import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import type { BusinessShop } from './auth';
import { getBusinessAssistantRuntimeConfig, type BusinessAllowedOp } from './config';
import {
  currencyLabel,
  describeFx,
  detectFxCurrency,
  extractFxValue,
  formatRate,
  normalizeCurrency,
  rateCurrencies,
  rateSentence,
  resolveFxTarget,
} from './fx';
import { loadShopFx } from './fx-load';
import { issueConfirmToken } from './confirm';
import {
  canManageCatalog,
  canManageMarketing,
  canManageOrders,
  canManageSettings,
  canManageStaff,
  denied,
} from './permissions';
import { resolveProductMatch } from './product-match';
import {
  canTransitionOrderStatus,
  normalizeOrderStatus,
  orderStatusLabel,
  parseTargetOrderStatus,
  type CanonicalOrderStatus,
} from './order-status';
import type { BusinessProposalCard, BusinessToolResult } from './tools';

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

function parsePriceFromText(text: string): number | undefined {
  const m = text.match(
    /(?:a|por|precio(?:\s+a)?|en|=)\s*\$?\s*(\d+(?:[.,]\d{1,2})?)/i,
  );
  if (m?.[1]) {
    const n = Number(m[1].replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }
  const bare = text.match(/\b(\d+(?:[.,]\d{1,2})?)\s*(?:usd|\$|dolares|dólares)?\b/i);
  if (!bare?.[1]) return undefined;
  const n = Number(bare[1].replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function extractQuotedOrName(text: string): string {
  const q = text.match(/[“"']([^”"']+)[”"']/);
  if (q?.[1]) return q[1].trim();
  // Prefer "pizza margarita" / "hamburguesa especial" spans.
  const dish = text.match(
    /\b((?:pizza|hamburguesa|arepa|jugo|refresco|empanada|combo)\s+[a-záéíóúñü0-9][\wáéíóúñü0-9 ]{1,40})/i,
  );
  if (dish?.[1]) {
    return dish[1]
      .replace(/\b(a|por|en)\s+\d+(?:[.,]\d{1,2})?.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return text
    .replace(
      /\b(agrega(r|me)?|añade|añadir|crea(r)?|nuevo|nueva|producto|plato|categoria|categoría|llamad[oa]|llamado|llamada|de prueba|prueba|de|una?|un|el|la|los|las|a|por|precio|dolares?|dólares?|usd|\$|\d+(?:[.,]\d{1,2})?)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export async function proposeCreateProduct(
  userId: string,
  shop: BusinessShop,
  userText: string,
): Promise<BusinessToolResult> {
  if (!canManageCatalog(shop)) return { text: denied('crear productos', shop) };
  const sb = getServiceSupabaseClient();
  const precio = parsePriceFromText(userText);
  let nombre = extractQuotedOrName(userText);
  // "pizza margarita" style — keep food words if extract stripped too much
  if (nombre.length < 2) {
    const m = userText.match(
      /\b(?:pizza|hamburguesa|arepa|jugo|refresco|empanada|combo)\s+([a-záéíóúñ0-9 ]{2,40})/i,
    );
    if (m) nombre = `${m[0]}`.replace(/\s+/g, ' ').trim();
  }
  if (nombre.length < 2) {
    return {
      text: `¿Cómo se llama el producto y a cuánto? 🍽️\n\nEj: “Agrégame una pizza margarita a 8”.`,
    };
  }
  if (precio == null) {
    return {
      text: `*${nombre}* — ¿a qué precio lo dejamos? (ej. “a 8”)`,
    };
  }
  const { data: cats } = await sb
    .from('categorias')
    .select('id,nombre')
    .eq('comercio_id', shop.comercioId)
    .order('orden', { ascending: true })
    .limit(20);
  const categoriaId = cats?.[0]?.id ? String(cats[0].id) : null;
  const catName = cats?.[0]?.nombre ? String(cats[0].nombre) : 'sin categoría';
  const proposal = makeProposal(
    userId,
    shop,
    'create_product',
    { nombre, precio, categoriaId },
    `Crear producto ${nombre} a ${precio}${shop.moneda ? ` ${shop.moneda}` : ''}`,
  );
  return {
    text: `¿Creamos este producto? 🍽️\n\n• *${nombre}*\n• Precio: *${precio}*${
      shop.moneda ? ` ${shop.moneda}` : ''
    }\n• Categoría: *${catName}*\n\nConfirma y lo guardo ✅`,
    proposal,
  };
}

export async function proposeDeleteProduct(
  userId: string,
  shop: BusinessShop,
  productHint: string,
): Promise<BusinessToolResult> {
  if (!canManageCatalog(shop)) return { text: denied('eliminar productos', shop) };
  const cfg = getBusinessAssistantRuntimeConfig();
  const sb = getServiceSupabaseClient();
  const { data: products } = await sb
    .from('productos')
    .select('id,nombre,precio,disponible')
    .eq('comercio_id', shop.comercioId)
    .order('nombre')
    .limit(Math.max(cfg.maxProductsSample, 300));
  const match = resolveProductMatch(products || [], productHint);
  if (match.status === 'ambiguous') {
    return {
      text: `Varios productos parecidos 👀\n${match.candidates
        .map((p) => `• ${p.nombre}`)
        .join('\n')}\n\nEscribe el nombre exacto.`,
    };
  }
  if (match.status !== 'exact') {
    return { text: `No encontré ese producto para eliminar 🙈` };
  }
  const p = match.product;
  const proposal = makeProposal(
    userId,
    shop,
    'delete_product',
    { productId: String(p.id), productName: String(p.nombre) },
    `Eliminar ${p.nombre}`,
  );
  return {
    text: `¿Eliminamos *${p.nombre}* del menú? 🗑️\n\nEsto no se puede deshacer desde aquí. Confirma para borrar.`,
    proposal,
  };
}

export async function proposeCreateCategory(
  userId: string,
  shop: BusinessShop,
  userText: string,
): Promise<BusinessToolResult> {
  if (!canManageCatalog(shop)) return { text: denied('crear categorías', shop) };
  const nombre = extractQuotedOrName(userText) || userText.replace(/.*categor[ií]a\s*/i, '').trim();
  if (nombre.length < 2) {
    return { text: `¿Cómo se llama la categoría? (ej. “crea categoría Postres”)` };
  }
  const proposal = makeProposal(
    userId,
    shop,
    'create_category',
    { nombre },
    `Crear categoría ${nombre}`,
  );
  return {
    text: `¿Creamos la categoría *${nombre}*? 📂\n\nConfirma y la agrego.`,
    proposal,
  };
}

export async function proposeDeleteCategory(
  userId: string,
  shop: BusinessShop,
  userText: string,
): Promise<BusinessToolResult> {
  if (!canManageCatalog(shop)) return { text: denied('eliminar categorías', shop) };
  const sb = getServiceSupabaseClient();
  const hint = extractQuotedOrName(userText);
  const { data: cats } = await sb
    .from('categorias')
    .select('id,nombre')
    .eq('comercio_id', shop.comercioId)
    .limit(40);
  const folded = hint.toLowerCase();
  const hit =
    (cats || []).find((c) => String(c.nombre).toLowerCase() === folded) ||
    (cats || []).find((c) => String(c.nombre).toLowerCase().includes(folded));
  if (!hit) return { text: `No encontré esa categoría 📂` };
  const proposal = makeProposal(
    userId,
    shop,
    'delete_category',
    { categoryId: String(hit.id), nombre: String(hit.nombre) },
    `Eliminar categoría ${hit.nombre}`,
  );
  return {
    text: `¿Eliminamos la categoría *${hit.nombre}*? Solo si no tiene productos.`,
    proposal,
  };
}

export async function proposeSetTasa(
  userId: string,
  shop: BusinessShop,
  userText: string,
  hint?: { value?: number | null; currency?: string | null },
): Promise<BusinessToolResult> {
  if (!canManageSettings(shop)) return { text: denied('cambiar la tasa', shop) };
  const fx = await loadShopFx(shop.comercioId);
  if (!fx) return { text: 'No pude leer la configuración de tasas de tu negocio. Intenta de nuevo en un momento 🙏' };

  const value = hint?.value ?? extractFxValue(userText);
  const requested = normalizeCurrency(hint?.currency) || detectFxCurrency(userText, fx.primary);

  if (value == null) {
    const options = rateCurrencies(fx);
    if (!options.length) {
      return {
        text: `Tu menú solo muestra precios en *${fx.primary}*, así que no hay una tasa que cambiar.\n\nSi quieres mostrar también otra moneda (pesos, bolívares…), dime cuál y te explico cómo activarla.`,
      };
    }
    return {
      text: `💱 Estas son tus tasas ahora:\n${describeFx(fx)}\n\nDime el nuevo valor, por ejemplo: “${options[0] === 'COP' ? 'pesos a 4.000' : `${options[0]!.toLowerCase()} a 40`}”.`,
    };
  }

  const target = resolveFxTarget(fx, requested);
  if (target.ok === false) {
    if (target.reason === 'ambiguous') {
      return {
        text: `¿La tasa de cuál moneda cambiamos a *${formatRate(value)}*? Tienes: ${target.options.map(currencyLabel).join(' y ')}.`,
      };
    }
    if (target.reason === 'not_enabled') {
      return {
        text: `Tu menú no cobra en ${requested ? currencyLabel(requested) : 'esa moneda'} todavía, así que primero hay que activarla en *Configuración → Tasas y cobros*. Monedas activas: ${fx.currencies.map(currencyLabel).join(', ')}.`,
      };
    }
    return {
      text: `Tu menú solo muestra precios en *${fx.primary}*, así que no hay una tasa que cambiar. Si quieres mostrar otra moneda, dime cuál.`,
    };
  }

  const currency = target.currency;
  const previous = fx.rates[currency] ?? null;
  if (previous != null && Math.abs(previous - value) < 1e-9) {
    return { text: `La tasa de ${currencyLabel(currency)} ya está en *${rateSentence(fx.primary, currency, value)}* ✅ No hay nada que cambiar.` };
  }
  const ratio = previous != null ? value / previous : 1;
  const warn =
    ratio > 3 || ratio < 1 / 3
      ? `\n\n⚠️ Ojo: es un cambio muy grande (antes *${formatRate(previous!)}*). Confírmalo solo si es correcto.`
      : '';
  const proposal = makeProposal(
    userId,
    shop,
    'set_tasa',
    { value, currency, primary: fx.primary, previous },
    `Tasa ${currency}: ${previous != null ? formatRate(previous) : '—'} → ${formatRate(value)}`,
  );
  return {
    text: `¿Cambiamos la tasa de ${currencyLabel(currency)}?\n\n• Antes: ${previous != null ? `*${rateSentence(fx.primary, currency, previous)}*` : 'sin tasa'}\n• Nueva: *${rateSentence(fx.primary, currency, value)}* (manual)${warn}\n\nConfirma abajo y la aplico en tu menú y checkout 💱`,
    proposal,
  };
}

export async function proposeOrderStatus(
  userId: string,
  shop: BusinessShop,
  userText: string,
): Promise<BusinessToolResult> {
  if (!canManageOrders(shop)) return { text: denied('cambiar pedidos', shop) };
  const next = parseTargetOrderStatus(userText);
  if (!next) {
    return {
      text: `¿A qué estado lo pasamos? 🧾\n\nPuedo: *confirmado*, *en camino/despachado*, *entregado* o *cancelado*.`,
    };
  }
  const sb = getServiceSupabaseClient();
  const codeMatch = userText.match(
    /\b(?:pedido|orden|#)\s*([a-z0-9-]{4,}|[0-9]{1,8})\b/i,
  );
  const hint = codeMatch?.[1] || '';
  let rows: Array<Record<string, unknown>> = [];
  {
    const full = await sb
      .from('pedidos')
      .select('id,estado,codigo_orden,nombre_cliente,cliente_nombre,detalles,created_at,archived_at')
      .eq('comercio_id', shop.comercioId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (full.error) {
      const minimal = await sb
        .from('pedidos')
        .select('id,estado,nombre_cliente,cliente_nombre,detalles,created_at')
        .eq('comercio_id', shop.comercioId)
        .order('created_at', { ascending: false })
        .limit(20);
      rows = (minimal.data || []) as Array<Record<string, unknown>>;
    } else {
      rows = ((full.data || []) as Array<Record<string, unknown>>).filter(
        (r) => r.archived_at == null,
      );
    }
  }
  let order =
    rows.find((r) => {
      if (!hint) return false;
      const h = hint.toLowerCase();
      const detalles =
        r.detalles && typeof r.detalles === 'object'
          ? (r.detalles as Record<string, unknown>)
          : {};
      return (
        String(r.codigo_orden || '')
          .toLowerCase()
          .includes(h) ||
        String(r.id).startsWith(h) ||
        String(r.nombre_cliente || '')
          .toLowerCase()
          .includes(h) ||
        String(r.cliente_nombre || '')
          .toLowerCase()
          .includes(h) ||
        String(detalles.order_id || '')
          .toLowerCase()
          .includes(h)
      );
    }) || null;
  if (!order && rows.length === 1) order = rows[0]!;
  if (!order && next !== 'pendiente') {
    order =
      rows.find((r) => {
        const from = normalizeOrderStatus(String(r.estado || ''));
        return canTransitionOrderStatus(from, next);
      }) || null;
  }
  if (!order) {
    return {
      text: `No identifiqué el pedido 🙈\n\nDime el número/código o mira *pedidos pendientes*.`,
    };
  }
  const from = normalizeOrderStatus(String(order.estado || ''));
  if (!canTransitionOrderStatus(from, next)) {
    return {
      text: `No puedo pasar de *${orderStatusLabel(from)}* a *${orderStatusLabel(
        next,
      )}* — no es una transición válida.`,
    };
  }
  const who = String(
    order.nombre_cliente || order.cliente_nombre || order.codigo_orden || order.id,
  ).slice(0, 40);
  const proposal = makeProposal(
    userId,
    shop,
    'set_order_status',
    { orderId: String(order.id), nextStatus: next, fromStatus: from },
    `Pedido ${who}: ${from} → ${next}`,
  );
  return {
    text: `¿Pasamos el pedido de *${who}* de *${orderStatusLabel(from)}* → *${orderStatusLabel(
      next,
    )}*? 🧾\n\nConfirma y lo actualizo.`,
    proposal,
  };
}

export async function listPaymentMethods(shop: BusinessShop): Promise<BusinessToolResult> {
  const sb = getServiceSupabaseClient();
  const { data, error } = await sb
    .from('metodos_pago')
    .select('id,nombre,tipo,descripcion,detalles')
    .eq('comercio_id', shop.comercioId)
    .order('nombre')
    .limit(30);
  if (error) return { text: `No pude leer los métodos de pago 😅 (${error.message})` };
  if (!data?.length) return { text: `Aún no hay métodos de pago en *${shop.nombre}* 💳` };
  const lines = data.map((m) => {
    // Never dump sensitive-looking tokens; show labels only.
    const det =
      typeof m.detalles === 'string' && m.detalles.length < 120 && !/token|password|secret/i.test(m.detalles)
        ? ` — ${m.detalles.slice(0, 80)}`
        : '';
    return `• *${m.nombre}* (${m.tipo || '—'})${det}`;
  });
  return { text: `Métodos de pago de *${shop.nombre}* 💳\n\n${lines.join('\n')}` };
}

export async function proposeUpsertPayment(
  userId: string,
  shop: BusinessShop,
  userText: string,
): Promise<BusinessToolResult> {
  if (!canManageSettings(shop)) return { text: denied('gestionar pagos', shop) };
  const t = userText.toLowerCase();
  const currency = (shop.moneda || 'USD').toLowerCase();
  const sb = getServiceSupabaseClient();
  const { data: existing } = await sb
    .from('metodos_pago')
    .select('id,tipo,nombre,descripcion,detalles')
    .eq('comercio_id', shop.comercioId)
    .limit(40);

  // Flutter BusinessSetupScreen._syncPaymentMethods tipo encoding.
  let nombre = 'Pago digital';
  let tipo = `transferencia__${currency}__1`;
  let detalles: string | null = null;
  let descripcion: string | null = 'Cuenta de pago digital';

  if (/\bzelle\b/.test(t)) {
    nombre = 'Pago digital: Zelle';
    const email = userText.match(/[\w.+-]+@[\w.-]+\.\w+/);
    detalles = JSON.stringify({
      name: 'Zelle',
      fields: email
        ? [{ type: 'correo', label: 'Correo', value: email[0] }]
        : [{ type: 'nota', label: 'Nota', value: 'Completar datos en panel si falta correo' }],
    });
    const transferCount = (existing || []).filter((m) =>
      String(m.tipo || '')
        .toLowerCase()
        .startsWith(`transferencia__${currency}__`),
    ).length;
    tipo = `transferencia__${currency}__${Math.max(1, transferCount + 1)}`;
  } else if (/\bpago\s*movil|pago\s*móvil|pm\b/.test(t)) {
    nombre = 'Pago digital: Pago móvil';
    detalles = JSON.stringify({
      name: 'Pago móvil',
      fields: [{ type: 'nota', label: 'Nota', value: 'Completar teléfono/banco en panel si falta' }],
    });
    const transferCount = (existing || []).filter((m) =>
      String(m.tipo || '')
        .toLowerCase()
        .startsWith(`transferencia__${currency}__`),
    ).length;
    tipo = `transferencia__${currency}__${Math.max(1, transferCount + 1)}`;
  } else if (/\befectivo\b/.test(t)) {
    nombre = 'Efectivo';
    tipo = `efectivo__${currency}`;
    descripcion = null;
    detalles = null;
  } else {
    const nameGuess = extractQuotedOrName(userText);
    if (nameGuess.length >= 2) nombre = `Pago digital: ${nameGuess}`;
    const transferCount = (existing || []).filter((m) =>
      String(m.tipo || '')
        .toLowerCase()
        .startsWith(`transferencia__${currency}__`),
    ).length;
    tipo = `transferencia__${currency}__${Math.max(1, transferCount + 1)}`;
    detalles = JSON.stringify({ name: nameGuess || 'Pago digital', fields: [] });
  }

  // Sync path: keep existing managed methods + add/replace this one (Flutter rebuild).
  const managedRows: Array<Record<string, unknown>> = (existing || [])
    .filter((m) => {
      const tip = String(m.tipo || '').toLowerCase();
      return tip.startsWith('efectivo__') || tip.startsWith('transferencia__');
    })
    .filter((m) => String(m.tipo || '').toLowerCase() !== tipo.toLowerCase())
    .map((m) => ({
      nombre: m.nombre,
      tipo: m.tipo,
      descripcion: m.descripcion,
      detalles: m.detalles,
    }));
  managedRows.push({ nombre, tipo, descripcion, detalles });

  const proposal = makeProposal(
    userId,
    shop,
    'sync_payment_methods',
    { rows: managedRows },
    `Sincronizar método ${nombre}`,
  );
  return {
    text: `¿Agregamos el método *${nombre}*? 💳\n\nSe sincroniza como en el panel (sin secretos). Confirma para guardar.`,
    proposal,
  };
}

export async function proposeDeletePayment(
  userId: string,
  shop: BusinessShop,
  userText: string,
): Promise<BusinessToolResult> {
  if (!canManageSettings(shop)) return { text: denied('gestionar pagos', shop) };
  const sb = getServiceSupabaseClient();
  const { data } = await sb
    .from('metodos_pago')
    .select('id,nombre,tipo')
    .eq('comercio_id', shop.comercioId)
    .limit(30);
  const hint = extractQuotedOrName(userText).toLowerCase() || userText.toLowerCase();
  const hit = (data || []).find((m) => {
    const n = String(m.nombre).toLowerCase();
    if (hint.includes('zelle') && n.includes('zelle')) return true;
    if (hint.length >= 3 && (n.includes(hint) || hint.includes(n))) return true;
    return false;
  });
  if (!hit) return { text: `No encontré ese método 💳\n\nEscribe *métodos de pago* para ver la lista.` };
  const proposal = makeProposal(
    userId,
    shop,
    'delete_payment_method',
    { methodId: String(hit.id), nombre: String(hit.nombre) },
    `Eliminar método ${hit.nombre}`,
  );
  return {
    text: `¿Quitamos *${hit.nombre}*? 💳\n\nConfirma para eliminarlo.`,
    proposal,
  };
}

export async function readDeliveryConfig(shop: BusinessShop): Promise<BusinessToolResult> {
  const sb = getServiceSupabaseClient();
  const { data } = await sb
    .from('comercios')
    .select('permite_delivery,branding_ia')
    .eq('id', shop.comercioId)
    .maybeSingle();
  const cfg =
    data?.branding_ia &&
    typeof data.branding_ia === 'object' &&
    (data.branding_ia as Record<string, unknown>).config_negocio &&
    typeof (data.branding_ia as Record<string, unknown>).config_negocio === 'object'
      ? (((data.branding_ia as Record<string, unknown>).config_negocio as Record<string, unknown>)
          .delivery_config as Record<string, unknown> | undefined)
      : undefined;
  const enabled = cfg?.enabled === true || data?.permite_delivery === true;
  const price = cfg?.fixed_price;
  const zones = Array.isArray(cfg?.zones) ? cfg!.zones.length : 0;
  const areas = Array.isArray(cfg?.area_zones) ? cfg!.area_zones.length : 0;
  return {
    text: [
      `Delivery en *${shop.nombre}* 🛵`,
      `• Estado: ${enabled ? '🟢 activo' : '🔴 inactivo'}`,
      price != null ? `• Tarifa fija: *${price}*` : null,
      cfg?.pricing_type ? `• Modo: *${cfg.pricing_type}*` : null,
      zones ? `• Intervalos: *${zones}*` : null,
      areas ? `• Polígonos: *${areas}*` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export async function proposeDeliveryToggle(
  userId: string,
  shop: BusinessShop,
  enabled: boolean,
  fixedPrice?: number,
  extra?: {
    pricingType?: string;
    zones?: Array<Record<string, unknown>>;
    areaZones?: Array<Record<string, unknown>>;
  },
): Promise<BusinessToolResult> {
  if (!canManageSettings(shop)) return { text: denied('configurar delivery', shop) };
  const data: Record<string, unknown> = { enabled };
  if (fixedPrice != null) data.fixedPrice = fixedPrice;
  if (extra?.pricingType) data.pricingType = extra.pricingType;
  if (extra?.zones?.length) data.zones = extra.zones;
  if (extra?.areaZones?.length) data.areaZones = extra.areaZones;

  // Sensible defaults when user asks for zones/polygons without JSON coords.
  if (enabled && extra?.pricingType === 'zones' && !extra.zones?.length) {
    const p = fixedPrice != null ? fixedPrice : 2;
    data.zones = [
      { name: 'Cerca', min_distance: 0, max_distance: 3, price: p },
      { name: 'Media', min_distance: 3, max_distance: 6, price: roundish(p * 1.5) },
      { name: 'Lejos', min_distance: 6, max_distance: 12, price: roundish(p * 2) },
    ];
  }
  if (enabled && extra?.pricingType === 'area_zones' && !extra.areaZones?.length) {
    // Tiny non-overlapping demo polygons near 0,0 — merchant should replace via panel map.
    // Validated by DeliveryConfig.validate (polygonsOverlap).
    data.areaZones = [
      {
        id: 'z_centro',
        name: 'Centro',
        price: fixedPrice != null ? fixedPrice : 2,
        polygon: [
          [10.48, -66.9],
          [10.48, -66.88],
          [10.5, -66.88],
          [10.5, -66.9],
        ],
      },
      {
        id: 'z_norte',
        name: 'Norte',
        price: fixedPrice != null ? fixedPrice + 1 : 3,
        polygon: [
          [10.51, -66.9],
          [10.51, -66.88],
          [10.53, -66.88],
          [10.53, -66.9],
        ],
      },
    ];
  }
  if (enabled && extra?.pricingType === 'distance') {
    data.distance = {
      base_price: fixedPrice != null ? fixedPrice : 1,
      included_km: 2,
      extra_price_per_km: 0.5,
    };
  }

  const proposal = makeProposal(
    userId,
    shop,
    'set_delivery_config',
    data,
    enabled ? `Activar delivery` : `Desactivar delivery`,
  );
  const mode = extra?.pricingType || (fixedPrice != null ? 'fixed' : 'toggle');
  return {
    text: enabled
      ? `¿Activamos el delivery (${mode})${
          fixedPrice != null ? ` con base *${fixedPrice}*` : ''
        }? 🛵\n\nSe valida con DeliveryConfig.validate antes de guardar.`
      : `¿Cerramos el delivery por ahora? 🔴`,
    proposal,
  };
}

function roundish(n: number) {
  return Math.round(n * 100) / 100;
}

export async function proposePromo(
  userId: string,
  shop: BusinessShop,
  userText: string,
): Promise<BusinessToolResult> {
  if (!canManageMarketing(shop)) return { text: denied('gestionar promociones', shop) };
  const name =
    extractQuotedOrName(userText) ||
    (/\b2\s*x\s*1|dos\s*por\s*uno\b/i.test(userText) ? '2x1' : 'Promoción');
  const proposal = makeProposal(
    userId,
    shop,
    'upsert_promo_rule',
    {
      name,
      enabled: true,
      triggerType: 'cart',
      surface: 'cart',
      priority: 'normal',
      maxSuggestions: 3,
    },
    `Crear promoción ${name}`,
  );
  return {
    text: `¿Creamos la promoción *${name}*? 🏷️\n\nQueda como regla de venta activa en carrito. Confirma para guardarla.`,
    proposal,
  };
}

async function findPromoRule(shop: BusinessShop, userText: string) {
  const sb = getServiceSupabaseClient();
  const { data } = await sb
    .from('upsell_rules')
    .select('id,name,enabled')
    .eq('comercio_id', shop.comercioId)
    .order('created_at', { ascending: false })
    .limit(30);
  const hint = extractQuotedOrName(userText).toLowerCase() || userText.toLowerCase();
  return (data || []).find((r) => {
    const n = String(r.name || '').toLowerCase();
    return hint.length >= 2 && (n.includes(hint) || hint.includes(n));
  });
}

export async function proposeTogglePromo(
  userId: string,
  shop: BusinessShop,
  userText: string,
  enabled: boolean,
): Promise<BusinessToolResult> {
  if (!canManageMarketing(shop)) return { text: denied('gestionar promociones', shop) };
  const hit = await findPromoRule(shop, userText);
  if (!hit) {
    return { text: `No encontré esa promoción 🏷️. Dime el nombre exacto o créala primero.` };
  }
  const proposal = makeProposal(
    userId,
    shop,
    'toggle_promo_rule',
    { ruleId: String(hit.id), enabled },
    enabled ? `Activar ${hit.name}` : `Pausar ${hit.name}`,
  );
  return {
    text: enabled
      ? `¿Reactivamos *${hit.name}*? 🟢`
      : `¿Pausamos *${hit.name}*? ⏸️`,
    proposal,
  };
}

export async function proposeDeletePromo(
  userId: string,
  shop: BusinessShop,
  userText: string,
): Promise<BusinessToolResult> {
  if (!canManageMarketing(shop)) return { text: denied('gestionar promociones', shop) };
  const hit = await findPromoRule(shop, userText);
  if (!hit) {
    return { text: `No encontré esa promoción para eliminar 🏷️.` };
  }
  const proposal = makeProposal(
    userId,
    shop,
    'delete_promo_rule',
    { ruleId: String(hit.id), name: String(hit.name) },
    `Eliminar ${hit.name}`,
  );
  return {
    text: `¿Eliminamos la promoción *${hit.name}*? 🗑️`,
    proposal,
  };
}

export async function listStaff(shop: BusinessShop): Promise<BusinessToolResult> {
  if (!canManageStaff(shop)) return { text: denied('ver el equipo', shop) };
  const sb = getServiceSupabaseClient();
  const { data, error } = await sb.rpc('list_comercio_team', {
    p_comercio_id: shop.comercioId,
  });
  if (!error && Array.isArray(data) && data.length) {
    const lines = data.slice(0, 20).map((r: Record<string, unknown>) => {
      const email = String(r.email || r.member_email || r.invite_email || '').slice(0, 40);
      const role = String(r.role || r.member_role || '—');
      const status = String(r.status || r.invite_status || 'active');
      return `• ${email || 'miembro'} — *${role}* (${status})`;
    });
    return { text: `Equipo de *${shop.nombre}* 👥\n\n${lines.join('\n')}` };
  }

  // Fallback: members + pending invites (Preview may lack list_comercio_team RPC).
  const [{ data: members }, { data: invites }] = await Promise.all([
    sb
      .from('comercio_members')
      .select('id,role,status,user_id')
      .eq('comercio_id', shop.comercioId)
      .eq('status', 'active')
      .limit(30),
    sb
      .from('comercio_member_invites')
      .select('id,email,role,status')
      .eq('comercio_id', shop.comercioId)
      .eq('status', 'pending')
      .limit(30),
  ]);
  const lines: string[] = [];
  for (const m of members || []) {
    lines.push(`• miembro — *${m.role}* (${String(m.id).slice(0, 8)}…)`);
  }
  for (const i of invites || []) {
    lines.push(`• ${i.email} — *${i.role}* (pending)`);
  }
  if (!lines.length) {
    return { text: `Equipo de *${shop.nombre}*: solo tú como propietario por ahora 👥` };
  }
  return { text: `Equipo de *${shop.nombre}* 👥\n\n${lines.join('\n')}` };
}

export async function proposeInviteStaff(
  userId: string,
  shop: BusinessShop,
  userText: string,
): Promise<BusinessToolResult> {
  if (!canManageStaff(shop)) return { text: denied('invitar trabajadores', shop) };
  const email = userText.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
  if (!email) {
    return {
      text: `¿A qué correo invitamos? 👥\n\nEj: “invita cajero@correo.com como caja”. Nunca comparto contraseñas.`,
    };
  }
  let role = 'caja';
  const t = userText.toLowerCase();
  if (/\bcocin/.test(t)) role = 'cocina';
  else if (/\bmarket/.test(t)) role = 'marketing';
  else if (/\bmesero|waiter/.test(t)) role = 'mesero';
  else if (/\badmin/.test(t)) role = 'administrador';
  else if (/\bcaja|cajer/.test(t)) role = 'caja';
  const proposal = makeProposal(
    userId,
    shop,
    'invite_staff',
    { email: email.toLowerCase(), role },
    `Invitar ${email} como ${role}`,
  );
  return {
    text: `¿Invitamos a *${email}* como *${role}*? 👥\n\nRecibirá acceso propio — no se comparte contraseña.`,
    proposal,
  };
}

export async function proposeRevokeStaff(
  userId: string,
  shop: BusinessShop,
  userText: string,
): Promise<BusinessToolResult> {
  if (!canManageStaff(shop)) return { text: denied('revocar accesos', shop) };
  const sb = getServiceSupabaseClient();
  const email = userText.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0]?.toLowerCase();
  const { data: invites } = await sb
    .from('comercio_member_invites')
    .select('id,email,role,status')
    .eq('comercio_id', shop.comercioId)
    .eq('status', 'pending')
    .limit(30);
  const hit = (invites || []).find((i) => {
    const e = String(i.email || '').toLowerCase();
    if (email && e === email) return true;
    if (email && e.includes(email.split('@')[0])) return true;
    const hint = extractQuotedOrName(userText).toLowerCase();
    return hint.length >= 3 && e.includes(hint);
  });
  if (!hit) {
    return {
      text: `No encontré una invitación pendiente para revocar 👥\n\nEscribe *equipo* para ver miembros e invitaciones.`,
    };
  }
  const proposal = makeProposal(
    userId,
    shop,
    'revoke_staff',
    { inviteId: String(hit.id), email: String(hit.email) },
    `Revocar ${hit.email}`,
  );
  return {
    text: `¿Revocamos el acceso de *${hit.email}* (*${hit.role}*)? 👥`,
    proposal,
  };
}

export async function proposeProductOptions(
  userId: string,
  shop: BusinessShop,
  userText: string,
): Promise<BusinessToolResult> {
  if (!canManageCatalog(shop)) return { text: denied('editar variaciones', shop) };
  const cfg = getBusinessAssistantRuntimeConfig();
  const sb = getServiceSupabaseClient();
  const { data: products } = await sb
    .from('productos')
    .select('id,nombre,precio,disponible,opciones_menu')
    .eq('comercio_id', shop.comercioId)
    .limit(Math.max(cfg.maxProductsSample, 300));
  const match = resolveProductMatch(products || [], userText);
  if (match.status !== 'exact') {
    return {
      text: `¿De qué producto configuramos tamaños/extras? Dime el nombre exacto 🧩`,
    };
  }

  const t = userText.toLowerCase();
  const opcionesMenu: Record<string, unknown> = {};

  // Parse "tamaños: Personal 8, Familiar 15" or quoted sizes.
  const sizeChunk =
    userText.match(/tama[nñ]os?\s*[:=]\s*([^.]+)/i)?.[1] ||
    userText.match(/sizes?\s*[:=]\s*([^.]+)/i)?.[1];
  if (sizeChunk || /\btama[nñ]os?\b/.test(t)) {
    const raw = sizeChunk || 'Personal 0, Familiar 0';
    const parts = raw
      .replace(/\s+en\s+.+$/i, '')
      .split(/[,;|/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const tamanos = parts.map((part, i) => {
      const priceMatch = part.match(/(\d+(?:[.,]\d{1,2})?)\s*$/);
      const precio = priceMatch ? Number(priceMatch[1].replace(',', '.')) : 0;
      const label = (priceMatch ? part.slice(0, priceMatch.index).trim() : part)
        .replace(/^[•\-]\s*/, '')
        .trim() || `Opción ${i + 1}`;
      return { id: `sz_${i + 1}`, label, precio: Number.isFinite(precio) ? precio : 0 };
    });
    if (tamanos.length) opcionesMenu.tamanos = tamanos;
  }

  const extraChunk =
    userText.match(/extras?\s*[:=]\s*([^.]+)/i)?.[1] ||
    userText.match(/complementos?\s*[:=]\s*([^.]+)/i)?.[1];
  if (extraChunk || /\bextras?\b/.test(t) || /\bcomplementos?\b/.test(t)) {
    const raw = extraChunk || 'Extra queso 1';
    const parts = raw.split(/[,;|/]+/).map((s) => s.trim()).filter(Boolean);
    const ajustes = parts.map((part, i) => {
      const priceMatch = part.match(/(\d+(?:[.,]\d{1,2})?)\s*$/);
      const precio = priceMatch ? Number(priceMatch[1].replace(',', '.')) : 0;
      const label = (priceMatch ? part.slice(0, priceMatch.index).trim() : part)
        .replace(/^[•\-]\s*/, '')
        .trim() || `Extra ${i + 1}`;
      return { id: `ex_${i + 1}`, label, precio: Number.isFinite(precio) ? precio : 0, tipo: 'checkbox' };
    });
    if (ajustes.length) opcionesMenu.ajustes = ajustes;
  }

  // Option groups (Flutter activadas + grupos)
  const groupName =
    userText.match(/grupo\s*[:=]\s*["“]?([^"”,.]+)["”]?/i)?.[1]?.trim() ||
    (/\bgrupo\b/.test(t) ? 'Opciones' : null);
  if (groupName) {
    const optsChunk = userText.match(/opciones?\s*[:=]\s*([^.]+)/i)?.[1] || 'Opción A, Opción B';
    const opts = optsChunk.split(/[,;|/]+/).map((s) => s.trim()).filter(Boolean);
    opcionesMenu.activadas = true;
    opcionesMenu.grupos = [
      {
        id: 'g_1',
        nombre: groupName,
        tipo: 'unica',
        obligatorio: true,
        min: 1,
        max: 1,
        opciones: opts.map((nombre, i) => ({
          id: `o_${i + 1}`,
          nombre,
          precio: 0,
        })),
      },
    ];
  }

  if (!Object.keys(opcionesMenu).length) {
    return {
      text: `Para *${match.product.nombre}* dime las opciones así:\n• “tamaños: Personal 8, Familiar 15”\n• “extras: Queso 1, Tocino 2”\n• “grupo: Bebida opciones: Coca, Pepsi”`,
    };
  }

  const proposal = makeProposal(
    userId,
    shop,
    'set_product_options',
    { productId: String(match.product.id), opcionesMenu },
    `Opciones de ${match.product.nombre}`,
  );
  return {
    text: `¿Guardamos estas variaciones en *${match.product.nombre}*? 🧩\n\nSe valida con el mismo parser del menú público.`,
    proposal,
  };
}

export async function proposeUpsellBadge(
  userId: string,
  shop: BusinessShop,
  userText: string,
  clear: boolean,
): Promise<BusinessToolResult> {
  if (!canManageCatalog(shop)) return { text: denied('destacar productos', shop) };
  const cfg = getBusinessAssistantRuntimeConfig();
  const sb = getServiceSupabaseClient();
  const { data: products } = await sb
    .from('productos')
    .select('id,nombre,precio,disponible')
    .eq('comercio_id', shop.comercioId)
    .limit(Math.max(cfg.maxProductsSample, 300));
  const match = resolveProductMatch(products || [], userText);
  if (match.status !== 'exact') {
    return { text: `¿Cuál producto destacamos? Dime el nombre exacto.` };
  }
  let badge: string | null = null;
  if (!clear) {
    const t = userText.toLowerCase();
    badge = /\bmejor\s*valor|ahorra\b/.test(t)
      ? 'mejor_valor'
      : /\bahorra\b/.test(t)
        ? 'ahorra'
        : 'mas_pedido';
  }
  const proposal = makeProposal(
    userId,
    shop,
    'set_upsell_badge',
    { productId: String(match.product.id), badge },
    badge ? `Destacar ${match.product.nombre}` : `Quitar destacado ${match.product.nombre}`,
  );
  return {
    text: badge
      ? `¿Marcamos *${match.product.nombre}* como destacado (*${badge}*)?`
      : `¿Quitamos el destacado de *${match.product.nombre}*?`,
    proposal,
  };
}

export async function proposeProductImage(
  userId: string,
  shop: BusinessShop,
  productHint: string,
  imageUrl: string,
  productId?: string,
): Promise<BusinessToolResult> {
  if (!canManageCatalog(shop)) return { text: denied('cambiar fotos', shop) };
  if (!imageUrl.startsWith('http')) {
    return { text: `Primero elige o toma la foto 🖼️` };
  }
  const cfg = getBusinessAssistantRuntimeConfig();
  const sb = getServiceSupabaseClient();
  const { data: products } = await sb
    .from('productos')
    .select('id,nombre,precio,disponible,imagen_url')
    .eq('comercio_id', shop.comercioId)
    .limit(Math.max(cfg.maxProductsSample, 300));
  const byId = productId ? (products || []).find((p) => String(p.id) === productId) : undefined;
  const match = byId
    ? ({ status: 'exact', product: byId } as const)
    : resolveProductMatch(products || [], productHint);
  const sampleOf = (rows: Array<Record<string, unknown>>) =>
    rows.slice(0, 5).map((p) => ({
      id: String(p.id),
      nombre: String(p.nombre || ''),
      precio: Number(p.precio) || 0,
      disponible: p.disponible !== false,
    }));
  if (match.status === 'ambiguous') {
    return {
      text: `Me llegó la foto 📷 Varios productos podrían ser:\n${match.candidates
        .map((p) => `• ${p.nombre}`)
        .join('\n')}\n\n¿Para cuál es?`,
      productsSample: sampleOf(match.candidates as unknown as Array<Record<string, unknown>>),
      pendingImageUrl: imageUrl,
    };
  }
  if (match.status !== 'exact') {
    return {
      text: `Me llegó la foto 📷 ¿Para qué producto es? Escríbeme el nombre o elige uno.`,
      productsSample: sampleOf((products || []) as unknown as Array<Record<string, unknown>>),
      pendingImageUrl: imageUrl,
    };
  }
  const proposal = makeProposal(
    userId,
    shop,
    'set_product_image',
    {
      productId: String(match.product.id),
      productName: String(match.product.nombre),
      imageUrl,
      previousUrl: match.product.imagen_url ? String(match.product.imagen_url) : null,
    },
    `Cambiar foto de ${match.product.nombre}`,
  );
  return {
    text: `¿Usamos esta foto para *${match.product.nombre}*? 🖼️\n\nConfirma para reemplazarla.`,
    proposal,
  };
}

export async function proposeUpdateProfile(
  userId: string,
  shop: BusinessShop,
  patch: { nombre?: string; descripcionVisual?: string; whatsapp?: string },
): Promise<BusinessToolResult> {
  if (!canManageSettings(shop)) return { text: denied('editar el perfil', shop) };
  if (!patch.nombre && !patch.descripcionVisual && !patch.whatsapp) {
    return { text: `¿Qué cambiamos del perfil? Nombre, descripción o WhatsApp.` };
  }
  const proposal = makeProposal(
    userId,
    shop,
    'update_business_profile',
    patch,
    `Actualizar perfil`,
  );
  const bits = [
    patch.nombre ? `nombre → *${patch.nombre}*` : null,
    patch.descripcionVisual ? `descripción actualizada` : null,
    patch.whatsapp ? `WhatsApp → *${patch.whatsapp}*` : null,
  ].filter(Boolean);
  return {
    text: `¿Guardamos estos cambios en *${shop.nombre}*?\n\n${bits.join('\n')}`,
    proposal,
  };
}

export type { CanonicalOrderStatus };
