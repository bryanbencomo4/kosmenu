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

export function createOrderId(comercioId: string) {
  const safeComercioId = comercioId.trim() || 'kosmenu';
  return `${safeComercioId}-${Date.now()}`;
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

export function extractComercioId(orderId: string) {
  const match = orderId.match(/^(.*)-(\d{10,})$/);
  return match?.[1] ?? null;
}
