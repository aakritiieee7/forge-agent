import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import * as vscode from "vscode";

import { selectContext, type ContextCandidate } from "./context.js";
import { resolveWorkspaceFile, isSensitiveWorkspacePath } from "./workspace-path.js";
import type { ReviewService } from "./review-service.js";

const MAX_FILE_BYTES = 96_000;
const MAX_SEARCH_RESULTS = 200;
const SAFE_COMMANDS = {
  "git status --short": ["git", ["status", "--short"]],
  "git diff --check": ["git", ["diff", "--check"]],
  "pytest -q": ["python", ["-m", "pytest", "-q"]],
  "npm test": ["npm", ["test"]],
} as const;

export interface WorkspaceToolServer {
  url: string;
  dispose(): void;
}

export async function startWorkspaceTools(reviewService: ReviewService): Promise<WorkspaceToolServer> {
  const mcp = new McpServer({ name: "forge-vscode-workspace", version: "0.1.0" });

  mcp.registerTool(
    "read_file",
    {
      title: "Read workspace file",
      description: "Read bounded, non-secret file content from the active local workspace.",
      inputSchema: {
        path: z.string().min(1).max(1_024),
        startLine: z.number().int().positive().optional(),
        endLine: z.number().int().positive().optional(),
      },
    },
    async ({ path, startLine, endLine }) => {
      try {
        const uri = await resolveWorkspaceFile(path);
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("File exceeds the 96 KB read limit.");
        const lines = new TextDecoder().decode(bytes).split(/\r?\n/);
        const first = Math.max(1, startLine ?? 1);
        const last = Math.min(lines.length, endLine ?? Math.min(lines.length, first + 399));
        if (last < first || last - first >= 400) throw new Error("Read at most 400 lines per request.");
        const content = lines.slice(first - 1, last).map((line, index) => `${first + index}: ${line}`);
        return textResult(content.join("\n"));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  mcp.registerTool(
    "search_workspace",
    {
      title: "Search workspace",
      description: "Search text or a bounded regular expression using VS Code’s indexed search service.",
      inputSchema: {
        query: z.string().min(1).max(256),
        regex: z.boolean().default(false),
      },
    },
    async ({ query, regex }) => {
      try {
        const cancellation = new vscode.CancellationTokenSource();
        const timeout = setTimeout(() => cancellation.cancel(), 5_000);
        try {
          const matches = await vscode.workspace.findTextInFiles(
            { pattern: query, isRegExp: regex, isCaseSensitive: false, isWordMatch: false },
            {
              include: "**/*",
              exclude: "**/{.git,node_modules,.venv,__pycache__,.tox}/**",
              maxResults: MAX_SEARCH_RESULTS,
            },
            cancellation.token,
          );
          const safeMatches = matches
            .filter((match) => !isSensitiveWorkspacePath(vscode.workspace.asRelativePath(match.uri)))
            .slice(0, MAX_SEARCH_RESULTS)
            .map((match) => {
              const line = match.ranges[0]?.start.line;
              const preview = match.preview.text.trim().slice(0, 280);
              return `${vscode.workspace.asRelativePath(match.uri)}:${(line ?? 0) + 1}: ${preview}`;
            });
          return textResult(safeMatches.join("\n") || "No matches found.");
        } finally {
          clearTimeout(timeout);
          cancellation.dispose();
        }
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  mcp.registerTool(
    "find_symbols",
    {
      title: "Find workspace symbols",
      description: "Find symbols through VS Code language-server providers in a bounded set of source files.",
      inputSchema: { query: z.string().min(1).max(160) },
    },
    async ({ query }) => {
      try {
        const files = await vscode.workspace.findFiles(
          "**/*.{ts,tsx,js,jsx,py,go,rs,java}",
          "**/{.git,node_modules,.venv,__pycache__,.tox}/**",
          60,
        );
        const results: string[] = [];
        for (const uri of files) {
          if (isSensitiveWorkspacePath(vscode.workspace.asRelativePath(uri))) continue;
          const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            "vscode.executeDocumentSymbolProvider",
            uri,
          );
          for (const symbol of flattenSymbols(symbols ?? [])) {
            if (symbol.name.toLowerCase().includes(query.toLowerCase())) {
              results.push(`${vscode.workspace.asRelativePath(uri)}:${symbol.range.start.line + 1} ${symbol.kind}: ${symbol.name}`);
              if (results.length >= 100) break;
            }
          }
          if (results.length >= 100) break;
        }
        return textResult(results.join("\n") || "No symbol definitions found.");
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  mcp.registerTool(
    "assemble_context",
    {
      title: "Assemble bounded repository context",
      description: "Rank a bounded candidate set by path and term frequency; return at most 6,000 approximate tokens with a file rationale manifest.",
      inputSchema: {
        query: z.string().min(1).max(512),
        paths: z.array(z.string().min(1).max(1_024)).max(120).optional(),
      },
    },
    async ({ query, paths }) => {
      try {
        const candidates = await readContextCandidates(query, paths ?? []);
        const selection = selectContext(candidates, query);
        const manifest = selection.files.map((file) => ({
          path: file.path,
          tokenFootprint: file.tokenCount,
          rationale: file.reason,
          truncated: file.truncated,
        }));
        const files = selection.files.map((file) => `\n--- ${file.path} (${file.tokenCount} tokens) ---\n${file.content}`);
        return textResult(
          JSON.stringify({ budget: selection.budget, tokensUsed: selection.tokenCount, manifest }) + files.join(""),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  mcp.registerTool(
    "propose_edit",
    {
      title: "Propose file edits",
      description: "Stage a complete replacement for per-hunk diff review. This tool never writes to disk.",
      inputSchema: { path: z.string().min(1).max(1_024), content: z.string().max(500_000) },
    },
    async ({ path, content }) => {
      try {
        return textResult(await reviewService.stage(path, content, false));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  mcp.registerTool(
    "create_file",
    {
      title: "Stage a new file",
      description: "Stage a new file under the workspace for the same explicit hunk review; no file is written here.",
      inputSchema: { path: z.string().min(1).max(1_024), content: z.string().max(250_000) },
    },
    async ({ path, content }) => {
      try {
        return textResult(await reviewService.stage(path, content, true));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  mcp.registerTool(
    "run_terminal_command",
    {
      title: "Run an approved diagnostic",
      description: "Run one allowlisted test or Git check after a separate VS Code confirmation. No shell is used.",
      inputSchema: { command: z.enum(["git status --short", "git diff --check", "pytest -q", "npm test"]) },
    },
    async ({ command }) => {
      const confirmation = await vscode.window.showWarningMessage(
        `Run diagnostic “${command}” in the open workspace?`,
        { modal: true, detail: "This runs local project code and may have project-defined effects." },
        "Run",
      );
      if (confirmation !== "Run") return textResult("Command cancelled by the user.");
      try {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if (!workspace || workspace.uri.scheme !== "file") throw new Error("Open a local workspace first.");
        const [executable, args] = SAFE_COMMANDS[command];
        return textResult(await runDiagnostic(executable, [...args], workspace.uri.fsPath));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcp.connect(transport);
  const server = createServer(async (request, response) => {
    if (request.headers.origin) {
      response.writeHead(403).end("Browser-origin requests are not accepted.");
      return;
    }
    try {
      const body = request.method === "POST" ? await readJsonBody(request) : undefined;
      await transport.handleRequest(request, response, body);
    } catch (error) {
      if (!response.headersSent) response.writeHead(400, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.message : "Invalid MCP request.");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not bind the local Forge MCP server.");

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    dispose: () => {
      server.close();
      void transport.close();
      void mcp.close();
    },
  };
}

async function readContextCandidates(query: string, explicitPaths: readonly string[]): Promise<ContextCandidate[]> {
  const requestedPaths = explicitPaths.length > 0
    ? explicitPaths
    : (await vscode.workspace.findFiles(
        "**/*",
        "**/{.git,node_modules,.venv,__pycache__,.tox}/**",
        100,
      )).map((uri) => vscode.workspace.asRelativePath(uri));
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9_]{2,}/g) ?? [])];
  const candidates: ContextCandidate[] = [];

  for (const relativePath of requestedPaths.slice(0, 120)) {
    if (isSensitiveWorkspacePath(relativePath)) continue;
    try {
      const uri = await resolveWorkspaceFile(relativePath);
      const bytes = await vscode.workspace.fs.readFile(uri);
      if (bytes.byteLength > MAX_FILE_BYTES || bytes.includes(0)) continue;
      const content = new TextDecoder().decode(bytes);
      const pathMatches = terms.filter((term) => relativePath.toLowerCase().includes(term));
      const termCount = terms.reduce((total, term) => total + (content.toLowerCase().split(term).length - 1), 0);
      const reason = pathMatches.length > 0
        ? `path matches ${pathMatches.join(", ")}`
        : termCount > 0
          ? `contains query terms (${termCount} matches)`
          : "explicitly requested candidate";
      candidates.push({ path: relativePath, content, reason, score: pathMatches.length * 8 });
    } catch {
      // A missing, unreadable, or concurrently removed candidate is skipped without stopping the scan.
    }
  }
  return candidates;
}

function flattenSymbols(symbols: readonly vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
  const flattened: vscode.DocumentSymbol[] = [];
  for (const symbol of symbols) {
    flattened.push(symbol, ...flattenSymbols(symbol.children));
  }
  return flattened;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : "The workspace tool failed.";
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += data.byteLength;
    if (bytes > 1_000_000) throw new Error("MCP request exceeded the 1 MB limit.");
    chunks.push(data);
  }
  if (bytes === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function runDiagnostic(executable: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const environment: Record<string, string> = {};
    for (const key of ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TEMP", "SystemRoot"]) {
      const value = process.env[key];
      if (value) environment[key] = value;
    }
    const child = spawn(executable, args, { cwd, env: environment, shell: false, windowsHide: true });
    let output = "";
    let settled = false;
    const append = (chunk: Buffer) => {
      if (output.length < 10_000) output += chunk.toString("utf8").slice(0, 10_000 - output.length);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timeout = setTimeout(() => child.kill("SIGTERM"), 60_000);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const safeOutput = redactSecrets(output).trim() || "(no output)";
      resolve(`exit=${code ?? signal ?? "unknown"}\n${safeOutput}`);
    });
  });
}

function redactSecrets(value: string): string {
  return value
    .replace(/((?:api[_-]?key|token|secret|password)\s*[=:]\s*)\S+/gi, "$1[REDACTED]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g, "[REDACTED]");
}