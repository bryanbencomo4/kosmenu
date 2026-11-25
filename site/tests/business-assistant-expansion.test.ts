import { describe, expect, it } from 'vitest';
import {
  canTransitionOrderStatus,
  normalizeOrderStatus,
  parseTargetOrderStatus,
} from '../app/api/asistente-negocio/_lib/order-status';
import { parseBusinessIntent } from '../app/api/asistente-negocio/_lib/intents';
import { isBusinessAllowedOp } from '../app/api/asistente-negocio/_lib/config';

describe('order status machine', () => {
  it('normalizes aliases like Flutter', () => {
    expect(normalizeOrderStatus('despachado')).toBe('en_camino');
    expect(normalizeOrderStatus('preparando')).toBe('confirmado');
    expect(normalizeOrderStatus('completado')).toBe('entregado');
  });

  it('allows only valid transitions', () => {
    expect(canTransitionOrderStatus('pendiente', 'confirmado')).toBe(true);
    expect(canTransitionOrderStatus('confirmado', 'en_camino')).toBe(true);
    expect(canTransitionOrderStatus('en_camino', 'entregado')).toBe(true);
    expect(canTransitionOrderStatus('entregado', 'cancelado')).toBe(false);
    expect(canTransitionOrderStatus('pendiente', 'entregado')).toBe(false);
  });

  it('parses natural targets', () => {
    expect(parseTargetOrderStatus('ponlo como despachado')).toBe('en_camino');
    expect(parseTargetOrderStatus('márcalo entregado')).toBe('entregado');
  });
});

describe('expanded allowed ops', () => {
  it('registers new write ops', () => {
    expect(isBusinessAllowedOp('create_product')).toBe(true);
    expect(isBusinessAllowedOp('set_order_status')).toBe(true);
    expect(isBusinessAllowedOp('set_tasa')).toBe(true);
    expect(isBusinessAllowedOp('upsert_payment_method')).toBe(true);
    expect(isBusinessAllowedOp('set_delivery_config')).toBe(true);
  });
});

describe('natural examples', () => {
  it('matches the expansion brief phrases', () => {
    expect(parseBusinessIntent('Pon la hamburguesa en 6').kind).toBe('propose_price');
    expect(parseBusinessIntent('Se agotó la campesina').kind).toBe('propose_availability');
    expect(parseBusinessIntent('Activa otra vez la pizza').kind).toBe('propose_availability');
    expect(parseBusinessIntent('Quiero quitar el pago móvil').kind).toBe('delete_payment');
    expect(parseBusinessIntent('Cambia la tasa a 42.5')).toMatchObject({
      kind: 'currency',
      setValue: 42.5,
    });
    expect(parseBusinessIntent('Pon el pedido 125 como despachado').kind).toBe(
      'set_order_status',
    );
  });
});
