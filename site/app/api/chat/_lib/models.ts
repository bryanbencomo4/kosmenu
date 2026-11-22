/**
 * Chatbot Gemini model catalog (Phase 2.2).
 *
 * Sources (verified 2026-11-22 against Google AI docs / pricing):
 * - https://aistudio.google.com/docs/models/gemini-3.1-flash-lite
 * - https://aistudio.google.com/docs/models/gemini-2.5-flash-lite
 * - https://ai.google.dev/gemini-api/docs/pricing
 *
 * Image / menu-import Edge Functions keep their own model ids — do not reuse this catalog there.
 */

export type ChatbotModelInfo = {
  id: string;
  /** Paid-tier USD per 1M input tokens (text/image/video). */
  priceInputPer1M: number;
  /**
   * Paid-tier USD per 1M audio input tokens when billed separately.
   * Gemini 3.1 Flash-Lite: $0.50/1M audio (vs $0.25 text/image/video).
   * @see https://aistudio.google.com/docs/pricing
   */
  priceAudioInputPer1M: number;
  /** Paid-tier USD per 1M output tokens (includes thinking tokens when billed). */
  priceOutputPer1M: number;
  functionCalling: boolean;
  notes: string;
};

/** Gemini audio tokenization heuristic used for conservative preflight. */
export const GEMINI_AUDIO_TOKENS_PER_SECOND = 25;

/**
 * Primary recommendation: gemini-3.1-flash-lite
 * - Current Flash-Lite generation with function calling
 * - Cheaper than gemini-3.5-flash-lite ($0.25/$1.50 vs $0.30/$2.50)
 * - Replaces retired gemini-2.0-flash-lite (shutdown 2026-06-01)
 */
export const CHATBOT_PRIMARY_MODEL = 'gemini-3.1-flash-lite';

/**
 * Fallback: gemini-2.5-flash-lite
 * - Still served; function calling supported
 * - Cheaper than primary ($0.10/$0.40) — never auto-escalate to a pricier model
 * - Google may limit new-project access to 2.5; keep as soft fallback only
 *
 * Do NOT use gemini-2.5-flash (deprecated / routes to 3.5 Flash-Lite rates from 2026-12-01).
 */
export const CHATBOT_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

export const CHATBOT_MODEL_CATALOG: Record<string, ChatbotModelInfo> = {
  'gemini-3.1-flash-lite': {
    id: 'gemini-3.1-flash-lite',
    priceInputPer1M: 0.25,
    priceAudioInputPer1M: 0.5,
    priceOutputPer1M: 1.5,
    functionCalling: true,
    notes: 'Recommended primary. Function calling + structured output. Audio input $0.50/1M.',
  },
  'gemini-2.5-flash-lite': {
    id: 'gemini-2.5-flash-lite',
    priceInputPer1M: 0.1,
    priceAudioInputPer1M: 0.3,
    priceOutputPer1M: 0.4,
    functionCalling: true,
    notes: 'Cheaper fallback. Audio input $0.30/1M.',
  },
  'gemini-3.5-flash-lite': {
    id: 'gemini-3.5-flash-lite',
    priceInputPer1M: 0.3,
    priceAudioInputPer1M: 0.3,
    priceOutputPer1M: 2.5,
    functionCalling: true,
    notes: 'Newer Flash-Lite but more expensive than 3.1 — not the default.',
  },
};

/** Retired / unsuitable for this chatbot (kept for docs + tests). */
export const CHATBOT_RETIRED_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash',
] as const;

export function isKnownChatbotModel(id: string): boolean {
  return Boolean(CHATBOT_MODEL_CATALOG[id.trim()]);
}

export function resolveChatbotModelPair(params: {
  primaryRaw?: string | null;
  fallbackRaw?: string | null;
}): {
  model: string;
  modelFallback: string;
  priceInputPer1M: number;
  priceOutputPer1M: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let model = (params.primaryRaw ?? '').trim() || CHATBOT_PRIMARY_MODEL;
  let modelFallback =
    (params.fallbackRaw ?? '').trim() || CHATBOT_FALLBACK_MODEL;

  if ((CHATBOT_RETIRED_MODELS as readonly string[]).includes(model)) {
    warnings.push(`primary_retired:${model}`);
    model = CHATBOT_PRIMARY_MODEL;
  }
  if ((CHATBOT_RETIRED_MODELS as readonly string[]).includes(modelFallback)) {
    warnings.push(`fallback_retired:${modelFallback}`);
    modelFallback = CHATBOT_FALLBACK_MODEL;
  }

  if (model === modelFallback) {
    warnings.push('fallback_same_as_primary');
    modelFallback =
      model === CHATBOT_FALLBACK_MODEL
        ? CHATBOT_PRIMARY_MODEL
        : CHATBOT_FALLBACK_MODEL;
  }

  const primaryInfo = CHATBOT_MODEL_CATALOG[model];
  const fallbackInfo = CHATBOT_MODEL_CATALOG[modelFallback];

  if (primaryInfo && fallbackInfo) {
    const primaryCost =
      primaryInfo.priceInputPer1M + primaryInfo.priceOutputPer1M;
    const fallbackCost =
      fallbackInfo.priceInputPer1M + fallbackInfo.priceOutputPer1M;
    if (fallbackCost > primaryCost) {
      warnings.push('fallback_more_expensive_than_primary');
      // Enforce cheaper-or-equal fallback when both are known catalog models.
      modelFallback = CHATBOT_FALLBACK_MODEL;
    }
  }

  const pricing = primaryInfo ?? CHATBOT_MODEL_CATALOG[CHATBOT_PRIMARY_MODEL];

  return {
    model,
    modelFallback,
    priceInputPer1M: pricing.priceInputPer1M,
    priceOutputPer1M: pricing.priceOutputPer1M,
    warnings,
  };
}
