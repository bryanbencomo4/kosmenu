/**
 * Allow only in-app panel paths after login (deep links from WaSender).
 * Rejects open redirects and path traversal.
 */
export function safePanelNext(
  raw: string | null | undefined,
  fallback = '/panel/conversaciones',
): string {
  const next = String(raw || '').trim();
  if (!next.startsWith('/panel/')) return fallback;
  if (
    next.includes('://') ||
    next.includes('\\') ||
    next.includes('..') ||
    next.startsWith('//')
  ) {
    return fallback;
  }
  // Keep query string (e.g. ?comercioId=) but strip fragments.
  const noHash = next.split('#')[0] || fallback;
  return noHash || fallback;
}
