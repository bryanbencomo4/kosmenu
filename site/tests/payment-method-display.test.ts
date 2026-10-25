import { describe, expect, it } from 'vitest';

import {
  formatPaymentMethodDetails,
  parsePaymentMethodFields,
} from '../app/_lib/payment-method-display';

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
        { label: 'ID', value: '1225317379' },
        { label: 'Usuario', value: 'Maicol-666' },
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
