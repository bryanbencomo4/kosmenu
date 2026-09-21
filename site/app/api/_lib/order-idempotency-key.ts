import { createHash } from 'crypto';

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function normalizeIdempotencyKey(raw: string | null): string | null {
  const key = (raw ?? '').trim();
  if (!key) return null;
  if (!KEY_PATTERN.test(key)) return null;
  return key;
}

export function hashOrderIdempotencyPayload(payload: unknown): string {
  const canonical = JSON.stringify(stableOrderIdempotencyPayload(payload));
  return createHash('sha256').update(canonical).digest('hex');
}

/** Fields that identify the customer's order intent. Volatile quotes like the FX rate are omitted so a retry is not treated as a different order. */
export function stableOrderIdempotencyPayload(payload: unknown) {
  const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return {
    comercioId: raw.comercioId ?? null,
    cliente_nombre: raw.cliente_nombre ?? null,
    telefono_cliente: raw.telefono_cliente ?? null,
    moneda_checkout: raw.moneda_checkout ?? null,
    costo_delivery: raw.costo_delivery ?? null,
    items: raw.items ?? null,
    delivery: raw.delivery ?? null,
    paymentMethod: raw.paymentMethod ?? null,
    paymentProofUrl: raw.paymentProofUrl ?? null,
    orderNotes: raw.orderNotes ?? null,
  };
}
