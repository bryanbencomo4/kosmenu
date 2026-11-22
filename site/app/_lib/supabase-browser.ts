'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

/**
 * Browser Supabase client for merchant panel (auth + Realtime under RLS).
 * Uses the anon key only — never the service role.
 */
export function getBrowserSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (browserClient) return browserClient;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anon) return null;
  browserClient = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'elmenuxfa-panel-auth',
    },
  });
  return browserClient;
}
