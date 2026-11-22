import assert from "node:assert/strict";
import test from "node:test";

import { CONTEXT_TOKEN_BUDGET, selectContext } from "../src/context.js";
import { applyApprovedHunks, type ReviewHunk } from "../src/review.js";
import { classifyFailure } from "../src/resilience.js";

test("context assembly never exceeds the brief's 6,000-token budget", () => {
  const selection = selectContext(
    [{ path: "src/flask/cli.py", content: "x".repeat(28_000), reason: "path matches cli" }],
    "flask cli",
    9_000,
  );

  assert.equal(CONTEXT_TOKEN_BUDGET, 6_000);
  assert.equal(selection.budget, 6_000);
  assert.ok(selection.tokenCount <= 6_000);
  assert.equal(selection.files[0]?.truncated, true);
});

test("only explicitly approved hunks are applied", () => {
  const original = "first\nold line\nlast";
  const hunks: ReviewHunk[] = [
    { id: "approved", startLine: 2, expectedLines: ["old line"], replacementLines: ["new line"] },
    { id: "rejected", startLine: 3, expectedLines: ["last"], replacementLines: ["changed last"] },
  ];

  const result = applyApprovedHunks(original, original, hunks, new Set(["approved"]));
  assert.deepEqual(result, { ok: true, content: "first\nnew line\nlast" });
});

test("concurrent workspace edits fail closed instead of being overwritten", () => {
  const original = "before";
  const hunk: ReviewHunk = { id: "one", startLine: 1, expectedLines: ["before"], replacementLines: ["after"] };
  const result = applyApprovedHunks("concurrent edit", original, [hunk], new Set(["one"]));

  assert.deepEqual(result, { ok: false, reason: "source-changed" });
});

test("TrueForge auth failures are not treated as safe transient retries", () => {
  const failure = Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  assert.equal(classifyFailure(failure), "credentials");
  assert.equal(classifyFailure(new Error("request timed out")), "retryable");
});