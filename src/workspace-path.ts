import { realpath } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";

export async function resolveWorkspaceFile(relativePath: string): Promise<vscode.Uri> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace || workspace.uri.scheme !== "file") {
    throw new Error("Forge tools require one open local VS Code workspace.");
  }
  if (!relativePath || relativePath.length > 1_024 || relativePath.includes("\0")) {
    throw new Error("Provide a short relative file path inside the open workspace.");
  }

  const normalized = relativePath.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    normalized.startsWith("/") ||
    /^[a-z]:/i.test(normalized) ||
    parts.some((part) => part === "..")
  ) {
    throw new Error("Absolute paths and parent-directory traversal are not allowed.");
  }
  if (isSensitiveWorkspacePath(normalized)) {
    throw new Error("This path is excluded to protect local credentials and key material.");
  }

  const rootPath = await realpath(workspace.uri.fsPath);
  const candidatePath = path.resolve(rootPath, ...parts.filter((part) => part && part !== "."));
  ensureInside(rootPath, candidatePath);

  try {
    ensureInside(rootPath, await realpath(candidatePath));
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    const realParent = await realpath(path.dirname(candidatePath));
    ensureInside(rootPath, realParent);
  }

  return vscode.Uri.file(candidatePath);
}

export function isSensitiveWorkspacePath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/").toLowerCase();
  const segments = normalized.split("/");
  const name = segments.at(-1) ?? "";
  return (
    segments.some((segment) => [".git", "node_modules", ".venv", "__pycache__"].includes(segment)) ||
    /^\.env(?:\.|$)/.test(name) ||
    [".npmrc", ".pypirc", "id_rsa", "id_ed25519", "credentials"].includes(name) ||
    /\.(?:pem|key|p12|pfx)$/.test(name)
  );
}

function ensureInside(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("The resolved path is outside the open workspace.");
  }
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}