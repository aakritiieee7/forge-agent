# Architecture and safety boundaries

## Runtime split

```text
VS Code extension host
  ├─ Webview: task input, stream status, cancellation
  ├─ Loopback MCP server: workspace reads/search/symbols, staged proposals, diagnostics
  └─ Diff review: per-hunk decisions → explicit apply command → WorkspaceEdit
             │
             └── TrueForge TypeScript SDK (HTTP/SSE)
                    └─ TrueForge session, context management, model routing, approvals
```

The extension host does not call provider APIs. It sends a user message to an already-created TrueForge session and displays streamed events. TrueForge's model fallback configuration belongs to the agent in the harness. The extension uses SDK retry settings for request-level resilience but does not replay an interrupted turn after tool activity may have begun; that avoids duplicating writes or commands.

## Context selection

`src/context.ts` scores candidate files using path matches and term frequency, then packs a ranked manifest under a hard 6,000 approximate-token cap (four characters per token). The `assemble_context` MCP tool accepts explicit paths or scans a bounded candidate set. The returned manifest includes each path, estimated footprint, rationale, and truncation status. This is a transparent lightweight retrieval baseline, not a semantic AST/call-graph index.

## Tool policy

| Tool | Behavior | Approval boundary |
| --- | --- | --- |
| `read_file` | Reads at most 400 lines / 96 KB, numbered from 1 | No write permission; secret paths blocked |
| `search_workspace` | Uses VS Code search with bounded query, results, and cancellation | No write permission |
| `find_symbols` | Uses language-server document symbols over a bounded file set | No write permission |
| `assemble_context` | Returns ranked context under the 6,000-token cap | No write permission |
| `propose_edit` | Opens a VS Code diff; stores proposal only | TrueForge approval plus per-hunk decisions and explicit apply command |
| `create_file` | Stages a new path as a diff | TrueForge approval plus per-hunk decisions and explicit apply command |
| `run_terminal_command` | Four named diagnostics, `shell: false`, bounded output | TrueForge approval plus modal VS Code confirmation |

Paths are relative to the first local workspace folder. Parent traversal, symlink escapes, key files, environment files, `.git`, dependency folders, and common virtual environments are excluded. Terminal output is size-capped and common credential patterns are redacted before returning to the model.

## Failure behavior

- Before a turn, missing URL/session settings produce an actionable message.
- Authentication failures request a credential update; transient status/network failures are labeled retryable; other failures keep the existing session and do not apply staged changes.
- A cancellation stops stream consumption; it never applies staged content.
- Before applying, the current source must still equal the reviewed baseline. A concurrent edit fails closed and requires a fresh proposal.
- TrueForge fallback configuration should use at least two available models. Provider catalog IDs and availability must be checked in the target TrueForge deployment.

## Known limitations

- The local MCP endpoint is reachable only from a TrueForge process sharing the developer's network namespace. Hosted deployments need a separately secured, reachable MCP service.
- Search and context candidate scans are bounded; large repositories may need explicit paths or additional retrieval indexing.
- Symbol retrieval depends on installed VS Code language extensions/providers.
- No private sandbox is provisioned here. Diagnostics execute only after two approval gates and are limited to the allowlist.
- The Flask benchmark and live TrueForge integration are not claimed as executed by this starter.