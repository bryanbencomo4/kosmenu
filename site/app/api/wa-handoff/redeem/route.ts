import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import {
  createMemoryWaHandoffStore,
  createSupabaseWaHandoffStore,
  type WaHandoffDestination,
  type WaHandoffStore,
} from '../../_lib/wa-handoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getStore(): WaHandoffStore {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key && process.env.NODE_ENV !== 'test') {
    try {
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return createSupabaseWaHandoffStore(client);
    } catch {
      /* fall through */
    }
  }
  const g = globalThis as unknown as { __waHandoffStore?: WaHandoffStore };
  if (!g.__waHandoffStore) g.__waHandoffStore = createMemoryWaHandoffStore();
  return g.__waHandoffStore;
}

/**
 * POST /api/wa-handoff/redeem
 * body: { code, destination?, action?: 'peek' | 'consume' }
 * - peek (default): validate without consuming — safe for boots / previews that run JS
 * - consume: atomic one-time use — only after intentional user action
 * Never use GET with the code (link previews).
 */
export async function POST(req: Request) {
  let body: { code?: string; destination?: string; action?: string };
  try {
    body = (await req.json()) as { code?: string; destination?: string; action?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const code = (body.code || '').trim();
  if (!code || code.length > 64 || !/^[A-Za-z0-9_-]+$/.test(code)) {
    return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 400 });
  }
  const destination = (body.destination || '').trim() as WaHandoffDestination | '';
  const action = (body.action || 'peek').trim().toLowerCase() === 'consume' ? 'consume' : 'peek';
  const store = getStore();
  const result =
    action === 'consume'
      ? await store.redeem({ code, destination: destination || undefined })
      : await store.validate({ code, destination: destination || undefined });

  if (result.ok === false) {
    const status =
      result.error === 'not_found' || result.error === 'destination_mismatch' ? 404 : 409;
    return NextResponse.json({ ok: false, error: result.error, action }, { status });
  }

  // Never echo fromDigitsHash to clients.
  return NextResponse.json({
    ok: true,
    action,
    destination: result.record.destination,
    payload: result.record.payload,
    expiresAtMs: result.record.expiresAtMs,
    consumed: Boolean(result.record.consumedAtMs),
  });
}

/** Reject GET — prevents accidental consume/leak via crawlers hitting query strings. */
export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'method_not_allowed', hint: 'use_post_peek_or_consume' },
    { status: 405 },
  );
}
