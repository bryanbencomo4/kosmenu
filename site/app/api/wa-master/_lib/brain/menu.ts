/**
 * Menu intelligence for the WhatsApp consumer brain.
 *
 * ONE source of truth: the same public menu that powers /v/{slug}
 * (`loadPublicMenuByIdentifier` → comercio, categorias, productos, checkout exchange).
 * Nothing here invents data: prices are the products' real minimum price, delivery is the
 * restaurant's own tariff, currencies are never mixed without a verifiable rate.
 *
 * Pure functions (+ one lazy DB loader) so every answer is unit-testable.
 */

import {
  convertAmountBetweenCurrencies,
  normalizeCurrencyCode,
  resolveCheckoutCurrencyRate,
} from '../../../../_lib/checkout-exchange-rate';
import {
  getProductDeliveryConfig,
  getProductDeliverySurcharge,
  getProductMaximumPrice,
  getProductMinimumPrice,
  parseProductMenuOptions,
} from '../../../../_lib/menu-product-options';
import { foldSearchText } from '../../../../_lib/search-text';
import { searchCatalog } from '../../../chat/_lib/catalog-search';
import type { LoadedPublicMenu } from '../../../menu/_lib/load-public-menu';
import type { WaMasterMenuView } from '../types';
import {
  formatMoney,
  quoteShopDelivery,
  shopDeliveryFromRow,
  type CurrencyConverter,
  type ShopDeliveryInfo,
  type ShopDeliveryQuote,
} from './delivery';

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export type MenuOptionChoice = { nombre: string; extra: number };
export type MenuOptionInfo = {
  nombre: string;
  required: boolean;
  min: number;
  max: number;
  choices: MenuOptionChoice[];
};

export type MenuProduct = {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  categoriaId: string | null;
  /** Real minimum price (base + cheapest required picks), in the menu currency. */
  price: number;
  maxPrice: number;
  /** True when the final price depends on what the person picks. */
  from: boolean;
  options: MenuOptionInfo[];
  sizes: Array<{ label: string; precio: number }>;
  adjustments: Array<{ label: string; precio: number }>;
  removals: string[];
  perKg: boolean;
  noDelivery: boolean;
  /** Fixed per-unit delivery surcharge (0 = none). */
  deliverySurcharge: number;
  deliverySurchargeLabel: string;
  /** Surcharge that depends on a picked option (amount unknown until they choose). */
  optionSurcharge: boolean;
};

export type MenuCategory = { id: string; nombre: string; count: number };

export type MenuSnapshot = {
  id: string;
  slug: string;
  nombre: string;
  currency: string;
  /** False when the shop is in maintenance / unverified: its public menu is not served. */
  online: boolean;
  products: MenuProduct[];
  categories: MenuCategory[];
  delivery: ShopDeliveryInfo;
  convert: CurrencyConverter;
  /** The raw public menu: kept so the shared catalog search can be reused as-is. */
  raw: LoadedPublicMenu;
};

export type MenuSource = Pick<LoadedPublicMenu, 'comercio' | 'categorias' | 'productos' | 'checkoutExchange'> & {
  marketRates?: unknown;
  isOnline?: boolean;
  comercioRow?: Record<string, unknown>;
};

export type LoadMenu = (slugOrId: string) => Promise<MenuSnapshot | null>;

function asNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function makeConverter(source: MenuSource, base: string): CurrencyConverter {
  const comercio = source.comercio as unknown as Record<string, unknown>;
  const opts = {
    baseCurrency: base,
    checkoutExchange: source.checkoutExchange,
    businessExchangeRate: asNum(comercio.exchange_rate_value) || null,
    businessQuoteCurrency: str(comercio.exchange_rate_quote_currency) || null,
    businessExchangeSource: str(comercio.exchange_rate_source) || 'manual',
    businessExchangeMode: str(comercio.exchange_rate_mode) || 'auto',
    marketRates: source.marketRates as never,
  };
  const accepted = new Set(
    ((source.checkoutExchange as { currencies?: string[] } | null)?.currencies ?? []).map((x) => normalizeCurrencyCode(x)),
  );
  return (amount, from, to) => {
    const f = normalizeCurrencyCode(from);
    const t = normalizeCurrencyCode(to);
    if (f === t) return amount;
    // Only conversions that go through the shop's base currency, and only with a REAL rate:
    // the checkout helper silently returns the amount unchanged when a rate is missing.
    const other = f === base ? t : f;
    if (f !== base && t !== base) return null;
    // Only currencies the shop explicitly accepts: the checkout would otherwise fall back to the
    // shop's generic rate for ANY currency code.
    if (!accepted.has(other)) return null;
    try {
      const rate = resolveCheckoutCurrencyRate(other, opts);
      if (!Number.isFinite(rate) || rate <= 0) return null;
    } catch {
      return null;
    }
    const out = convertAmountBetweenCurrencies(amount, f, t, opts);
    if (!Number.isFinite(out) || out < 0) return null;
    // A misconfigured rate (e.g. "1 USD = 1 COP") would silently produce absurd prices: refuse it.
    if (amount > 0) {
      const ratio = out / amount;
      if (WEAK.has(f) && STRONG.has(t) && ratio > 0.1) return null;
      if (STRONG.has(f) && WEAK.has(t) && ratio < 10) return null;
    }
    return out;
  };
}

const WEAK = new Set(['COP', 'VES']);
const STRONG = new Set(['USD', 'EUR']);

export function buildMenuSnapshot(source: MenuSource): MenuSnapshot {
  const comercio = source.comercio as unknown as Record<string, unknown>;
  const currency = normalizeCurrencyCode(str(comercio.moneda) || 'COP');
  const cats = (source.categorias as Array<Record<string, unknown>>) || [];
  const catName = new Map(cats.map((c) => [str(c.id), str(c.nombre)]));

  const products: MenuProduct[] = ((source.productos as Array<Record<string, unknown>>) || [])
    .filter((p) => p.disponible !== false)
    .map((p) => {
      const like = p as never;
      const opts = parseProductMenuOptions(p.opciones_menu);
      const min = getProductMinimumPrice(like);
      const max = getProductMaximumPrice(like);
      const del = getProductDeliveryConfig(like);
      const catId = str(p.categoria_id) || null;
      return {
        id: str(p.id),
        nombre: str(p.nombre),
        descripcion: str(p.descripcion),
        categoria: (catId && catName.get(catId)) || '',
        categoriaId: catId,
        price: min,
        maxPrice: max,
        from: max > min,
        options: (opts?.grupos ?? []).map((g) => ({
          nombre: g.nombre,
          required: g.obligatorio,
          min: g.min,
          max: g.max,
          choices: g.opciones.map((o) => ({ nombre: o.nombre, extra: o.precio })),
        })),
        sizes: (opts?.tamanos ?? []).map((s) => ({ label: s.label, precio: s.precio })),
        adjustments: (opts?.ajustes ?? []).map((a) => ({ label: a.label, precio: a.precio })),
        removals: opts?.personalizacion?.exclusiones?.ingredientes.map((i) => i.nombre) ?? [],
        perKg: Boolean(opts?.venta_por_peso),
        noDelivery: del?.exclude === true,
        deliverySurcharge: getProductDeliverySurcharge(like, true, null),
        deliverySurchargeLabel: del?.surchargeLabel || '',
        optionSurcharge: Boolean(del?.surchargePorOpcion && Object.keys(del.surchargePorOpcion).length),
      };
    });

  const categories: MenuCategory[] = cats
    .map((c) => ({
      id: str(c.id),
      nombre: str(c.nombre),
      count: products.filter((p) => p.categoriaId === str(c.id)).length,
    }))
    .filter((c) => c.count > 0);

  // The public DTO already carries the delivery tariff (delivery_tarifas) of the same shop.
  const delivery = shopDeliveryFromRow({
    ...(source.comercioRow ?? {}),
    ...comercio,
    moneda: currency,
  });

  return {
    id: str(comercio.id),
    slug: str(comercio.slug),
    nombre: str(comercio.nombre),
    currency,
    online: source.isOnline !== false && comercio.en_linea !== false,
    products,
    categories,
    delivery,
    convert: makeConverter(source, currency),
    raw: {
      comercio: source.comercio,
      categorias: source.categorias,
      productos: (source.productos as unknown[]).filter((p) => (p as { disponible?: boolean }).disponible !== false),
      checkoutExchange: source.checkoutExchange,
      marketRates: source.marketRates ?? null,
    } as unknown as LoadedPublicMenu,
  };
}

/** Default loader: the same public menu loader behind /v/{slug} (cached, circuit-protected). */
export const loadMenuSnapshotFromDb: LoadMenu = async (slugOrId) => {
  const mod = await import('../../../menu/_lib/load-public-menu');
  const menu = await mod.loadPublicMenuByIdentifier(slugOrId);
  if (!menu) return null;
  let online = menu.isOnline;
  if (online && menu.ownerId) {
    try {
      const { getServiceSupabaseClient } = await import('../../../_lib/supabase-server');
      online = await mod.isOwnerEmailVerified(getServiceSupabaseClient(), menu.ownerId);
    } catch {
      // Same policy as the public route: if admin auth is unavailable, keep serving.
    }
  }
  return buildMenuSnapshot({ ...menu, isOnline: online });
};

// ---------------------------------------------------------------------------
// Understanding the question
// ---------------------------------------------------------------------------

const fold = foldSearchText;

const NUM_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, diez: 10,
};

function wordToNumber(w: string): number | null {
  if (/^\d{1,2}$/.test(w)) return Number(w);
  return NUM_WORDS[w] ?? null;
}

export type Budget = { amount: number; currency: string | null };

export type MenuAsk = {
  cheapest: boolean;
  priciest: boolean;
  total: boolean;
  recommend: boolean;
  price: boolean;
  list: boolean;
  availability: boolean;
  /** Mentions delivery cost together with products ("el total con delivery"). */
  withDelivery: boolean;
  budget: Budget | null;
  n: number | null;
  categories: MenuCategory[];
  products: MenuProduct[];
  /** "la primera", "la 2", "esas tres" → indexes into the last shown list. */
  ordinals: number[];
  all: boolean;
  /** Quantities by product id, when stated ("2 de la primera", "dos lomitos"). */
  qty: Record<string, number>;
  optionWords: string[];
};

const RE_CHEAP = /\b(mas (barat|economic|accesible|bajit|chepa)\w*|barat\w+|economic\w+|menor(es)? precio|precio mas bajo|lo mas bajo|menos (caro|costos)\w*|chep\w+|accesible\w*|de menos precio)\b/;
const RE_PRICEY = /\b(mas (car|costos)\w+|precio mas alto|mayor(es)? precio|mas lujos\w+|premium)\b/;
const RE_TOTAL = /\b(total|subtotal|a pagar|en total|cuanto (seria|serian|saldria|saldrian|me sale|me salen|me costaria|me costarian|me cobran|gastaria|gastaria|pagaria|pagar|pago|gasto|gastar|son|es todo|vale todo|cuesta todo|cuestan todos|saldria todo)|suma de|sumame|calcula(me)?|cuenta)\b/;
const RE_RECOMMEND = /\b(recomiend\w*|recomend\w*|aconsej\w*|sugier\w*|sugerenc\w*|cual (me )?(conviene|escoger|pido|elijo|vale la pena|es mejor|esta mejor)|que (me )?(pido|pedir|elijo|conviene)|mejor (opcion|relacion|calidad)|cual es la mejor|que tal esta)\b/;
const RE_PRICE = /\b(cuanto (cuesta|cuestan|vale|valen|sale|salen|es|son|cobran por)|precio|precios|a como|valor|que cuesta|costo de)\b/;
const RE_LIST = /\b(que (tienen|tiene|hay|venden|manejan|ofrecen|trae|traen|opciones)|menu|carta|categorias|opciones|muestrame|enseñame|ensename|lista|dime (las|los)|cuales (son|hay)|que mas)\b/;
const RE_AVAIL = /\b(agotad\w*|disponib\w*|hay |tienen |tiene |viene |vienen |manejan |venden |trae |traen |queda |quedan |se puede|puedo (pedir|poner|quitar|agregar)|sin |con (extra|doble|triple|queso|tocineta)|doble|triple|extra|combo|tamano|sabor\w*|variante\w*|version\w*|opcion de|sustitu\w*|cambiar)\b/;
const RE_DELIVERY_WORD = /\b(delivery|domicilio|envio|despacho|reparto|llevan|traer)\b/;
const RE_ALL = /\b(todas?|todos|esas|esos|las tres|los tres|las dos|los dos|las cuatro|las cinco|ambas|ambos|las anteriores|las de arriba|esas (tres|dos))\b/;

const INTENT_WORDS = new Set([
  'cuales', 'cual', 'cuanto', 'cuesta', 'cuestan', 'vale', 'valen', 'sale', 'salen', 'son', 'es', 'esta', 'estan',
  'mas', 'menos', 'barata', 'baratas', 'barato', 'baratos', 'economica', 'economicas', 'economico', 'economicos',
  'cara', 'caras', 'caro', 'caros', 'precio', 'precios', 'total', 'subtotal', 'delivery', 'domicilio', 'envio',
  'dame', 'dime', 'quiero', 'quisiera', 'necesito', 'me', 'te', 'se', 'lo', 'la', 'las', 'los', 'el', 'un', 'una',
  'unos', 'unas', 'de', 'del', 'al', 'a', 'y', 'o', 'en', 'con', 'sin', 'por', 'para', 'que', 'como', 'si', 'no',
  'tienen', 'tiene', 'hay', 'viene', 'vienen', 'puedo', 'pedir', 'ese', 'esa', 'eso', 'esos', 'esas', 'tres', 'dos',
  'cuatro', 'cinco', 'uno', 'primera', 'segunda', 'tercera', 'primer', 'segundo', 'tercer', 'individual', 'cada',
  'favor', 'porfa', 'porfavor', 'gracias', 'hola', 'buenas', 'ok', 'vale', 'dale', 'entonces', 'tambien', 'ahora',
  'recomiendas', 'recomienda', 'recomendarias', 'recomendar', 'presupuesto', 'tengo', 'puedes', 'podrias', 'podria',
  'agotado', 'agotada', 'disponible', 'disponibles', 'opciones', 'menu', 'carta', 'cuenta', 'suma', 'sumame',
  'mejor', 'conviene', 'pido', 'elijo', 'cuantas', 'cuantos', 'tal', 'estan', 'aqui', 'alli', 'este', 'esta', 'segun',
]);

function stem(w: string): string {
  const x = fold(w);
  if (x.length > 4 && x.endsWith('es')) return x.slice(0, -2);
  if (x.length > 3 && x.endsWith('s')) return x.slice(0, -1);
  return x;
}

function tokens(text: string): string[] {
  return fold(text)
    .replace(/[^a-z0-9ñ\s.]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);
}

const CURRENCY_WORDS: Array<[RegExp, string]> = [
  [/^(cop|pesos?|colombian\w*)$/, 'COP'],
  [/^(usd|dolar(es)?|dolares|\$us|us\$)$/, 'USD'],
  [/^(ves|bs|bs\.|bolivar(es)?|bolivares|bsf|vef)$/, 'VES'],
  [/^(eur|euros?)$/, 'EUR'],
];

/** "20000", "20.000", "20 mil", "20k", "1,5 millones", optionally with a currency word. */
export function parseBudget(text: string): Budget | null {
  const t = fold(text);
  const hint = /\b(presupuesto|tengo|cuento con|dispongo de|hasta|maximo|max|gastar|gastarme|alcanza|con \$?\s*\d|me sobra|llevo)\b/.test(t) || /\bcon\s+\d/.test(t);
  if (!hint) return null;
  const m = /(?:^|[^\d])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(mil|k|millones?|m)?\b\s*(cop|pesos?|usd|dolar(?:es)?|ves|bs\.?|bolivar(?:es)?|eur|euros?|\$)?/.exec(t);
  if (!m) return null;
  let raw = m[1];
  const mult = m[2];
  // "20.000" / "20,000" are thousands; "12,5" / "12.5" are decimals.
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) raw = raw.replace(/[.,]/g, '');
  else raw = raw.replace(',', '.');
  let amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (mult === 'mil' || mult === 'k') amount *= 1000;
  else if (mult && /^m/.test(mult)) amount *= 1_000_000;
  let currency: string | null = null;
  const cw = m[3];
  if (cw) {
    for (const [re, code] of CURRENCY_WORDS) if (re.test(cw)) currency = code;
  }
  if (!currency) {
    const after = t.slice(m.index + m[0].length).trim().split(/\s+/)[0] || '';
    for (const [re, code] of CURRENCY_WORDS) if (re.test(after)) currency = code;
  }
  return { amount, currency };
}

export function matchCategories(snap: MenuSnapshot, t: string): MenuCategory[] {
  const words = tokens(t).map(stem).filter((w) => w.length >= 4 && !INTENT_WORDS.has(w));
  if (!words.length) return [];
  return snap.categories.filter((c) => {
    const ct = tokens(c.nombre).map(stem).filter((w) => w.length >= 4);
    return ct.some((x) => words.includes(x));
  });
}

function ordinalsIn(t: string): number[] {
  const out: number[] = [];
  const add = (n: number) => {
    if (!out.includes(n)) out.push(n);
  };
  for (const m of t.matchAll(/\b(?:la |el |las |los )?(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa])\b/g)) {
    add({ primer: 0, primera: 0, primero: 0, segund: 1, segunda: 1, segundo: 1, tercer: 2, tercera: 2, tercero: 2, cuarta: 3, cuarto: 3, quinta: 4, quinto: 4 }[m[1]] ?? 0);
  }
  for (const m of t.matchAll(/\b(?:la|el|opcion|numero|n|#)\s*([1-9])\b(?!\s+(?!y\b|e\b|o\b|con\b|sin\b|para\b|de\b|cuanto\b|que\b|es\b)[a-zñ]{3,})/g)) add(Number(m[1]) - 1);
  return out;
}

/** Words that describe a product / option the person is asking about (no intent filler). */
function contentWords(t: string, snap: MenuSnapshot): string[] {
  const catStems = new Set(snap.categories.flatMap((c) => tokens(c.nombre).map(stem)));
  const toks = tokens(t);
  return toks.filter((w, i) => {
    if (/^\d{1,2}$/.test(w)) {
      // "2 carnes" names a product; "las 3 más baratas" / "2 de la primera" are counts.
      const next = toks[i + 1];
      return Boolean(next) && !INTENT_WORDS.has(next) && !/^(mil|k|cop|usd|bs|pesos|dolares)$/.test(next);
    }
    if (INTENT_WORDS.has(w) || w.length < 3) return false;
    if (catStems.has(stem(w)) && w.length >= 4) return false;
    return true;
  });
}

export function parseMenuAsk(text: string, snap: MenuSnapshot, view: WaMasterMenuView | null): MenuAsk {
  const t = fold(text);
  const categories = matchCategories(snap, t);
  const cheapest = RE_CHEAP.test(t);
  const priciest = RE_PRICEY.test(t);
  const total = RE_TOTAL.test(t) || /\bcon delivery\b/.test(t) && /\b(cuanto|total|seria|sale)\b/.test(t);
  const recommend = RE_RECOMMEND.test(t);
  const budget = parseBudget(text);
  const price = RE_PRICE.test(t) && !(RE_DELIVERY_WORD.test(t) && !/\b(hamburg|pizza|producto|plato|menu)\b/.test(t) && categories.length === 0 && !view);
  const list = RE_LIST.test(t);

  // "las tres más baratas", "las 5 más caras": a small count, never an amount of money.
  let n: number | null = null;
  if (cheapest || priciest) {
    for (const m of t.matchAll(/\b(\d{1,2}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|diez)\b(?!\s*(?:mil|k|cop|usd|bs|pesos|dolares|km|\.|,\d))/g)) {
      const v = wordToNumber(m[1]);
      if (v && v <= 12) {
        n = v;
        break;
      }
    }
  }

  // Products named in the message (shared catalog search; category words stripped first).
  const cw = contentWords(t, snap);
  let products: MenuProduct[] = [];
  // Only words that really occur somewhere in this menu can name a product ("elegir" cannot).
  const known = cw.filter((w) => snap.products.some((p) => productMentions(p, w)));
  const wantsNamed = (!cheapest && !priciest) || /\b(del?|de la|el|la)\s+\w+/.test(t);
  if (known.length && wantsNamed) {
    const result = searchCatalog(snap.raw, { query: known.join(' '), limit: 5, available_only: true });
    const top = result.hits[0]?.score ?? 0;
    const hits = result.hits.filter((h) => h.score >= Math.max(40, top * 0.7));
    products = hits
      .map((h) => snap.products.find((p) => p.id === h.product.id))
      .filter((p): p is MenuProduct => Boolean(p));
    // Products that contain every word the person said beat partial matches ("2 carnes").
    const exact = products.filter((p) => known.every((w) => productMentions(p, w)));
    if (exact.length) products = exact;
    // Weak fuzzy matches on loose words are noise, not a product reference.
    if (products.length > 3) products = [];
  }

  const ordinals = view ? ordinalsIn(t) : [];
  const all = RE_ALL.test(t);
  const availability = RE_AVAIL.test(t);

  // Quantities: "2 de la primera", "dos lomito".
  const qty: Record<string, number> = {};
  if (view) {
    for (const m of t.matchAll(/\b(\d{1,2}|un|una|dos|tres|cuatro|cinco|seis)\s+(?:de\s+)?(?:la |el |las |los )?(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa])\b/g)) {
      const q = wordToNumber(m[1]);
      const idx = ordinalsIn(m[2])[0];
      const id = idx != null ? view.productIds[idx] : undefined;
      if (q && id) qty[id] = q;
    }
  }
  for (const p of products) {
    // "dos margarita" for PIZZA MARGARITA: the quantity may sit before any distinctive word of the name.
    const words = tokens(p.nombre).map(stem).filter((w) => w.length >= 3);
    if (!words.length) continue;
    let m: RegExpExecArray | null = null;
    for (const w of words) {
      m = new RegExp(`\\b(\\d{1,2}|un|una|dos|tres|cuatro|cinco|seis)\\s+(?:de\\s+)?(?:la |el |las |los )?(?:\\w+\\s+)?${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).exec(t);
      if (m) break;
    }
    // "2 carnes" is the product's own name, not "two of the carnes".
    const ownNumber = m && tokens(p.nombre)[0] === m[1];
    const q = m && !ownNumber ? wordToNumber(m[1]) : null;
    if (q) qty[p.id] = q;
  }

  // "¿Y cuánto pagaría por dos?": a bare quantity applies to the single product on the table.
  if (view && view.productIds.length === 1 && !products.length) {
    const m =
      /\b(?:por|x|para|pedir|llevar|llevo|quiero|quiera|serian|seria)\s+(\d{1,2}|un|una|dos|tres|cuatro|cinco|seis)\b(?!\s*(?:mil|k|cop|usd|bs|pesos|dolares))/.exec(t) ||
      /\b(\d{1,2}|dos|tres|cuatro|cinco|seis)\s+(?:de (?:esas?|esos?|estas?|estos?|ellas?)|unidades|piezas)\b/.exec(t);
    const q = m ? wordToNumber(m[1]) : null;
    if (q && q <= 20) qty[view.productIds[0]] = q;
  }

  return {
    cheapest,
    priciest,
    total,
    recommend,
    price,
    list,
    availability,
    withDelivery: RE_DELIVERY_WORD.test(t),
    budget,
    n,
    categories,
    products,
    ordinals,
    all,
    qty,
    optionWords: cw,
  };
}

/** Is this message really about the products / prices of the restaurant (not just delivery)? */
export function isMenuAsk(ask: MenuAsk, hasView: boolean): boolean {
  if (ask.cheapest || ask.priciest || ask.recommend || ask.budget) return true;
  if (ask.products.length && (ask.price || ask.availability || ask.total || ask.list || ask.qty[ask.products[0].id])) return true;
  if (ask.categories.length && (ask.list || ask.price || ask.availability || ask.total)) return true;
  if (hasView && (ask.total || ask.ordinals.length > 0 || (ask.price && !ask.withDelivery))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Selecting products
// ---------------------------------------------------------------------------

export type Line = { product: MenuProduct; qty: number };

export type Selection = {
  lines: Line[];
  source: 'cheapest' | 'priciest' | 'named' | 'view' | 'category' | 'none';
  /** Other products priced exactly like the last one listed (so a tie is not hidden). */
  ties: MenuProduct[];
  category: MenuCategory | null;
  pool: MenuProduct[];
};

function byPriceAsc(a: MenuProduct, b: MenuProduct) {
  return a.price - b.price || a.nombre.localeCompare(b.nombre, 'es');
}

/** The same dish listed twice (same name and price) must not take two slots in a ranking. */
export function dedupeProducts(list: MenuProduct[]): MenuProduct[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    const key = `${fold(p.nombre)}|${p.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function poolFor(snap: MenuSnapshot, ask: MenuAsk, view: WaMasterMenuView | null): { pool: MenuProduct[]; category: MenuCategory | null } {
  const priced = dedupeProducts(snap.products.filter((p) => p.price > 0));
  if (ask.categories.length) {
    const ids = new Set(ask.categories.map((c) => c.id));
    return { pool: priced.filter((p) => p.categoriaId && ids.has(p.categoriaId)), category: ask.categories.length === 1 ? ask.categories[0] : null };
  }
  if (view?.category) {
    const cat = snap.categories.find((c) => fold(c.nombre) === fold(view.category!));
    if (cat) return { pool: priced.filter((p) => p.categoriaId === cat.id), category: cat };
  }
  return { pool: priced, category: null };
}

export function selectProducts(snap: MenuSnapshot, ask: MenuAsk, view: WaMasterMenuView | null): Selection {
  const { pool, category } = poolFor(snap, ask, view);
  const mkLines = (ps: MenuProduct[]): Line[] => ps.map((p) => ({ product: p, qty: ask.qty[p.id] ?? 1 }));
  const tiesOf = (picked: MenuProduct[], from: MenuProduct[]) => {
    const last = picked[picked.length - 1];
    if (!last) return [];
    return from.filter((p) => p.price === last.price && !picked.some((x) => x.id === p.id));
  };

  const fromView = (): MenuProduct[] => {
    if (!view) return [];
    const ids = ask.ordinals.length && !ask.all ? ask.ordinals.map((i) => view.productIds[i]).filter(Boolean) : view.productIds;
    return ids.map((id) => snap.products.find((p) => p.id === id)).filter((p): p is MenuProduct => Boolean(p));
  };

  if (ask.cheapest || ask.priciest) {
    const sorted = [...pool].sort(byPriceAsc);
    if (ask.priciest) sorted.reverse();
    const n = Math.max(1, Math.min(ask.n ?? 3, 8));
    const picked = sorted.slice(0, n);
    return { lines: mkLines(picked), source: ask.cheapest ? 'cheapest' : 'priciest', ties: tiesOf(picked, sorted), category, pool };
  }
  if (ask.products.length) {
    return { lines: mkLines(ask.products.slice(0, 5)), source: 'named', ties: [], category, pool };
  }
  const v = fromView();
  if (v.length && (ask.total || ask.ordinals.length || ask.all || ask.price || ask.recommend)) {
    const lines = v.map((p) => ({ product: p, qty: ask.qty[p.id] ?? view?.qty?.[p.id] ?? 1 }));
    return { lines, source: 'view', ties: [], category, pool };
  }
  if (ask.categories.length) {
    const sorted = [...pool].sort(byPriceAsc).slice(0, 8);
    return { lines: mkLines(sorted), source: 'category', ties: [], category, pool };
  }
  return { lines: [], source: 'none', ties: [], category, pool };
}

// ---------------------------------------------------------------------------
// Formatting + totals
// ---------------------------------------------------------------------------

export function money(snap: MenuSnapshot, amount: number): string {
  return formatMoney(amount, snap.currency);
}

export function productLine(snap: MenuSnapshot, p: MenuProduct, qty = 1): string {
  const price = money(snap, p.price);
  const label = p.from ? `desde ${price}` : price;
  return `• ${qty > 1 ? `${qty} × ` : ''}${p.nombre} — ${label}`;
}

export type OrderTotals = {
  lines: Array<{ product: MenuProduct; qty: number; lineTotal: number }>;
  subtotal: number;
  surcharges: number;
  hasFrom: boolean;
  blockedProducts: MenuProduct[];
  optionSurchargeProducts: MenuProduct[];
};

export function computeTotals(lines: Line[]): OrderTotals {
  const rows = lines.map((l) => ({ product: l.product, qty: l.qty, lineTotal: round2(l.product.price * l.qty) }));
  const subtotal = round2(rows.reduce((s, r) => s + r.lineTotal, 0));
  return {
    lines: rows,
    subtotal,
    surcharges: round2(rows.reduce((s, r) => s + r.product.deliverySurcharge * r.qty, 0)),
    hasFrom: rows.some((r) => r.product.from),
    blockedProducts: rows.filter((r) => r.product.noDelivery).map((r) => r.product),
    optionSurchargeProducts: rows.filter((r) => r.product.optionSurcharge).map((r) => r.product),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The text that follows the subtotal: delivery, charges and the final estimate. */
export function describeTotal(
  snap: MenuSnapshot,
  totals: OrderTotals,
  quote: ShopDeliveryQuote | null,
  place: string | null,
): { lines: string[]; needsLocation: boolean; total: number | null } {
  const out: string[] = [];
  const cur = snap.currency;
  out.push(`Subtotal: ${money(snap, totals.subtotal)}`);
  if (totals.hasFrom) {
    out.push('(los productos marcados «desde» pueden subir según lo que elijas dentro de cada uno)');
  }
  if (totals.blockedProducts.length) {
    out.push(
      `⚠️ ${totals.blockedProducts.map((p) => p.nombre).join(', ')} no se despacha${totals.blockedProducts.length > 1 ? 'n' : ''} por delivery; solo para retirar o comer en el local.`,
    );
  }
  if (!quote) return { lines: out, needsLocation: false, total: null };

  const where = place ? `hasta ${place}` : 'hasta tu ubicación';
  switch (quote.kind) {
    case 'fee': {
      const sur = totals.surcharges;
      if (quote.minOrder > 0 && totals.subtotal < quote.minOrder) {
        out.push(
          `⚠️ El delivery exige un pedido mínimo de ${money(snap, quote.minOrder)}; con ${money(snap, totals.subtotal)} todavía no aplica. No te sumo un delivery que no podrías pedir.`,
        );
        return { lines: out, needsLocation: false, total: null };
      }
      out.push(
        quote.free
          ? `Delivery ${where}: gratis${quote.distanceKm != null ? ` (a ${kmLabel(quote.distanceKm)})` : ''}`
          : `Delivery ${where}: ${money(snap, quote.fee)}${quote.distanceKm != null ? ` (a ${kmLabel(quote.distanceKm)})` : ''}`,
      );
      if (sur > 0) out.push(`Recargo de empaque/delivery de productos: ${money(snap, sur)}`);
      if (totals.optionSurchargeProducts.length) {
        out.push(
          `(${totals.optionSurchargeProducts.map((p) => p.nombre).join(', ')} puede sumar un recargo de delivery según la opción que elijas)`,
        );
      }
      const total = round2(totals.subtotal + (quote.free ? 0 : quote.fee) + sur);
      out.push(`*Total estimado: ${money(snap, total)}*`);
      return { lines: out, needsLocation: false, total };
    }
    case 'needs_location':
      return { lines: out, needsLocation: true, total: null };
    case 'blocked':
      out.push(`Delivery ${where}: no disponible — ${quote.reason}.`);
      out.push('Así que el total con delivery no aplica; sí podrías pedir para retirar en el local.');
      return { lines: out, needsLocation: false, total: totals.subtotal };
    case 'agreed':
      out.push(`Delivery ${where}: queda fuera de sus zonas con tarifa; el costo se acuerda directamente con el negocio, por eso no lo sumo.`);
      return { lines: out, needsLocation: false, total: null };
    case 'none':
      out.push(`${snap.nombre} no tiene delivery activo, solo retiro o consumo en el local. Total estimado sin delivery: ${money(snap, totals.subtotal)}`);
      return { lines: out, needsLocation: false, total: totals.subtotal };
    case 'no_tariff':
      out.push('Hace delivery, pero no tiene una tarifa automática publicada, así que no te voy a inventar el costo; lo ves al elegir delivery en su menú.');
      return { lines: out, needsLocation: false, total: null };
    case 'no_origin':
      out.push('No tengo el punto exacto de su local en el mapa, así que no puedo calcular el delivery desde aquí.');
      return { lines: out, needsLocation: false, total: null };
    case 'currency_mismatch':
      out.push(
        `⚠️ Configuración inconsistente: el menú está en ${cur} pero su tarifa de delivery está en ${quote.tariffCurrency} y no hay una tasa verificable para convertir. Por eso no te muestro un total mezclado; el local debe corregirlo.`,
      );
      return { lines: out, needsLocation: false, total: null };
  }
}

function kmLabel(km: number): string {
  return `${String(Math.round(km * 10) / 10).replace('.', ',')} km`;
}

// ---------------------------------------------------------------------------
// Budget recommendation
// ---------------------------------------------------------------------------

export type BudgetPlan =
  | { ok: false; reason: 'currency'; budget: Budget }
  | { ok: false; reason: 'too_low'; needed: number; cheapest: MenuProduct; available: number }
  | {
      ok: true;
      available: number;
      main: MenuProduct;
      side: MenuProduct | null;
      alternatives: MenuProduct[];
      leftover: number;
    };

export function planBudget(
  snap: MenuSnapshot,
  budget: Budget,
  pool: MenuProduct[],
  deliveryFee: number,
  opts: { withSide?: boolean } = {},
): BudgetPlan {
  let amount = budget.amount;
  if (budget.currency && budget.currency !== snap.currency) {
    const converted = snap.convert(amount, budget.currency, snap.currency);
    if (converted == null) return { ok: false, reason: 'currency', budget };
    amount = round2(converted);
  }
  const available = round2(amount - deliveryFee);
  const priced = pool.filter((p) => p.price > 0);
  const sorted = [...priced].sort(byPriceAsc);
  const cheapest = sorted[0];
  if (!cheapest) return { ok: false, reason: 'too_low', needed: 0, cheapest: undefined as never, available };
  const drinks = snap.products.filter((p) => /bebida|refresco|jugo|agua|malta/.test(fold(p.categoria)) && p.price > 0).sort(byPriceAsc);
  const isDrinkPool = priced.every((p) => /bebida|refresco|jugo|agua|malta/.test(fold(p.categoria)));
  // A drink is only suggested when the person asked for one (nobody asking for burgers wants a juice pushed).
  const side = !isDrinkPool && opts.withSide ? drinks[0] ?? null : null;
  const sideCost = side?.price ?? 0;
  if (available < cheapest.price) {
    return { ok: false, reason: 'too_low', needed: round2(cheapest.price + deliveryFee), cheapest, available };
  }
  const withSide = sorted.filter((p) => p.price + sideCost <= available);
  const main = (withSide.length ? withSide : sorted.filter((p) => p.price <= available)).slice(-1)[0] ?? cheapest;
  const usesSide = Boolean(side) && withSide.length > 0;
  const affordable = sorted.filter((p) => p.price <= available && p.id !== main.id);
  const alternatives = [affordable[0], affordable[Math.floor(affordable.length / 2)]]
    .filter((p): p is MenuProduct => Boolean(p))
    .filter((p, i, arr) => arr.findIndex((q) => q.id === p.id) === i)
    .slice(0, 2);
  return {
    ok: true,
    available,
    main,
    side: usesSide ? side : null,
    alternatives,
    leftover: round2(available - main.price - (usesSide ? sideCost : 0)),
  };
}

// ---------------------------------------------------------------------------
// Variants / options
// ---------------------------------------------------------------------------

export function describeProductOptions(snap: MenuSnapshot, p: MenuProduct): string[] {
  const out: string[] = [];
  for (const g of p.options) {
    const names = g.choices.slice(0, 10).map((c) => (c.extra > 0 ? `${c.nombre} (+${money(snap, c.extra)})` : c.nombre));
    const how = g.required ? (g.max > 1 ? `elige ${g.min === g.max ? g.max : `${g.min}–${g.max}`}` : 'elige 1') : 'opcional';
    out.push(`${g.nombre} (${how}): ${names.join(', ')}${g.choices.length > 10 ? '…' : ''}`);
  }
  if (p.sizes.length) out.push(`Tamaños: ${p.sizes.map((s) => `${s.label} ${money(snap, s.precio)}`).join(' · ')}`);
  const extras = p.adjustments.filter((a) => a.label);
  if (extras.length) out.push(`Extras: ${extras.map((a) => (a.precio ? `${a.label} (+${money(snap, a.precio)})` : a.label)).join(', ')}`);
  if (p.removals.length) out.push(`Puedes quitar: ${p.removals.join(', ')}`);
  if (p.perKg) out.push('Se vende por peso (el precio es por kg).');
  return out;
}

/** Does the product (name, description or options) mention this word? */
export function productMentions(p: MenuProduct, word: string): boolean {
  const w = stem(word);
  if (w.length < 3 && !/^\d{1,2}$/.test(w)) return false;
  const hay = fold(
    [p.nombre, p.descripcion, ...p.options.flatMap((g) => [g.nombre, ...g.choices.map((c) => c.nombre)]), ...p.sizes.map((s) => s.label), ...p.adjustments.map((a) => a.label), ...p.removals].join(' '),
  );
  return hay.split(/[^a-z0-9ñ]+/).map(stem).includes(w);
}

export { quoteShopDelivery };
