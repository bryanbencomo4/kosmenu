import { NextResponse } from 'next/server';

import { getUserFromBearerRequest } from '../../../_lib/supabase-user-auth';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import { isSupervisionMemoryEnabled } from '../../../chat/_lib/supervision-memory';
import { isSupervisionEnabledForCommerce } from '../../../chat/_lib/supervision-config';

export const runtime = 'nodejs';

/**
 * GET /api/panel/conversaciones/me
 * Lists comercios the authenticated merchant can supervise (no UUID paste).
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = consumeRateLimit(`panel:chat:me:${ip}`, 40, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  if (isSupervisionMemoryEnabled()) {
    const pinned = (process.env.CHAT_SUPERVISION_E2E_COMERCIO_ID || '').trim();
    const auth = request.headers.get('authorization') || '';
    const token = auth.toLowerCase().startsWith('bearer ')
      ? auth.slice(7).trim()
      : '';
    const expected = (process.env.CHAT_SUPERVISION_E2E_BEARER || '').trim();
    if (
      (process.env.NODE_ENV || '').toLowerCase() !== 'production' &&
      expected &&
      token === expected &&
      pinned
    ) {
      return NextResponse.json({
        ok: true,
        memory: true,
        comercios: [
          {
            id: pinned,
            nombre: 'E2E Comercio',
            role: 'administrador',
            supervision_enabled: isSupervisionEnabledForCommerce(pinned),
          },
        ],
      });
    }
  }

  const user = await getUserFromBearerRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = getServiceSupabaseClient();
  const owned = await sb
    .from('comercios')
    .select('id,nombre')
    .eq('owner_id', user.id)
    .limit(50);

  const members = await sb
    .from('comercio_members')
    .select('comercio_id,role,status,comercios(id,nombre)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('role', ['administrador', 'caja', 'marketing'])
    .limit(50);

  const byId = new Map<
    string,
    { id: string; nombre: string; role: string; supervision_enabled: boolean }
  >();

  for (const row of owned.data || []) {
    const id = String(row.id);
    byId.set(id, {
      id,
      nombre: String(row.nombre || 'Comercio'),
      role: 'administrador',
      supervision_enabled: isSupervisionEnabledForCommerce(id),
    });
  }

  for (const row of members.data || []) {
    const id = String(row.comercio_id || (row as { comercios?: { id?: string } }).comercios?.id || '');
    if (!id || byId.has(id)) continue;
    const nested = (row as { comercios?: { nombre?: string } }).comercios;
    byId.set(id, {
      id,
      nombre: String(nested?.nombre || 'Comercio'),
      role: String(row.role || ''),
      supervision_enabled: isSupervisionEnabledForCommerce(id),
    });
  }

  return NextResponse.json({
    ok: true,
    comercios: [...byId.values()],
  });
}
