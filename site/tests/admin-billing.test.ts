import { describe, expect, it } from 'vitest';

import {
  canManageAdvisors,
  canManageBillingCatalog,
  canReviewPayments,
  isManualMethodReady,
  normalizeAccountFields,
  buildPagoMovilAccountFields,
  textToAccountFields,
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

  it('acepta lineas Banco: valor y Banco - valor', () => {
    expect(textToAccountFields('Banco: BDV\nTeléfono - 04121234567\nCédula = V-1')).toEqual([
      { label: 'Banco', value: 'BDV', copyable: true },
      { label: 'Teléfono', value: '04121234567', copyable: true },
      { label: 'Cédula', value: 'V-1', copyable: true },
    ]);
  });

  it('arma los campos de pago movil sin filas vacias', () => {
    expect(
      buildPagoMovilAccountFields({
        banco: 'Banco de Venezuela',
        telefono: '0412-0000000',
        cedula: '',
        titular: 'ElMenúXFA',
      }).map((item) => item.label),
    ).toEqual(['Banco', 'Teléfono', 'Titular']);
  });
});
