import { phonesMatchDigits, waMasterDigitsKey } from './phone';
import type { WaMasterComercioRef, WaMasterIdentity, WaMasterRole } from './types';

export type WaMasterIdentityCatalogRow = {
  comercioId: string;
  publicName: string;
  slug: string | null;
  whatsapp: string | null;
  telefonos: string | null;
  supervisionWhatsapp: string | null;
};

export type WaMasterIdentityHints = {
  /** Digits that appeared on pedidos.telefono_cliente (signal only). */
  consumerOrderDigits?: string[];
  /** Owner auth phones keyed by comercioId — weak signal. */
  ownerAuthPhonesByComercio?: Record<string, string[]>;
};

/**
 * Resolve contact identity from a preloaded catalog (sim or service-role snapshot).
 * Does not grant mutation rights. Multi-match returns all public candidates.
 */
export function resolveWaMasterIdentity(params: {
  fromDigits: string;
  catalog: WaMasterIdentityCatalogRow[];
  hints?: WaMasterIdentityHints;
}): WaMasterIdentity {
  const fromDigits = waMasterDigitsKey(params.fromDigits);
  const notes: string[] = [];
  const comercios: WaMasterComercioRef[] = [];
  const seen = new Set<string>();

  const push = (ref: WaMasterComercioRef) => {
    if (seen.has(ref.comercioId)) return;
    seen.add(ref.comercioId);
    comercios.push(ref);
  };

  for (const row of params.catalog) {
    if (row.whatsapp && phonesMatchDigits(fromDigits, row.whatsapp)) {
      push({
        comercioId: row.comercioId,
        publicName: row.publicName,
        slug: row.slug,
        matchField: 'whatsapp',
        provenance: 'verified_db',
      });
      continue;
    }
    if (row.telefonos && phonesMatchDigits(fromDigits, row.telefonos)) {
      push({
        comercioId: row.comercioId,
        publicName: row.publicName,
        slug: row.slug,
        matchField: 'telefonos',
        provenance: 'verified_db',
      });
      continue;
    }
    if (row.supervisionWhatsapp && phonesMatchDigits(fromDigits, row.supervisionWhatsapp)) {
      push({
        comercioId: row.comercioId,
        publicName: row.publicName,
        slug: row.slug,
        matchField: 'supervision_whatsapp',
        provenance: 'verified_db',
      });
    }
  }

  const ownerMap = params.hints?.ownerAuthPhonesByComercio ?? {};
  for (const [comercioId, phones] of Object.entries(ownerMap)) {
    if (phones.some((p) => phonesMatchDigits(fromDigits, p))) {
      const row = params.catalog.find((c) => c.comercioId === comercioId);
      if (row) {
        push({
          comercioId: row.comercioId,
          publicName: row.publicName,
          slug: row.slug,
          matchField: 'owner_auth',
          provenance: 'verified_db',
        });
        notes.push('owner_auth_phone_match_weak');
      }
    }
  }

  const consumerOrderSignal = (params.hints?.consumerOrderDigits ?? []).some((d) =>
    phonesMatchDigits(fromDigits, d),
  );
  if (consumerOrderSignal) notes.push('pedido_telefono_cliente_match');

  let role: WaMasterRole = 'new_contact';
  if (comercios.length && consumerOrderSignal) role = 'mixed';
  else if (comercios.length > 0) role = 'merchant_candidate';
  else if (consumerOrderSignal) role = 'possible_consumer';

  return {
    fromDigits,
    role,
    comercios,
    possibleConsumer: consumerOrderSignal || role === 'possible_consumer' || role === 'mixed',
    consumerOrderSignal,
    provenanceNotes: notes,
  };
}
