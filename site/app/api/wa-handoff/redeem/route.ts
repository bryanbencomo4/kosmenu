import { NextResponse } from 'next/server';

import { appCorsPreflight, withAppCors } from '../../_lib/app-cors';
import { resolveWaHandoffStore } from '../../_lib/wa-handoff-store';
import type { WaHandoffDestination } from '../../_lib/wa-handoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = {
  methods: 'POST, OPTIONS',
  headers: 'authorization, content-type, accept',
};

/**
 * POST /api/wa-handoff/redeem
 * body: { code, destination?, action?: 'peek' | 'consume' }
 * - peek (default): validate without consuming — safe for boots / previews that run JS
 * - consume: atomic one-time use — only after intentional user action
 * Never use GET with the code (link previews).
 */
export async function OPTIONS(req: Request) {
  return appCorsPreflight(req, CORS);
}

export async function POST(req: Request) {
  let body: { code?: string; destination?: string; action?: string };
  try {
    body = (await req.json()) as { code?: string; destination?: string; action?: string };
  } catch {
    return withAppCors(
      req,
      NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }),
      CORS,
    );
  }
  const code = (body.code || '').trim();
  if (!code || code.length > 64 || !/^[A-Za-z0-9_-]+$/.test(code)) {
    return withAppCors(
      req,
      NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 400 }),
      CORS,
    );
  }
  const destination = (body.destination || '').trim() as WaHandoffDestination | '';
  const action = (body.action || 'peek').trim().toLowerCase() === 'consume' ? 'consume' : 'peek';
  const store = resolveWaHandoffStore();
  const result =
    action === 'consume'
      ? await store.redeem({ code, destination: destination || undefined })
      : await store.validate({ code, destination: destination || undefined });

  if (result.ok === false) {
    const status =
      result.error === 'not_found' || result.error === 'destination_mismatch' ? 404 : 409;
    return withAppCors(
      req,
      NextResponse.json({ ok: false, error: result.error, action }, { status }),
      CORS,
    );
  }

  // Never echo fromDigitsHash to clients.
  return withAppCors(
    req,
    NextResponse.json({
      ok: true,
      action,
      destination: result.record.destination,
      payload: result.record.payload,
      expiresAtMs: result.record.expiresAtMs,
      consumed: Boolean(result.record.consumedAtMs),
    }),
    CORS,
  );
}

/** Reject GET — prevents accidental consume/leak via crawlers hitting query strings. */
export async function GET(req: Request) {
  return withAppCors(
    req,
    NextResponse.json(
      { ok: false, error: 'method_not_allowed', hint: 'use_post_peek_or_consume' },
      { status: 405 },
    ),
    CORS,
  );
}
