export const CONTEXT_TOKEN_BUDGET = 6_000;

export interface ContextCandidate {
  path: string;
  content: string;
  reason: string;
  score?: number;
}

export interface SelectedContextFile extends ContextCandidate {
  tokenCount: number;
  truncated: boolean;
}

export interface ContextSelection {
  files: SelectedContextFile[];
  tokenCount: number;
  budget: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function scoreCandidate(candidate: ContextCandidate, queryTerms: readonly string[]): number {
  const normalizedPath = candidate.path.toLowerCase();
  const normalizedContent = candidate.content.toLowerCase();
  const pathScore = queryTerms.reduce(
    (score, term) => score + (normalizedPath.includes(term) ? 8 : 0),
    0,
  );
  const contentScore = queryTerms.reduce((score, term) => {
    const matches = normalizedContent.split(term).length - 1;
    return score + Math.min(matches, 20);
  }, 0);
  return (candidate.score ?? 0) + pathScore + contentScore;
}

export function selectContext(
  candidates: readonly ContextCandidate[],
  query: string,
  requestedBudget = CONTEXT_TOKEN_BUDGET,
): ContextSelection {
  const budget = Math.max(1, Math.min(requestedBudget, CONTEXT_TOKEN_BUDGET));
  const queryTerms = [...new Set(query.toLowerCase().match(/[a-z0-9_]{2,}/g) ?? [])];
  const ranked = candidates
    .map((candidate, index) => ({ candidate, index, score: scoreCandidate(candidate, queryTerms) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const files: SelectedContextFile[] = [];
  let tokenCount = 0;

  for (const { candidate, score } of ranked) {
    const remaining = budget - tokenCount;
    if (remaining <= 0) break;
    const candidateTokens = estimateTokens(candidate.content);
    const includedTokens = Math.min(candidateTokens, remaining);
    if (includedTokens === 0) continue;

    const truncated = candidateTokens > includedTokens;
    const content = truncated ? candidate.content.slice(0, includedTokens * 4) : candidate.content;
    const tokenFootprint = Math.min(estimateTokens(content), remaining);
    files.push({
      ...candidate,
      content,
      score,
      tokenCount: tokenFootprint,
      truncated,
    });
    tokenCount += tokenFootprint;
  }

  return { files, tokenCount, budget };
}