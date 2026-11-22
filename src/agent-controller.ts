import { TrueForge } from "@truefoundry/trueforge-sdk";
import * as vscode from "vscode";

import { classifyFailure, userFacingFailure } from "./resilience.js";
import type { ForgePanel } from "./forge-panel.js";

export class AgentController {
  private activeTurn: AbortController | undefined;

  constructor(
    private readonly panel: ForgePanel,
    private readonly secrets: vscode.SecretStorage,
  ) {}

  async run(prompt: string): Promise<void> {
    if (this.activeTurn) {
      this.panel.postMessage({ type: "error", value: "A Forge turn is already running." });
      return;
    }

    const configuration = vscode.workspace.getConfiguration("forge");
    const baseUrl = configuration.get<string>("baseUrl", "").trim();
    const sessionId = configuration.get<string>("sessionId", "").trim();
    if (!baseUrl || !sessionId) {
      this.panel.postMessage({
        type: "error",
        value: "Set forge.baseUrl and forge.sessionId after creating a Forge agent session in TrueForge.",
      });
      return;
    }

    const token = await this.secrets.get("trueforge.token");
    const client = new TrueForge({
      baseUrl,
      ...(token ? { token } : {}),
      maxRetries: 2,
      timeoutInSeconds: 60,
    });
    const controller = new AbortController();
    this.activeTurn = controller;
    this.panel.postMessage({ type: "state", value: "running" });

    try {
      const stream = await client.sessions.createTurnStream(sessionId, {
        input: [{ type: "user.message", content: prompt }],
      });

      for await (const event of stream) {
        if (controller.signal.aborted) break;
        this.panel.postMessage({ type: "event", value: formatStreamEvent(event) });
      }

      this.panel.postMessage({
        type: "state",
        value: controller.signal.aborted ? "cancelled" : "complete",
      });
    } catch (error) {
      const disposition = classifyFailure(error);
      this.panel.postMessage({ type: "error", value: userFacingFailure(disposition) });
    } finally {
      if (this.activeTurn === controller) this.activeTurn = undefined;
    }
  }

  cancel(): void {
    this.activeTurn?.abort();
  }
}

function formatStreamEvent(event: unknown): string {
  try {
    return JSON.stringify(event);
  } catch {
    return "TrueForge sent an event that could not be displayed.";
  }
}