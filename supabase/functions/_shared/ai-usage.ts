const MAX_REQUESTS_PER_MONTH = 50;
const MAX_ESTIMATED_COST = 10;
const COST_PER_1K_TOKENS = 0.0005;
const MAX_AI_IMAGES_ONBOARDING = 25;

type AiUsageControlRow = {
  id: string;
  commerce_id: string;
  period_month: string;
  tokens_input: number;
  tokens_output: number;
  requests: number;
  estimated_cost: number;
  created_at?: string;
  updated_at?: string;
};

type GeminiUsageMetadata = {
  promptTokenCount?: unknown;
  candidatesTokenCount?: unknown;
};

type CommerceAiImageStateRow = {
  id: string;
  onboarding_completed: boolean;
  ai_image_generation_used: boolean;
  ai_images_generated_count: number;
  ai_images_generation_completed_at?: string;
};

export class AiUsageError extends Error {
  readonly status: number;
  readonly errorCode: string;

  constructor(message: string, status: number, errorCode: string) {
    super(message);
    this.name = 'AiUsageError';
    this.status = status;
    this.errorCode = errorCode;
  }

  toResponseBody() {
    return {
      error: this.errorCode,
      message: this.message,
    };
  }
}

export function getCurrentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function enforceAiLimits(
  supabase: any,
  commerceId: string,
): Promise<AiUsageControlRow> {
  const normalizedCommerceId = commerceId.trim();
  if (!normalizedCommerceId) {
    throw new Error('commerceId is required to enforce AI limits');
  }

  const { data: commerce, error: commerceError } = await supabase
    .from('comercios')
    .select('id, ai_enabled')
    .eq('id', normalizedCommerceId)
    .limit(1)
    .maybeSingle();

  if (commerceError) {
    throw new Error(`Error loading comercio AI settings: ${commerceError.message}`);
  }

  if (!commerce?.id) {
    throw new AiUsageError('Comercio not found.', 404, 'Commerce not found');
  }

  if (commerce.ai_enabled === false) {
    throw new AiUsageError('AI disabled for this commerce', 403, 'AI disabled');
  }

  const periodMonth = getCurrentPeriod();
  const { data: usageRow, error: usageError } = await supabase
    .from('ai_usage_control')
    .upsert(
      {
        commerce_id: normalizedCommerceId,
        period_month: periodMonth,
      },
      {
        onConflict: 'commerce_id,period_month',
      },
    )
    .select(
      'id, commerce_id, period_month, tokens_input, tokens_output, requests, estimated_cost, created_at, updated_at',
    )
    .single();

  if (usageError) {
    throw new Error(`Error loading AI usage control: ${usageError.message}`);
  }

  const usage = normalizeUsageRow(usageRow);

  if (usage.requests >= MAX_REQUESTS_PER_MONTH) {
    throw new AiUsageError(
      'You have reached your monthly AI usage limit',
      429,
      'AI limit reached',
    );
  }

  if (usage.estimated_cost >= MAX_ESTIMATED_COST) {
    throw new AiUsageError(
      'You have reached your monthly AI usage limit',
      429,
      'AI limit reached',
    );
  }

  return usage;
}

export async function recordGeminiUsage(
  supabase: any,
  commerceId: string,
  usageMetadata: GeminiUsageMetadata | null | undefined,
) {
  const normalizedCommerceId = commerceId.trim();
  if (!normalizedCommerceId) {
    throw new Error('commerceId is required to record AI usage');
  }

  const inputTokens = normalizeInteger(usageMetadata?.promptTokenCount);
  const outputTokens = normalizeInteger(usageMetadata?.candidatesTokenCount);
  const estimatedCost = estimateCostUsd(inputTokens, outputTokens);

  const { error } = await supabase.rpc('increment_ai_usage_control', {
    p_commerce_id: normalizedCommerceId,
    p_period_month: getCurrentPeriod(),
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_requests: 1,
    p_estimated_cost: estimatedCost,
  });

  if (error) {
    throw new Error(`Error updating AI usage control: ${error.message}`);
  }

  return {
    inputTokens,
    outputTokens,
    estimatedCost,
  };
}

export async function enforceAiImageOnboardingLimit(
  supabase: any,
  commerceId: string,
): Promise<CommerceAiImageStateRow> {
  const normalizedCommerceId = commerceId.trim();
  if (!normalizedCommerceId) {
    throw new AiUsageError('Missing required field: commerce_id', 400, 'Missing commerce_id');
  }

  if (!isAiImageGenerationEnabled()) {
    throw new AiUsageError(
      'AI image generation is temporarily disabled',
      503,
      'AI image generation disabled',
    );
  }

  const { data: commerce, error } = await supabase
    .from('comercios')
    .select(
      'id, onboarding_completed, ai_image_generation_used, ai_images_generated_count, ai_images_generation_completed_at',
    )
    .eq('id', normalizedCommerceId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Error loading comercio AI image settings: ${error.message}`);
  }

  if (!commerce?.id) {
    throw new AiUsageError('Comercio not found.', 404, 'Commerce not found');
  }

  const state = normalizeCommerceAiImageState(commerce);

  if (state.onboarding_completed) {
    throw new AiUsageError(
      'AI image generation is only available once during onboarding',
      429,
      'AI image limit reached',
    );
  }

  if (state.ai_image_generation_used) {
    throw new AiUsageError(
      'AI image generation is only available once during onboarding',
      429,
      'AI image limit reached',
    );
  }

  if (state.ai_images_generated_count >= MAX_AI_IMAGES_ONBOARDING) {
    throw new AiUsageError(
      'AI image generation is only available once during onboarding',
      429,
      'AI image limit reached',
    );
  }

  return state;
}

export async function recordAiImagesGenerated(
  supabase: any,
  commerceId: string,
  generatedCount: number,
) {
  const normalizedCommerceId = commerceId.trim();
  if (!normalizedCommerceId) {
    throw new Error('commerceId is required to record AI image generation');
  }

  const safeGeneratedCount = Math.max(0, Math.trunc(generatedCount));
  if (safeGeneratedCount <= 0) {
    return null;
  }

  const { data, error } = await supabase.rpc('increment_ai_images_generated', {
    p_commerce_id: normalizedCommerceId,
    p_generated_count: safeGeneratedCount,
  });

  if (error) {
    throw new Error(`Error updating AI image generation usage: ${error.message}`);
  }

  return data;
}

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return ((inputTokens + outputTokens) / 1000) * COST_PER_1K_TOKENS;
}

function normalizeUsageRow(value: Record<string, unknown>): AiUsageControlRow {
  return {
    id: String(value.id ?? ''),
    commerce_id: String(value.commerce_id ?? ''),
    period_month: String(value.period_month ?? ''),
    tokens_input: normalizeInteger(value.tokens_input),
    tokens_output: normalizeInteger(value.tokens_output),
    requests: normalizeInteger(value.requests),
    estimated_cost: normalizeNumber(value.estimated_cost),
    created_at: value.created_at ? String(value.created_at) : undefined,
    updated_at: value.updated_at ? String(value.updated_at) : undefined,
  };
}

function normalizeCommerceAiImageState(
  value: Record<string, unknown>,
): CommerceAiImageStateRow {
  return {
    id: String(value.id ?? ''),
    onboarding_completed: normalizeBoolean(value.onboarding_completed),
    ai_image_generation_used: normalizeBoolean(value.ai_image_generation_used),
    ai_images_generated_count: normalizeInteger(value.ai_images_generated_count),
    ai_images_generation_completed_at: value.ai_images_generation_completed_at
      ? String(value.ai_images_generation_completed_at)
      : undefined,
  };
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function isAiImageGenerationEnabled(): boolean {
  return normalizeString(Deno.env.get('AI_IMAGE_GENERATION_ENABLED')).toLowerCase() !== 'false';
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  const parsed = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  const parsed = Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export {
  MAX_AI_IMAGES_ONBOARDING,
  MAX_ESTIMATED_COST,
  MAX_REQUESTS_PER_MONTH,
};