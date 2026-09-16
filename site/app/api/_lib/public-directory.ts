import 'server-only';

import { publicSiteUrl } from '../../_lib/public-site-config';
import { isOwnerEmailVerified } from '../menu/_lib/load-public-menu';
import {
  buildOrderCountMap,
  pickFeaturedDirectoryBusinesses,
  rankDirectorySearchResults,
} from './public-directory-featured';
import { normalizeDirectoryQuery } from './public-directory-text';
import { getServiceSupabaseClient } from './supabase-server';

export type PublicDirectoryBusiness = {
  id: string;
  slug: string;
  nombre: string;
  logoUrl: string | null;
  categoria: string | null;
  direccion: string | null;
  negocioVirtual: boolean;
  menuUrl: string;
};

type RawComercioRow = {
  id?: string | null;
  slug?: string | null;
  nombre?: string | null;
  logo_url?: string | null;
  categoria?: string | null;
  direccion?: string | null;
  negocio_virtual?: boolean | null;
  owner_id?: string | null;
  updated_at?: string | null;
};

const DIRECTORY_SELECT =
  'id,slug,nombre,logo_url,categoria,direccion,negocio_virtual,owner_id,updated_at';

const FEATURED_ORDER_LOOKBACK_DAYS = 90;
const FEATURED_CANDIDATE_LIMIT = 120;

function toDirectoryBusiness(row: RawComercioRow): PublicDirectoryBusiness | null {
  const id = (row.id ?? '').toString().trim();
  const slug = (row.slug ?? '').toString().trim();
  const nombre = (row.nombre ?? '').toString().trim();
  if (!id || !slug || !nombre) return null;

  const site = publicSiteUrl.replace(/\/$/, '');
  return {
    id,
    slug,
    nombre,
    logoUrl: (row.logo_url ?? '').toString().trim() || null,
    categoria: (row.categoria ?? '').toString().trim() || null,
    direccion: (row.direccion ?? '').toString().trim() || null,
    negocioVirtual: row.negocio_virtual === true,
    menuUrl: `${site}/v/${encodeURIComponent(slug)}`,
  };
}

async function filterVerifiedBusinesses(rows: RawComercioRow[]) {
  const supabase = getServiceSupabaseClient();
  const verified: PublicDirectoryBusiness[] = [];

  for (const row of rows) {
    const ownerId = (row.owner_id ?? '').toString().trim();
    if (ownerId) {
      try {
        const ok = await isOwnerEmailVerified(supabase, ownerId);
        if (!ok) continue;
      } catch {
        // Keep listing resilient if auth admin lookup is temporarily unavailable.
      }
    }

    const mapped = toDirectoryBusiness(row);
    if (mapped) verified.push(mapped);
  }

  return verified;
}

async function loadRecentOrderCounts(comercioIds: string[]) {
  if (comercioIds.length === 0) {
    return new Map<string, number>();
  }

  const supabase = getServiceSupabaseClient();
  const since = new Date();
  since.setDate(since.getDate() - FEATURED_ORDER_LOOKBACK_DAYS);

  const { data, error } = await supabase
    .from('pedidos')
    .select('comercio_id')
    .gte('created_at', since.toISOString())
    .in('comercio_id', comercioIds);

  if (error) {
    throw new Error(error.message);
  }

  return buildOrderCountMap((data ?? []) as Array<{ comercio_id?: string | null }>);
}

async function loadFeaturedDirectoryBusinesses(limit: number) {
  const supabase = getServiceSupabaseClient();

  const { data, error } = await supabase
    .from('comercios')
    .select(DIRECTORY_SELECT)
    .eq('en_linea', true)
    .order('updated_at', { ascending: false })
    .limit(FEATURED_CANDIDATE_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  const verified = await filterVerifiedBusinesses((data ?? []) as RawComercioRow[]);
  const orderCounts = await loadRecentOrderCounts(verified.map((entry) => entry.id));

  return pickFeaturedDirectoryBusinesses(verified, orderCounts, limit);
}

export async function searchPublicDirectory(options: {
  query?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 20);
  const normalizedQuery = normalizeDirectoryQuery(options.query ?? '');
  const supabase = getServiceSupabaseClient();

  if (normalizedQuery.length === 0) {
    return loadFeaturedDirectoryBusinesses(limit);
  }

  const safeTerm = normalizedQuery.replace(/[%_]/g, '');
  const pattern = `%${safeTerm}%`;

  const { data, error } = await supabase
    .from('comercios')
    .select(DIRECTORY_SELECT)
    .eq('en_linea', true)
    .or(
      `nombre.ilike."${pattern}",slug.ilike."${pattern}",categoria.ilike."${pattern}",direccion.ilike."${pattern}"`,
    )
    .order('updated_at', { ascending: false })
    .limit(limit * 4);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RawComercioRow[];
  const verified = await filterVerifiedBusinesses(rows);
  const ranked = rankDirectorySearchResults(verified, normalizedQuery);

  return ranked.slice(0, limit);
}
