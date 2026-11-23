import 'server-only';

import {
  extractOrderMoney,
  formatAdminMoney,
  type AdminMoney,
} from './admin-money';
import { getAdminSupabaseClient } from './admin-supabase';
import {
  isWhatsappManualOrder,
  normalizeOrderManagementMode,
} from '../../_lib/order-management-mode';

export type AdminOrderListItem = {
  id: string;
  code: string;
  comercioId: string;
  businessName: string;
  customerName: string;
  customerPhone: string | null;
  status: string;
  statusLabel: string;
  managementMode: 'platform' | 'whatsapp_manual';
  amount: number;
  amountLabel: string;
  currency: string;
  usdEstimate: number | null;
  usdEstimateLabel: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  createdAt: string | null;
  createdLabel: string;
  archivedAt: string | null;
  isArchived: boolean;
};

export type AdminOrderItemLine = {
  name: string;
  quantity: number;
  unitPrice: number | null;
  unitPriceLabel: string | null;
  notes: string | null;
};

export type AdminOrderDetail = AdminOrderListItem & {
  customerEmail: string | null;
  deliveryMode: string | null;
  deliveryAddress: string | null;
  deliveryReference: string | null;
  deliveryInstructions: string | null;
  orderNotes: string | null;
  subtotalLabel: string | null;
  deliveryCostLabel: string | null;
  exchangeRate: number | null;
  baseAmountLabel: string | null;
  baseCurrency: string;
  items: AdminOrderItemLine[];
  paymentMethodDetails: string[];
  comprobanteUrls: string[];
  rawDetalles: Record<string, unknown>;
  money: AdminMoney;
};

type RawPedido = {
  id?: string | null;
  comercio_id?: string | null;
  estado?: string | null;
  total?: number | string | null;
  costo_delivery?: number | string | null;
  nombre_cliente?: string | null;
  telefono_cliente?: string | null;
  created_at?: string | null;
  archived_at?: string | null;
  detalles?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asTrimmed(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeStatus(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return 'pendiente';
  if (normalized === 'rechazado' || normalized === 'anulado') return 'cancelado';
  return normalized;
}

function formatStatusLabel(status: string) {
  return status
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatRelativeTime(value: string | null | undefined, now = new Date()) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Hace instantes';
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 14) return `Hace ${diffDays} d`;
  return date.toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatOrderCode(row: RawPedido) {
  const detalles = asRecord(row.detalles);
  const orderId = asTrimmed(detalles.order_id) ?? asTrimmed(detalles.codigo_orden);
  if (orderId) {
    return orderId.startsWith('#') ? orderId : `#${orderId}`;
  }
  const fallback = (row.id ?? '').slice(0, 8).toUpperCase() || 'PEDIDO';
  return `#${fallback}`;
}

function paymentMethodLabel(detalles: Record<string, unknown>) {
  const metodo = asRecord(detalles.metodo_pago);
  return (
    asTrimmed(metodo.nombre) ??
    asTrimmed(metodo.name) ??
    asTrimmed(detalles.metodo_pago_nombre) ??
    null
  );
}

function paymentMethodDetails(detalles: Record<string, unknown>): string[] {
  const metodo = asRecord(detalles.metodo_pago);
  const datos = metodo.datos;
  if (Array.isArray(datos)) {
    return datos.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof datos === 'string' && datos.trim()) {
    return [datos.trim()];
  }
  return [];
}

function comprobanteUrls(detalles: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
    const raw = asTrimmed(value);
    if (!raw || seen.has(raw)) return;
    seen.add(raw);
    out.push(raw);
  };

  if (Array.isArray(detalles.comprobantes)) {
    for (const item of detalles.comprobantes) push(item);
  }
  push(detalles.comprobante_url);
  push(detalles.comprobante_public_url);
  // Keep at least a sentinel so the UI shows the open button when any proof exists.
  return out;
}

function parseItems(detalles: Record<string, unknown>, currency: string): AdminOrderItemLine[] {
  const items = detalles.items;
  if (!Array.isArray(items)) return [];

  return items
    .map((raw) => {
      const item = asRecord(raw);
      const name =
        asTrimmed(item.nombre) ??
        asTrimmed(item.name) ??
        asTrimmed(item.producto) ??
        'Producto';
      const quantityRaw = Number(item.cantidad ?? item.quantity ?? 1);
      const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;
      const unitPriceRaw = item.precio ?? item.price ?? item.unit_price;
      const unitPrice =
        unitPriceRaw == null || unitPriceRaw === ''
          ? null
          : Number(unitPriceRaw);
      const safePrice = unitPrice != null && Number.isFinite(unitPrice) ? unitPrice : null;

      return {
        name,
        quantity,
        unitPrice: safePrice,
        unitPriceLabel: safePrice != null ? formatAdminMoney(safePrice, currency) : null,
        notes: asTrimmed(item.notas) ?? asTrimmed(item.opciones)?.slice(0, 180) ?? null,
      } satisfies AdminOrderItemLine;
    })
    .filter((item) => Boolean(item.name));
}

function toListItem(
  row: RawPedido,
  businessNameById: Map<string, string>,
  now = new Date(),
): AdminOrderListItem | null {
  const id = asTrimmed(row.id);
  const comercioId = asTrimmed(row.comercio_id);
  if (!id || !comercioId) return null;

  const detalles = asRecord(row.detalles);
  const money = extractOrderMoney(row);
  const status = normalizeStatus(row.estado);
  const managementMode =
    normalizeOrderManagementMode(detalles.management_mode) === 'whatsapp_manual' ||
    isWhatsappManualOrder(row.detalles)
      ? 'whatsapp_manual'
      : 'platform';

  return {
    id,
    code: formatOrderCode(row),
    comercioId,
    businessName: businessNameById.get(comercioId) ?? 'Comercio',
    customerName:
      asTrimmed(row.nombre_cliente) ??
      asTrimmed(detalles.cliente_nombre) ??
      asTrimmed(detalles.nombre_cliente) ??
      'Cliente',
    customerPhone:
      asTrimmed(row.telefono_cliente) ??
      asTrimmed(detalles.telefono_cliente) ??
      asTrimmed(detalles.cliente_telefono) ??
      null,
    status,
    statusLabel:
      managementMode === 'whatsapp_manual'
        ? 'Gestionado por WhatsApp'
        : formatStatusLabel(status),
    managementMode,
    amount: money.amount,
    amountLabel: formatAdminMoney(money.amount, money.currency),
    currency: money.currency,
    usdEstimate: money.usdEstimate,
    usdEstimateLabel:
      money.usdEstimate != null ? formatAdminMoney(money.usdEstimate, 'USD') : null,
    paymentMethod: paymentMethodLabel(detalles),
    paymentReference: asTrimmed(detalles.referencia_pago),
    createdAt: row.created_at ?? null,
    createdLabel: formatRelativeTime(row.created_at, now),
    archivedAt: row.archived_at ?? null,
    isArchived: Boolean(row.archived_at),
  };
}

function toDetail(
  row: RawPedido,
  businessNameById: Map<string, string>,
): AdminOrderDetail | null {
  const list = toListItem(row, businessNameById);
  if (!list) return null;

  const detalles = asRecord(row.detalles);
  const money = extractOrderMoney(row);
  const delivery = asRecord(detalles.delivery);
  const subtotal = Number(detalles.subtotal_moneda_checkout ?? detalles.subtotal);
  const deliveryCost = Number(
    detalles.costo_delivery_moneda_checkout ?? row.costo_delivery ?? detalles.costo_delivery,
  );

  return {
    ...list,
    customerEmail: asTrimmed(detalles.cliente_email) ?? asTrimmed(detalles.email_cliente),
    deliveryMode:
      asTrimmed(delivery.mode) ??
      asTrimmed(delivery.tipo) ??
      asTrimmed(detalles.delivery_mode),
    deliveryAddress:
      asTrimmed(delivery.address) ??
      asTrimmed(delivery.direccion) ??
      asTrimmed(detalles.direccion_entrega),
    deliveryReference:
      asTrimmed(delivery.reference) ??
      asTrimmed(delivery.referencia) ??
      asTrimmed(detalles.referencia_entrega),
    deliveryInstructions:
      asTrimmed(delivery.instructions) ??
      asTrimmed(delivery.instrucciones) ??
      asTrimmed(detalles.instrucciones_entrega),
    orderNotes:
      asTrimmed(detalles.order_notes) ??
      asTrimmed(detalles.notas) ??
      asTrimmed(detalles.notas_pedido),
    subtotalLabel: Number.isFinite(subtotal)
      ? formatAdminMoney(subtotal, money.currency)
      : null,
    deliveryCostLabel: Number.isFinite(deliveryCost)
      ? formatAdminMoney(deliveryCost, money.currency)
      : null,
    exchangeRate: money.exchangeRate,
    baseAmountLabel: formatAdminMoney(money.baseAmount, money.baseCurrency),
    baseCurrency: money.baseCurrency,
    items: parseItems(detalles, money.currency),
    paymentMethodDetails: paymentMethodDetails(detalles),
    comprobanteUrls: comprobanteUrls(detalles),
    rawDetalles: detalles,
    money,
  };
}

async function loadBusinessNames(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase.from('comercios').select('id,nombre').in('id', unique);
  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as Array<{ id?: string | null; nombre?: string | null }>).map((row) => [
      String(row.id ?? ''),
      (row.nombre ?? '').trim() || 'Comercio',
    ]),
  );
}

function parseOrderFilterInstant(
  value: string | null | undefined,
  bound: 'start' | 'end',
): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    if (bound === 'start') return `${trimmed}T00:00:00.000Z`;
    const next = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(next.getTime())) return null;
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function listAdminOrders(options?: {
  query?: string;
  businessId?: string;
  status?: string;
  archived?: 'active' | 'archived' | 'all';
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const supabase = getAdminSupabaseClient();
  const limit = Math.min(Math.max(options?.limit ?? 80, 1), 200);
  const offset = Math.max(options?.offset ?? 0, 0);
  const query = (options?.query ?? '').trim();
  const businessId = (options?.businessId ?? '').trim();
  const status = (options?.status ?? '').trim().toLowerCase();
  const archived = options?.archived ?? 'active';
  const fromIso = parseOrderFilterInstant(options?.from, 'start');
  const toIso = parseOrderFilterInstant(options?.to, 'end');

  let request = supabase
    .from('pedidos')
    .select(
      'id,comercio_id,estado,total,costo_delivery,nombre_cliente,telefono_cliente,created_at,archived_at,detalles',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (businessId) {
    request = request.eq('comercio_id', businessId);
  }

  if (status && status !== 'all') {
    request = request.eq('estado', status);
  }

  if (archived === 'active') {
    request = request.is('archived_at', null);
  } else if (archived === 'archived') {
    request = request.not('archived_at', 'is', null);
  }

  if (fromIso) {
    request = request.gte('created_at', fromIso);
  }

  if (toIso) {
    // Chart buckets and date-only filters use an exclusive end bound.
    request = request.lt('created_at', toIso);
  }

  if (query.length >= 2) {
    const safe = query.replace(/[%_,]/g, '').slice(0, 60);
    if (safe) {
      const filters = [
        `nombre_cliente.ilike.%${safe}%`,
        `telefono_cliente.ilike.%${safe}%`,
      ];
      if (/^[0-9a-f-]{36}$/i.test(safe)) {
        filters.push(`id.eq.${safe}`);
      }
      request = request.or(filters.join(','));
    }
  }

  const { data, error, count } = await request;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RawPedido[];
  const businessNames = await loadBusinessNames(
    rows.map((row) => row.comercio_id?.toString() ?? ''),
  );
  const now = new Date();
  const orders = rows
    .map((row) => toListItem(row, businessNames, now))
    .filter((row): row is AdminOrderListItem => row != null);

  return {
    orders,
    total: count ?? orders.length,
    limit,
    offset,
  };
}

export async function getAdminOrderDetail(orderId: string) {
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('pedidos')
    .select(
      'id,comercio_id,estado,total,costo_delivery,nombre_cliente,telefono_cliente,created_at,archived_at,detalles',
    )
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const row = data as RawPedido;
  const businessNames = await loadBusinessNames([row.comercio_id?.toString() ?? '']);
  return toDetail(row, businessNames);
}

export async function listAdminOrdersForBusiness(businessId: string, limit = 40) {
  return listAdminOrders({ businessId, limit });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function setAdminOrdersArchivedBulk(
  orderIds: string[],
  archived: boolean,
): Promise<{ updatedIds: string[]; skipped: number }> {
  const uniqueIds = [
    ...new Set(
      orderIds
        .map((id) => id.trim())
        .filter((id) => UUID_RE.test(id)),
    ),
  ].slice(0, 200);

  if (uniqueIds.length === 0) {
    return { updatedIds: [], skipped: orderIds.length };
  }

  const supabase = getAdminSupabaseClient();
  const nextArchivedAt = archived ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from('pedidos')
    .update({ archived_at: nextArchivedAt })
    .in('id', uniqueIds)
    .select('id');

  if (error) throw new Error(error.message);

  const updatedIds = ((data ?? []) as Array<{ id?: string | null }>)
    .map((row) => (row.id ?? '').trim())
    .filter(Boolean);

  return {
    updatedIds,
    skipped: Math.max(0, uniqueIds.length - updatedIds.length),
  };
}
