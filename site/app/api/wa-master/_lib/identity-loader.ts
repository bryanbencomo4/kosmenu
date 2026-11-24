import type { SupabaseClient } from '@supabase/supabase-js';

import {
  resolveWaMasterIdentity,
  type WaMasterIdentityCatalogRow,
  type WaMasterIdentityHints,
} from './identity';
import { phonesMatchDigits, waMasterDigitsKey } from './phone';
import type { WaMasterIdentity } from './types';

export type WaMasterIdentitySource = {
  loadCatalog: () => Promise<WaMasterIdentityCatalogRow[]>;
  loadConsumerOrderDigits?: () => Promise<string[]>;
  loadOwnerAuthPhonesByComercio?: () => Promise<Record<string, string[]>>;
};

/**
 * Read-only identity snapshot from comercios (+ optional pedidos signal).
 * Phone match on comercios.whatsapp is NOT ownership proof.
 */
export function createSupabaseWaMasterIdentitySource(
  client: SupabaseClient,
): WaMasterIdentitySource {
  return {
    async loadCatalog() {
      const { data, error } = await client
        .from('comercios')
        .select('id,nombre,slug,whatsapp,telefonos,branding_ia')
        .limit(500);
      if (error || !data) return [];
      return data.map((row) => {
        const branding =
          row.branding_ia && typeof row.branding_ia === 'object'
            ? (row.branding_ia as Record<string, unknown>)
            : {};
        const config =
          branding.config_negocio && typeof branding.config_negocio === 'object'
            ? (branding.config_negocio as Record<string, unknown>)
            : {};
        const supervision =
          (typeof config.supervision_whatsapp === 'string' && config.supervision_whatsapp) ||
          (typeof config.notify_whatsapp === 'string' && config.notify_whatsapp) ||
          null;
        return {
          comercioId: String(row.id),
          publicName: String(row.nombre || 'Comercio'),
          slug: row.slug ? String(row.slug) : null,
          whatsapp: row.whatsapp ? String(row.whatsapp) : null,
          telefonos: row.telefonos ? String(row.telefonos) : null,
          supervisionWhatsapp: supervision,
        } satisfies WaMasterIdentityCatalogRow;
      });
    },

    async loadConsumerOrderDigits() {
      // Existence signal only — never return order payloads.
      const { data, error } = await client
        .from('pedidos')
        .select('telefono_cliente')
        .not('telefono_cliente', 'is', null)
        .limit(2000);
      if (error || !data) return [];
      const out = new Set<string>();
      for (const row of data) {
        const d = waMasterDigitsKey(String(row.telefono_cliente || ''));
        if (d) out.add(d);
      }
      return [...out];
    },
  };
}

/** Contract-shaped fixtures when Preview lacks dense phone data. */
export const WA_MASTER_IDENTITY_FIXTURES: WaMasterIdentityCatalogRow[] = [
  {
    comercioId: 'fixture-don-tomas',
    publicName: 'Pizzería Don Tomás',
    slug: 'don-tomas',
    whatsapp: '+584120000099',
    telefonos: null,
    supervisionWhatsapp: null,
  },
  {
    comercioId: 'fixture-burger-lab',
    publicName: 'Burger Lab',
    slug: 'burger-lab',
    whatsapp: '04120000099',
    telefonos: null,
    supervisionWhatsapp: null,
  },
];

export const WA_MASTER_CONSUMER_ORDER_FIXTURES = ['584140821633', '584120000050'];

export async function loadWaMasterIdentity(params: {
  fromDigits: string;
  source?: WaMasterIdentitySource | null;
  /** Merge fixtures when live catalog empty or for deterministic pilots. */
  includeFixtures?: boolean;
  extraHints?: WaMasterIdentityHints;
}): Promise<WaMasterIdentity> {
  const fromDigits = waMasterDigitsKey(params.fromDigits);
  let catalog: WaMasterIdentityCatalogRow[] = [];
  const hints: WaMasterIdentityHints = { ...(params.extraHints || {}) };

  if (params.source) {
    try {
      catalog = await params.source.loadCatalog();
      if (params.source.loadConsumerOrderDigits) {
        hints.consumerOrderDigits = await params.source.loadConsumerOrderDigits();
      }
      if (params.source.loadOwnerAuthPhonesByComercio) {
        hints.ownerAuthPhonesByComercio = await params.source.loadOwnerAuthPhonesByComercio();
      }
    } catch {
      catalog = [];
    }
  }

  if (params.includeFixtures !== false) {
    // Always available contract fixtures for tests / sparse Preview.
    const seen = new Set(catalog.map((c) => c.comercioId));
    for (const row of WA_MASTER_IDENTITY_FIXTURES) {
      if (!seen.has(row.comercioId)) catalog.push(row);
    }
    const orderDigits = new Set([
      ...(hints.consumerOrderDigits || []),
      ...WA_MASTER_CONSUMER_ORDER_FIXTURES,
    ]);
    hints.consumerOrderDigits = [...orderDigits];
  }

  const identity = resolveWaMasterIdentity({ fromDigits, catalog, hints });

  // Extra safety note when match is public whatsapp field only.
  if (
    identity.comercios.some((c) => c.matchField === 'whatsapp' || c.matchField === 'telefonos')
  ) {
    if (!identity.provenanceNotes.includes('phone_match_is_not_ownership')) {
      identity.provenanceNotes.push('phone_match_is_not_ownership');
    }
  }
  return identity;
}

/** True if digits appear as a consumer order signal (no order details). */
export function hasConsumerOrderSignal(identity: WaMasterIdentity, digits: string): boolean {
  return identity.consumerOrderSignal && phonesMatchDigits(identity.fromDigits, digits);
}
