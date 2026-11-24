import { NextResponse } from 'next/server';

import { verifyWaEntryWebhook } from '../_lib/auth';
import { loadWaEntryConfig } from '../_lib/config';
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
 * Inbound webhook for the universal WhatsApp entry router.
 *
 * Durable claim/process completes BEFORE HTTP 200 on accepted events.
 * Fail-closed flags (inbound/router/real-send independent).
 * Production: only enable after ELMENUXFA1 webhook backup + controlled cutover.
 */
export async function POST(req: Request) {
  // Config-only first so auth works even if durable store init fails.
  const config = loadWaEntryConfig();
  const nowMs = Date.now();
  const ip = clientIp(req);

  if (!allowIp(ip, config.webhookRatePerMinute, nowMs)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > 0 && contentLength > config.maxBodyBytes) {
    return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > config.maxBodyBytes) {
    return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  }

  // Authenticate BEFORE kill-switch / store init so forged requests never look like soft ignore.
  const auth = verifyWaEntryWebhook({
    config,
    headers: req.headers,
    rawBody,
  });
  if (auth.ok === false) {
    console.error('[wa-entry] unauthorized', { ip: ip.slice(0, 32) });
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  // Inbound off: ACK without side effects. Router off still allows passive claim path.
  if (!config.inboundEnabled) {
    return NextResponse.json(
      { ok: true, action: 'ignored', reason: 'kill_switch' },
      { status: 200 },
    );
  }

  let runtimeCtx;
  try {
    runtimeCtx = getWaEntryRuntime();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'runtime_init_error';
    console.error('[wa-entry] runtime_init', message.slice(0, 200));
    return NextResponse.json(
      { ok: false, error: 'runtime_init', reason: message.slice(0, 160) },
      { status: 500 },
    );
  }

  try {
    // Persist (claim) + route + isolated outbound BEFORE ACK so provider retries on failure.
    const result = await processWaEntryEvent({
      config: runtimeCtx.config,
      store: runtimeCtx.store,
      sender: runtimeCtx.sender,
      rawBody,
      masterMemoryStore: runtimeCtx.master?.memoryStore,
      masterQuota: runtimeCtx.master?.quota,
      masterIdentitySource: runtimeCtx.master?.identitySource ?? null,
      masterLoadMenu: runtimeCtx.master?.loadMenu,
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

/** Health / readiness — no secrets, no store side effects. */
export async function GET() {
  try {
    // Config-only: do not initialize Supabase store on health checks.
    const config = loadWaEntryConfig();
    return NextResponse.json({
      ok: true,
      module: 'wa-entry',
      inboundEnabled: config.inboundEnabled,
      routerEnabled: config.routerEnabled,
      adapter: config.adapter,
      storeKind: config.storeKind,
      previewProjectRef:
        config.storeKind === 'supabase_preview' ? config.previewProjectRef : null,
      prodProjectRef: config.storeKind === 'supabase' ? config.prodProjectRef : null,
      realWasenderEnabled: Boolean(
        config.allowRealWasender && config.adapter === 'wasender',
      ),
      allowlistCount: config.allowlistDigits.length,
      enforceAllowlist: config.enforceAllowlist,
      webhookSecretConfigured: Boolean(config.webhookSecret),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'health_error';
    return NextResponse.json(
      { ok: false, module: 'wa-entry', error: message.slice(0, 160) },
      { status: 500 },
    );
  }
}
