import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import {
  createMemoryWaHandoffStore,
  createSupabaseWaHandoffStore,
  type WaHandoffDestination,
} from '../../_lib/wa-handoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getStore() {
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
  // Process-local fallback (Preview without table / local)
  const g = globalThis as unknown as { __waHandoffStore?: ReturnType<typeof createMemoryWaHandoffStore> };
  if (!g.__waHandoffStore) g.__waHandoffStore = createMemoryWaHandoffStore();
  return g.__waHandoffStore;
}

export async function POST(req: Request) {
  let body: { code?: string; destination?: string };
  try {
    body = (await req.json()) as { code?: string; destination?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const code = (body.code || '').trim();
  if (!code || code.length > 64 || !/^[A-Za-z0-9_-]+$/.test(code)) {
    return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 400 });
  }
  const destination = (body.destination || '').trim() as WaHandoffDestination | '';
  const store = getStore();
  const result = await store.redeem({
    code,
    destination: destination || undefined,
  });
  if (!result.ok) {
    const status =
      result.error === 'not_found' || result.error === 'destination_mismatch' ? 404 : 409;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  // Never echo phone hashes to the browser beyond necessity.
  return NextResponse.json({
    ok: true,
    destination: result.record.destination,
    payload: result.record.payload,
    expiresAtMs: result.record.expiresAtMs,
  });
}
