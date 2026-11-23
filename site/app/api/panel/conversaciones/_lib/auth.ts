import 'server-only';

import type { User } from '@supabase/supabase-js';

import { getUserFromBearerRequest } from '../../../_lib/supabase-user-auth';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';
import { isSupervisionMemoryEnabled } from '../../../chat/_lib/supervision-memory';

export type MerchantAccess = {
  user: User;
  comercioId: string;
  role: string;
};

/**
 * Local/E2E only: Bearer matching CHAT_SUPERVISION_E2E_BEARER when memory
 * store is on. Never active in production.
 */
function tryE2eAccess(
  request: Request,
  comercioId: string,
): MerchantAccess | null {
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') return null;
  if (!isSupervisionMemoryEnabled()) return null;
  const expected = (process.env.CHAT_SUPERVISION_E2E_BEARER || '').trim();
  if (!expected) return null;
  const auth = request.headers.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : '';
  // Primary bearer, or `${bearer}:b` for a second employee (concurrency tests).
  const isPrimary = token === expected;
  const isSecondary = token === `${expected}:b`;
  if (!token || (!isPrimary && !isSecondary)) return null;
  const pinned = (process.env.CHAT_SUPERVISION_E2E_COMERCIO_ID || '').trim();
  const requested = comercioId.trim();
  // When a commerce is pinned for e2e, reject other commerce IDs.
  if (pinned && requested && requested.toLowerCase() !== pinned.toLowerCase()) {
    return null;
  }
  const id = requested || pinned;
  if (!id) return null;
  const primaryUserId =
    (process.env.CHAT_SUPERVISION_E2E_USER_ID || '').trim() ||
    '00000000-0000-4000-8000-0000000000e2';
  const secondaryUserId =
    (process.env.CHAT_SUPERVISION_E2E_USER_ID_B || '').trim() ||
    '00000000-0000-4000-8000-0000000000e3';
  const userId = isSecondary ? secondaryUserId : primaryUserId;
  return {
    user: {
      id: userId,
      email: isSecondary
        ? 'e2e-supervision-b@elmenuxfa.local'
        : 'e2e-supervision@elmenuxfa.local',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as User,
    comercioId: id,
    role: 'administrador',
  };
}

export async function requireMerchantConversationAccess(
  request: Request,
  comercioId: string,
): Promise<MerchantAccess | { error: string; status: number }> {
  const e2e = tryE2eAccess(request, comercioId);
  if (e2e) return e2e;

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
