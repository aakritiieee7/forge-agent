# `pallets/flask` 3.1.3 benchmark

Target from the submission brief: repository `pallets/flask`, release `3.1.3`, baseline commit prefix `22d92470`. This is a reproducible test target, not a completed benchmark result.

## Prepare

```sh
./scripts/setup-flask-benchmark.sh
cd .benchmarks/flask
python -m pytest -q
```

The setup script checks out the commit named in the brief into `.benchmarks/flask`. It does not modify the extension source. If that commit is unavailable, stop and confirm the intended revision rather than silently substituting a different one.

## Suggested scenarios

1. **Inline edit:** ask Forge to adjust a small CLI/debug behavior; inspect each changed hunk and apply only approved hunks. Verify the relevant output from the Flask test suite.
2. **Unspecified multi-file task:** ask for a narrowly scoped behavior change without naming files. Record which files the agent discovers, inspect the context manifest, review all proposed hunks, then run the relevant tests.
3. **Cancellation:** begin a read-only task, cancel while streaming, and verify no proposal was applied.
4. **Provider failure:** in an isolated TrueForge test profile, make the primary provider unavailable and verify the harness reports a fallback event while preserving the same session. Never use a real production session or real secrets for this test.

## Evidence checklist

- Record the exact repository commit and Python/pytest versions.
- Capture TrueForge session and model-routing evidence without exposing tokens.
- Count proposed files and accepted/rejected hunks from the review UI.
- Save the actual pytest command and exit status; do not report a pass from an unrun test.
- Record cancellation and provider-failure outcomes, including any limitations.

## Baseline status

Not run in this project workspace. Do not treat the uploaded write-up's scorecard as a verified result of this codebase.