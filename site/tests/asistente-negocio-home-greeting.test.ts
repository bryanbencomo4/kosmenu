import { describe, expect, it } from 'vitest';

import { homeGreetingText, timeGreetingEs } from '../app/api/asistente-negocio/_lib/copy';
import type { BusinessShop } from '../app/api/asistente-negocio/_lib/auth';

const shop: BusinessShop = {
  comercioId: 'c1',
  nombre: 'Pizzería Trueno',
  slug: 'pizzeria-trueno',
  role: 'owner',
  moneda: 'USD',
  tasa: null,
  enLinea: true,
  horarios: null,
};

describe('business assistant home greeting', () => {
  it('greets with business name like dashboard home', () => {
    const text = homeGreetingText(shop, {
      ordersToday: 4,
      salesToday: 52.5,
      customersToday: 3,
    });
    expect(text).toMatch(/Pizzería Trueno/);
    expect(text).toMatch(/Buenos días|Buenas tardes|Buenas noches/);
    expect(text).toMatch(/Pedidos: \*4\*/);
    expect(text).toMatch(/Ventas: \*52\.50 USD\*/);
    expect(text).toMatch(/Clientes: \*3\*/);
    expect(text).toMatch(/barra de abajo|Qué hacemos/i);
    expect(text).not.toMatch(/Desde aquí puedes/);
    expect(text).not.toMatch(/app\.elmenuxfa\.com\/(?!asistente)/);
  });

  it('handles empty day softly', () => {
    const text = homeGreetingText({ ...shop, enLinea: false }, {
      ordersToday: 0,
      salesToday: 0,
      customersToday: 0,
    });
    expect(text).toMatch(/oculto|abrimos/i);
    expect(text).toMatch(/aún no hay pedidos/i);
  });

  it('timeGreetingEs follows Caracas hours', () => {
    // 15:00 UTC = 11:00 Caracas → morning
    expect(timeGreetingEs(new Date('2026-11-25T15:00:00.000Z'))).toBe('Buenos días');
    // 18:00 UTC = 14:00 Caracas → afternoon
    expect(timeGreetingEs(new Date('2026-11-25T18:00:00.000Z'))).toBe('Buenas tardes');
    // 02:00 UTC = 22:00 Caracas → night
    expect(timeGreetingEs(new Date('2026-11-26T02:00:00.000Z'))).toBe('Buenas noches');
  });
});
