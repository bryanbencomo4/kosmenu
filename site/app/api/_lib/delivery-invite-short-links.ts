import { randomBytes } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

function generateCode() {
  return randomBytes(8).toString('base64url').slice(0, 10);
}

export async function createDeliveryInviteShortLink(input: {
  supabase: SupabaseClient;
  invitationId: string;
  token: string;
}) {
  const existing = await input.supabase
    .from('delivery_invite_short_links')
    .select('code')
    .eq('invitation_id', input.invitationId)
    .maybeSingle();
  if (!existing.error && existing.data?.code) return existing.data.code.toString();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = generateCode();
    const { data, error } = await input.supabase
      .from('delivery_invite_short_links')
      .insert({ code, invitation_id: input.invitationId, token: input.token })
      .select('code')
      .maybeSingle();
    if (!error && data?.code) return data.code.toString();
    if ((error as { code?: string } | null)?.code !== '23505') {
      throw new Error(error?.message ?? 'Unable to create delivery invite short link.');
    }
  }

  throw new Error('Unable to allocate delivery invite short link.');
}
