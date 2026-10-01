import { sanitizeCartLineSelection } from '../../_lib/menu-product-options';
import { convertOrderAmount, normalizeOrderCurrency } from './order-currency';

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
  cancellation?: {
    reason: 'timeout_no_confirmacion' | 'cancelado_por_cliente';
  };
  items: Array<{
    name: string;
    quantity: number;
    unitPrice?: number;
    productId?: string;
    selection?: {
      tamanoId?: string;
      tamanoLabel?: string;
      servicioAdicional?: boolean;
      ajusteIds?: string[];
      grupos?: Record<string, string[]>;
    };
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
    canRateService: boolean;
  };
  serviceRating: {
    customer: number | null;
  };
  comercio: {
    nombre: string;
    slug?: string | null;
    whatsapp?: string | null;
    /** Public business pickup address (menu-visible), only for pickup orders. */
    pickupAddress?: string | null;
    /** Public menu logo — already shown on /v/[slug]. */
    logoUrl?: string | null;
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
  moneda?: string | null;
  whatsapp?: string | null;
  telefonos?: unknown;
  direccion?: string | null;
  logo_url?: string | null;
  branding_ia?: Record<string, unknown> | null;
};

function firstPhone(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = value.toString().trim();
    return text || null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const phone = firstPhone(entry);
      if (phone) return phone;
    }
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      const phone = firstPhone(entry);
      if (phone) return phone;
    }
  }
  return null;
}

/** Statuses where customer confirmation of delivery is allowed. */
export const CONFIRM_RECEIVED_ALLOWED_STATUSES: ReadonlySet<PublicOrderStatus> = new Set([
  'en_camino',
]);

export function normalizePublicStatus(value: unknown): PublicOrderStatus {
  const raw = (value ?? '').toString().trim().toLowerCase();
  if (raw === 'cancelado' || raw === 'rechazado' || raw === 'anulado') return 'cancelado';
  if (raw === 'confirmado' || raw === 'preparando') {
    return 'confirmado';
  }
  if (raw === 'listo') return 'entregado';
  if (raw === 'en_camino' || raw === 'entregado') {
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
    return status === 'confirmado' || status === 'pendiente'
      ? 'Retiro en el comercio cuando el pedido esté listo.'
      : null;
  }

  if (status === 'en_camino' || delegateStatus === 'accepted' || delegateStatus === 'arrived') {
    return 'En camino a la dirección que indicaste al ordenar.';
  }

  if (status === 'entregado') {
    return 'Entrega completada.';
  }

  return 'La dirección de entrega no se muestra en este enlace por seguridad.';
}

function sanitizePublicSelection(raw: unknown): PublicOrderTrackingResponse['items'][number]['selection'] {
  const selection = sanitizeCartLineSelection(raw);
  return Object.keys(selection).length > 0 ? selection : undefined;
}

export function toPublicOrderTrackingResponse(
  order: RawPedido,
  orderId: string,
  comercio: RawComercio | null,
): PublicOrderTrackingResponse {
  const detalles = order.detalles && typeof order.detalles === 'object' ? order.detalles : {};
  const baseCurrency = normalizeOrderCurrency(detalles.moneda_base ?? comercio?.moneda);
  const requestedCurrency = normalizeOrderCurrency(detalles.moneda_checkout, baseCurrency);
  const rawExchangeRate = Number(detalles.tasa_cambio_snapshot);
  const hasUsableExchangeRate = Number.isFinite(rawExchangeRate) && rawExchangeRate > 0;
  const currency = requestedCurrency === baseCurrency || hasUsableExchangeRate
    ? requestedCurrency
    : baseCurrency;
  const convertToDisplayCurrency = (amount: number) =>
    convertOrderAmount(amount, baseCurrency, currency, rawExchangeRate) ?? amount;
  const itemsRaw = Array.isArray(detalles.items) ? detalles.items : [];
  const items = itemsRaw
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const name = (row.nombre ?? row.name ?? 'Producto').toString().trim() || 'Producto';
      const quantity = Number(row.cantidad ?? row.quantity ?? 0);
      const unitPriceBase = Number(row.precio ?? row.price);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      const productId = (row.product_id ?? row.productId ?? '').toString().trim();
      // New orders store the raw ids in `seleccion` and the frozen snapshot
      // array in `opciones`; older orders stored the ids in `opciones`.
      const legacySelection = Array.isArray(row.opciones) ? undefined : row.opciones;
      const selection = sanitizePublicSelection(row.seleccion ?? legacySelection ?? row.selection);
      return {
        name,
        quantity,
        unitPrice: Number.isFinite(unitPriceBase) && unitPriceBase >= 0
          ? convertToDisplayCurrency(unitPriceBase)
          : undefined,
        ...(productId ? { productId } : {}),
        ...(selection ? { selection } : {}),
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

  const persistedStatus = normalizePublicStatus(order.estado);
  const status = persistedStatus === 'cancelado' || delegateStatus !== 'completed'
    ? persistedStatus
    : 'entregado';
  const createdAt = (order.created_at ?? new Date().toISOString()).toString();
  const rawCustomerRating = Number(detalles.customer_service_rating);
  const customerServiceRating = Number.isInteger(rawCustomerRating) && rawCustomerRating >= 1 && rawCustomerRating <= 5
    ? rawCustomerRating
    : null;
  const isRateable = status === 'entregado' || status === 'cancelado';
  const cancellation =
    detalles.cancellation && typeof detalles.cancellation === 'object'
      ? (detalles.cancellation as Record<string, unknown>)
      : {};
  const cancellationReason = cancellation.reason;
  const publicCancellationReason =
    cancellationReason === 'timeout_no_confirmacion' ||
    cancellationReason === 'cancelado_por_cliente'
      ? cancellationReason
      : null;

  const customerCanConfirm =
    CONFIRM_RECEIVED_ALLOWED_STATUSES.has(status) && delegateStatus === 'arrived';

  return {
    orderId,
    status,
    createdAt,
    ...(publicCancellationReason ? { cancellation: { reason: publicCancellationReason } } : {}),
    items,
    subtotal: Number.isFinite(Number(detalles.subtotal))
      ? convertToDisplayCurrency(Number(detalles.subtotal))
      : undefined,
    deliveryCost: Number.isFinite(Number(order.costo_delivery))
      ? convertToDisplayCurrency(Number(order.costo_delivery))
      : undefined,
    total: Number.isFinite(Number(detalles.total ?? order.total))
      ? convertToDisplayCurrency(Number(detalles.total ?? order.total))
      : undefined,
    currency,
    deliveryType,
    locationHint: buildLocationHint(deliveryType, status, delegateStatus),
    deliveryProgress: {
      delegateStatus,
      customerCanConfirm,
    },
    notifications: { whatsappEnabled },
    permissions: {
      canCancelAsCustomer: status === 'pendiente',
      canConfirmReceived: customerCanConfirm,
      canRateService: isRateable && customerServiceRating === null,
    },
    serviceRating: { customer: customerServiceRating },
    comercio: {
      nombre: (comercio?.nombre ?? 'Comercio').toString(),
      slug: comercio?.slug ?? null,
      whatsapp: firstPhone(comercio?.whatsapp) ?? firstPhone(comercio?.telefonos),
      pickupAddress: deliveryType === 'pickup' ? (comercio?.direccion ?? null) : null,
      logoUrl: sanitizePublicAssetUrl(comercio?.logo_url),
      branding: sanitizePublicBranding(comercio?.branding_ia ?? null),
    },
  };
}

function sanitizePublicAssetUrl(value: unknown): string | null {
  const raw = (value ?? '').toString().trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
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
