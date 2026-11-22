import 'server-only';

import type { User } from '@supabase/supabase-js';

import { getUserFromBearerRequest } from '../../../_lib/supabase-user-auth';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';

export type MerchantAccess = {
  user: User;
  comercioId: string;
  role: string;
};

export async function requireMerchantConversationAccess(
  request: Request,
  comercioId: string,
): Promise<MerchantAccess | { error: string; status: number }> {
  const user = await getUserFromBearerRequest(request);
  if (!user) return { error: 'unauthorized', status: 401 };

  const id = comercioId.trim();
  if (!id) return { error: 'missing_comercio', status: 400 };

  const sb = getServiceSupabaseClient();
  const { data: owner } = await sb
    .from('comercios')
    .select('id,owner_id')
    .eq('id', id)
    .maybeSingle();

  if (owner && String(owner.owner_id) === user.id) {
    return { user, comercioId: id, role: 'administrador' };
  }

  const { data: member } = await sb
    .from('comercio_members')
    .select('role,status')
    .eq('comercio_id', id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!member) return { error: 'forbidden', status: 403 };
  const role = String(member.role || '');
  if (!['administrador', 'caja', 'marketing'].includes(role)) {
    return { error: 'forbidden_role', status: 403 };
  }
  return { user, comercioId: id, role };
}
