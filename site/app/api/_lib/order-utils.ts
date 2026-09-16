export type IncomingOrderItem = {
  productId?: string;
  nombre?: string;
  cantidad?: number;
  precio?: number;
};

export type NormalizedOrderItem = {
  product_id: string;
  nombre: string;
  cantidad: number;
  precio: number;
};

export const ORDER_DISPLAY_PREFIX = 'EMXFA';
export const ORDER_DISPLAY_NUMBER_LENGTH = 6;
const LEGACY_ORDER_ID_PATTERN = /^(.*)-(\d{10,})$/;
const ORDER_DISPLAY_ID_PATTERN = /^EMXFA-\d{6}$/;

/** Standard public order code, e.g. `EMXFA-000042`. */
export function formatOrderDisplayId(sequenceNumber: number): string {
  const safe = Number.isFinite(sequenceNumber)
    ? Math.max(0, Math.floor(sequenceNumber))
    : 0;
  return `${ORDER_DISPLAY_PREFIX}-${String(safe).padStart(ORDER_DISPLAY_NUMBER_LENGTH, '0')}`;
}

export function isOrderDisplayId(orderId: string): boolean {
  return ORDER_DISPLAY_ID_PATTERN.test(orderId.trim());
}

export function normalizeOrderItems(items: unknown): NormalizedOrderItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((raw) => {
      const item = (raw ?? {}) as IncomingOrderItem;
      const cantidad = Number(item.cantidad ?? 0);
      const precio = Number(item.precio ?? 0);
      const nombre = String(item.nombre ?? '').trim() || 'Producto';
      const productId = String(item.productId ?? '').trim() || `manual-${nombre}`;

      if (!Number.isFinite(cantidad) || cantidad <= 0) return null;
      if (!Number.isFinite(precio) || precio < 0) return null;

      return {
        product_id: productId,
        nombre,
        cantidad,
        precio,
      };
    })
    .filter(Boolean) as NormalizedOrderItem[];
}

export function calculateTotal(items: NormalizedOrderItem[]) {
  return items.reduce((sum, item) => sum + item.cantidad * item.precio, 0);
}

/** Legacy helper: only old `{uuid}-{timestamp}` ids embed the comercio id. */
export function extractComercioId(orderId: string) {
  const match = orderId.match(LEGACY_ORDER_ID_PATTERN);
  return match?.[1] ?? null;
}

export function isLegacyOrderId(orderId: string) {
  return LEGACY_ORDER_ID_PATTERN.test(orderId.trim());
}
