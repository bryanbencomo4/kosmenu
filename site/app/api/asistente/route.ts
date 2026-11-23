import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  isDiscoveryAssistantApiEnabled,
  normalizeDiscoveryRef,
} from '../../_lib/discovery-assistant';
import { consumeRateLimit, getClientIp } from '../_lib/rate-limit';
import { createRequestId, createSessionId } from '../chat/_lib/schema';
import { runDiscoveryAgent } from './_lib/agent';
import {
  DISCOVERY_FALLBACK_MSG,
  estimateDiscoveryCostUsd,
  getDiscoveryAssistantConfig,
  isDiscoveryGeminiLiveAllowed,
} from './_lib/config';
import { getServiceSupabaseClient } from '../_lib/supabase-server';
import {
  DiscoveryQuotaError,
  recordDiscoveryTokens,
  reserveDiscoveryRequest,
} from './_lib/quota';

export const runtime = 'nodejs';
export const maxDuration = 60;

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(40),
  sessionId: z.string().trim().min(1).max(80).optional(),
  lat: z.number().finite().optional(),
  lng: z.number().finite().optional(),
  region: z.string().trim().max(60).optional(),
  /** Non-sensitive share origin (e.g. wa) — analytics placeholder only. */
  ref: z.string().trim().max(32).optional(),
});

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * POST /api/asistente — discovery agent.
 * When disabled / Gemini fails / quota exhausted: soft fallback so UI keeps directory path.
 */
export async function POST(request: Request) {
  const config = getDiscoveryAssistantConfig();

  if (!isDiscoveryAssistantApiEnabled() && !config.enabled) {
    return json({
      ok: true,
      fallback: true,
      text: DISCOVERY_FALLBACK_MSG,
      restaurants: [],
      reason: 'discovery_disabled',
    });
  }

  // Prefer explicit DISCOVERY_ASSISTANT_ENABLED via config.enabled
  if (!config.enabled) {
    return json({
      ok: true,
      fallback: true,
      text: DISCOVERY_FALLBACK_MSG,
      restaurants: [],
      reason: 'discovery_disabled',
    });
  }

  const ip = getClientIp(request);
  const rate = consumeRateLimit(
    `discovery-assistant:ip:${ip}`,
    config.rateLimitPerIpPerMinute,
    60_000,
  );
  if (!rate.ok) {
    return json(
      {
        ok: true,
        fallback: true,
        text: 'Demasiadas consultas. Usa los filtros del directorio o intenta en un momento.',
        restaurants: [],
        reason: 'ip_rate_limit',
      },
      429,
    );
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return json(
      {
        ok: false,
        error: 'invalid_body',
        fallback: true,
        text: 'Mensaje inválido.',
        restaurants: [],
      },
      400,
    );
  }

  const messages = body.messages
    .slice(-Math.min(config.maxMessagesPerRequest, config.maxHistoryMessages))
    .map((m) => ({
      role: m.role,
      text: m.text.slice(0, config.maxMessageChars),
    }));

  if (messages[messages.length - 1]?.role !== 'user') {
    return json(
      {
        ok: false,
        error: 'last_message_must_be_user',
        fallback: true,
        text: DISCOVERY_FALLBACK_MSG,
        restaurants: [],
      },
      400,
    );
  }

  const sessionId = body.sessionId || createSessionId();
  const requestId = createRequestId();
  const shareRef = normalizeDiscoveryRef(body.ref);
  const supabase =
    config.quotaBackend === 'postgres' ? getServiceSupabaseClient() : null;

  const live = isDiscoveryGeminiLiveAllowed(config);
  if (live.ok) {
    try {
      await reserveDiscoveryRequest({
        config,
        sessionId,
        supabase,
      });
    } catch (err) {
      if (err instanceof DiscoveryQuotaError) {
        // Soft fallback — client can still fetch directory.
        return json({
          ok: true,
          fallback: true,
          text: DISCOVERY_FALLBACK_MSG,
          restaurants: [],
          reason: err.code,
          sessionId,
          requestId,
          ref: shareRef,
        });
      }
      return json({
        ok: true,
        fallback: true,
        text: DISCOVERY_FALLBACK_MSG,
        restaurants: [],
        reason: 'quota_unavailable',
        sessionId,
        requestId,
        ref: shareRef,
      });
    }
  }

  try {
    const result = await runDiscoveryAgent({
      config,
      messages,
      ctx: {
        lat: body.lat,
        lng: body.lng,
        region: body.region,
        pageSize: config.defaultPageSize,
      },
      supabase,
    });

    // Post-turn metering (once per requestId). Never authorizes Gemini by itself.
    if (
      live.ok &&
      ((result.tokensInput ?? 0) > 0 || (result.tokensOutput ?? 0) > 0)
    ) {
      try {
        await recordDiscoveryTokens({
          config,
          requestId,
          model: result.model,
          tokensInput: result.tokensInput ?? 0,
          tokensOutput: result.tokensOutput ?? 0,
          supabase,
        });
      } catch {
        // Visibility only — request reserve already applied; do not fail the user turn.
      }
    }

    const tokensInput = result.tokensInput ?? 0;
    const tokensOutput = result.tokensOutput ?? 0;
    return json({
      ok: true,
      fallback: Boolean(result.fallback),
      text: result.text,
      restaurants: result.restaurants,
      model: result.model,
      toolCalls: result.toolCalls,
      skippedLlm: result.skippedLlm ?? false,
      tokensInput,
      tokensOutput,
      geminiHttpCalls: result.geminiHttpCalls ?? 0,
      estimatedCostUsd: estimateDiscoveryCostUsd(tokensInput, tokensOutput),
      stopReason: result.stopReason ?? null,
      sessionId,
      requestId,
      ref: shareRef,
    });
  } catch {
    return json({
      ok: true,
      fallback: true,
      text: DISCOVERY_FALLBACK_MSG,
      restaurants: [],
      sessionId,
      requestId,
      ref: shareRef,
      reason: 'agent_error',
    });
  }
}

/** Lightweight status — no secrets. */
export async function GET() {
  const config = getDiscoveryAssistantConfig();
  const live = isDiscoveryGeminiLiveAllowed(config);
  return json({
    ok: true,
    enabled: config.enabled,
    simulate: config.simulate,
    liveGemini: live.ok,
    liveReason: live.ok ? null : live.reason ?? null,
    quotaBackend: config.quotaBackend,
    pageSize: config.defaultPageSize,
    maxGeminiHttpCallsPerRequest: config.maxGeminiHttpCallsPerRequest,
    geminiHttpBudget: config.geminiHttpBudget || null,
    maxOutputTokens: config.maxOutputTokens,
    maxToolRounds: config.maxToolRounds,
  });
}
