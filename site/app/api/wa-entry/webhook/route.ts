import { NextResponse } from 'next/server';

import { verifyWaEntryWebhook } from '../_lib/auth';
import { processWaEntryEvent } from '../_lib/process';
import { getWaEntryRuntime } from '../_lib/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ipHits = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const xf = req.headers.get('x-forwarded-for') || '';
  return (xf.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim();
}

function maskDigits(value?: string): string {
  const d = (value || '').replace(/\D/g, '');
  if (d.length < 6) return '***';
  return `${d.slice(0, 3)}***${d.slice(-2)}`;
}

function allowIp(ip: string, limit: number, nowMs: number): boolean {
  const row = ipHits.get(ip);
  if (!row || row.resetAt <= nowMs) {
    ipHits.set(ip, { count: 1, resetAt: nowMs + 60_000 });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
}

/**
 * Isolated inbound webhook for the universal WhatsApp entry router.
 *
 * Durable claim/process completes BEFORE HTTP 200 on accepted events.
 * Fail-closed flags. Isolated Preview sender never uses prod WA queue.
 *
 * DO NOT point ELMENUXFA1 here without explicit dual-dispatch / secondary-session auth.
 */
export async function POST(req: Request) {
  const runtimeCtx = getWaEntryRuntime();
  const { config } = runtimeCtx;
  const nowMs = Date.now();
  const ip = clientIp(req);

  if (!allowIp(ip, config.webhookRatePerMinute, nowMs)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  if (!config.inboundEnabled || !config.routerEnabled) {
    return NextResponse.json(
      { ok: true, action: 'ignored', reason: 'kill_switch' },
      { status: 200 },
    );
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > 0 && contentLength > config.maxBodyBytes) {
    return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > config.maxBodyBytes) {
    return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  }

  const auth = verifyWaEntryWebhook({
    config,
    headers: req.headers,
    rawBody,
  });
  if (auth.ok === false) {
    console.error('[wa-entry] unauthorized', { ip: ip.slice(0, 32) });
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    // Persist (claim) + route + isolated outbound BEFORE ACK so provider retries on failure.
    const result = await processWaEntryEvent({
      config,
      store: runtimeCtx.store,
      sender: runtimeCtx.sender,
      rawBody,
    });

    console.info('[wa-entry] processed', {
      action: result.action,
      reason: result.reason,
      chat: maskDigits(result.chatId),
      eventId: result.eventId ? String(result.eventId).slice(0, 12) : undefined,
      replyCount: result.replies.length,
      storeOps: result.metrics.storeOps,
    });

    if (!result.accepted) {
      // Malformed / rejected — 400 so provider can decide; not a silent drop.
      return NextResponse.json(
        { ok: false, action: result.action, reason: result.reason },
        { status: 400 },
      );
    }

    if (result.action === 'error') {
      // Durable claim may exist; return 500 to invite bounded provider retry.
      return NextResponse.json(
        { ok: false, action: 'error', reason: result.reason },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        action: result.action,
        reason: result.reason,
        eventId: result.eventId,
        state: result.state,
        replyCount: result.replies.length,
        metrics: result.metrics,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal_error';
    console.error('[wa-entry] process_error', message.slice(0, 200));
    return NextResponse.json({ ok: false, error: 'process_error' }, { status: 500 });
  }
}

/** Health / readiness — no secrets, no side effects. */
export async function GET() {
  const { config } = getWaEntryRuntime();
  return NextResponse.json({
    ok: true,
    module: 'wa-entry',
    inboundEnabled: config.inboundEnabled,
    routerEnabled: config.routerEnabled,
    adapter: config.adapter,
    storeKind: config.storeKind,
    previewProjectRef: config.storeKind === 'supabase_preview' ? config.previewProjectRef : null,
    realWasenderEnabled: false,
    webhookSecretConfigured: Boolean(config.webhookSecret),
  });
}
