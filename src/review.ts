export interface ReviewHunk {
  id: string;
  startLine: number;
  expectedLines: string[];
  replacementLines: string[];
}

export type ApplyHunksResult =
  | { ok: true; content: string }
  | { ok: false; reason: "source-changed" | "no-approved-hunks" | "hunk-mismatch" };

export function applyApprovedHunks(
  currentContent: string,
  originalContent: string,
  hunks: readonly ReviewHunk[],
  approvedIds: ReadonlySet<string>,
): ApplyHunksResult {
  if (currentContent !== originalContent) return { ok: false, reason: "source-changed" };

  const approved = hunks
    .filter((hunk) => approvedIds.has(hunk.id))
    .sort((left, right) => right.startLine - left.startLine);
  if (approved.length === 0) return { ok: false, reason: "no-approved-hunks" };

  const lines = originalContent.split("\n");
  for (const hunk of approved) {
    const startIndex = hunk.startLine - 1;
    if (startIndex < 0 || startIndex > lines.length) return { ok: false, reason: "hunk-mismatch" };
    const currentLines = lines.slice(startIndex, startIndex + hunk.expectedLines.length);
    if (currentLines.length !== hunk.expectedLines.length) return { ok: false, reason: "hunk-mismatch" };
    if (currentLines.some((line, index) => line !== hunk.expectedLines[index])) {
      return { ok: false, reason: "hunk-mismatch" };
    }
    lines.splice(startIndex, hunk.expectedLines.length, ...hunk.replacementLines);
  }

  return { ok: true, content: lines.join("\n") };
}