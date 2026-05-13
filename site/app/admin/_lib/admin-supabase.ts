import 'server-only';

import { createClient } from '@supabase/supabase-js';

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`[admin-supabase] Missing environment variable: ${name}`);
  }

  return value;
}

export function getAdminSupabaseClient() {
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