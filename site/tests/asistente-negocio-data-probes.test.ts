import { describe, expect, it } from 'vitest';

import { parseBusinessIntent } from '../app/api/asistente-negocio/_lib/intents';
import {
  buildCustomersView,
  buildMetricsView,
  buildOrdersView,
  formatHoursForChat,
} from '../app/api/asistente-negocio/_lib/orders-view';

function kind(text: string) {
  return parseBusinessIntent(text).kind;
}

function intent(text: string) {
  return parseBusinessIntent(text);
}

/**
 * Probe pack — merchant questions that previously fell short
 * (ugly lists, wrong tool, or no answer).
 */
describe('asistente-negocio data probes', () => {
  describe('intent routing for analytics questions', () => {
    it('customer count → home_metrics (not orders dump)', () => {
      for (const q of [
        'cuantos clientes tengo ?',
        'cuántos clientes tengo',
        'cuantos clientes hoy',
      ]) {
        const i = intent(q);
        expect(i.kind, q).toBe('home_metrics');
        if (i.kind === 'home_metrics') expect(i.focus).toBe('customers');
      }
    });

    it('customer names → customers', () => {
      for (const q of [
        'dale el nombre de los clientes',
        'nombres de clientes',
        'quiénes pidieron',
        'lista de clientes',
      ]) {
        expect(kind(q), q).toBe('customers');
      }
    });

    it('sales / resumen → home_metrics', () => {
      expect(intent('ventas de hoy').kind).toBe('home_metrics');
      expect(intent('resumen de hoy').kind).toBe('home_metrics');
      expect(intent('cuanto he vendido hoy').kind).toBe('home_metrics');
      expect(intent('cuántos pedidos tengo hoy').kind).toBe('home_metrics');
    });

    it('orders list filters', () => {
      expect(intent('pedidos')).toEqual({ kind: 'recent_orders', filter: 'all' });
      expect(intent('pedidos pendientes')).toEqual({
        kind: 'recent_orders',
        filter: 'pending',
      });
      expect(intent('pedidos de hoy')).toEqual({
        kind: 'recent_orders',
        filter: 'today',
      });
    });

    it('order detail from card tap', () => {
      expect(intent('detalle pedido a1b2c3d4').kind).toBe('order_detail');
      expect(intent('detalle pedido María').kind).toBe('order_detail');
    });

    it('does not steal menu / membership / account', () => {
      expect(kind('ver menú')).toBe('list_menu');
      expect(kind('mi membresía')).toBe('membership');
      expect(kind('cambiar contraseña')).toBe('account');
      expect(kind('hablar con un humano')).toBe('escalate_human');
      expect(kind('cambiar precio')).toBe('propose_price');
    });
  });

  describe('structured views (no bullet walls)', () => {
    it('orders view includes customer name + short id', () => {
      const view = buildOrdersView({
        shopName: 'pizzas el trueno',
        currency: 'USD',
        filter: 'all',
        rows: [
          {
            id: '11111111-2222-3333-4444-555555555555',
            estado: 'pendiente',
            total: 14.69,
            created_at: '2026-11-23T11:15:00.000Z',
            nombre_cliente: 'Carlos',
            telefono_cliente: '04141234567',
          },
        ],
      });
      expect(view.orders[0]?.customerName).toBe('Carlos');
      expect(view.orders[0]?.shortId).toHaveLength(8);
      expect(view.orders[0]?.whenLabel).not.toMatch(/^2026-11-23T/);
    });

    it('metrics view computes avg ticket', () => {
      const view = buildMetricsView({
        shopName: 'pizzas el trueno',
        currency: 'USD',
        ordersToday: 4,
        salesToday: 40,
        customersToday: 3,
        focus: 'customers',
      });
      expect(view.avgTicket).toBe(10);
      expect(view.focus).toBe('customers');
    });

    it('customers view aggregates unique names', () => {
      const view = buildCustomersView({
        shopName: 'pizzas el trueno',
        scopeLabel: 'hoy',
        rows: [
          { nombre_cliente: 'Ana', total: 10 },
          { nombre_cliente: 'ana', total: 12 },
          { nombre_cliente: 'Luis', total: 8 },
          { nombre_cliente: '  ', total: 1 },
        ],
      });
      expect(view.customers).toHaveLength(2);
      expect(view.customers[0]?.name).toBe('Ana');
      expect(view.customers[0]?.orders).toBe(2);
    });

    it('hours formatter never dumps indented JSON', () => {
      expect(formatHoursForChat({ note: 'Lun-Vie 10-22' })).toBe('Lun-Vie 10-22');
      expect(formatHoursForChat(null)).toMatch(/Sin horario/i);
      const ugly = formatHoursForChat({ lun: '10-22', updatedVia: 'x', updatedAt: 'y' });
      expect(ugly).not.toMatch(/\n {2}/);
      expect(ugly).toMatch(/lun/i);
    });
  });
});
