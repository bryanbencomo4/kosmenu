import { describe, expect, it } from 'vitest';
import { customerOrderActionSchema, assertCustomerStatusTransition } from '../app/api/_lib/order-customer-actions';
import { toPublicOrderTrackingResponse } from '../app/api/_lib/public-order';

describe('restored manual customer cancellation', () => {
  it('rejects automatic timeout cancellation', () => {
    expect(customerOrderActionSchema.safeParse({ action: 'cancel', source: 'timeout', reason: 'expired' }).success).toBe(false);
  });
  it('accepts manual cancellation with a reason', () => {
    expect(customerOrderActionSchema.safeParse({ action: 'cancel', source: 'cliente', reason: 'Cambio de planes' }).success).toBe(true);
  });
  it('still requires a meaningful reason', () => {
    expect(customerOrderActionSchema.safeParse({ action: 'cancel', source: 'cliente' }).success).toBe(false);
  });
  it('still prevents customers from cancelling accepted orders', () => {
    expect(assertCustomerStatusTransition('pendiente', 'cancelado').ok).toBe(true);
    expect(assertCustomerStatusTransition('confirmado', 'cancelado').ok).toBe(false);
  });
  it('keeps old pending orders pending and exposes only historical cancellation codes', () => {
    const order = {
      id: 'old-pending', estado: 'pendiente', created_at: '2026-09-20T12:00:00Z',
      detalles: { items: [], cancellation: { reason: 'timeout_no_confirmacion', customerReason: 'private explanation' } },
    };
    const result = toPublicOrderTrackingResponse(order, 'ORD-1', null);
    expect(result.status).toBe('pendiente');
    expect(result.permissions.canCancelAsCustomer).toBe(true);
    expect(result.cancellation).toEqual({ reason: 'timeout_no_confirmacion' });
    expect(JSON.stringify(result)).not.toContain('private explanation');
  });
});