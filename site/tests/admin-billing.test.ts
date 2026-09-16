import { describe, expect, it } from 'vitest';

import {
  canManageAdvisors,
  canManageBillingCatalog,
  canReviewPayments,
  isManualMethodReady,
  normalizeAccountFields,
} from '../app/admin/_lib/admin-billing';

describe('admin billing roles', () => {
  it('keeps review, catalog and advisors on different desks', () => {
    expect(canReviewPayments('finance')).toBe(true);
    expect(canReviewPayments('support')).toBe(true);
    expect(canReviewPayments('sales')).toBe(false);

    expect(canManageBillingCatalog('finance')).toBe(true);
    expect(canManageBillingCatalog('support')).toBe(false);

    expect(canManageAdvisors('sales')).toBe(true);
    expect(canManageAdvisors('finance')).toBe(false);
  });
});

describe('account fields', () => {
  it('drops incomplete rows so the merchant never copies an empty destination', () => {
    expect(
      normalizeAccountFields([
        { label: 'Banco', value: 'Bancolombia', copyable: true },
        { label: 'Cuenta', value: '   ' },
        { label: '', value: '123' },
      ]),
    ).toEqual([{ label: 'Banco', value: 'Bancolombia', copyable: true }]);
  });

  it('hides a bank method until a destination exists', () => {
    expect(
      isManualMethodReady({
        verification: 'manual',
        requiresAdvisorCode: false,
        accountFields: [],
      }),
    ).toBe(false);

    expect(
      isManualMethodReady({
        verification: 'manual',
        requiresAdvisorCode: true,
        accountFields: [],
      }),
    ).toBe(true);
  });
});
