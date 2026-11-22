import * as vscode from "vscode";

import { AgentController } from "./agent-controller.js";
import { ForgePanel } from "./forge-panel.js";
import { ReviewService } from "./review-service.js";
import { startWorkspaceTools } from "./workspace-tools.js";

let currentPanel: ForgePanel | undefined;
let currentController: AgentController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const reviewService = new ReviewService();
  context.subscriptions.push(reviewService);

  const openPanel = vscode.commands.registerCommand("forge.openPanel", () => {
    const panel = ForgePanel.createOrShow(context.extensionUri);
    if (currentPanel !== panel) {
      currentPanel = panel;
      currentController = new AgentController(panel, context.secrets);
      context.subscriptions.push(panel.onPrompt((prompt) => void currentController?.run(prompt)));
      context.subscriptions.push(panel.onCancel(() => currentController?.cancel()));
    }
  });

  const setToken = vscode.commands.registerCommand("forge.setTrueForgeToken", async () => {
    const value = await vscode.window.showInputBox({
      title: "TrueForge access token",
      prompt: "Stored in VS Code SecretStorage; never added to workspace settings.",
      password: true,
      ignoreFocusOut: true,
    });
    if (value) {
      await context.secrets.store("trueforge.token", value);
      void vscode.window.showInformationMessage("TrueForge token saved securely.");
    }
  });

  const applyApproved = vscode.commands.registerCommand("forge.applyApprovedEdits", async () => {
    await reviewService.applyApprovedEdits();
  });

  const copyMcpUrl = vscode.commands.registerCommand("forge.copyMcpUrl", async () => {
    const url = context.workspaceState.get<string>("forge.mcpUrl");
    if (!url) {
      void vscode.window.showWarningMessage("Open a workspace before copying the local MCP URL.");
      return;
    }
    await vscode.env.clipboard.writeText(url);
    void vscode.window.showInformationMessage("Forge MCP URL copied. It is available only on this machine.");
  });

  const cancelTurn = vscode.commands.registerCommand("forge.cancelTurn", () => {
    currentController?.cancel();
  });

  context.subscriptions.push(openPanel, setToken, applyApproved, copyMcpUrl, cancelTurn);
  const toolServer = await startWorkspaceTools(reviewService);
  context.subscriptions.push({ dispose: () => toolServer.dispose() });
  await context.workspaceState.update("forge.mcpUrl", toolServer.url);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void vscode.window.showInformationMessage("Forge workspace tools now use the active VS Code workspace.");
    }),
  );
}

export function deactivate(): void {
  // VS Code disposes all subscriptions registered during activation.
}