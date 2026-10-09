import 'server-only';

import { publicSiteUrl } from '../../_lib/public-site-config';
import { getAdminSupabaseClient } from './admin-supabase';

export type AdminBusinessRow = {
  id: string;
  nombre: string;
  slug: string;
  categoria: string | null;
  direccion: string | null;
  en_linea: boolean;
  mostrar_en_directorio_publico: boolean;
  promovido: boolean;
  negocio_virtual: boolean;
  updated_at: string | null;
  created_at: string | null;
  menuUrl: string;
};

type RawComercio = {
  id?: string | null;
  nombre?: string | null;
  slug?: string | null;
  categoria?: string | null;
  direccion?: string | null;
  en_linea?: boolean | null;
  mostrar_en_directorio_publico?: boolean | null;
  negocio_virtual?: boolean | null;
  branding_ia?: unknown;
  updated_at?: string | null;
  created_at?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function readPromotedFromBranding(brandingIa: unknown): boolean {
  const branding = asRecord(brandingIa);
  const config = asRecord(branding.config_negocio);
  return config.destacado_directorio === true || config.promovido === true;
}

export function withPromotedFlag(brandingIa: unknown, promoted: boolean): Record<string, unknown> {
  const branding = { ...asRecord(brandingIa) };
  const config = { ...asRecord(branding.config_negocio) };
  config.destacado_directorio = promoted;
  // Keep legacy alias in sync so older readers stay consistent.
  config.promovido = promoted;
  branding.config_negocio = config;
  return branding;
}

function toAdminBusiness(row: RawComercio): AdminBusinessRow | null {
  const id = (row.id ?? '').toString().trim();
  const slug = (row.slug ?? '').toString().trim();
  const nombre = (row.nombre ?? '').toString().trim();
  if (!id || !slug || !nombre) return null;

  const site = publicSiteUrl.replace(/\/$/, '');
  return {
    id,
    nombre,
    slug,
    categoria: (row.categoria ?? '').toString().trim() || null,
    direccion: (row.direccion ?? '').toString().trim() || null,
    en_linea: row.en_linea === true,
    mostrar_en_directorio_publico: row.mostrar_en_directorio_publico === true,
    promovido: readPromotedFromBranding(row.branding_ia),
    negocio_virtual: row.negocio_virtual === true,
    updated_at: row.updated_at ?? null,
    created_at: row.created_at ?? null,
    menuUrl: `${site}/v/${encodeURIComponent(slug)}`,
  };
}

export async function listAdminBusinesses(options?: {
  query?: string;
  limit?: number;
}) {
  const supabase = getAdminSupabaseClient();
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 1000);
  const query = (options?.query ?? '').trim();

  let request = supabase
    .from('comercios')
    .select(
      'id,nombre,slug,categoria,direccion,en_linea,mostrar_en_directorio_publico,negocio_virtual,branding_ia,updated_at,created_at',
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (query.length >= 2) {
    const safe = query.replace(/[%_,]/g, '').slice(0, 60);
    if (safe) {
      request = request.or(
        `nombre.ilike.%${safe}%,slug.ilike.%${safe}%,categoria.ilike.%${safe}%,direccion.ilike.%${safe}%`,
      );
    }
  }

  const { data, error } = await request;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as RawComercio[])
    .map(toAdminBusiness)
    .filter((row): row is AdminBusinessRow => row != null);
}

export async function getAdminBusinessRaw(id: string) {
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('comercios')
    .select(
      'id,nombre,slug,categoria,direccion,en_linea,mostrar_en_directorio_publico,negocio_virtual,branding_ia,updated_at,created_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as RawComercio | null) ?? null;
}

export async function updateAdminBusiness(
  id: string,
  patch: {
    promovido?: boolean;
    mostrar_en_directorio_publico?: boolean;
    en_linea?: boolean;
  },
) {
  const current = await getAdminBusinessRaw(id);
  if (!current?.id) {
    throw new Error('Negocio no encontrado.');
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof patch.mostrar_en_directorio_publico === 'boolean') {
    updates.mostrar_en_directorio_publico = patch.mostrar_en_directorio_publico;
  }
  if (typeof patch.en_linea === 'boolean') {
    updates.en_linea = patch.en_linea;
  }
  if (typeof patch.promovido === 'boolean') {
    updates.branding_ia = withPromotedFlag(current.branding_ia, patch.promovido);
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('comercios')
    .update(updates)
    .eq('id', id)
    .select(
      'id,nombre,slug,categoria,direccion,en_linea,mostrar_en_directorio_publico,negocio_virtual,branding_ia,updated_at,created_at',
    )
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const mapped = toAdminBusiness((data as RawComercio | null) ?? current);
  if (!mapped) {
    throw new Error('No se pudo actualizar el negocio.');
  }
  return mapped;
}
