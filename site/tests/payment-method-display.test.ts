import { describe, expect, it } from 'vitest';

import {
  formatPaymentMethodDetails,
  parsePaymentMethodFields,
  paymentClipboardValue,
  paymentMethodLabelFromRow,
} from '../app/_lib/payment-method-display';

describe('paymentMethodLabelFromRow', () => {
  it('drops the redundant Pago digital prefix', () => {
    expect(paymentMethodLabelFromRow({ nombre: 'Pago digital: Pago Móvil' })).toBe('Pago Móvil');
    expect(paymentMethodLabelFromRow({ nombre: 'Pago digital: BNC' })).toBe('BNC');
    expect(paymentMethodLabelFromRow({ nombre: 'Efectivo VES' })).toBe('Efectivo VES');
  });
});

describe('formatPaymentMethodDetails', () => {
  it('formats transfer account JSON from Flutter setup', () => {
    const details = formatPaymentMethodDetails({
      nombre: 'Pago digital: Nequi',
      descripcion: 'Cuenta de pago digital',
      detalles: JSON.stringify({
        name: 'Nequi',
        fields: [{ type: 'telefono', label: 'Numero de telefono', value: '+573019101507' }],
      }),
    });

    expect(details).toEqual(['Numero de telefono: +573019101507']);
    expect(details.join(' ')).not.toContain('{');
  });

  it('exposes structured fields for copy UI', () => {
    expect(
      parsePaymentMethodFields({
        descripcion: 'Cuenta de pago digital',
        detalles: JSON.stringify({
          name: 'Binance',
          fields: [
            { type: 'texto', label: 'ID', value: '1225317379' },
            { type: 'texto', label: 'Usuario', value: 'Maicol-666' },
          ],
        }),
      }),
    ).toEqual({
      fields: [
        { label: 'ID', value: '1225317379', type: 'texto', kind: 'text' },
        { label: 'Usuario', value: 'Maicol-666', type: 'texto', kind: 'text' },
      ],
      note: null,
    });
  });

  it('formats Bre-B style keys', () => {
    const details = formatPaymentMethodDetails({
      descripcion: 'Cuenta de pago digital',
      detalles: JSON.stringify({
        name: 'Bre-B',
        fields: [{ type: 'texto', label: 'Llave', value: '@bencomo811' }],
      }),
    });

    expect(details).toEqual(['Llave: @bencomo811']);
  });

  it('keeps legacy flat columns', () => {
    expect(
      formatPaymentMethodDetails({
        banco: 'Banesco',
        titular: 'Maria Perez',
        numero: '0134-1234-56-7890123456',
      }),
    ).toEqual([
      'Banco: Banesco',
      'Titular: Maria Perez',
      'Número: 0134-1234-56-7890123456',
    ]);
  });
});

describe('paymentClipboardValue', () => {
  it('strips VE country code and adds leading 0 for bank paste', () => {
    expect(
      paymentClipboardValue({ label: 'TELF', value: '+584126159179', type: 'telefono' }),
    ).toBe('04126159179');
    expect(
      paymentClipboardValue({ label: 'Teléfono', value: '0412-6159179' }),
    ).toBe('04126159179');
    expect(
      paymentClipboardValue({ label: 'Teléfono', value: '4126159179' }),
    ).toBe('04126159179');
  });

  it('strips document letter prefixes for bank paste', () => {
    expect(
      paymentClipboardValue({ label: 'DOCUMENTO', value: 'J-503354356', type: 'cedula' }),
    ).toBe('503354356');
    expect(paymentClipboardValue({ label: 'Cédula', value: 'V12345678' })).toBe('12345678');
  });

  it('leaves bank names and free text unchanged', () => {
    expect(paymentClipboardValue({ label: 'BANCO', value: 'BANESCO' })).toBe('BANESCO');
    expect(paymentClipboardValue({ label: 'Usuario', value: 'Maicol-666' })).toBe('Maicol-666');
  });
});
