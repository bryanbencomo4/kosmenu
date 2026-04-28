/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AiUsageError, getCredits } from '../_shared/ai-usage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-comercio-id',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = req.method === 'POST' ? await safeJson(req) : {};
    const commerceId = resolveComercioId(req, body);
    if (!commerceId) {
      return jsonResponse(
        {
          error: 'Missing commerce_id',
          message: 'commerce_id is required',
        },
        400,
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

    const wallet = await getCredits(supabase, commerceId);

    return jsonResponse(
      {
        commerce_id: commerceId,
        credits_balance: wallet.credits_balance,
        credits_used: wallet.credits_used,
      },
      200,
    );
  } catch (error) {
    if (error instanceof AiUsageError) {
      return jsonResponse(error.toResponseBody(), error.status);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: 'Could not load AI credits', message }, 500);
  }
});

function resolveComercioId(req: Request, body: Record<string, unknown>): string {
  const headerValue = normalizeString(req.headers.get('x-comercio-id'));
  if (headerValue) {
    return headerValue;
  }

  const url = new URL(req.url);
  const queryValue = normalizeString(url.searchParams.get('commerce_id'));
  if (queryValue) {
    return queryValue;
  }

  return normalizeString(body.commerce_id ?? body.comercio_id);
}

async function safeJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const payload = await req.json();
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
  } catch {
    // Ignore empty or invalid JSON bodies for the balance lookup.
  }

  return {};
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