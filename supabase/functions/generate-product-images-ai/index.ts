/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  AiUsageError,
  MAX_AI_IMAGES_ONBOARDING,
  enforceAiImageOnboardingLimit,
} from '../_shared/ai-usage.ts';

type ImageGenerationItem = {
  type: 'product' | 'category';
  id: string;
  name: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const commerceId = normalizeString(body.commerce_id ?? body.comercio_id);
    const items = normalizeItems(body.items);

    if (!commerceId) {
      return jsonResponse(
        {
          error: 'Missing commerce_id',
          message: 'commerce_id is required',
        },
        400,
      );
    }

    if (items.length === 0) {
      return jsonResponse(
        {
          error: 'Missing items',
          message: 'At least one item is required',
        },
        400,
      );
    }

    if (items.length > MAX_AI_IMAGES_ONBOARDING) {
      return jsonResponse(
        {
          error: 'AI image limit reached',
          message: 'AI image generation is only available once during onboarding',
        },
        429,
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          error: 'Missing env vars',
          message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const state = await enforceAiImageOnboardingLimit(supabase, commerceId);

    return jsonResponse(
      {
        ok: true,
        mode: 'placeholder',
        commerce_id: commerceId,
        requested_items: items.length,
        planned_generated_count: items.length,
        remaining_quota_before_generation:
          MAX_AI_IMAGES_ONBOARDING - state.ai_images_generated_count,
        message:
          'Placeholder mode: AI provider not configured yet. Integrate the real image model and call recordAiImagesGenerated after successful generation.',
        items,
      },
      200,
    );
  } catch (error) {
    if (error instanceof AiUsageError) {
      return jsonResponse(error.toResponseBody(), error.status);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: 'Image generation failed', message }, 500);
  }
});

function normalizeItems(value: unknown): ImageGenerationItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: ImageGenerationItem[] = [];
  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      continue;
    }

    const item = rawItem as Record<string, unknown>;
    const type = normalizeString(item.type);
    const id = normalizeString(item.id);
    const name = normalizeString(item.name);

    if ((type !== 'product' && type !== 'category') || !id || !name) {
      continue;
    }

    items.push({
      type,
      id,
      name,
    });
  }

  return items;
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