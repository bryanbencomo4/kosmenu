import type { BusinessShop } from './auth';

/** Mirrors Flutter MerchantSession capabilities. */
export function isShopAdmin(shop: BusinessShop): boolean {
  const r = String(shop.role || '').toLowerCase();
  return r === 'owner' || r === 'administrador';
}

export function canManageCatalog(shop: BusinessShop): boolean {
  return isShopAdmin(shop);
}

export function canManageSettings(shop: BusinessShop): boolean {
  return isShopAdmin(shop);
}

export function canManageStaff(shop: BusinessShop): boolean {
  return isShopAdmin(shop);
}

export function canManageMarketing(shop: BusinessShop): boolean {
  const r = String(shop.role || '').toLowerCase();
  return isShopAdmin(shop) || r === 'marketing';
}

export function canManageOrders(shop: BusinessShop): boolean {
  const r = String(shop.role || '').toLowerCase();
  return isShopAdmin(shop) || r === 'caja' || r === 'cocina';
}

export function denied(action: string, shop: BusinessShop): string {
  return `Tu rol (*${shop.role}*) no puede ${action} en *${shop.nombre}*.`;
}
