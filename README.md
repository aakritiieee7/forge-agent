# Forge — VS Code Agent on TrueForge

Forge is a VS Code extension shell for an editor-native coding agent. TrueForge owns agent sessions, model calls, model routing, and stream lifecycle; the extension contributes workspace tools and a human-reviewed edit surface. It does not call model-provider APIs directly.

## What is implemented

- A VS Code webview panel that sends prompts through the TrueForge TypeScript SDK.
- A local Streamable HTTP MCP tool server bound to `127.0.0.1` on an ephemeral port.
- Bounded file reads, VS Code text search, language-server symbol lookup, and a 6,000 approximate-token context selector with a visible rationale manifest.
- Edit and create-file proposals opened in the VS Code diff editor. Every hunk is accepted or rejected separately; only the explicit **Forge: Apply Approved Hunks** command writes accepted hunks.
- Diagnostic execution limited to four named commands. Each command requires a VS Code confirmation, runs without a shell, has a timeout, and returns bounded, redacted output.
- TrueForge SDK retry settings and status-specific recovery messages. Model fallback is configured in the TrueForge agent, not by calling another provider from the extension.

## Requirements and setup

1. Use Node.js 22.14 or newer and install this extension project's dependencies.
2. Start a local TrueForge runtime by following the official [TrueForge quickstart](https://trueforge.dev/quickstart). Add an MCP server entry for the URL copied by **Forge: Copy Local MCP URL**. Keep TrueForge and VS Code on the same machine/network namespace for the loopback endpoint.
3. Create a TrueForge agent and session. Enable its model fallback chain and require tool approval for `propose_edit`, `create_file`, and `run_terminal_command`. The profile in `agents/forge-agent.profile.json` is a mapping guide, not a version-specific server import file.
4. In VS Code settings, set `forge.baseUrl` and `forge.sessionId`. Use **Forge: Set TrueForge Token** if the server requires a token; it is stored in VS Code SecretStorage.
5. Run `npm run compile`, open this folder in the Extension Development Host, and run **Forge: Open Agent**.

The MCP endpoint rejects browser-origin requests and listens only on loopback. A hosted TrueForge deployment cannot reach a developer's `127.0.0.1`; use a properly authenticated, TLS-protected, reachable MCP host instead. Do not expose the local endpoint through an unauthenticated public tunnel.

## Commands

| Command | Purpose |
| --- | --- |
| `Forge: Open Agent` | Open the task panel and stream a turn through TrueForge |
| `Forge: Set TrueForge Token` | Store or replace the optional access token securely |
| `Forge: Apply Approved Hunks` | Apply the hunks explicitly accepted in diff review |
| `Forge: Copy Local MCP URL` | Copy the current loopback MCP endpoint |
| `Forge: Cancel Agent Turn` | Stop consuming the active response stream |

## Build and test

```sh
npm install
npm run compile
npm test
npm run package
```

## Compatibility note

The brief names `@truefoundry/trueforge-sdk` 0.4.2, which is not available from the public npm registry at implementation time. This starter uses the currently published SDK line (0.185.0) and its documented `TrueForge` client / `createTurnStream` API. Recheck the official docs before upgrading. The extension has not been connected to a live TrueForge server in this workspace.

## Project files

- `src/` — extension and MCP server implementation.
- `agents/` — human-readable TrueForge setup profile.
- `docs/` — architecture, benchmark steps, and GitHub instructions.
- `demo/` — timed four-minute recording script.
- `scripts/` — Flask benchmark setup and verification helpers.
- `test/` — context, hunk-approval, and failure-classification tests.