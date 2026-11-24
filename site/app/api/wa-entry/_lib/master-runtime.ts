/**
 * Production Master Assistant wiring (memory + identity + quota + menu read).
 * Uses the same production Supabase project as wa-entry — never Preview for pilot user data.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  assertProdSupabaseTarget,
  type WaEntryConfig,
} from './config';
import {
  createSupabaseWaMasterIdentitySource,
  createSupabaseWaMasterMemoryStore,
  createSupabaseWaMasterQuotaStore,
  type WaMasterIdentitySource,
  type WaMasterMemoryStore,
  type WaMasterQuotaStore,
} from '../../wa-master/_lib';
import type { AdminMenuLoader } from '../../wa-master/_lib/specialists/admin';

export type WaMasterRuntimeDeps = {
  memoryStore: WaMasterMemoryStore;
  quota: WaMasterQuotaStore;
  identitySource: WaMasterIdentitySource;
  loadMenu: AdminMenuLoader;
  client: SupabaseClient;
};

function createProdMasterClient(
  config: WaEntryConfig,
  env: NodeJS.ProcessEnv,
): SupabaseClient {
  assertProdSupabaseTarget(config, env);
  const url = (config.prodSupabaseUrl || env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (config.prodServiceRoleKey || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createSupabaseAdminMenuLoader(client: SupabaseClient): AdminMenuLoader {
  return async (comercioId: string) => {
    const { data: comercio, error: cErr } = await client
      .from('comercios')
      .select('id,nombre,moneda,tasa_cambio_pesos,permite_delivery,branding_ia')
      .eq('id', comercioId)
      .maybeSingle();
    if (cErr || !comercio) return null;

    const { data: products } = await client
      .from('productos')
      .select('id,nombre,precio,disponible,categoria')
      .eq('comercio_id', comercioId)
      .limit(40);

    return {
      comercioId: String(comercio.id),
      publicName: String(comercio.nombre || 'Comercio'),
      currencyLabel: comercio.moneda ? String(comercio.moneda) : null,
      exchangeRate:
        comercio.tasa_cambio_pesos != null ? String(comercio.tasa_cambio_pesos) : null,
      products: (products || []).map((p) => ({
        id: String(p.id),
        nombre: String(p.nombre || ''),
        precio: p.precio == null ? null : Number(p.precio),
        disponible: p.disponible == null ? null : Boolean(p.disponible),
        categoria: p.categoria ? String(p.categoria) : null,
      })),
      openLabel: null,
      permiteDelivery:
        comercio.permite_delivery == null ? null : Boolean(comercio.permite_delivery),
    };
  };
}

/**
 * Build Master deps for production store. Returns null if not prod supabase
 * or credentials incomplete (caller falls back to in-memory — fail soft for tests).
 */
export function tryCreateProdWaMasterRuntime(
  config: WaEntryConfig,
  env: NodeJS.ProcessEnv = process.env,
): WaMasterRuntimeDeps | null {
  if (config.storeKind !== 'supabase') return null;
  try {
    const client = createProdMasterClient(config, env);
    return {
      client,
      memoryStore: createSupabaseWaMasterMemoryStore(client),
      quota: createSupabaseWaMasterQuotaStore(client),
      identitySource: createSupabaseWaMasterIdentitySource(client),
      loadMenu: createSupabaseAdminMenuLoader(client),
    };
  } catch {
    return null;
  }
}
