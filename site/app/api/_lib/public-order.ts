export type PublicOrderStatus =
  | 'pendiente'
  | 'confirmado'
  | 'preparando'
  | 'en_camino'
  | 'entregado'
  | 'cancelado';

/**
 * Minimal customer-facing tracking payload.
 * Never includes customer PII, payment proofs, tokens, or precise delivery location.
 */
export type PublicOrderTrackingResponse = {
  orderId: string;
  status: PublicOrderStatus;
  createdAt: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice?: number;
  }>;
  subtotal?: number;
  deliveryCost?: number;
  total?: number;
  currency?: string;
  deliveryType?: 'pickup' | 'delivery';
  /** Coarse location hint only — never street address / coords. */
  locationHint?: string | null;
  deliveryProgress?: {
    delegateStatus: string | null;
    customerCanConfirm: boolean;
  };
  notifications: {
    whatsappEnabled: boolean;
  };
  permissions: {
    canCancelAsCustomer: boolean;
    canConfirmReceived: boolean;
  };
  comercio: {
    nombre: string;
    slug?: string | null;
    whatsapp?: string | null;
    /** Public business pickup address (menu-visible), only for pickup orders. */
    pickupAddress?: string | null;
    /** Theme tokens only — no remote asset URLs. */
    branding?: Record<string, unknown> | null;
  };
};

type RawPedido = {
  id: string;
  estado?: string | null;
  created_at?: string | null;
  total?: number | null;
  costo_delivery?: number | null;
  detalles?: Record<string, unknown> | null;
  public_tracking_token_hash?: string | null;
};

type RawComercio = {
  nombre?: string | null;
  slug?: string | null;
  whatsapp?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  branding_ia?: Record<string, unknown> | null;
};

export const CONFIRMATION_TIMEOUT_MS = 15 * 60 * 1000;

/** Statuses where customer confirmation of delivery is allowed. */
export const CONFIRM_RECEIVED_ALLOWED_STATUSES: ReadonlySet<PublicOrderStatus> = new Set([
  'en_camino',
]);

export function normalizePublicStatus(value: unknown): PublicOrderStatus {
  const raw = (value ?? '').toString().trim().toLowerCase();
  if (raw === 'cancelado' || raw === 'rechazado' || raw === 'anulado') return 'cancelado';
  if (raw === 'confirmado' || raw === 'preparando' || raw === 'en_camino' || raw === 'entregado') {
    return raw;
  }
  return 'pendiente';
}

export function extractTokenHashFromPedido(order: RawPedido): string | null {
  const columnHash = (order.public_tracking_token_hash ?? '').toString().trim().toLowerCase();
  if (columnHash) return columnHash;

  const detalles = order.detalles && typeof order.detalles === 'object' ? order.detalles : {};
  const nested = (detalles.public_tracking_token_hash ?? '').toString().trim().toLowerCase();
  return nested || null;
}

function buildLocationHint(
  deliveryType: 'pickup' | 'delivery',
  status: PublicOrderStatus,
  delegateStatus: string | null,
): string | null {
  if (deliveryType === 'pickup') {
    return status === 'preparando' || status === 'confirmado' || status === 'pendiente'
      ? 'Retiro en el comercio cuando el pedido este listo.'
      : null;
  }

  if (status === 'en_camino' || delegateStatus === 'accepted' || delegateStatus === 'arrived') {
    return 'En camino a la direccion que indicaste al ordenar.';
  }

  if (status === 'entregado') {
    return 'Entrega completada.';
  }

  return 'La direccion de entrega no se muestra en este enlace por seguridad.';
}

export function toPublicOrderTrackingResponse(
  order: RawPedido,
  orderId: string,
  comercio: RawComercio | null,
): PublicOrderTrackingResponse {
  const detalles = order.detalles && typeof order.detalles === 'object' ? order.detalles : {};
  const itemsRaw = Array.isArray(detalles.items) ? detalles.items : [];
  const items = itemsRaw
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const name = (row.nombre ?? row.name ?? 'Producto').toString().trim() || 'Producto';
      const quantity = Number(row.cantidad ?? row.quantity ?? 0);
      const unitPrice = Number(row.precio ?? row.price);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        name,
        quantity,
        unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : undefined,
      };
    })
    .filter(Boolean) as PublicOrderTrackingResponse['items'];

  const delivery =
    detalles.delivery && typeof detalles.delivery === 'object'
      ? (detalles.delivery as Record<string, unknown>)
      : {};
  const deliveryType = delivery.mode === 'delivery' ? 'delivery' : 'pickup';

  const notifications =
    detalles.notifications && typeof detalles.notifications === 'object'
      ? (detalles.notifications as Record<string, unknown>)
      : {};
  const whatsappEnabled =
    typeof notifications.whatsapp_enabled === 'boolean' ? notifications.whatsapp_enabled : true;

  const delegate =
    detalles.delivery_delegate && typeof detalles.delivery_delegate === 'object'
      ? (detalles.delivery_delegate as Record<string, unknown>)
      : {};
  const delegateStatus = (delegate.status ?? '').toString().trim().toLowerCase() || null;

  const status = normalizePublicStatus(order.estado);
  const createdAt = (order.created_at ?? new Date().toISOString()).toString();
  const createdAtMs = Date.parse(createdAt);
  const pendingExpired =
    status === 'pendiente' &&
    Number.isFinite(createdAtMs) &&
    Date.now() - createdAtMs >= CONFIRMATION_TIMEOUT_MS;

  const customerCanConfirm =
    CONFIRM_RECEIVED_ALLOWED_STATUSES.has(status) && delegateStatus === 'arrived';

  return {
    orderId,
    status,
    createdAt,
    items,
    subtotal: Number.isFinite(Number(detalles.subtotal)) ? Number(detalles.subtotal) : undefined,
    deliveryCost: Number.isFinite(Number(order.costo_delivery))
      ? Number(order.costo_delivery)
      : undefined,
    total: Number.isFinite(Number(order.total)) ? Number(order.total) : undefined,
    currency: (detalles.moneda_checkout ?? 'USD').toString(),
    deliveryType,
    locationHint: buildLocationHint(deliveryType, status, delegateStatus),
    deliveryProgress: {
      delegateStatus,
      customerCanConfirm,
    },
    notifications: { whatsappEnabled },
    permissions: {
      canCancelAsCustomer: pendingExpired && status === 'pendiente',
      canConfirmReceived: customerCanConfirm,
    },
    comercio: {
      nombre: (comercio?.nombre ?? 'Comercio').toString(),
      slug: comercio?.slug ?? null,
      whatsapp: (comercio?.whatsapp ?? comercio?.telefono ?? null) as string | null,
      pickupAddress: deliveryType === 'pickup' ? (comercio?.direccion ?? null) : null,
      branding: sanitizePublicBranding(comercio?.branding_ia ?? null),
    },
  };
}

function sanitizePublicBranding(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const allowed = [
    'color_principal',
    'color_secundario',
    'fuente_titulos',
    'fuente_cuerpo',
    'colores_personalizados',
  ] as const;
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in value) out[key] = value[key];
  }
  return Object.keys(out).length ? out : null;
}
