import 'server-only';

import { createClient, type User } from '@supabase/supabase-js';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

/**
 * Resolve the Supabase Auth user from an Authorization: Bearer <access_token> header.
 * Uses the anon key + JWT (respects Auth); never returns the service role.
 */
export async function getUserFromBearerRequest(request: Request): Promise<User | null> {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = (match?.[1] ?? '').trim();
  if (!token || token.length < 20 || token.length > 4096) {
    return null;
  }

  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) {
    return null;
  }
  return data.user;
}
