import { z } from 'zod';

import { normalizePublicStatus, type PublicOrderStatus } from './public-order';

export const customerOrderActionSchema = z
  .discriminatedUnion('action', [
    z
      .object({
        action: z.literal('cancel'),
        source: z.enum(['cliente', 'timeout']),
      })
      .strict(),
    z
      .object({
        action: z.literal('set_whatsapp_notifications'),
        enabled: z.boolean(),
      })
      .strict(),
    z
      .object({
        action: z.literal('confirm_received'),
      })
      .strict(),
  ]);

export type CustomerOrderAction = z.infer<typeof customerOrderActionSchema>;

/** Customer-facing transitions only. Merchant/delivery use other channels. */
const CUSTOMER_ALLOWED: Record<
  PublicOrderStatus,
  Partial<Record<PublicOrderStatus, true>>
> = {
  pendiente: { cancelado: true },
  confirmado: {},
  preparando: {},
  en_camino: { entregado: true },
  entregado: {},
  cancelado: {},
};

export function assertCustomerStatusTransition(
  from: unknown,
  to: PublicOrderStatus,
): { ok: true } | { ok: false; error: string } {
  const current = normalizePublicStatus(from);
  if (current === to) return { ok: true };
  if (!CUSTOMER_ALLOWED[current]?.[to]) {
    return { ok: false, error: 'Transicion de estado no permitida.' };
  }
  return { ok: true };
}

export function isPedidoEstadoEnumError(message: string) {
  const normalized = (message ?? '').toLowerCase();
  return normalized.includes('invalid input value for enum') && normalized.includes('pedido_estado');
}
