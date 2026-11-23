/** Pure helpers for Gemini usageMetadata — safe for unit tests. */

export function extractDiscoveryGeminiUsage(json: {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}): { in: number; out: number } {
  const u = json?.usageMetadata ?? {};
  return {
    in: Number(u.promptTokenCount || 0) || 0,
    out: Number(u.candidatesTokenCount || 0) || 0,
  };
}
