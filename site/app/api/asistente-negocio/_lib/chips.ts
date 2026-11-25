import type { BusinessShop } from './auth';
import type { BusinessIntent } from './intents';
import type { BusinessToolResult, ShopHomeMetrics } from './tools';

export type BusinessChip = {
  id: string;
  /** Shown in the bar (may include emoji). */
  label: string;
  /** Exact text sent when tapped. */
  text: string;
  /** When set (multi-shop), client must send this as comercioId. */
  comercioId?: string;
};

export type ChipContext = {
  phase:
    | 'auth'
    | 'boot'
    | 'multi_shop'
    | 'no_shop'
    | 'turn'
    | 'after_apply'
    | 'after_cancel';
  shop?: BusinessShop | null;
  intent?: BusinessIntent;
  result?: BusinessToolResult | null;
  metrics?: ShopHomeMetrics | null;
  shopNames?: string[];
  shops?: Array<{ comercioId: string; nombre: string }>;
  handoffPending?: string | null;
};

/**
 * Full admin catalog — ordered by merchant daily frequency:
 * orient → money → product ops → visibility → schedule → growth.
 */
const CATALOG: BusinessChip[] = [
  { id: 'menu', label: '📋 Ver menú', text: 'ver menú' },
  { id: 'orders', label: '🧾 Pedidos', text: 'pedidos' },
  { id: 'today', label: '📊 Hoy', text: 'resumen de hoy' },
  { id: 'link', label: '🔗 Enlace', text: 'enlace del menú' },
  { id: 'price', label: '💵 Precio', text: 'cambiar precio' },
  { id: 'rate', label: '💱 Tasa', text: 'tasa de cambio' },
  { id: 'plan', label: '💳 Membresía', text: 'mi membresía' },
  { id: 'account', label: '🔐 Cuenta', text: 'mi cuenta' },
  { id: 'photo', label: '🖼️ Foto', text: 'cambiar foto' },
  { id: 'stock_out', label: '⏸️ Agotar', text: 'agotar' },
  { id: 'stock_on', label: '✅ Activar', text: 'activar' },
  { id: 'hide', label: '🙈 Ocultar', text: 'ocultar producto' },
  { id: 'add', label: '➕ Producto', text: 'agregar producto' },
  { id: 'hours', label: '🕒 Horario', text: 'horario' },
  { id: 'open', label: '🟢 Abrir', text: 'abrir' },
  { id: 'close', label: '🔴 Cerrar', text: 'cerrar' },
  { id: 'human', label: '🙋 Hablar con soporte', text: 'hablar con un humano' },
];

const MAX_BAR = 18;

function chip(
  id: string,
  label: string,
  text = label.replace(/^[^\wÁÉÍÓÚÜÑáéíóúüñ0-9]+/u, '').trim(),
): BusinessChip {
  return { id, label, text: text || label };
}

function merge(priority: BusinessChip[], rest: BusinessChip[] = CATALOG, max = MAX_BAR): BusinessChip[] {
  const seen = new Set<string>();
  const out: BusinessChip[] = [];
  for (const c of [...priority, ...rest]) {
    const key = c.text.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Stable catalog with light boosts — never bury "Ver menú".
 * Closed shop → float Abrir after the core money/product cluster.
 * Busy day → float Pedidos right after Ver menú.
 */
function prioritizeCatalog(
  shop?: BusinessShop | null,
  metrics?: ShopHomeMetrics | null,
): BusinessChip[] {
  const boost: BusinessChip[] = [CATALOG[0]!]; // Ver menú always first
  const hasOrders = (metrics?.ordersToday ?? 0) > 0;
  if (hasOrders) {
    boost.push(CATALOG.find((c) => c.id === 'orders')!);
  }
  if (shop?.enLinea === false) {
    // Keep menu + money ops early; open is urgent but after orientation.
    boost.push(
      CATALOG.find((c) => c.id === 'price')!,
      CATALOG.find((c) => c.id === 'rate')!,
      CATALOG.find((c) => c.id === 'open')!,
    );
  }
  return merge(boost.filter(Boolean), CATALOG);
}

function priceSuggestions(current: unknown, moneda: string | null): BusinessChip[] {
  const n = Number(current);
  if (!Number.isFinite(n) || n <= 0) {
    return [
      chip('p8', '💵 a 8', 'a 8'),
      chip('p10', '💵 a 10', 'a 10'),
      chip('p12', '💵 a 12', 'a 12'),
      chip('p15', '💵 a 15', 'a 15'),
    ];
  }
  const unit = moneda ? ` ${moneda}` : '';
  const deltas = [-1, 1, 2, Math.max(1, Math.round(n * 0.1))];
  const values = [
    ...new Set(
      deltas.map((d) => Math.round((n + d) * 100) / 100).filter((v) => v > 0),
    ),
  ];
  return values.slice(0, 4).map((v, i) => chip(`px${i}`, `💵 a ${v}${unit}`, `a ${v}`));
}

function productChips(
  products: NonNullable<BusinessToolResult['productsSample']> | undefined,
  mode: 'price' | 'pick' | 'stock' | 'photo' | 'hide',
): BusinessChip[] {
  if (!products?.length) return [];
  return products.slice(0, 5).map((p, i) => {
    const name = p.nombre.trim();
    if (mode === 'price') {
      return chip(`prod_price_${i}`, `💵 ${name}`, `cambiar precio ${name}`);
    }
    if (mode === 'stock') {
      const agotar = p.disponible !== false;
      return agotar
        ? chip(`prod_out_${i}`, `⏸️ Agotar ${name}`, `agotar ${name}`)
        : chip(`prod_on_${i}`, `✅ Activar ${name}`, `activar ${name}`);
    }
    if (mode === 'photo') {
      return chip(`prod_photo_${i}`, `🖼️ ${name}`, `cambiar foto ${name}`);
    }
    if (mode === 'hide') {
      return chip(`prod_hide_${i}`, `🙈 ${name}`, `ocultar ${name}`);
    }
    return chip(`prod_${i}`, `🍽️ ${name}`, name);
  });
}

function contextualPriority(
  intent: BusinessIntent,
  shop: BusinessShop,
  result: BusinessToolResult | null | undefined,
): BusinessChip[] {
  if (result?.proposal) {
    return [chip('cancel', '❌ Cancelar', 'cancelar')];
  }

  switch (intent.kind) {
    case 'list_menu':
      // Menu UI owns products; chips are manage actions only.
      return [
        chip('price', '💵 Precio', 'cambiar precio'),
        chip('stock_out', '⏸️ Agotar', 'agotar'),
        chip('stock_on', '✅ Activar', 'activar'),
        chip('hide', '🙈 Ocultar', 'ocultar producto'),
        chip('photo', '🖼️ Foto', 'cambiar foto'),
        chip('rate', '💱 Tasa', 'tasa de cambio'),
        chip('add', '➕ Producto', 'agregar producto'),
      ];
    case 'propose_price': {
      const sample = result?.productsSample;
      if (intent.newPrice == null && sample?.length === 1 && !result?.proposal) {
        return priceSuggestions(sample[0].precio, shop.moneda);
      }
      if (intent.newPrice == null && sample && sample.length > 0 && !result?.proposal) {
        return productChips(sample, 'pick');
      }
      return [];
    }
    case 'propose_availability':
      return productChips(result?.productsSample, 'stock');
    case 'change_image':
      return productChips(result?.productsSample, 'photo');
    case 'read_hours':
      return [
        chip('hours_set', '✏️ Cambiar horario', 'cambiar horario Lun-Vie 10:00-22:00'),
      ];
    case 'propose_en_linea':
      if (typeof intent.enLinea !== 'boolean' && !result?.proposal) {
        return [
          chip('open_now', '🟢 Abrir', 'abrir'),
          chip('close_now', '🔴 Cerrar', 'cerrar'),
        ];
      }
      return [chip('cancel', '❌ Cancelar', 'cancelar')];
    case 'add_product':
      return [
        chip('ex1', '🍽️ Arepa 3.5', 'Arepa 3.5'),
        chip('ex2', '🥤 Refresco 1.5', 'Refresco 1.5'),
      ];
    case 'propose_hours':
      return [chip('cancel', '❌ Cancelar', 'cancelar')];
    case 'currency':
      return [
        chip('rate_ask', '💱 Ver tasa', 'tasa de cambio'),
        chip('price', '💵 Precio', 'cambiar precio'),
      ];
    case 'membership':
      return [
        chip('orders', '🧾 Pedidos', 'pedidos'),
        chip('menu', '📋 Ver menú', 'ver menú'),
        chip('plan', '💳 Membresía', 'mi membresía'),
      ];
    case 'recent_orders':
      return [
        chip('pending', '⏳ Pendientes', 'pedidos pendientes'),
        chip('today_o', '🧾 Hoy', 'pedidos de hoy'),
        chip('clients', '👥 Clientes', 'nombres de clientes'),
        chip('today', '📊 Resumen', 'resumen de hoy'),
      ];
    case 'home_metrics':
      return [
        chip('orders', '🧾 Pedidos', 'pedidos de hoy'),
        chip('clients', '👥 Clientes', 'nombres de clientes'),
        chip('sales', '💵 Ventas', 'ventas de hoy'),
        chip('pending', '⏳ Pendientes', 'pedidos pendientes'),
      ];
    case 'customers':
      return [
        chip('orders', '🧾 Pedidos', 'pedidos'),
        chip('today', '📊 Hoy', 'resumen de hoy'),
        chip('pending', '⏳ Pendientes', 'pedidos pendientes'),
      ];
    case 'order_detail':
      return [
        chip('orders', '🧾 Pedidos', 'pedidos'),
        chip('pending', '⏳ Pendientes', 'pedidos pendientes'),
      ];
    case 'share_menu':
      return [
        chip('link', '🔗 Enlace', 'enlace del menú'),
        chip('menu', '📋 Ver menú', 'ver menú'),
        chip('open', '🟢 Abrir', 'abrir'),
      ];
    case 'account':
      return [
        chip('pass', '🔐 Contraseña', 'cambiar contraseña'),
        chip('mail', '✉️ Email', 'cambiar email'),
        chip('plan', '💳 Membresía', 'mi membresía'),
      ];
    case 'register':
      return [
        chip('name', '🏪 Nombre del local', 'Se llama '),
        chip('menu', '📋 Ver menú', 'ver menú'),
      ];
    case 'help':
      return [
        chip('menu', '📋 Ver menú', 'ver menú'),
        chip('plan', '💳 Membresía', 'mi membresía'),
        chip('account', '🔐 Cuenta', 'mi cuenta'),
      ];
    default:
      return [];
  }
}

/** Full catalog in the bar; contextual chips float first when useful. */
export function suggestBusinessChips(ctx: ChipContext): BusinessChip[] {
  if (ctx.phase === 'auth') {
    return [
      chip('login', '🔐 Entrar', 'entrar'),
      chip('register', '✨ Registrarme', 'registrarme'),
    ];
  }
  if (ctx.phase === 'multi_shop') {
    const shops =
      ctx.shops?.length
        ? ctx.shops
        : (ctx.shopNames || []).map((n, i) => ({
            comercioId: `unknown_${i}`,
            nombre: n,
          }));
    return shops.slice(0, 6).map((s) => ({
      id: `shop:${s.comercioId}`,
      label: `🏪 ${s.nombre}`,
      text: `usar negocio ${s.nombre}`,
      comercioId: s.comercioId,
    }));
  }
  if (ctx.phase === 'no_shop') {
    return [
      chip('reg', '🏪 Registrar negocio', 'registrar negocio'),
      chip('help', '❓ ¿Qué puedes hacer?', 'ayuda'),
    ];
  }

  const catalog = prioritizeCatalog(ctx.shop, ctx.metrics);

  if (ctx.phase === 'boot') {
    if (ctx.handoffPending === 'edit_price') {
      return merge(
        [chip('price_go', '💵 Seguir con el precio', 'cambiar precio')],
        catalog,
      );
    }
    return catalog;
  }

  if (ctx.phase === 'after_apply' || ctx.phase === 'after_cancel') {
    return catalog;
  }

  if (ctx.shop && ctx.intent) {
    // After "ver menú", keep the bar focused on menu management — not the whole OS.
    if (ctx.intent.kind === 'list_menu') {
      return merge(contextualPriority(ctx.intent, ctx.shop, ctx.result), [
        chip('orders', '🧾 Pedidos', 'pedidos'),
        chip('hours', '🕒 Horario', 'horario'),
      ]);
    }
    return merge(contextualPriority(ctx.intent, ctx.shop, ctx.result), catalog);
  }

  return catalog;
}

/** Exposed for tests / UI that want the raw catalog size. */
export function adminCatalogChips(): BusinessChip[] {
  return [...CATALOG];
}
