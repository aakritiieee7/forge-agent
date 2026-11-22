export type FailureDisposition = "retryable" | "credentials" | "configuration" | "unknown";

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  const statusCode = error.statusCode;
  return typeof statusCode === "number" ? statusCode : undefined;
}

function getMessage(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase();
  return String(error).toLowerCase();
}

export function classifyFailure(error: unknown): FailureDisposition {
  const statusCode = getStatusCode(error);
  if (statusCode === 401 || statusCode === 403) return "credentials";
  if (statusCode === 408 || statusCode === 429 || (statusCode !== undefined && statusCode >= 500)) {
    return "retryable";
  }
  if (statusCode !== undefined && statusCode >= 400) return "configuration";

  const message = getMessage(error);
  if (/timeout|timed out|econnreset|econnrefused|network|fetch failed/.test(message)) {
    return "retryable";
  }
  return "unknown";
}

export function userFacingFailure(disposition: FailureDisposition): string {
  switch (disposition) {
    case "retryable":
      return "TrueForge is temporarily unavailable. Your workspace was not changed; reconnect and retry when the session is ready.";
    case "credentials":
      return "TrueForge rejected the saved credentials. Update the token and reconnect the existing session.";
    case "configuration":
      return "TrueForge rejected this request. Check the server URL, session ID, and agent configuration.";
    default:
      return "The agent turn stopped unexpectedly. No proposed edits were applied; inspect the TrueForge session before retrying.";
  }
}