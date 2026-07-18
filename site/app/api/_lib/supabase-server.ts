import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

/**
 * Privileged server Supabase client (service role).
 * Fails immediately when SUPABASE_SERVICE_ROLE_KEY is missing.
 * Never import this module from Client Components.
 */
export function getServiceSupabaseClient(): SupabaseClient {
  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * @deprecated Use getServiceSupabaseClient(). Kept as an explicit alias so
 * call sites do not silently fall back to the anon key.
 */
export function getServerSupabaseClient(): SupabaseClient {
  return getServiceSupabaseClient();
}

/**
 * Explicit anon client for rare server paths that must respect RLS.
 * Does not use the service role key.
 */
export function getAnonServerSupabaseClient(): SupabaseClient {
  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
