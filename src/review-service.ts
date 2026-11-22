import * as vscode from "vscode";

import { createReviewHunks } from "./diff-proposal.js";
import { applyApprovedHunks, type ReviewHunk } from "./review.js";
import { resolveWorkspaceFile } from "./workspace-path.js";

interface ReviewSession {
  id: string;
  path: string;
  uri: vscode.Uri;
  originalContent: string;
  proposedContent: string;
  existed: boolean;
  hunks: ReviewHunk[];
  decisions: Map<string, "approved" | "rejected">;
}

export class ReviewService implements vscode.Disposable {
  private readonly sessions = new Map<string, ReviewSession>();
  private readonly lensEmitter = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    const contentProvider: vscode.TextDocumentContentProvider = {
      provideTextDocumentContent: (uri) => this.sessions.get(uri.query)?.proposedContent ?? "",
    };
    const lensProvider: vscode.CodeLensProvider = {
      onDidChangeCodeLenses: this.lensEmitter.event,
      provideCodeLenses: (document) => this.provideCodeLenses(document),
    };
    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider("forge-review", contentProvider),
      vscode.languages.registerCodeLensProvider({ scheme: "forge-review" }, lensProvider),
      vscode.commands.registerCommand("forge.review.accept", (sessionId: unknown, hunkId: unknown) =>
        this.setDecision(sessionId, hunkId, "approved"),
      ),
      vscode.commands.registerCommand("forge.review.reject", (sessionId: unknown, hunkId: unknown) =>
        this.setDecision(sessionId, hunkId, "rejected"),
      ),
    );
  }

  async stage(path: string, proposedContent: string, allowCreate: boolean): Promise<string> {
    const uri = await resolveWorkspaceFile(path);
    let originalContent = "";
    let existed = true;
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      originalContent = document.getText();
    } catch (error) {
      if (!allowCreate || !isFileNotFound(error)) throw error;
      existed = false;
    }

    const hunks = createReviewHunks(path, originalContent, proposedContent);
    if (hunks.length === 0) return "The proposed content is identical to the workspace file.";

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const session: ReviewSession = {
      id,
      path,
      uri,
      originalContent,
      proposedContent,
      existed,
      hunks,
      decisions: new Map(),
    };
    this.sessions.set(id, session);
    const previewUri = vscode.Uri.from({ scheme: "forge-review", path: `/${path}`, query: id });
    await vscode.commands.executeCommand("vscode.diff", uri, previewUri, `Forge review: ${path}`);
    return `Staged ${hunks.length} hunk(s) for ${path}. Review each hunk, then run “Forge: Apply Approved Hunks”. No file was written.`;
  }

  async applyApprovedEdits(): Promise<void> {
    const ready = [...this.sessions.values()].filter((session) =>
      [...session.decisions.values()].includes("approved"),
    );
    if (ready.length === 0) {
      void vscode.window.showInformationMessage("No hunks have been approved for application.");
      return;
    }

    const selection = await vscode.window.showQuickPick(
      ready.map((session) => ({ label: session.path, description: `${approvedCount(session)} approved hunk(s)`, id: session.id })),
      { placeHolder: "Choose a reviewed file to apply" },
    );
    if (!selection) return;

    const session = this.sessions.get(selection.id);
    if (!session) return;
    const current = session.existed
      ? (await vscode.workspace.openTextDocument(session.uri)).getText()
      : await readNewFileIfPresent(session.uri);
    const result = applyApprovedHunks(
      current,
      session.originalContent,
      session.hunks,
      new Set(
        [...session.decisions]
          .filter(([, decision]) => decision === "approved")
          .map(([hunkId]) => hunkId),
      ),
    );

    if (!result.ok) {
      const explanation = result.reason === "source-changed"
        ? "The file changed since review began. Re-open the proposal against the latest file."
        : "The reviewed hunks no longer match the staged source; nothing was written.";
      void vscode.window.showWarningMessage(explanation);
      return;
    }

    if (session.existed) {
      const document = await vscode.workspace.openTextDocument(session.uri);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(session.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), result.content);
      if (!(await vscode.workspace.applyEdit(edit))) {
        void vscode.window.showErrorMessage("VS Code could not apply the approved edit. The file was left unchanged.");
        return;
      }
    } else {
      await vscode.workspace.fs.writeFile(session.uri, new TextEncoder().encode(result.content));
    }

    this.sessions.delete(session.id);
    this.lensEmitter.fire();
    void vscode.window.showInformationMessage(`Applied approved hunks to ${session.path}.`);
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.lensEmitter.dispose();
    this.sessions.clear();
  }

  private provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const session = this.sessions.get(document.uri.query);
    if (!session) return [];
    return session.hunks.flatMap((hunk, index) => {
      const decision = session.decisions.get(hunk.id);
      if (decision) return [];
      const line = Math.max(0, hunk.startLine - 1);
      const range = new vscode.Range(line, 0, line, 0);
      return [
        new vscode.CodeLens(range, {
          title: `$(check) Accept hunk ${index + 1}`,
          command: "forge.review.accept",
          arguments: [session.id, hunk.id],
        }),
        new vscode.CodeLens(range, {
          title: `$(x) Reject hunk ${index + 1}`,
          command: "forge.review.reject",
          arguments: [session.id, hunk.id],
        }),
      ];
    });
  }

  private setDecision(sessionId: unknown, hunkId: unknown, decision: "approved" | "rejected"): void {
    if (typeof sessionId !== "string" || typeof hunkId !== "string") return;
    const session = this.sessions.get(sessionId);
    if (!session || !session.hunks.some((hunk) => hunk.id === hunkId)) return;
    session.decisions.set(hunkId, decision);
    this.lensEmitter.fire();
  }
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof vscode.FileSystemError && error.code === "FileNotFound";
}

async function readNewFileIfPresent(uri: vscode.Uri): Promise<string> {
  try {
    await vscode.workspace.fs.stat(uri);
    return "A file now exists at this path. Re-review before applying the proposal.";
  } catch (error) {
    if (isFileNotFound(error)) return "";
    throw error;
  }
}

function approvedCount(session: ReviewSession): number {
  return [...session.decisions.values()].filter((decision) => decision === "approved").length;
}