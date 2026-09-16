import { NextResponse } from 'next/server';

import { loadPublicMenuByIdentifier } from '../menu/_lib/load-public-menu';
import { getAnonServerSupabaseClient } from '../_lib/supabase-server';

export const dynamic = 'force-dynamic';

const MENU_CANARY_SLUG = 'napoles-pizza';

type CheckStatus = 'ok' | 'fail';

async function timed<T>(fn: () => Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    const value = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

  const checks: Record<string, CheckStatus> = {
    site: 'ok',
    supabaseRest: 'fail',
    supabaseAuth: 'fail',
    publicMenu: 'fail',
  };

  if (supabaseUrl && anonKey) {
    const rest = await timed(async () => {
      const client = getAnonServerSupabaseClient();
      const { error } = await client
        .from('global_market_rates')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
    }, 8000);
    checks.supabaseRest = rest.ok ? 'ok' : 'fail';

    const auth = await timed(async () => {
      const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/settings`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(String(response.status));
    }, 8000);
    checks.supabaseAuth = auth.ok ? 'ok' : 'fail';
  }

  const menu = await timed(async () => {
    const loaded = await loadPublicMenuByIdentifier(MENU_CANARY_SLUG);
    if (!loaded) {
      throw new Error('canary menu missing');
    }
    // Offline/draft is a billing outcome, not an outage. Online menus must still have products.
    if (loaded.isOnline && (!Array.isArray(loaded.productos) || loaded.productos.length < 1)) {
      throw new Error('canary menu empty');
    }
  }, 8000);
  checks.publicMenu = menu.ok ? 'ok' : 'fail';

  const ok = Object.values(checks).every((status) => status === 'ok');
  return NextResponse.json(
    {
      ok,
      service: 'elmenuxfa-site',
      checks,
      ts: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
