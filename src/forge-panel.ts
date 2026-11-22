import * as vscode from "vscode";
import { randomBytes } from "node:crypto";

export type PanelMessage =
  | { type: "state"; value: "ready" | "running" | "cancelled" | "complete" }
  | { type: "event"; value: string }
  | { type: "error"; value: string };

export class ForgePanel {
  private static current: ForgePanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly promptEmitter = new vscode.EventEmitter<string>();
  private readonly cancelEmitter = new vscode.EventEmitter<void>();

  private constructor(extensionUri: vscode.Uri) {
    this.panel = vscode.window.createWebviewPanel(
      "forge.agent",
      "Forge Agent",
      vscode.ViewColumn.Beside,
      { enableScripts: true, localResourceRoots: [extensionUri] },
    );
    this.panel.webview.html = this.createHtml(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      if (!message || typeof message !== "object" || !("type" in message)) return;
      if (message.type === "prompt" && "value" in message && typeof message.value === "string") {
        this.promptEmitter.fire(message.value);
      }
      if (message.type === "cancel") this.cancelEmitter.fire();
    }, undefined, this.disposables);
    this.panel.onDidDispose(() => {
      ForgePanel.current = undefined;
      this.dispose();
    }, undefined, this.disposables);
  }

  static createOrShow(extensionUri: vscode.Uri): ForgePanel {
    if (ForgePanel.current) {
      ForgePanel.current.panel.reveal(vscode.ViewColumn.Beside);
      return ForgePanel.current;
    }
    ForgePanel.current = new ForgePanel(extensionUri);
    return ForgePanel.current;
  }

  onPrompt(listener: (value: string) => void): vscode.Disposable {
    return this.promptEmitter.event(listener);
  }

  onCancel(listener: () => void): vscode.Disposable {
    return this.cancelEmitter.event(listener);
  }

  postMessage(message: PanelMessage): void {
    void this.panel.webview.postMessage(message);
  }

  dispose(): void {
    while (this.disposables.length > 0) this.disposables.pop()?.dispose();
    this.promptEmitter.dispose();
    this.cancelEmitter.dispose();
  }

  private createHtml(webview: vscode.Webview): string {
    const nonce = randomBytes(18).toString("base64");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Forge Agent</title>
  <style>
    body { color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font: 13px var(--vscode-font-family); padding: 18px; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p { color: var(--vscode-descriptionForeground); line-height: 1.5; }
    textarea { box-sizing: border-box; width: 100%; min-height: 120px; resize: vertical; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 10px; font: inherit; }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 8px 12px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .actions { display: flex; gap: 8px; margin-top: 10px; }
    #cancel { color: var(--vscode-foreground); background: transparent; border: 1px solid var(--vscode-button-border, var(--vscode-panel-border)); }
    #status { margin-top: 14px; color: var(--vscode-descriptionForeground); }
    #events { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 45vh; overflow: auto; border-top: 1px solid var(--vscode-panel-border); margin-top: 14px; padding-top: 12px; }
  </style>
</head>
<body>
  <h1>Forge Agent</h1>
  <p>TrueForge runs the agent turn. Proposed edits remain staged until you review and apply approved hunks.</p>
  <textarea id="prompt" aria-label="Agent task" placeholder="Describe the outcome. Forge will inspect the workspace and propose changes for review."></textarea>
  <div class="actions"><button id="send">Start agent</button><button id="cancel">Cancel turn</button></div>
  <div id="status" role="status" aria-live="polite">Ready</div>
  <pre id="events" aria-live="polite"></pre>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const prompt = document.getElementById('prompt');
    const status = document.getElementById('status');
    const events = document.getElementById('events');
    document.getElementById('send').addEventListener('click', () => {
      const value = prompt.value.trim();
      if (value) vscode.postMessage({ type: 'prompt', value });
    });
    document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    window.addEventListener('message', ({ data }) => {
      if (data.type === 'state') status.textContent = data.value;
      if (data.type === 'event') events.textContent += data.value + '\\n';
      if (data.type === 'error') status.textContent = data.value;
    });
  </script>
</body>
</html>`;
  }
}