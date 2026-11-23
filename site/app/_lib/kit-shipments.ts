export const KIT_GIFT_QTY = 4;
export const KIT_EXTRAS_UNIT_USD = 2.5;
export const KIT_EXTRAS_MAX = 50;
export const KIT_RECEIPTS_BUCKET = 'comprobantes-kit';

export const KIT_SHIPMENT_STATUSES = [
  'pending_payment',
  'pending_ship',
  'shipped',
  'cancelled',
] as const;

export type KitShipmentStatus = (typeof KIT_SHIPMENT_STATUSES)[number];

export function computeKitProductTotalUsd(extrasQty: number) {
  const qty = Math.max(0, Math.min(KIT_EXTRAS_MAX, Math.floor(extrasQty)));
  return Math.round(qty * KIT_EXTRAS_UNIT_USD * 100) / 100;
}

export function resolveKitStatus(extrasQty: number): KitShipmentStatus {
  return extrasQty > 0 ? 'pending_payment' : 'pending_ship';
}

export function kitOrderPublicCode(id: string) {
  return `KIT-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}
