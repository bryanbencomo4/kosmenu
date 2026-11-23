import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isChatbotStagingMode } from './staging-guards';
import { asReadOnlySupabaseClient } from './supabase-readonly';

const FETCH_TIMEOUT_MS = 5_000;

let serviceClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;
let stagingServiceClient: SupabaseClient | null = null;
let stagingAnonClient: SupabaseClient | null = null;

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
  if (isChatbotStagingMode()) {
    if (stagingServiceClient) return stagingServiceClient;
    // Catalog reads for offline Trueno need service role SELECT; wrap to deny writes.
    // Prefer service role when present; otherwise anon (RLS-limited).
    const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
    const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    const key = service || anon;
    if (!key) {
      throw new Error(
        'Staging mode requires SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY',
      );
    }
    stagingServiceClient = asReadOnlySupabaseClient(
      createServerClient(url, key),
    );
    return stagingServiceClient;
  }
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
  if (isChatbotStagingMode()) {
    if (stagingAnonClient) return stagingAnonClient;
    const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
    const key = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    stagingAnonClient = asReadOnlySupabaseClient(createServerClient(url, key));
    return stagingAnonClient;
  }
  if (anonClient) return anonClient;
  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  anonClient = createServerClient(url, key);
  return anonClient;
}
