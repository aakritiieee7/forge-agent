# Forge demo — exactly 4:00

Keep the recording under four minutes. Show actual outputs and do not claim a test, fallback, or score that was not observed in this run.

| Time | Shot and narration | Evidence on screen |
| --- | --- | --- |
| 0:00–0:15 | Introduce Forge Vanguard and the goal: a VS Code-native agent whose execution loop runs on TrueForge. | VS Code with the Forge panel and TrueForge session view open. |
| 0:15–0:55 | **Task A — inline edit.** Ask for a small change to a Flask CLI/debug behavior. Point out the relevant context and the staged diff. Accept one hunk, reject another, then apply approved hunks. | Per-hunk CodeLens decisions; no write before the explicit apply command; `git diff --check`. |
| 0:55–1:15 | Show the bounded retrieval manifest: selected paths, reasons, and the 6,000-token cap. | `assemble_context` result with `tokenFootprint` and rationale. |
| 1:15–2:15 | **Task B — agent mode.** Give a behavior-only request without listing filenames. Let the agent search Flask, explain its file selection, and stage related source/test/doc changes. Review every file and hunk before applying. | TrueForge stream, discovered paths, CodeLens decisions, final `git diff --stat`. |
| 2:15–2:40 | Run the relevant Flask tests after approval. State the exact command and result. | Terminal exit status and pytest summary. |
| 2:40–3:00 | **Cancellation.** Start a read-only investigation and cancel the turn while events are streaming. | Cancelled status and unchanged working tree for the cancelled turn. |
| 3:00–3:35 | **Resilience.** In an isolated TrueForge profile, stop the primary test provider and observe the configured fallback. Do not reuse a production token or session. | Same session ID, harness fallback event, no duplicate turn or partial accepted edit. |
| 3:35–3:55 | Summarize the safeguards: bounded context, two approval gates for writes/commands, and no automatic replay after ambiguous streaming failures. | Architecture notes and accepted-hunk summary. |
| 3:55–4:00 | Close on the project and repository link. | GitHub repository name and benchmark commit. |

If a step fails, keep the failure visible and describe it accurately; do not replace it with an unverified success screen.