export const POLL_BACKOFF_MS = [10_000, 30_000, 60_000, 120_000] as const;

export function nextPollDelayMs(consecutiveFailures: number, healthyMs = 20_000) {
  if (consecutiveFailures <= 0) return healthyMs;
  const index = Math.min(consecutiveFailures - 1, POLL_BACKOFF_MS.length - 1);
  return POLL_BACKOFF_MS[index];
}
