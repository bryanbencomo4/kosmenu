import { describe, expect, it } from 'vitest';

import { BDV_EVENT_LABELS, BDV_PAYMENT_STATUSES, bdvStatusClassName, formatBdvAmount } from '../app/admin/_lib/admin-bdv';

describe('admin BDV monitoring labels', () => {
  it('covers the statuses the panel can filter', () => {
    expect(BDV_PAYMENT_STATUSES).toEqual(['RECEIVED', 'MATCHED', 'CONFIRMED', 'REJECTED', 'ERROR']);
  });

  it('labels payment_events types in Spanish', () => {
    expect(BDV_EVENT_LABELS.hmac_validated).toBe('Validación HMAC');
    expect(BDV_EVENT_LABELS.payment_received).toBe('Recepción del pago');
    expect(BDV_EVENT_LABELS.matching_found).toBe('Matching encontrado');
    expect(BDV_EVENT_LABELS.activation_completed).toBe('Activación realizada');
    expect(BDV_EVENT_LABELS.error).toBe('Error');
  });

  it('formats bolivares and status chips without inventing values', () => {
    expect(formatBdvAmount(888888.88)).toContain('888');
    expect(formatBdvAmount(null)).toBe('—');
    expect(bdvStatusClassName('CONFIRMED')).toContain('emerald');
    expect(bdvStatusClassName('RECEIVED')).toContain('amber');
  });
});
