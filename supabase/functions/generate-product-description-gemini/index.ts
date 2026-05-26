/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  AiUsageError,
  COST_PRODUCT_DESCRIPTION,
  deductCredits,
  enforceAiLimits,
  hasEnoughCredits,
  recordGeminiUsage,
} from '../_shared/ai-usage.ts';
import {
  buildProductDescriptionSystemPrompt,
  buildProductDescriptionUserPrompt,
  detectProductVisualKind,
  type ProductImagePromptInput,
} from '../_shared/product-image-prompt.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-comercio-id',
};

const GEMINI_MODEL = 'gemini-2.5-flash';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const comercioId = normalizeString(body.commerce_id ?? body.comercio_id);
    const productName = normalizeString(body.product_name ?? body.productName ?? body.nombre);
    const categoryName = normalizeString(body.category_name ?? body.categoryName);
    const rawDescription = normalizeString(body.description ?? body.descripcion);
    const businessName = normalizeString(body.business_name ?? body.businessName);
    const businessCategory = normalizeString(body.business_category ?? body.businessCategory);

    if (!comercioId) {
      return jsonResponse({ error: 'Missing commerce_id' }, 400);
    }

    if (!productName) {
      return jsonResponse({ error: 'Missing product_name' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing env vars' }, 500);
    }

    if (!geminiApiKey) {
      return jsonResponse({ error: 'GEMINI_API_KEY is not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    await enforceAiLimits(supabase, comercioId);
    await hasEnoughCredits(supabase, comercioId, COST_PRODUCT_DESCRIPTION);

    const promptInput: ProductImagePromptInput = {
      productName,
      description: rawDescription,
      categoryName,
      businessName,
      businessCategory,
    };

    const kind = detectProductVisualKind(promptInput);
    const descriptionText = await generateDescriptionWithGemini({
      apiKey: geminiApiKey,
      supabase,
      comercioId,
      systemPrompt: buildProductDescriptionSystemPrompt(kind),
      userPrompt: buildProductDescriptionUserPrompt(promptInput),
    });

    await deductCredits(
      supabase,
      comercioId,
      COST_PRODUCT_DESCRIPTION,
      'product_description_generation',
      {
        function: 'generate-product-description-gemini',
        product_name: productName,
        visual_kind: kind,
      },
    );

    return jsonResponse(
      {
        ok: true,
        description: descriptionText,
        visual_kind: kind,
        credits_charged: COST_PRODUCT_DESCRIPTION,
      },
      200,
    );
  } catch (error) {
    if (error instanceof AiUsageError) {
      return jsonResponse(error.toResponseBody(), error.status);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: 'Description generation failed', message }, 500);
  }
});

async function generateDescriptionWithGemini(params: {
  apiKey: string;
  supabase: ReturnType<typeof createClient>;
  comercioId: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent` +
    `?key=${encodeURIComponent(params.apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: params.systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: params.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.55,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            description: { type: 'string' },
          },
          required: ['description'],
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini error (${GEMINI_MODEL}): ${await response.text()}`);
  }

  const completion = await response.json();
  await recordGeminiUsage(params.supabase, params.comercioId, completion?.usageMetadata);

  const parsed = safeParseJson(extractText(completion));
  const description = normalizeString(parsed?.description);
  if (!description) {
    throw new Error('Gemini did not return a product description');
  }

  return description.length > 320 ? `${description.slice(0, 317).trim()}...` : description;
}

function extractText(payload: Record<string, unknown>): string {
  const candidates = payload?.candidates as Array<Record<string, unknown>> | undefined;
  const parts = candidates?.[0]?.content as Record<string, unknown> | undefined;
  const partList = parts?.parts as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(partList)) {
    throw new Error('Gemini response did not include text output');
  }

  for (const part of partList) {
    const text = normalizeString(part?.text);
    if (text) return text;
  }

  throw new Error('Gemini response did not include text output');
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
