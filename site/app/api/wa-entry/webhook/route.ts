import { NextResponse } from 'next/server';

import { verifyWaEntryWebhook } from '../_lib/auth';
import { processWaEntryEvent } from '../_lib/process';
import { getWaEntryRuntime } from '../_lib/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Local / isolated inbound webhook for the universal WhatsApp entry router.
 *
 * Fail-closed: PLATFORM_WA_INBOUND + PLATFORM_WA_ROUTER must both be on.
 * Default adapter is `sim` — never calls production WaSender or Supabase.
 *
 * DO NOT point production ELMENUXFA1 webhooks here without an explicit
 * activation review and dual-dispatch plan.
 */
export async function POST(req: Request) {
  const runtimeCtx = getWaEntryRuntime();
  const { config } = runtimeCtx;

  if (!config.inboundEnabled || !config.routerEnabled) {
    return NextResponse.json(
      { ok: true, action: 'ignored', reason: 'kill_switch' },
      { status: 200 },
    );
  }

  const rawBody = await req.text();
  const auth = verifyWaEntryWebhook({
    config,
    headers: req.headers,
    rawBody,
  });
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const result = await processWaEntryEvent({
      config,
      store: runtimeCtx.store,
      sender: runtimeCtx.sender,
      rawBody,
    });

    // ACK quickly per provider expectations; details are for local observability only.
    return NextResponse.json(
      {
        ok: result.accepted,
        action: result.action,
        reason: result.reason,
        eventId: result.eventId,
        state: result.state,
        replyCount: result.replies.length,
        metrics: result.metrics,
      },
      { status: result.accepted ? 200 : 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal_error';
    // Never leak secrets; keep logs free of message bodies in production paths.
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
  });
}
