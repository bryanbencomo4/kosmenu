import { getServiceSupabaseClient } from '../../_lib/supabase-server';

export type BusinessShop = {
  comercioId: string;
  nombre: string;
  slug: string | null;
  role: string;
  moneda: string | null;
  tasa: string | null;
  enLinea: boolean | null;
  horarios: unknown;
};

export async function resolveMembership(
  userId: string,
  preferredComercioId?: string | null,
): Promise<{ list: BusinessShop[]; selected: BusinessShop | null }> {
  const sb = getServiceSupabaseClient();
  const { data: owned } = await sb
    .from('comercios')
    .select('id,nombre,slug,moneda,tasa_cambio_pesos,en_linea,horarios')
    .eq('owner_id', userId)
    .limit(20);
  const { data: memberRows } = await sb
    .from('comercio_members')
    .select('comercio_id,role,status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(20);

  const byId = new Map<string, BusinessShop>();
  for (const row of owned || []) {
    byId.set(String(row.id), {
      comercioId: String(row.id),
      nombre: String(row.nombre || 'Negocio'),
      slug: row.slug ? String(row.slug) : null,
      role: 'owner',
      moneda: row.moneda ? String(row.moneda) : null,
      tasa: row.tasa_cambio_pesos != null ? String(row.tasa_cambio_pesos) : null,
      enLinea: typeof row.en_linea === 'boolean' ? row.en_linea : null,
      horarios: row.horarios ?? null,
    });
  }
  for (const m of memberRows || []) {
    const id = String(m.comercio_id);
    if (byId.has(id)) continue;
    const { data: c } = await sb
      .from('comercios')
      .select('id,nombre,slug,moneda,tasa_cambio_pesos,en_linea,horarios')
      .eq('id', id)
      .maybeSingle();
    if (!c) continue;
    byId.set(id, {
      comercioId: id,
      nombre: String(c.nombre || 'Negocio'),
      slug: c.slug ? String(c.slug) : null,
      role: String(m.role || 'member'),
      moneda: c.moneda ? String(c.moneda) : null,
      tasa: c.tasa_cambio_pesos != null ? String(c.tasa_cambio_pesos) : null,
      enLinea: typeof c.en_linea === 'boolean' ? c.en_linea : null,
      horarios: c.horarios ?? null,
    });
  }
  const list = [...byId.values()];
  const preferred = preferredComercioId
    ? list.find((c) => c.comercioId === preferredComercioId) || null
    : list.length === 1
      ? list[0]
      : null;
  return { list, selected: preferred };
}

export function userCanOperateShop(
  shops: BusinessShop[],
  comercioId: string,
): BusinessShop | null {
  return shops.find((s) => s.comercioId === comercioId) ?? null;
}
