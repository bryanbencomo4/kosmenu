import { describe, expect, it } from 'vitest';
import { normalizeOrderManagementMode, resolveCommerceManagementMode, resolveOrderManagementMode } from '../app/_lib/order-management-mode';
import { toPublicOrderTrackingResponse } from '../app/api/_lib/public-order';

describe('independent management-mode snapshot', () => {
  it('manual public receipt preserves totals but disables workflow permissions', () => {
    const result = toPublicOrderTrackingResponse({
      id: 'order-manual', estado: 'pendiente', total: 18000,
      detalles: { management_mode: 'whatsapp_manual', total: 18000, items: [{ nombre: 'Pizza', cantidad: 1, precio: 18000 }] },
    }, 'ORD-1', null);
    expect(result.managementMode).toBe('whatsapp_manual');
    expect(result.locationHint).toBeNull();
    expect(result.deliveryProgress?.delegateStatus).toBeNull();
    expect(result.total).toBe(18000);
    expect(result.permissions).toEqual({ canCancelAsCustomer: false, canConfirmReceived: false, canRateService: false });
    const platform = toPublicOrderTrackingResponse({ id: 'old', estado: 'pendiente', detalles: {} }, 'ORD-2', null);
    expect(platform.managementMode).toBe('platform');
    expect(platform.permissions.canCancelAsCustomer).toBe(true);
  });
  it.each([undefined, null, '', 'manual', 'WHATSAPP_MANUAL', 'platform'])('defaults safely for %j', (value) => {
    expect(normalizeOrderManagementMode(value)).toBe('platform');
  });
  it('detailed format alone never activates manual management', () => {
    expect(resolveCommerceManagementMode({ config_negocio: { whatsapp_order_format: 'detailed' } })).toBe('platform');
  });
  it('requires a separate explicit commerce opt-in', () => {
    expect(resolveCommerceManagementMode({ config_negocio: { order_management_mode: 'whatsapp_manual' } })).toBe('whatsapp_manual');
  });
  it('previous manual orders remain manual after switching back', () => {
    const commerce = { config_negocio: { order_management_mode: 'whatsapp_manual' } };
    const oldOrder = { management_mode: resolveCommerceManagementMode(commerce) };
    commerce.config_negocio.order_management_mode = 'platform';
    const newOrder = { management_mode: resolveCommerceManagementMode(commerce) };
    expect(resolveOrderManagementMode(oldOrder)).toBe('whatsapp_manual');
    expect(resolveOrderManagementMode(newOrder)).toBe('platform');
  });
  it('previous platform and missing-field orders never become manual', () => {
    const commerce = { config_negocio: { order_management_mode: 'platform' } };
    const oldOrder = { management_mode: resolveCommerceManagementMode(commerce) };
    commerce.config_negocio.order_management_mode = 'whatsapp_manual';
    expect(resolveOrderManagementMode(oldOrder)).toBe('platform');
    expect(resolveOrderManagementMode({})).toBe('platform');
  });
  it('does not share preferences between tenants', () => {
    const tenantA = { config_negocio: { order_management_mode: 'whatsapp_manual' } };
    expect(resolveCommerceManagementMode(tenantA)).toBe('whatsapp_manual');
    expect(resolveCommerceManagementMode({})).toBe('platform');
  });
  it('configuration read failures fall back to platform', () => {
    expect(resolveCommerceManagementMode({ get config_negocio() { throw Error('unavailable'); } })).toBe('platform');
    expect(resolveOrderManagementMode({ get management_mode() { throw Error('unavailable'); } })).toBe('platform');
  });
});