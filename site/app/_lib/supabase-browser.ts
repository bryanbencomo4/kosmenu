'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;
let anonRealtimeClient: SupabaseClient | null = null;

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

/**
 * Anon Realtime client for consumer chat hints (no session persistence).
 * Does not share the merchant panel auth storage key.
 */
export function getAnonRealtimeSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (anonRealtimeClient) return anonRealtimeClient;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anon) return null;
  anonRealtimeClient = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return anonRealtimeClient;
}
