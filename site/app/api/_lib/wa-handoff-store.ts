/**
 * Resolve handoff persistence store.
 * Prefer Preview Supabase when PLATFORM_WA_PREVIEW_* is set — never write
 * test codes to production unless those vars are absent and prod URL is intentional.
 */

import { createClient } from '@supabase/supabase-js';

import {
  createMemoryWaHandoffStore,
  createSupabaseWaHandoffStore,
  type WaHandoffStore,
} from './wa-handoff';

const PREVIEW_REF = 'gsfxqzvmyzjjgpigrste';
const PROD_REF = 'qqhberaayhohxlbbhdyi';

export function resolveWaHandoffStore(env: NodeJS.ProcessEnv = process.env): WaHandoffStore {
  if ((env.NODE_ENV || '') === 'test') {
    const g = globalThis as unknown as { __waHandoffStore?: WaHandoffStore };
    if (!g.__waHandoffStore) g.__waHandoffStore = createMemoryWaHandoffStore();
    return g.__waHandoffStore;
  }

  const vercelEnv = (env.VERCEL_ENV || '').trim().toLowerCase();
  const previewUrl = (env.PLATFORM_WA_PREVIEW_SUPABASE_URL || '').trim();
  const previewKey = (env.PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY || '').trim();
  // Preview store ONLY on Preview / explicit local test — never on production.
  if (
    previewUrl &&
    previewKey &&
    (vercelEnv === 'preview' || (env.WA_HANDOFF_STORE || '').trim() === 'supabase_preview')
  ) {
    if (!previewUrl.includes(PREVIEW_REF) || previewUrl.includes(PROD_REF)) {
      throw new Error('wa_handoff_refused: preview supabase URL invalid');
    }
    return createSupabaseWaHandoffStore(
      createClient(previewUrl, previewKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
  }

  const url = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    // Refuse accidental prod writes when Vercel Preview is active without Preview vars.
    if (vercelEnv === 'preview' && url.includes(PROD_REF)) {
      const g = globalThis as unknown as { __waHandoffStore?: WaHandoffStore };
      if (!g.__waHandoffStore) g.__waHandoffStore = createMemoryWaHandoffStore();
      return g.__waHandoffStore;
    }
    if (vercelEnv === 'production' && url.includes(PREVIEW_REF)) {
      throw new Error('wa_handoff_refused: production must not use Preview Supabase');
    }
    return createSupabaseWaHandoffStore(
      createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
  }

  const g = globalThis as unknown as { __waHandoffStore?: WaHandoffStore };
  if (!g.__waHandoffStore) g.__waHandoffStore = createMemoryWaHandoffStore();
  return g.__waHandoffStore;
}
