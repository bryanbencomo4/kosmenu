import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const FETCH_TIMEOUT_MS = 5_000;

let serviceClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function timedFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.signal) {
    return fetch(input, init);
  }
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

function createServerClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: timedFetch,
    },
  });
}

/**
 * Privileged server Supabase client (service role).
 * Fails immediately when SUPABASE_SERVICE_ROLE_KEY is missing.
 * Reuses one client per isolate so we do not open a connection per request.
 * Never import this module from Client Components.
 */
export function getServiceSupabaseClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  serviceClient = createServerClient(url, key);
  return serviceClient;
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
  if (anonClient) return anonClient;
  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  anonClient = createServerClient(url, key);
  return anonClient;
}
