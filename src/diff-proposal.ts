import { structuredPatch } from "diff";

import type { ReviewHunk } from "./review.js";

export function createReviewHunks(
  filePath: string,
  originalContent: string,
  proposedContent: string,
): ReviewHunk[] {
  const patch = structuredPatch(filePath, filePath, originalContent, proposedContent, "", "", {
    context: 2,
  });

  return patch.hunks.map((hunk, index) => {
    let nextOldLine = Math.max(1, hunk.oldStart);
    let startLine = nextOldLine;
    let touched = false;
    const expectedLines: string[] = [];
    const replacementLines: string[] = [];

    for (const line of hunk.lines) {
      const kind = line[0];
      const content = line.slice(1);
      if (kind === " ") {
        nextOldLine += 1;
      } else if (kind === "-") {
        if (!touched) startLine = nextOldLine;
        touched = true;
        expectedLines.push(content);
        nextOldLine += 1;
      } else if (kind === "+") {
        if (!touched) startLine = nextOldLine;
        touched = true;
        replacementLines.push(content);
      }
    }

    return { id: `${filePath}:${index + 1}`, startLine, expectedLines, replacementLines };
  });
}