import { createClient } from '@supabase/supabase-js';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function getServerSupabaseClient() {
  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
