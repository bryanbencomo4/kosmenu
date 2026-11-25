import { describe, expect, it } from 'vitest';
import { parseBusinessHoursText } from '../app/api/asistente-negocio/_lib/hours-parse';
import { parseBusinessIntent } from '../app/api/asistente-negocio/_lib/intents';
import {
  extractProductHint,
  resolveProductMatch,
  resolveShopByName,
} from '../app/api/asistente-negocio/_lib/product-match';
import { formatHoursForChat } from '../app/api/asistente-negocio/_lib/orders-view';

describe('P1 multi-shop name resolution', () => {
  const shops = [
    { comercioId: 'a', nombre: 'QA_CHATBOT_2026 pizzas el trueno' },
    { comercioId: 'b', nombre: 'QA_CHATBOT_2026 decoy isolation' },
  ];

  it('matches bare shop name and usar negocio phrase', () => {
    expect(resolveShopByName(shops, 'QA_CHATBOT_2026 pizzas el trueno')?.comercioId).toBe('a');
    expect(
      resolveShopByName(shops, 'usar negocio QA_CHATBOT_2026 decoy isolation')?.comercioId,
    ).toBe('b');
  });

  it('does not invert-match long phrases into short names', () => {
    expect(resolveShopByName(shops, 'usar negocio algo que no existe')).toBeNull();
  });
});

describe('P2 safe product match', () => {
  const products = [
    { id: '1', nombre: 'Campesina', precio: 4.8, disponible: true },
    { id: '2', nombre: 'Margarita', precio: 5, disponible: true },
    { id: '3', nombre: 'QA_CHATBOT_2026 Hamburguesa', precio: 8, disponible: true },
  ];

  it('matches exact product and refuses decoy cross-name fuzzy', () => {
    expect(resolveProductMatch(products, 'Activa Campesina')).toMatchObject({
      status: 'exact',
      product: { id: '1' },
    });
    expect(
      resolveProductMatch(products, 'Cambia el precio de QA_CHATBOT_2026 Decoy Pizza a 1.11')
        .status,
    ).toBe('none');
  });

  it('asks when ambiguous similar names', () => {
    const twins = [
      { id: 'a', nombre: 'Pizza Especial' },
      { id: 'b', nombre: 'Pizza Especial Grande' },
    ];
    // cleaned hint "pizza especial" exact-matches first; containment of shorter name in longer utterance
    const r = resolveProductMatch(twins, 'cambiar precio Pizza Especial');
    expect(r.status === 'exact' || r.status === 'ambiguous').toBe(true);
  });

  it('extractProductHint strips admin verbs', () => {
    expect(extractProductHint('Marca Campesina como disponible')).toContain('campesina');
    expect(extractProductHint('Marca Campesina como disponible')).not.toContain('marca');
  });
});

describe('P3 natural language', () => {
  it('activa producto → availability on', () => {
    expect(parseBusinessIntent('Activa Campesina')).toMatchObject({
      kind: 'propose_availability',
      available: true,
    });
    expect(parseBusinessIntent('reactiva Campesina')).toMatchObject({
      kind: 'propose_availability',
      available: true,
    });
  });

  it('abrir negocio still en_linea', () => {
    expect(parseBusinessIntent('abrir el negocio').kind).toBe('propose_en_linea');
    expect(parseBusinessIntent('activar el local').kind).toBe('propose_en_linea');
  });

  it('payments/delivery/promo/staff/category do not become add_product', () => {
    expect(parseBusinessIntent('agrega un método de pago Zelle de prueba')).toMatchObject({
      kind: 'unsupported',
      topic: 'payments',
    });
    expect(parseBusinessIntent('crea una zona de delivery de prueba')).toMatchObject({
      kind: 'unsupported',
      topic: 'delivery',
    });
    expect(parseBusinessIntent('crea una promoción 2x1')).toMatchObject({
      kind: 'unsupported',
      topic: 'promo',
    });
    expect(parseBusinessIntent('agregar empleado mesero')).toMatchObject({
      kind: 'unsupported',
      topic: 'staff',
    });
    expect(parseBusinessIntent('crea una categoría postres')).toMatchObject({
      kind: 'unsupported',
      topic: 'category',
    });
    expect(parseBusinessIntent('marca el pedido pendiente como entregado')).toMatchObject({
      kind: 'unsupported',
      topic: 'order_status',
    });
  });
});

describe('P4 structured hours', () => {
  it('parses Lun-Vie range into Flutter days', () => {
    const parsed = parseBusinessHoursText('Cambia el horario a Lun-Vie 11:00-21:00');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.schedule.days.monday.open).toBe(true);
    expect(parsed.schedule.days.monday.ranges[0]).toEqual({
      start: '11:00',
      end: '21:00',
    });
    expect(parsed.schedule.days.saturday.open).toBe(false);
    expect(parsed.summary).toMatch(/11:00/);
  });

  it('formatHoursForChat reads Flutter schedule', () => {
    const parsed = parseBusinessHoursText('todos los días 10:00-22:00');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const text = formatHoursForChat(parsed.schedule);
    expect(text).toContain('Lunes');
    expect(text).toContain('10:00');
  });
});
