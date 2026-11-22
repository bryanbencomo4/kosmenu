/**
 * Chat media helper (STT / image / PDF).
 * - simulate: deterministic text, 0 Gemini HTTP
 * - live: Gemini multimodal under live-budget + media sub-cap
 * Never creates orders. Ephemeral private disk only (no public buckets).
 */
import { NextResponse } from 'next/server';

import {
  allowsLocalOfflineChatbotCommerce,
  LOCAL_OFFLINE_CHATBOT_COMMERCE_ID,
  LOCAL_OFFLINE_CHATBOT_SLUG,
  parseAllowedCommerceIds,
} from '../../_lib/commerce-auth';
import { getChatbotConfig, isChatbotRuntimeAllowed } from '../../_lib/config';
import { getLiveBudgetSnapshot } from '../../_lib/live-budget';
import { storeEphemeralMedia, purgeExpiredMedia } from '../../_lib/media-ephemeral';
import { runMediaGemini } from '../../_lib/media-gemini';
import {
  CHAT_ALLOWED_AUDIO_MIME,
  CHAT_ALLOWED_FILE_MIME,
  CHAT_MEDIA_MAX_AUDIO_BYTES,
  CHAT_MEDIA_MAX_FILE_BYTES,
  chatMediaLiveAllowed,
  resolveChatMediaMode,
} from '../../_lib/media-gates';
import { isChatbotStagingMode } from '../../../_lib/staging-guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_AUDIO_DURATION_SEC = 60;

/**
 * Media is only for the chatbot allowlist (same UUID set as chat) plus the
 * local Trueno offline smoke slug/id. Never opens arbitrary commerces.
 */
function commerceAllowed(comercioId: string): boolean {
  const id = comercioId.trim().toLowerCase();
  if (!id) return false;
  if (id === LOCAL_OFFLINE_CHATBOT_COMMERCE_ID) return true;
  if (id === LOCAL_OFFLINE_CHATBOT_SLUG) return true;
  if (allowsLocalOfflineChatbotCommerce({ commerceId: id })) return true;
  const allowed = parseAllowedCommerceIds(
    process.env.CHATBOT_ALLOWED_COMMERCE_IDS,
  );
  return allowed.has(id);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ comercioId: string }> },
) {
  const { comercioId } = await ctx.params;
  if (!comercioId?.trim()) {
    return NextResponse.json({ ok: false, error: 'missing_commerce' }, { status: 400 });
  }

  // Production: same chatbot runtime gates as text chat (allowlist / postgres /
  // ALLOW_PRODUCTION). Media still needs CHATBOT_MEDIA_LIVE via chatMediaLiveAllowed.
  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'production') {
    const runtime = isChatbotRuntimeAllowed(getChatbotConfig());
    if (!runtime.ok) {
      return NextResponse.json(
        { ok: false, error: runtime.reason || 'production_blocked' },
        { status: 403 },
      );
    }
  }

  if (!commerceAllowed(comercioId)) {
    return NextResponse.json(
      { ok: false, error: 'commerce_not_allowlisted' },
      { status: 403 },
    );
  }

  purgeExpiredMedia();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  const kind = String(form.get('kind') || '').trim();
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: 'missing_file' }, { status: 400 });
  }

  const mime = (file.type || 'application/octet-stream').toLowerCase();
  const mode = resolveChatMediaMode();
  const durationSec = Math.min(
    MAX_AUDIO_DURATION_SEC,
    Math.max(1, Number(form.get('durationSec') || 30) || 30),
  );

  const buf = Buffer.from(await file.arrayBuffer());

  if (kind === 'audio') {
    if (
      !CHAT_ALLOWED_AUDIO_MIME.some((m) => mime.startsWith(m.split(';')[0])) &&
      !mime.startsWith('audio/')
    ) {
      return NextResponse.json({ ok: false, error: 'unsupported_audio' }, { status: 415 });
    }
    if (buf.length > CHAT_MEDIA_MAX_AUDIO_BYTES) {
      return NextResponse.json({ ok: false, error: 'audio_too_large' }, { status: 413 });
    }

    const stored = storeEphemeralMedia({
      bytes: buf,
      mime,
      kind: 'audio',
    });

    if (mode === 'simulate') {
      return NextResponse.json({
        ok: true,
        mode: 'simulate',
        geminiHttpCalls: 0,
        staging: isChatbotStagingMode(),
        ephemeralId: stored.id,
        transcript: null,
        note:
          'Transcripción automática no disponible en modo simulado. El audio se conserva en el chat; escribe el pedido o autoriza STT live.',
      });
    }

    const live = chatMediaLiveAllowed();
    if (!live.ok) {
      return NextResponse.json({
        ok: true,
        mode: 'blocked',
        geminiHttpCalls: 0,
        ephemeralId: stored.id,
        transcript: null,
        note: `STT live bloqueado (${live.reason}).`,
      });
    }

    const config = getChatbotConfig();
    if (!config.geminiApiKey) {
      return NextResponse.json(
        { ok: false, error: 'gemini_unconfigured' },
        { status: 503 },
      );
    }

    const result = await runMediaGemini({
      apiKey: config.geminiApiKey,
      model: config.model,
      mime,
      bytes: buf,
      kind: 'audio',
      audioDurationSec: durationSec,
      maxOutputTokens: Math.min(256, config.maxOutputTokens),
      prompt:
        'Transcribe fielmente el audio en español. Devuelve SOLO el texto dicho por el cliente, sin comillas ni comentarios. Si no se entiende, responde exactamente: [inaudible].',
    });

    const budget = getLiveBudgetSnapshot();
    if (result.ok === false) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          message: result.message,
          requestId: result.requestId,
          budget: {
            geminiHttpCalls: budget.geminiHttpCalls,
            mediaHttpCalls: budget.mediaHttpCalls,
            estimatedCostUsd: budget.estimatedCostUsd,
            mediaEstimatedCostUsd: budget.mediaEstimatedCostUsd,
            hardGuarantee: false,
          },
          ephemeralId: stored.id,
          transcript: null,
        },
        {
          status:
            result.error.includes('cap') || result.error.includes('preflight')
              ? 429
              : 502,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      mode: 'live',
      transcript: result.text,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      estimatedCostUsd: result.estimatedCostUsd,
      requestId: result.requestId,
      ephemeralId: stored.id,
      budget: {
        geminiHttpCalls: budget.geminiHttpCalls,
        mediaHttpCalls: budget.mediaHttpCalls,
        estimatedCostUsd: budget.estimatedCostUsd,
        mediaEstimatedCostUsd: budget.mediaEstimatedCostUsd,
        hardGuarantee: false,
      },
    });
  }

  if (kind === 'image' || kind === 'file') {
    if (!CHAT_ALLOWED_FILE_MIME.includes(mime) && !mime.startsWith('image/')) {
      return NextResponse.json({ ok: false, error: 'unsupported_file' }, { status: 415 });
    }
    if (buf.length > CHAT_MEDIA_MAX_FILE_BYTES) {
      return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 413 });
    }

    const stored = storeEphemeralMedia({
      bytes: buf,
      mime,
      kind: kind === 'image' ? 'image' : 'file',
    });
    const isImage = mime.startsWith('image/');

    if (mode === 'simulate') {
      return NextResponse.json({
        ok: true,
        mode: 'simulate',
        geminiHttpCalls: 0,
        ephemeralId: stored.id,
        analysis: isImage
          ? 'Recibí tu imagen. No analizo el contenido en modo simulado; descríbeme qué quieres pedir del menú real.'
          : 'Recibí tu archivo. En modo simulado no lo abro; dime qué necesitas del menú.',
      });
    }

    const live = chatMediaLiveAllowed();
    if (!live.ok) {
      return NextResponse.json({
        ok: true,
        mode: 'blocked',
        geminiHttpCalls: 0,
        ephemeralId: stored.id,
        analysis: `Análisis live bloqueado (${live.reason}).`,
      });
    }

    const config = getChatbotConfig();
    if (!config.geminiApiKey) {
      return NextResponse.json(
        { ok: false, error: 'gemini_unconfigured' },
        { status: 503 },
      );
    }

    const prompt = isImage
      ? [
          'Eres asistente de un restaurante. Analiza la imagen del cliente y responde SOLO en español con este formato exacto:',
          'TIPO: comprobante_pago | ubicacion_delivery | menu_comida | otro',
          'RESUMEN: 1-2 frases claras',
          'DETALLES: banco/monto/referencia si es comprobante; dirección/referencias si es ubicación; platos visibles si es comida. Si no se ve, escribe "no legible".',
          'NO inventes montos, bancos, productos ni direcciones que no se vean. Si es captura de transferencia/pago móvil/recibo → comprobante_pago. Si es mapa, fachada con dirección o nota de entrega → ubicacion_delivery. Si es plato/menú → menu_comida.',
        ].join('\n')
      : [
          'Eres asistente de un restaurante. Resume el PDF/archivo del cliente en español con este formato:',
          'TIPO: comprobante_pago | ubicacion_delivery | menu_comida | otro',
          'RESUMEN: 1-2 frases',
          'DETALLES: datos legibles (montos, refs, direcciones). NO inventes.',
        ].join('\n');

    const result = await runMediaGemini({
      apiKey: config.geminiApiKey,
      model: config.model,
      mime,
      bytes: buf,
      kind: isImage ? 'image' : 'file',
      maxOutputTokens: Math.min(256, config.maxOutputTokens),
      prompt,
    });

    const budget = getLiveBudgetSnapshot();
    if (result.ok === false) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          message: result.message,
          requestId: result.requestId,
          ephemeralId: stored.id,
          analysis: null,
          budget: {
            geminiHttpCalls: budget.geminiHttpCalls,
            mediaHttpCalls: budget.mediaHttpCalls,
            estimatedCostUsd: budget.estimatedCostUsd,
            mediaEstimatedCostUsd: budget.mediaEstimatedCostUsd,
            hardGuarantee: false,
          },
        },
        {
          status:
            result.error.includes('cap') || result.error.includes('preflight')
              ? 429
              : 502,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      mode: 'live',
      analysis: result.text,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      estimatedCostUsd: result.estimatedCostUsd,
      requestId: result.requestId,
      ephemeralId: stored.id,
      budget: {
        geminiHttpCalls: budget.geminiHttpCalls,
        mediaHttpCalls: budget.mediaHttpCalls,
        estimatedCostUsd: budget.estimatedCostUsd,
        mediaEstimatedCostUsd: budget.mediaEstimatedCostUsd,
        hardGuarantee: false,
      },
    });
  }

  return NextResponse.json({ ok: false, error: 'unknown_kind' }, { status: 400 });
}
