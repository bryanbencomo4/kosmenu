/**
 * Gemini thinking config by model family.
 *
 * Official notes (2026-11):
 * - Gemini 3.x Flash-Lite uses thinkingLevel (MINIMAL is default for 3.1 Flash-Lite).
 * - Specifying thinkingBudget + thinkingLevel together errors on Gemini 3.
 * - Gemini 2.5 Flash-Lite uses thinkingBudget (integer), not thinkingLevel.
 * - Even with MINIMAL, tool rounds must echo thoughtSignature parts or Gemini 3 returns 400.
 *
 * @see https://docs.cloud.google.com/vertex-ai/generative-ai/docs/thinking
 * @see https://ai.google.dev/gemini-api/docs/gemini-3
 * @see https://firebase.google.com/docs/ai-logic/thinking
 */

export type ThinkingConfigPayload =
  | { thinkingLevel: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' }
  | { thinkingBudget: number };

export function buildThinkingConfigForModel(modelId: string): ThinkingConfigPayload {
  const id = modelId.trim().toLowerCase();
  // Gemini 3+ → thinkingLevel only (never combine with thinkingBudget).
  if (id.startsWith('gemini-3') || id.startsWith('gemini-4')) {
    return { thinkingLevel: 'MINIMAL' };
  }
  // Gemini 2.5 Flash-Lite / Flash → budget. 0 is the closest to "minimal cost".
  if (id.includes('2.5')) {
    return { thinkingBudget: 0 };
  }
  // Unknown: prefer Gemini 3-style MINIMAL (our primary is 3.1).
  return { thinkingLevel: 'MINIMAL' };
}
