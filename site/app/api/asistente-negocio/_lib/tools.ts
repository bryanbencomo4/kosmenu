import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import type { BusinessShop } from './auth';
import { appendBusinessAudit } from './audit';
import {
  getBusinessAssistantRuntimeConfig,
  type BusinessAllowedOp,
} from './config';
import {
  consumeConfirmNonce,
  issueConfirmToken,
  verifyConfirmToken,
  type ConfirmPayload,
} from './confirm';
import {
  formatFlutterScheduleForChat,
  parseBusinessHoursText,
  type FlutterBusinessSchedule,
} from './hours-parse';
import type { BusinessMenuView } from './menu-view';
import { buildMenuView } from './menu-view';
import {
  buildCustomersView,
  buildMetricsView,
  buildOrdersView,
  formatHoursForChat,
  type BusinessCustomersView,
  type BusinessMetricsView,
  type BusinessOrdersView,
} from './orders-view';
import { applyExtendedOp } from './apply-extended';
import { resolveProductMatch, type ProductRow } from './product-match';

export type { BusinessMenuView, BusinessMenuCategory, BusinessMenuProduct } from './menu-view';
export type {
  BusinessCustomersView,
  BusinessMetricsView,
  BusinessOrderRow,
  BusinessOrdersView,
} from './orders-view';

export type BusinessProposalCard = {
  action: BusinessAllowedOp;
  confirmToken: string;
  expiresAt: number;
  summary: string;
  details: Record<string, unknown>;
  panelUrl: string;
};

export type BusinessToolResult = {
  text: string;
  proposal?: BusinessProposalCard;
  productsSample?: Array<{
    id: string;
    nombre: string;
    precio: unknown;
    disponible: boolean | null;
  }>;
  /** Rich menu for in-chat carousels (categories + products). */
  menuView?: BusinessMenuView;
  /** In-chat secure account card (email / password). */
  showAccountCard?: 'password' | 'email' | 'menu';
  /** Structured orders list (replaces ugly bullet dumps). */
  ordersView?: BusinessOrdersView;
  /** Today's KPI snapshot card. */
  metricsView?: BusinessMetricsView;
  /** Customer names from recent / today orders. */
  customersView?: BusinessCustomersView;
  auditId?: string;
};

function pickProduct(
  products: ProductRow[],
  hint?: string,
): { product: ProductRow | null; ambiguous: ProductRow[] } {
  const result = resolveProductMatch(products, hint);
  if (result.status === 'exact') return { product: result.product, ambiguous: [] };
  if (result.status === 'ambiguous') return { product: null, ambiguous: result.candidates };
  return { product: null, ambiguous: [] };
}

function ambiguousProductText(shopName: string, candidates: ProductRow[]): string {
  const list = candidates
    .slice(0, 6)
    .map((p) => `• ${String(p.nombre || '')}`)
    .join('\n');
  return `Encontré varios parecidos en *${shopName}* 👀\n\n${list}\n\nEscribe el *nombre exacto* del que quieres cambiar.`;
}

async function loadProducts(comercioId: string, limit: number) {
  const sb = getServiceSupabaseClient();
  const { data, error } = await sb
    .from('productos')
    .select('id,nombre,descripcion,precio,disponible,categoria_id,imagen_url')
    .eq('comercio_id', comercioId)
    .order('nombre', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

async function loadCategories(comercioId: string) {
  const sb = getServiceSupabaseClient();
  const { data, error } = await sb
    .from('categorias')
    .select('id,nombre,imagen_url,orden')
    .eq('comercio_id', comercioId)
    .order('orden', { ascending: true })
    .limit(80);
  if (error) {
    // orden may be missing on older schemas — retry without it.
    const retry = await sb
      .from('categorias')
      .select('id,nombre,imagen_url')
      .eq('comercio_id', comercioId)
      .order('nombre', { ascending: true })
      .limit(80);
    if (retry.error) throw new Error(retry.error.message);
    return retry.data || [];
  }
  return data || [];
}

function makeProposal(
  userId: string,
  shop: BusinessShop,
  op: BusinessAllowedOp,
  data: Record<string, unknown>,
  summary: string,
): BusinessProposalCard {
  const cfg = getBusinessAssistantRuntimeConfig();
  const issued = issueConfirmToken(
    { op, userId, comercioId: shop.comercioId, data },
    cfg.confirmTtlMs,
  );
  return {
    action: op,
    confirmToken: issued.token,
    expiresAt: issued.expiresAt,
    summary,
    details: data,
    panelUrl: cfg.panelUrl,
  };
}

function mapProductsSample(
  products: Array<{ id: unknown; nombre: unknown; precio: unknown; disponible: unknown }>,
  limit = 8,
) {
  return products.slice(0, limit).map((p) => ({
    id: String(p.id),
    nombre: String(p.nombre || ''),
    precio: p.precio,
    disponible: typeof p.disponible === 'boolean' ? p.disponible : null,
  }));
}

export async function listMenu(shop: BusinessShop): Promise<BusinessToolResult> {
  const cfg = getBusinessAssistantRuntimeConfig();
  const [products, categories] = await Promise.all([
    loadProducts(shop.comercioId, Math.max(cfg.maxProductsSample, 120)),
    loadCategories(shop.comercioId),
  ]);
  const menuView = buildMenuView(shop, categories, products);
  const status =
    shop.enLinea === true ? '🟢' : shop.enLinea === false ? '🔴' : '⚪️';
  const n = menuView.products.length;
  const cats = menuView.categories.length;
  return {
    text:
      n === 0
        ? `Todavía no veo productos en *${shop.nombre}* 🙈\n\n¿Agregamos el primero?`
        : `Aquí está el menú de *${shop.nombre}* ${status}\n\n${cats} categorí${cats === 1 ? 'a' : 'as'} · ${n} producto${n === 1 ? '' : 's'}.\nDesliza cada fila o toca *Ver* — y toca un plato para gestionarlo 👇`,
    productsSample: mapProductsSample(products),
    menuView,
  };
}

/** Guide photo change in-chat (confirm path lands later; pick product first). */
export async function guideChangeImage(
  shop: BusinessShop,
  productHint?: string,
): Promise<BusinessToolResult> {
  const cfg = getBusinessAssistantRuntimeConfig();
  const products = await loadProducts(shop.comercioId, cfg.maxProductsSample);
  const { product: match, ambiguous } = pickProduct(products, productHint);
  if (ambiguous.length) {
    return {
      text: ambiguousProductText(shop.nombre, ambiguous),
      productsSample: mapProductsSample(ambiguous),
    };
  }
  if (!match) {
    return {
      text: `¿De cuál producto cambiamos la foto? 🖼️\n\nToca uno abajo o escribe el nombre.`,
      productsSample: mapProductsSample(products),
    };
  }
  return {
    text: `Perfecto — *${match.nombre}* 🖼️\n\nPor ahora mándame la foto por aquí cuando esté listo el adjunto en el chat; mientras, dime si quieres *mejorarla con IA* o solo reemplazarla.`,
    productsSample: mapProductsSample([match], 1),
  };
}

export async function proposePrice(
  userId: string,
  shop: BusinessShop,
  opts: { productHint?: string; newPrice?: number },
): Promise<BusinessToolResult> {
  const cfg = getBusinessAssistantRuntimeConfig();
  const products = await loadProducts(shop.comercioId, cfg.maxProductsSample);
  const { product: match, ambiguous } = pickProduct(products, opts.productHint);
  if (ambiguous.length) {
    return {
      text: ambiguousProductText(shop.nombre, ambiguous),
      productsSample: mapProductsSample(ambiguous),
    };
  }
  if (!match) {
    return {
      text: `No encontré ese producto en *${shop.nombre}* 😅\n\nDime el nombre tal cual o escribe “ver menú”.`,
      productsSample: mapProductsSample(products),
    };
  }
  if (opts.newPrice == null) {
    return {
      text: `*${match.nombre}* está en *${match.precio ?? '—'}*${
        shop.moneda ? ` ${shop.moneda}` : ''
      } 💵\n\n¿A cuánto lo dejamos? (ej. “a 12”)`,
      productsSample: mapProductsSample([match], 1),
    };
  }
  const proposal = makeProposal(
    userId,
    shop,
    'set_price',
    {
      productId: String(match.id),
      productName: String(match.nombre || ''),
      currentPrice: match.precio,
      newPrice: opts.newPrice,
    },
    `Cambiar precio de ${match.nombre} de ${match.precio ?? '—'} a ${opts.newPrice}${
      shop.moneda ? ` ${shop.moneda}` : ''
    }`,
  );
  return {
    text: `¿Lo dejamos así? 🤞\n\n*${match.nombre}*: ${match.precio ?? '—'} → *${opts.newPrice}*${
      shop.moneda ? ` ${shop.moneda}` : ''
    }\n\nToca *Confirmar* y listo ✅`,
    proposal,
  };
}

export async function proposeAvailability(
  userId: string,
  shop: BusinessShop,
  opts: { productHint?: string; available?: boolean },
): Promise<BusinessToolResult> {
  const cfg = getBusinessAssistantRuntimeConfig();
  const products = await loadProducts(shop.comercioId, cfg.maxProductsSample);
  const { product: match, ambiguous } = pickProduct(products, opts.productHint);
  if (ambiguous.length) {
    return {
      text: ambiguousProductText(shop.nombre, ambiguous),
      productsSample: mapProductsSample(ambiguous),
    };
  }
  if (!match) {
    return {
      text: `No encontré ese producto en *${shop.nombre}* 🙈\n\nDime el nombre o toca uno abajo.`,
      productsSample: mapProductsSample(products),
    };
  }
  const available = opts.available !== false;
  const proposal = makeProposal(
    userId,
    shop,
    'set_availability',
    {
      productId: String(match.id),
      productName: String(match.nombre || ''),
      available,
    },
    `Marcar ${match.nombre} como ${available ? 'disponible' : 'agotado'}`,
  );
  return {
    text: available
      ? `¿Activamos *${match.nombre}* otra vez? ✅\n\nConfirma y queda disponible.`
      : `¿Marcamos *${match.nombre}* como agotado? ⏸️\n\nConfirma y lo ocultamos del menú.`,
    proposal,
  };
}

export async function readHours(shop: BusinessShop): Promise<BusinessToolResult> {
  const raw = formatHoursForChat(shop.horarios);
  return {
    text: `🕒 Horario de *${shop.nombre}*:\n${raw}\n\nSi quieres cambiarlo, dime algo como “Lun-Vie 10:00-22:00”.`,
  };
}

export async function proposeHours(
  userId: string,
  shop: BusinessShop,
  hoursText: string,
): Promise<BusinessToolResult> {
  const parsed = parseBusinessHoursText(hoursText);
  if (!parsed.ok) {
    return {
      text: `No pude armar un horario válido 😅\n\n${parsed.error}\n\nEjemplo: *Lun-Vie 11:00-21:00* o *todos los días 10:00-22:00*.`,
    };
  }
  const summaryBlock = formatFlutterScheduleForChat(parsed.schedule);
  const proposal = makeProposal(
    userId,
    shop,
    'set_hours',
    {
      hoursText,
      summary: parsed.summary,
      schedule: parsed.schedule,
      previous: shop.horarios,
    },
    `Actualizar horario: ${parsed.summary}`,
  );
  return {
    text: `¿Queda así el horario de *${shop.nombre}*? 🕒\n\n*Resumen:* ${parsed.summary}\n\n${summaryBlock}\n\nConfirma y lo guardo ✅`,
    proposal,
  };
}

export async function proposeEnLinea(
  userId: string,
  shop: BusinessShop,
  enLinea?: boolean,
): Promise<BusinessToolResult> {
  if (typeof enLinea !== 'boolean') {
    return {
      text: `*${shop.nombre}* está ${
        shop.enLinea === true ? '🟢 abierto' : shop.enLinea === false ? '🔴 cerrado' : '⚪️ sin estado claro'
      }.\n\n¿Lo abrimos o lo cerramos?`,
    };
  }
  const proposal = makeProposal(
    userId,
    shop,
    'set_en_linea',
    { enLinea },
    enLinea ? `Poner ${shop.nombre} en línea` : `Poner ${shop.nombre} fuera de línea`,
  );
  return {
    text: enLinea
      ? `¿Abrimos *${shop.nombre}*? 🟢\n\nConfirma y queda en línea.`
      : `¿Cerramos *${shop.nombre}* por ahora? 🔴\n\nConfirma y queda fuera de línea.`,
    proposal,
  };
}

export type ShopHomeMetrics = {
  ordersToday: number;
  salesToday: number;
  customersToday: number;
};

/** Caracas business-day KPIs — same window as the merchant home dashboard. */
export async function loadShopHomeMetrics(
  shop: BusinessShop,
): Promise<ShopHomeMetrics | null> {
  try {
    const { adminTodayBusinessWindow } = await import(
      '../../../admin/_lib/admin-business-day'
    );
    const { startInclusive, endExclusive } = adminTodayBusinessWindow();
    const sb = getServiceSupabaseClient();
    const { data, error } = await sb
      .from('pedidos')
      .select('id,estado,total,nombre_cliente,archived_at')
      .eq('comercio_id', shop.comercioId)
      .gte('created_at', startInclusive.toISOString())
      .lt('created_at', endExclusive.toISOString())
      .is('archived_at', null)
      .limit(500);
    if (error) return null;
    const rows = (data || []).filter(
      (o) => String(o.estado || '').toLowerCase() !== 'cancelado',
    );
    const customers = new Set<string>();
    let sales = 0;
    for (const o of rows) {
      const total = Number(o.total);
      if (Number.isFinite(total)) sales += total;
      const name = String(o.nombre_cliente || '').trim().toLowerCase();
      if (name) customers.add(name);
    }
    return {
      ordersToday: rows.length,
      salesToday: sales,
      customersToday: customers.size,
    };
  } catch {
    return null;
  }
}

export async function recentOrders(
  shop: BusinessShop,
  opts?: { filter?: 'all' | 'pending' | 'today' },
): Promise<BusinessToolResult> {
  const cfg = getBusinessAssistantRuntimeConfig();
  const filter = opts?.filter || 'all';
  const sb = getServiceSupabaseClient();
  let query = sb
    .from('pedidos')
    .select('id,estado,total,created_at,nombre_cliente,telefono_cliente')
    .eq('comercio_id', shop.comercioId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(filter === 'pending' ? Math.max(cfg.maxRecentOrders, 20) : cfg.maxRecentOrders);

  if (filter === 'pending') {
    query = query.eq('estado', 'pendiente');
  }
  if (filter === 'today') {
    try {
      const { adminTodayBusinessWindow } = await import(
        '../../../admin/_lib/admin-business-day'
      );
      const { startInclusive, endExclusive } = adminTodayBusinessWindow();
      query = query
        .gte('created_at', startInclusive.toISOString())
        .lt('created_at', endExclusive.toISOString());
    } catch {
      /* keep unfiltered if window fails */
    }
  }

  const { data, error } = await query;
  if (error) {
    return {
      text: `No pude traer los pedidos ahora 😅\n\nIntenta de nuevo en un momentito.`,
    };
  }
  const rows = (data || []) as Array<Record<string, unknown>>;
  const ordersView = buildOrdersView({
    shopName: shop.nombre,
    currency: shop.moneda,
    filter,
    rows,
  });
  const n = ordersView.orders.length;
  const text =
    n === 0
      ? filter === 'pending'
        ? `No hay pedidos *pendientes* ahora en *${shop.nombre}* ✅`
        : filter === 'today'
          ? `Hoy aún no hay pedidos en *${shop.nombre}* 📊`
          : `Todavía no veo pedidos en *${shop.nombre}* 🧾`
      : `Aquí tienes ${n} pedido${n === 1 ? '' : 's'} 👇`;

  return { text, ordersView };
}

/** Mid-chat KPI answer — same numbers as the home greeting. */
export async function readHomeMetrics(
  shop: BusinessShop,
  focus: BusinessMetricsView['focus'] = 'all',
): Promise<BusinessToolResult> {
  const metrics = await loadShopHomeMetrics(shop);
  if (!metrics) {
    return {
      text: `No pude cargar el resumen de hoy 😅\n\nIntenta de nuevo en un momentito.`,
    };
  }
  const metricsView = buildMetricsView({
    shopName: shop.nombre,
    currency: shop.moneda,
    ...metrics,
    focus,
  });
  let text: string;
  if (focus === 'customers') {
    text =
      metrics.customersToday === 0
        ? `Hoy todavía no registré clientes con nombre en *${shop.nombre}* 👥`
        : `Hoy llevas *${metrics.customersToday}* cliente${metrics.customersToday === 1 ? '' : 's'} 👥`;
  } else if (focus === 'sales') {
    text =
      metrics.ordersToday === 0
        ? `Hoy aún no hay ventas en *${shop.nombre}* 💵`
        : `Hoy vas por *${formatMoneyShort(metrics.salesToday, shop.moneda)}* en ventas 💵`;
  } else if (focus === 'orders') {
    text =
      metrics.ordersToday === 0
        ? `Hoy aún no hay pedidos en *${shop.nombre}* 🧾`
        : `Hoy llevas *${metrics.ordersToday}* pedido${metrics.ordersToday === 1 ? '' : 's'} 🧾`;
  } else {
    text =
      metrics.ordersToday === 0
        ? `Resumen de hoy en *${shop.nombre}*: todavía sin movimiento 📊`
        : `Resumen de hoy en *${shop.nombre}* 📊`;
  }
  return { text, metricsView };
}

function formatMoneyShort(amount: number, moneda: string | null): string {
  const rounded = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return moneda ? `${rounded} ${moneda}` : rounded;
}

/** Unique customer names from recent pedidos (today first, else last N). */
export async function listCustomers(shop: BusinessShop): Promise<BusinessToolResult> {
  const cfg = getBusinessAssistantRuntimeConfig();
  const sb = getServiceSupabaseClient();
  let scopeLabel = 'pedidos recientes';
  let rows: Array<{ nombre_cliente?: unknown; total?: unknown }> = [];

  try {
    const { adminTodayBusinessWindow } = await import(
      '../../../admin/_lib/admin-business-day'
    );
    const { startInclusive, endExclusive } = adminTodayBusinessWindow();
    const today = await sb
      .from('pedidos')
      .select('nombre_cliente,total,estado,created_at')
      .eq('comercio_id', shop.comercioId)
      .gte('created_at', startInclusive.toISOString())
      .lt('created_at', endExclusive.toISOString())
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!today.error && (today.data || []).length > 0) {
      rows = (today.data || []).filter(
        (o) => String(o.estado || '').toLowerCase() !== 'cancelado',
      );
      scopeLabel = 'hoy';
    }
  } catch {
    /* fall through */
  }

  if (rows.length === 0) {
    const recent = await sb
      .from('pedidos')
      .select('nombre_cliente,total,estado,created_at')
      .eq('comercio_id', shop.comercioId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(Math.max(cfg.maxRecentOrders * 3, 40));
    if (recent.error) {
      return { text: `No pude leer los clientes ahora 😅\n\nIntenta de nuevo.` };
    }
    rows = (recent.data || []).filter(
      (o) => String(o.estado || '').toLowerCase() !== 'cancelado',
    );
    scopeLabel = 'pedidos recientes';
  }

  const customersView = buildCustomersView({
    shopName: shop.nombre,
    scopeLabel,
    rows,
  });
  const n = customersView.customers.length;
  return {
    text:
      n === 0
        ? `No veo nombres de clientes guardados todavía en *${shop.nombre}* 👥`
        : `Estos son los clientes (${scopeLabel}) 👇`,
    customersView,
  };
}

export async function readOrderDetail(
  shop: BusinessShop,
  hint: string,
): Promise<BusinessToolResult> {
  const sb = getServiceSupabaseClient();
  const needle = hint.replace(/detalle\s+pedido/i, '').trim();
  const compact = needle.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const { data, error } = await sb
    .from('pedidos')
    .select(
      'id,estado,total,created_at,nombre_cliente,telefono_cliente,detalles,costo_delivery',
    )
    .eq('comercio_id', shop.comercioId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) {
    return { text: `No pude abrir ese pedido 😅\n\nIntenta de nuevo.` };
  }
  const rows = data || [];
  const match =
    rows.find((o) => String(o.id) === needle) ||
    rows.find((o) =>
      String(o.id).replace(/-/g, '').toLowerCase().startsWith(compact.slice(0, 8)),
    ) ||
    rows.find((o) => {
      const name = String(o.nombre_cliente || '').toLowerCase();
      return name && compact && name.includes(needle.toLowerCase());
    });
  if (!match) {
    return {
      text: `No encontré ese pedido 🙈\n\nToca uno en la lista o escribe *pedidos*.`,
    };
  }
  const ordersView = buildOrdersView({
    shopName: shop.nombre,
    currency: shop.moneda,
    filter: 'all',
    rows: [match as Record<string, unknown>],
  });
  const name = String(match.nombre_cliente || '').trim() || 'Sin nombre';
  const phone = String(match.telefono_cliente || '').trim();
  const when = ordersView.orders[0]?.whenLabel || '—';
  return {
    text: [
      `Pedido de *${name}*`,
      `• Estado: *${match.estado ?? '—'}*`,
      `• Total: *${match.total ?? '—'}*${shop.moneda ? ` ${shop.moneda}` : ''}`,
      phone ? `• Tel: ${phone}` : null,
      `• Cuando: ${when}`,
    ]
      .filter(Boolean)
      .join('\n'),
    ordersView,
  };
}

export async function applyConfirm(params: {
  userId: string;
  shops: BusinessShop[];
  token: string;
}): Promise<BusinessToolResult> {
  const cfg = getBusinessAssistantRuntimeConfig();
  let payload: ConfirmPayload | null = null;
  let nonce = '';
  let expiresAt = 0;
  let matchedShop: BusinessShop | null = null;
  let hardFail: string | null = null;

  for (const shop of params.shops) {
    const v = verifyConfirmToken(params.token, {
      userId: params.userId,
      comercioId: shop.comercioId,
    });
    if (v.ok) {
      payload = v.payload;
      nonce = v.nonce;
      expiresAt = v.expiresAt;
      matchedShop = shop;
      break;
    }
    if (v.error === 'replay' || v.error === 'expired' || v.error === 'invalid_signature') {
      hardFail = v.error;
    }
  }
  if (!payload || !matchedShop) {
    return {
      text: hardFail
        ? `No pude aplicar el cambio (${hardFail}). Genera una propuesta nueva.`
        : 'La confirmación no es válida para tu sesión o negocio. Pide el cambio otra vez.',
    };
  }

  const sb = getServiceSupabaseClient();
  try {
    if (payload.op === 'set_price') {
      const productId = String(payload.data.productId || '');
      const newPrice = Number(payload.data.newPrice);
      if (!productId || !Number.isFinite(newPrice) || newPrice <= 0) {
        throw new Error('invalid_price_payload');
      }
      const { error, data } = await sb
        .from('productos')
        .update({ precio: newPrice })
        .eq('id', productId)
        .eq('comercio_id', matchedShop.comercioId)
        .select('id,nombre,precio')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('product_not_found');
      consumeConfirmNonce(nonce, expiresAt);
      const auditId = appendBusinessAudit(cfg.auditDir, {
        userId: params.userId,
        comercioId: matchedShop.comercioId,
        op: payload.op,
        data: payload.data,
        ok: true,
      });
      return {
        text: `¡Hecho! ✅ *${data.nombre}* quedó en *${data.precio}*${
          matchedShop.moneda ? ` ${matchedShop.moneda}` : ''
        }\n\n(ref ${auditId})`,
        auditId,
      };
    }

    if (payload.op === 'set_availability') {
      const productId = String(payload.data.productId || '');
      const available = payload.data.available === true;
      const { error, data } = await sb
        .from('productos')
        .update({ disponible: available })
        .eq('id', productId)
        .eq('comercio_id', matchedShop.comercioId)
        .select('id,nombre,disponible')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('product_not_found');
      consumeConfirmNonce(nonce, expiresAt);
      const auditId = appendBusinessAudit(cfg.auditDir, {
        userId: params.userId,
        comercioId: matchedShop.comercioId,
        op: payload.op,
        data: payload.data,
        ok: true,
      });
      return {
        text: data.disponible
          ? `¡Listo! ✅ *${data.nombre}* otra vez disponible.\n\n(ref ${auditId})`
          : `Listo ⏸️ *${data.nombre}* marcado como agotado.\n\n(ref ${auditId})`,
        auditId,
      };
    }

    if (payload.op === 'set_en_linea') {
      const enLinea = payload.data.enLinea === true;
      const { error, data } = await sb
        .from('comercios')
        .update({ en_linea: enLinea })
        .eq('id', matchedShop.comercioId)
        .select('id,nombre,en_linea')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('comercio_not_found');
      consumeConfirmNonce(nonce, expiresAt);
      const auditId = appendBusinessAudit(cfg.auditDir, {
        userId: params.userId,
        comercioId: matchedShop.comercioId,
        op: payload.op,
        data: payload.data,
        ok: true,
      });
      return {
        text: data.en_linea
          ? `¡Abierto! 🟢 *${data.nombre}* ya está en línea.\n\n(ref ${auditId})`
          : `Cerrado por ahora 🔴 *${data.nombre}* fuera de línea.\n\n(ref ${auditId})`,
        auditId,
      };
    }

    if (payload.op === 'set_hours') {
      const hoursText = String(payload.data.hoursText || '').trim();
      let schedule = payload.data.schedule as FlutterBusinessSchedule | undefined;
      if (!schedule || typeof schedule !== 'object' || !schedule.days) {
        const parsed = parseBusinessHoursText(hoursText);
        if (!parsed.ok) throw new Error('invalid_hours');
        schedule = parsed.schedule;
      }
      const horarios: FlutterBusinessSchedule = {
        ...schedule,
        timezone: schedule.timezone || 'America/Caracas',
        updatedVia: 'business_assistant',
        updatedAt: new Date().toISOString(),
        sourceText: hoursText.slice(0, 200) || schedule.sourceText,
      };
      const { error, data } = await sb
        .from('comercios')
        .update({ horarios })
        .eq('id', matchedShop.comercioId)
        .select('id,nombre')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('comercio_not_found');
      consumeConfirmNonce(nonce, expiresAt);
      const auditId = appendBusinessAudit(cfg.auditDir, {
        userId: params.userId,
        comercioId: matchedShop.comercioId,
        op: payload.op,
        data: payload.data,
        ok: true,
      });
      const summary =
        typeof payload.data.summary === 'string' && payload.data.summary
          ? payload.data.summary
          : formatFlutterScheduleForChat(horarios).split('\n')[0] || 'horario';
      return {
        text: `¡Guardado! 🕒 Horario de *${data.nombre}* actualizado (${summary}).\n\n(ref ${auditId})`,
        auditId,
      };
    }

    const extended = await applyExtendedOp({
      sb,
      shop: matchedShop,
      op: payload.op,
      data: payload.data,
      userId: params.userId,
    });
    if (extended) {
      consumeConfirmNonce(nonce, expiresAt);
      const auditId = appendBusinessAudit(cfg.auditDir, {
        userId: params.userId,
        comercioId: matchedShop.comercioId,
        op: payload.op,
        data: { ...payload.data, ...(extended.data || {}) },
        ok: true,
      });
      return { text: `${extended.text}\n\n(ref ${auditId})`, auditId };
    }

    throw new Error('unsupported_op');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'apply_failed';
    appendBusinessAudit(cfg.auditDir, {
      userId: params.userId,
      comercioId: matchedShop.comercioId,
      op: payload.op,
      data: payload.data,
      ok: false,
      error: message,
    });
    return {
      text: `Uy, no pude aplicar eso 😅 (${message})\n\nIntenta de nuevo aquí mismo.`,
    };
  }
}
