/**
 * Durable control-plane store for take/mute across Vercel instances.
 * Always prefers production Supabase when credentials are present — even if
 * PLATFORM_WA_INBOUND is temporarily off (runtime otherwise falls back to memory).
 */

import { createClient } from '@supabase/supabase-js';

import {
  assertProdSupabaseTarget,
  loadWaEntryConfig,
  WA_ENTRY_PROD_PROJECT_REF,
} from './config';
import { createMemoryWaEntryStore } from './store';
import { asAsyncStore, type WaEntryAsyncStore } from './store-async';
import { createSupabaseWaEntryStore } from './store-supabase';

export function resolveWaEntryControlStore(
  env: NodeJS.ProcessEnv = process.env,
): WaEntryAsyncStore {
  const config = loadWaEntryConfig(env);
  const url = (
    config.prodSupabaseUrl ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_URL ||
    ''
  ).trim();
  const key = (config.prodServiceRoleKey || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (url.includes(WA_ENTRY_PROD_PROJECT_REF) && key.startsWith('eyJ')) {
    const gated = {
      ...config,
      storeKind: 'supabase' as const,
      inboundEnabled: true,
      prodSupabaseUrl: url,
      prodServiceRoleKey: key,
    };
    assertProdSupabaseTarget(gated, env);
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return createSupabaseWaEntryStore(client);
  }

  // Local/test fallback only.
  return asAsyncStore(createMemoryWaEntryStore());
}
