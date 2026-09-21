export type CheckoutAttempt = {
  key: string;
  fingerprint: string;
};

export type CheckoutAttemptFingerprintInput = {
  comercioId: string;
  customerName: string;
  customerWhatsapp: string;
  customerEmail: string;
  currency: string;
  paymentMethodId: string;
  paymentReferenceLast4: string;
  notes: string;
  deliveryMode: string;
  totalCents: number;
  items: Array<{ nombre?: string; cantidad?: number; precio?: number }>;
};

export function createCheckoutIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const random = Math.random().toString(36).slice(2, 12);
  return `chk-${Date.now().toString(36)}-${random}`;
}

export function checkoutAttemptFingerprint(input: CheckoutAttemptFingerprintInput) {
  const items = (input.items ?? [])
    .map((item) => {
      const name = (item.nombre ?? '').toString().trim();
      const qty = Number(item.cantidad) || 0;
      const price = Math.round((Number(item.precio) || 0) * 100);
      return `${name}:${qty}:${price}`;
    })
    .join('|');

  return [
    (input.comercioId ?? '').trim(),
    (input.customerName ?? '').trim().toLowerCase(),
    (input.customerWhatsapp ?? '').replace(/\D/g, ''),
    (input.customerEmail ?? '').trim().toLowerCase(),
    (input.currency ?? '').trim().toUpperCase(),
    (input.paymentMethodId ?? '').trim(),
    (input.paymentReferenceLast4 ?? '').trim(),
    (input.notes ?? '').trim(),
    (input.deliveryMode ?? '').trim(),
    String(input.totalCents ?? 0),
    items,
  ].join('::');
}

export function resolveCheckoutAttempt(
  current: CheckoutAttempt | null,
  fingerprint: string,
): CheckoutAttempt {
  if (current?.fingerprint === fingerprint && current.key) {
    return current;
  }

  return {
    key: createCheckoutIdempotencyKey(),
    fingerprint,
  };
}

export function humanizeOrderSubmitError(error: string) {
  const code = (error ?? '').toString().trim();
  if (code === 'idempotency_key_reuse_with_different_payload') {
    return 'No se pudo confirmar este pedido. Pulsa otra vez para enviarlo.';
  }
  return code || 'No se pudo guardar el pedido.';
}
