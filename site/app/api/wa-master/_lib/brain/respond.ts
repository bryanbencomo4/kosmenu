/**
 * Central brain — resolves one WhatsApp turn in natural prose.
 *
 * Principles (from the support guide):
 *  - Resolve with the real directory / DB tools first; hand off only when needed.
 *  - Never present numbered "1/2" choices; links live inside the sentence.
 *  - Never claim an action is done; never ask for passwords/tokens.
 *  - Phone alone is a hint, not ownership (merchant actions need a verified session).
 *  - If we can't verify something, say so and offer the next step.
 */

import type { WaMasterConfig } from '../config';
import type {
  WaMasterDiscoveryCard,
  WaMasterDiscoveryCtx,
  WaMasterDiscoveryExecute,
} from '../discovery-bridge';
import { issueMasterHandoff } from '../handoff';
import { buildHandoffContextFromMemory } from '../knowledge/handoff-context';
import {
  PLATFORM_WHAT_IS,
  formatPublishedPricing,
} from '../knowledge/platform';
import { buildPublicMenuLinks } from '../menu-links';
import type { WaHandoffStore } from '../../../_lib/wa-handoff';
import type {
  WaMasterBrainPending,
  WaMasterComercioRef,
  WaMasterIdentity,
  WaMasterIntent,
  WaMasterMemory,
  WaMasterRestaurantRef,
  WaMasterSpecialist,
  WaMasterSummary,
  WaMasterTask,
} from '../types';
import { ADVISOR_OFFER, matchFeature, pricingNote } from './kb';
import {
  MAX_SANE_DELIVERY_KM,
  describeDelivery,
  loadShopDeliveryFromDb,
  quoteShopDelivery,
  type LoadShopDelivery,
  type ShopDeliveryQuote,
} from './delivery';
import {
  computeTotals,
  dedupeProducts,
  describeProductOptions,
  describeTotal,
  isMenuAsk,
  loadMenuSnapshotFromDb,
  matchCategories,
  money,
  parseMenuAsk,
  planBudget,
  productLine,
  productMentions,
  selectProducts,
  type LoadMenu,
  type MenuProduct,
  type MenuSnapshot,
} from './menu';
import { extractPlaceText, isBareCity } from './place';
import {
  TASK_TTL_MS,
  crossAsk,
  detectExclusion,
  detectReset,
  type Exclusion,
  freshTask,
  isExcluded,
  isRestaurantListAsk,
  mentionsRestaurant,
  parseCount,
  sameSearch,
  wantsCheap,
  wantsDeliveryFilter,
  wantsOthers,
} from './task';
import { haversineKm } from '../../../../_lib/delivery-config';
import { describeImageTurn, parseImageTurn, type ImageTurn } from '../image-turn';
import { extractCoords, geocodeAddress, looksLikeAddress } from '../../../_lib/geocode';
import {
  CONSUMER_FLAVOURED,
  detectMerchantVoice,
  inferMerchantDomain,
  isBareOwnerStatement,
} from './stance';
import {
  classifyCentralTopic,
  extractCities,
  extractRestaurantName,
  fold,
  type CentralTopic,
  type MerchantDomain,
  type TopicResult,
} from './topics';

export const BRAIN_PENDING_TTL_MS = 30 * 60 * 1000;

export type BrainResult = {
  replies: string[];
  toolsUsed: string[];
  memoryPatch: Partial<WaMasterSummary>;
  specialist: WaMasterSpecialist;
  intent: WaMasterIntent;
  topic: CentralTopic;
  delegate?: { specialist: WaMasterSpecialist; intent: WaMasterIntent };
  escalateHuman?: boolean;
  /**
   * Figures (prices, delivery, totals) were computed from the real menu/tariff: the natural-voice
   * composer must not reword them (it could drop a line or blur a coverage verdict).
   */
  skipCompose?: boolean;
};

export type BrainParams = {
  text: string;
  identity: WaMasterIdentity;
  memory: WaMasterMemory;
  config: WaMasterConfig;
  nowMs: number;
  fromDigits: string;
  handoffStore?: WaHandoffStore;
  discoveryCtx: WaMasterDiscoveryCtx;
  executeDiscovery: WaMasterDiscoveryExecute;
  /** Delivery facts of one restaurant (real tariff config). Injectable for tests. */
  loadShopDelivery?: LoadShopDelivery;
  /** The restaurant's public menu (same source as /v/{slug}). Injectable for tests. */
  loadPublicMenu?: LoadMenu;
};

type Ctx = BrainParams & {
  tr: TopicResult;
  t: string;
  shops: WaMasterComercioRef[];
  tools: string[];
};

const BRAND = 'ElMenúXFA';

function P(...parts: Array<string | null | undefined | false>): string {
  return parts.filter((p): p is string => Boolean(p)).join('\n\n');
}

function absMenu(card: { slug: string; menuUrl?: string }, config: WaMasterConfig): string {
  if (card.menuUrl && /^https?:\/\//.test(card.menuUrl)) return card.menuUrl;
  const base = (config.publicSiteUrl || 'https://elmenuxfa.com').replace(/\/$/, '');
  return `${base}/v/${encodeURIComponent(card.slug)}`;
}

function openWord(card: WaMasterDiscoveryCard): string {
  if (card.isOpen === true) return 'abierto ahora';
  if (card.isOpen === false) return 'cerrado en este momento';
  return 'horario no confirmado';
}

function toRefs(cards: WaMasterDiscoveryCard[], config: WaMasterConfig): WaMasterRestaurantRef[] {
  return cards.slice(0, 5).map((r) => ({
    id: r.id,
    slug: r.slug,
    nombre: r.nombre,
    menuUrl: absMenu(r, config),
    chatUrl: r.chatUrl ?? null,
  }));
}

function bulletList(cards: WaMasterDiscoveryCard[], config: WaMasterConfig): string {
  return cards
    .slice(0, 5)
    .map(
      (c) =>
        `• *${c.nombre}* (${openWord(c)}${
          typeof c.distanceKm === 'number' ? ` · a ${c.distanceKm.toFixed(1).replace('.', ',')} km` : ''
        })${c.matchedDish ? `\n  🍽 ${c.matchedDish}` : ''}\n  ${absMenu(c, config)}`,
    )
    .join('\n');
}

/** Singular-ish stem so "tequeños"/"tequeno" and "empanadas"/"empanada" compare equal. */
function stem(word: string): string {
  const w = fold(word);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

const DISH_TOKEN_STOP = new Set(['de', 'del', 'con', 'sin', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'al', 'en', 'para']);

/** The menu item of this restaurant that actually matches the dish asked for (or null). */
export function dishEvidence(card: WaMasterDiscoveryCard, query: string): string | null {
  const qTokens = fold(query)
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !DISH_TOKEN_STOP.has(w))
    .map(stem);
  if (!qTokens.length) return null;
  const hasToken = (hay: string[], q: string) =>
    hay.some(
      (h) =>
        h === q ||
        (q.length >= 4 && h.startsWith(q)) ||
        (h.length >= 4 && q.startsWith(h)) ||
        (q.length >= 5 && editDistanceAtMost1(h, q)),
    );
  const names = [card.matchedDish, ...(card.productNames || [])].filter((n): n is string => Boolean(n));
  for (const name of names) {
    const hay = fold(name).split(/\s+/).map(stem);
    if (qTokens.every((q) => hasToken(hay, q))) return name;
  }
  // A restaurant literally named after the dish ("Tequeñería Don Pepe").
  const nameHay = fold(card.nombre).split(/\s+/).map(stem);
  if (qTokens.every((q) => hasToken(nameHay, q))) return card.nombre;
  return null;
}

async function dirSearch(
  c: Ctx,
  tool: 'search_restaurants' | 'filter_restaurants',
  args: Record<string, unknown>,
): Promise<{ ok: boolean; cards: WaMasterDiscoveryCard[] }> {
  try {
    const out = await c.executeDiscovery(tool, { limit: 5, offset: 0, ...args }, c.discoveryCtx);
    c.tools.push(tool);
    return { ok: Boolean(out.ok), cards: out.restaurants ?? [] };
  } catch {
    return { ok: false, cards: [] };
  }
}

function matchCard(cards: WaMasterDiscoveryCard[], name: string): WaMasterDiscoveryCard | null {
  const n = fold(name);
  if (!n) return null;
  const exact = cards.find((r) => fold(r.nombre) === n);
  if (exact) return exact;
  const incl = cards.filter((r) => fold(r.nombre).includes(n) || n.includes(fold(r.nombre)));
  if (incl.length === 1) return incl[0];
  const tokens = n.split(' ').filter((w) => w.length > 2);
  const scored = cards
    .map((r) => ({ r, s: tokens.filter((w) => fold(r.nombre).includes(w)).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  if (scored.length && (scored.length === 1 || scored[0].s > scored[1].s)) return scored[0].r;
  return null;
}

function cleanName(text: string): string {
  return text
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\b(el|la|los|las|restaurante|negocio|local|se llama|es|del|de|quiero|el menu de|menu de)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickShop(c: Ctx): WaMasterComercioRef | null {
  if (!c.shops.length) return null;
  const mentioned = c.shops.find((s) => c.t.includes(fold(s.publicName)));
  if (mentioned) return mentioned;
  const selected = c.memory.summary.selectedComercioId;
  const hit = selected ? c.shops.find((s) => s.comercioId === selected) : null;
  return hit || c.shops[0];
}

const AFFIRM = /^(si|sí|dale|ok|okey|listo|va|vale|claro|perfecto|de una|mandalo|envialo|pasame(lo)?|pásame(lo)?|1|ese|el asistente|asistente|por el asistente|quiero el asistente)\b/i;
const PANEL = /^(2|panel|yo lo hago|lo hago yo|por el panel|prefiero el panel)\b/i;

type DomainCopy = { need: string; panel: string; pendingOp: string; intent: WaMasterIntent };

const DOMAIN_COPY: Record<MerchantDomain, DomainCopy> = {
  fx: {
    need: 'cambiar la tasa',
    panel: 'entra a app.elmenuxfa.com, ve a Configuración → Tasas y cobros y ahí la actualizas',
    pendingOp: 'set_fx',
    intent: 'admin.fx',
  },
  price: {
    need: 'cambiar un precio',
    panel: 'entra a app.elmenuxfa.com, abre el producto en tu menú y edita el precio',
    pendingOp: 'edit_price',
    intent: 'admin.edit_price',
  },
  product: {
    need: 'agregar o editar productos',
    panel: 'entra a app.elmenuxfa.com y ve a los productos de tu menú',
    pendingOp: 'edit_products',
    intent: 'admin.edit_product',
  },
  availability: {
    need: 'cambiar la disponibilidad de un producto',
    panel: 'entra a app.elmenuxfa.com y marca el producto como disponible o agotado desde tu menú',
    pendingOp: 'set_availability',
    intent: 'admin.availability',
  },
  delivery: {
    need: 'configurar el delivery',
    panel: 'entra a app.elmenuxfa.com y ve a la configuración de delivery (zonas y tarifas)',
    pendingOp: 'set_delivery',
    intent: 'admin.delivery',
  },
  links: {
    need: 'obtener tus enlaces',
    panel: 'entra a app.elmenuxfa.com y copia el enlace o el QR de tu menú',
    pendingOp: 'menu_links',
    intent: 'admin.menu_links',
  },
  hours: {
    need: 'ajustar el horario o cerrar temporalmente',
    panel: 'entra a app.elmenuxfa.com y ve a Configuración → horarios',
    pendingOp: 'set_hours',
    intent: 'admin.hours',
  },
  payments: {
    need: 'configurar tus métodos de pago',
    panel: 'entra a app.elmenuxfa.com y ve a Configuración → Tasas y cobros',
    pendingOp: 'admin_settings',
    intent: 'admin.settings',
  },
  photo: {
    need: 'cambiar la foto de un producto',
    panel: 'entra a app.elmenuxfa.com, abre el producto en tu menú y toca su foto para cambiarla',
    pendingOp: 'change_product_image',
    intent: 'admin.edit_product',
  },
  logo: {
    need: 'cambiar imagen o descripción del negocio',
    panel: 'entra a app.elmenuxfa.com y ve a la configuración del perfil de tu negocio',
    pendingOp: 'admin_settings',
    intent: 'admin.settings',
  },
  promo: {
    need: 'crear una promoción',
    panel: 'entra a app.elmenuxfa.com y edita los productos que quieras poner en oferta',
    pendingOp: 'admin_settings',
    intent: 'admin.settings',
  },
  category: {
    need: 'crear una categoría',
    panel: 'entra a app.elmenuxfa.com y ve a las categorías de tu menú',
    pendingOp: 'edit_products',
    intent: 'admin.edit_product',
  },
  order_status: {
    need: 'cambiar el estado de un pedido',
    panel: 'entra a app.elmenuxfa.com y abre la sección de pedidos',
    pendingOp: 'admin_settings',
    intent: 'admin.settings',
  },
  staff: {
    need: 'agregar a una persona de tu equipo',
    panel: 'entra a app.elmenuxfa.com y ve a Usuarios; ahí eliges el rol (administrador, cocina, marketing o mesero)',
    pendingOp: 'admin_settings',
    intent: 'admin.settings',
  },
  settings: {
    need: 'revisar la configuración de tu negocio',
    panel: 'entra a app.elmenuxfa.com y abre la configuración de tu negocio',
    pendingOp: 'admin_settings',
    intent: 'admin.settings',
  },
};

async function businessHandoff(
  c: Ctx,
  opts: { intent: WaMasterIntent; pendingOp: string; shop: WaMasterComercioRef | null },
): Promise<string | null> {
  const issued = await issueMasterHandoff({
    store: c.handoffStore,
    config: c.config,
    destination: 'business_assistant',
    fromDigits: c.fromDigits,
    nowMs: c.nowMs,
    payload: buildHandoffContextFromMemory({
      memory: c.memory,
      identity: c.identity,
      text: c.text,
      intent: opts.intent,
      pendingOperation: opts.pendingOp,
      comercioId: opts.shop?.comercioId ?? null,
      slug: opts.shop?.slug ?? null,
      profile: 'business',
      extra: {
        conversationHint: c.text.trim().slice(0, 160),
        summary: `${opts.pendingOp}${opts.shop ? ` · ${opts.shop.publicName}` : ''}`.slice(0, 200),
      },
    }),
  });
  if (issued?.url) c.tools.push('handoff_business');
  return issued?.url ?? null;
}

function reply(
  c: Ctx,
  topic: CentralTopic,
  replies: string[],
  extra: Partial<BrainResult> = {},
): BrainResult {
  const specialistByTopic: Partial<Record<CentralTopic, WaMasterSpecialist>> = {
    search_food: 'consumer',
    browse_directory: 'consumer',
    menu_of: 'consumer',
    contact_of: 'consumer',
    hours_of: 'consumer',
    open_now: 'consumer',
    delivery_find: 'consumer',
    payments: 'consumer',
    consumer_howto: 'consumer',
    order_howto: 'consumer',
    restaurant_assistant: 'consumer',
    example_menu: 'commercial',
    pricing: 'commercial',
    register: 'commercial',
    feature: 'commercial',
    assistant_info: 'commercial',
    merchant_ops: 'admin',
    merchant_report: 'admin',
    merchant_diag: 'admin',
    merchant_access: 'admin',
    merchant_account: 'admin',
    order_issue: 'support',
    link_broken: 'support',
    support_info: 'support',
    sensitive: 'support',
  };
  const intentByTopic: Partial<Record<CentralTopic, WaMasterIntent>> = {
    search_food: 'consumer.search',
    browse_directory: 'consumer.search',
    menu_of: 'consumer.search',
    contact_of: 'consumer.search',
    hours_of: 'consumer.hours',
    open_now: 'consumer.hours',
    delivery_find: 'consumer.delivery',
    payments: 'consumer.search',
    consumer_howto: 'consumer.order_help',
    order_howto: 'consumer.order_help',
    order_issue: 'consumer.order_help',
    restaurant_assistant: 'consumer.search',
    pricing: 'commercial.pricing',
    register: 'commercial.register',
    feature: 'commercial.info',
    assistant_info: 'commercial.info',
    example_menu: 'commercial.info',
    merchant_ops: 'admin.settings',
    merchant_report: 'admin.view_menu',
    merchant_diag: 'admin.view_menu',
    merchant_access: 'admin.settings',
    merchant_account: 'admin.settings',
    support_info: 'support.question',
    sensitive: 'support.question',
    link_broken: 'support.issue',
    greeting: 'greeting',
  };
  return {
    replies,
    toolsUsed: [...new Set(['brain', ...c.tools])],
    memoryPatch: { menuId: null, menuProfile: null, ...extra.memoryPatch },
    specialist: specialistByTopic[topic] ?? 'orchestrator',
    intent: intentByTopic[topic] ?? 'unknown',
    topic,
    ...extra,
  };
}

function askName(c: Ctx, topic: CentralTopic, prompt: string): BrainResult {
  return reply(c, topic, [prompt], {
    memoryPatch: {
      brainPending: { kind: 'name', topic, atMs: c.nowMs },
    },
  });
}

function askZone(c: Ctx, topic: CentralTopic, prompt: string, extra: Partial<WaMasterBrainPending> = {}): BrainResult {
  return reply(c, topic, [prompt], {
    memoryPatch: {
      brainPending: { kind: 'zone', topic, atMs: c.nowMs, ...extra },
    },
  });
}

/** Restaurant by name through the real directory. */
async function findByName(
  c: Ctx,
  name: string,
): Promise<{ card: WaMasterDiscoveryCard | null; options: WaMasterDiscoveryCard[]; ok: boolean }> {
  const { ok, cards } = await dirSearch(c, 'search_restaurants', { query: name, limit: 8 });
  return { card: matchCard(cards, name), options: cards, ok };
}

async function restaurantFlow(c: Ctx, topic: CentralTopic, name: string | null): Promise<BrainResult> {
  const prompts: Partial<Record<CentralTopic, string>> = {
    menu_of: '¡Claro! Dime el nombre del restaurante (y la ciudad si la sabes) y te paso el enlace correcto de su menú.',
    contact_of:
      'Te lo consigo. Dime el nombre exacto del negocio (y la ciudad) para estar seguro de que es el correcto, y te paso lo que tenga publicado.',
    hours_of: 'Claro, reviso el horario que el restaurante tenga registrado. ¿Cuál local es y en qué ciudad está?',
    payments: 'Reviso los métodos de pago que tenga publicados. ¿De qué restaurante hablamos?',
    restaurant_assistant: '¡Claro! ¿Con cuál restaurante quieres hablar? Dime el nombre y te conecto con su asistente si lo tiene activo.',
  };
  if (!name) {
    const last = c.memory.summary.lastRestaurants || [];
    if (last.length === 1) {
      name = last[0].nombre;
    } else {
      return askName(c, topic, prompts[topic] || prompts.menu_of!);
    }
  }
  const found = await findByName(c, name);
  if (!found.ok) {
    return reply(c, topic, [
      'Ahora mismo no logro consultar el directorio. Intenta de nuevo en un momento, o si prefieres escribe *asesor* y te ayuda una persona.',
    ]);
  }
  if (!found.card) {
    if (found.options.length > 1) {
      return reply(
        c,
        topic,
        [
          P(
            `Encontré varios parecidos a *${name}*:`,
            bulletList(found.options, c.config),
            '¿Cuál es? Dime el nombre y te lo paso.',
          ),
        ],
        { memoryPatch: { lastRestaurants: toRefs(found.options, c.config) } },
      );
    }
    return reply(
      c,
      topic,
      [
        P(
          `No encuentro *${name}* en el directorio de ${BRAND}. Puede que no esté registrado, o que lo tengas con otro nombre.`,
          '¿Me confirmas el nombre exacto o la ciudad? También puedo mostrarte qué restaurantes sí tenemos.',
        ),
      ],
      { memoryPatch: { brainPending: { kind: 'name', topic, atMs: c.nowMs } } },
    );
  }
  const card = found.card;
  const url = absMenu(card, c.config);
  const refs = toRefs([card], c.config);
  const patch = { lastRestaurants: refs, brainPending: null, activeRestaurant: refs[0] };

  if (topic === 'hours_of') {
    return reply(c, topic, [P(`*${card.nombre}*: ${openWord(card)}${card.openLabel ? ` (${card.openLabel})` : ''}.`, `Menú y datos publicados: ${url}`)], {
      memoryPatch: patch,
    });
  }
  if (topic === 'payments') {
    const channels = card.paymentChannels?.length ? card.paymentChannels.join(', ') : null;
    const cur = card.currencies?.length ? card.currencies.join(' / ') : null;
    return reply(
      c,
      topic,
      [
        channels || cur
          ? P(
              `*${card.nombre}* tiene publicado${channels ? `: ${channels}` : ''}${cur ? `. Monedas: ${cur}${card.acceptsVesBcv ? ' (bolívares a tasa BCV)' : ''}` : ''}.`,
              `Lo ves completo en su menú: ${url}`,
            )
          : P(`*${card.nombre}* no tiene métodos de pago publicados en el directorio.`, `Revisa su menú o pregúntale directo: ${url}`),
      ],
      { memoryPatch: patch },
    );
  }
  if (topic === 'restaurant_assistant') {
    const issued = await issueMasterHandoff({
      store: c.handoffStore,
      config: c.config,
      destination: 'commerce_chatbot',
      fromDigits: c.fromDigits,
      nowMs: c.nowMs,
      payload: buildHandoffContextFromMemory({
        memory: c.memory,
        identity: c.identity,
        text: c.text,
        intent: 'consumer.search',
        slug: card.slug,
        comercioId: card.id,
        profile: 'commerce',
        extra: { conversationHint: `Cliente desde WhatsApp central: ${c.text.trim().slice(0, 140)}` },
      }),
    });
    const chat = issued?.url || card.chatUrl || null;
    if (issued?.url) c.tools.push('handoff_commerce_chatbot');
    return reply(
      c,
      topic,
      [
        chat
          ? P(
              `Dale, con *${card.nombre}* sí puedes hablar con su asistente virtual; responde con la información real de su menú.`,
              chat,
              `Si prefieres ver el menú directo: ${url}`,
            )
          : P(
              `*${card.nombre}* no tiene el asistente virtual activo por ahora.`,
              `Aquí está su menú, donde también ves el contacto que publicaron: ${url}`,
            ),
      ],
      { memoryPatch: patch },
    );
  }
  if (topic === 'contact_of') {
    return reply(
      c,
      topic,
      [
        P(
          `Aquí tienes *${card.nombre}*: ${url}`,
          `En su menú ves la ubicación y el contacto que el negocio publicó.${card.chatUrl ? ` Y si prefieres preguntarle algo sobre sus platos, su asistente está aquí: ${card.chatUrl}` : ''}`,
          'No comparto números que el negocio no haya hecho públicos.',
        ),
      ],
      { memoryPatch: patch },
    );
  }
  // menu_of: resolve first (what it sells, whether it reaches the person), the link after.
  return selectRestaurant(c, refs[0]);
}

async function foodFlow(c: Ctx, topic: 'search_food' | 'browse_directory' | 'open_now' | 'delivery_find', opts: {
  zone: string | null;
  category?: string | null;
  query?: string | null;
  label?: string | null;
  openOnly?: boolean;
  /** Where the person is (shared location or geocoded address): sort by distance. */
  geo?: { lat: number; lng: number; label?: string | null } | null;
}): Promise<BrainResult> {
  const { zone } = opts;
  // The place they described ("Los Palos Grandes, Caracas") is remembered to check coverage later,
  // and (when it is more than a bare city) used to sort by real distance.
  const cityList = c.tr.cities.length ? c.tr.cities : zone ? [zone] : [];
  const place = zone && !opts.geo ? extractPlaceText(c.text, cityList) : null;
  let geo = opts.geo ?? null;
  let placeGeo: Dest | null = null;
  if (!geo && place && !isBareCity(place, cityList)) {
    const p = await geocodeAddress(place);
    if (p) {
      geo = { lat: p.lat, lng: p.lng, label: place };
      placeGeo = { lat: p.lat, lng: p.lng, label: place, approx: 'place' };
    }
  }
  const args: Record<string, unknown> = { limit: 5 };
  if (zone) args.region = zone;
  if (geo) {
    args.lat = geo.lat;
    args.lng = geo.lng;
  }
  if (opts.category) args.category = opts.category;
  if (opts.query) args.query = opts.query;
  // A dish search must be backed by the menu: fetch more candidates + their product names,
  // then keep only restaurants that really list that dish (the directory ranks fuzzily).
  const dishQuery = !opts.category && opts.query ? opts.query : null;
  if (dishQuery) {
    args.limit = 15;
    args.includeDishes = true;
  }
  const verify = (list: WaMasterDiscoveryCard[]) =>
    dishQuery
      ? list
          .map((card) => ({ ...card, matchedDish: dishEvidence(card, dishQuery) }))
          .filter((card) => card.matchedDish)
          .slice(0, 5)
      : list;
  const tool = opts.openOnly ? 'filter_restaurants' : 'search_restaurants';
  if (opts.openOnly) args.openOnly = true;
  const first = await dirSearch(c, tool, args);
  const { ok } = first;
  let cards = verify(first.cards);
  let zoneMiss = false;
  if (!ok) {
    return reply(c, topic, [
      'Ahora mismo no logro consultar el directorio. Intenta de nuevo en un momento, o escribe *asesor* y te ayuda una persona.',
    ]);
  }
  // Zone data is sparse: when the zone filter finds nothing, retry without it and be honest.
  if (!cards.length && zone && !opts.openOnly) {
    const { region: _drop, ...rest } = args;
    void _drop;
    const wide = await dirSearch(c, tool, rest);
    const verified = verify(wide.cards);
    if (wide.ok && verified.length) {
      cards = verified;
      zoneMiss = true;
    }
  }
  const what = opts.label ? `*${opts.label}*` : 'lo que buscas';
  const where = zone ? ` en *${zone}*` : geo ? ' cerca de ti' : '';
  const orderNote = /\b(pedir|pido|pedido|ordenar)\b/.test(c.t)
    ? 'Los pedidos se hacen desde el menú de cada restaurante: ahí eliges y confirmas (delivery o retiro). Yo por aquí no tomo pedidos.'
    : null;
  const promoNote = /\bpromoci/.test(c.t)
    ? 'Las promociones las publica cada restaurante en su propio menú.'
    : null;
  const deliveryNote =
    topic === 'delivery_find'
      ? 'En el menú de cada uno ves si tiene delivery para tu zona y cuánto cuesta.'
      : null;

  if (!cards.length) {
    if (opts.openOnly) {
      return reply(c, topic, [
        P(
          `Ahora mismo no veo restaurantes abiertos${where} con horario confirmado. Algunos locales no tienen horario configurado.`,
          'Si quieres, dime qué se te antoja y busco igual.',
        ),
      ]);
    }
    const explore = (c.config.consumerAssistantUrl || 'https://elmenuxfa.com/asistente').trim();
    if (dishQuery) {
      return reply(
        c,
        topic,
        [
          P(
            `Busqué ${what}${where} en los menús publicados en ${BRAND} y no veo a ningún restaurante que lo tenga cargado ahora mismo 😕`,
            'Puede que alguno lo prepare y aún no lo haya subido. ¿Quieres que lo busque en otra ciudad o te sugiero algo parecido?',
          ),
        ],
        { memoryPatch: { zone, lastRestaurants: [] } },
      );
    }
    return reply(
      c,
      topic,
      [
        P(
          `No encontré ${what}${where} en el directorio de ${BRAND} por ahora.`,
          zone
            ? 'Puedo buscar en otra zona o con otro tipo de comida, ¿cuál probamos?'
            : 'Dime en qué ciudad estás o prueba con otro tipo de comida, y lo busco de nuevo.',
          `También puedes explorar con el asistente de descubrimiento: ${explore}`,
        ),
      ],
      { memoryPatch: { zone, lastRestaurants: [] } },
    );
  }

  const refs = toRefs(cards, c.config);
  const nearestKm = cards
    .map((r) => r.distanceKm)
    .filter((d): d is number => typeof d === 'number')
    .sort((a, b) => a - b)[0];
  const farAway = zoneMiss && nearestKm != null && nearestKm > MAX_SANE_DELIVERY_KM;
  const intro = farAway
    ? `No tengo ${what} confirmado en *${place || zone}*. Lo más cercano que veo en el directorio de ${BRAND} queda a unos ${Math.round(nearestKm!)} km, así que lo más probable es que no te llegue; te lo dejo por si te sirve:`
    : zoneMiss
    ? `No tengo confirmado ${what} específicamente en *${zone}*, pero esto es lo que hay en el directorio de ${BRAND} (revisa en cada menú si llegan a tu zona):`
    : opts.openOnly
    ? `Estos son los que veo abiertos${where}:`
    : opts.label
      ? `Encontré estas opciones de ${what}${where}:`
      : `Estos son algunos restaurantes${where}:`;
  const followZone = !zone && !geo && cards.length >= 5;
  const follow = geo
    ? 'Dime cuál te interesa y te paso el menú, o dime qué se te antoja y lo afino.'
    : followZone
    ? '¿En qué ciudad o zona estás? Así te filtro los más cercanos.'
    : opts.label || opts.openOnly
      ? 'Dime cuál te interesa y te paso más detalle, o dime otra comida y lo afino.'
      : 'Dime qué se te antoja (pizza, hamburguesas, arepas…) y lo afino.';
  return reply(
    c,
    topic,
    [P(intro, bulletList(cards, c.config), orderNote, promoNote, deliveryNote, follow)],
    {
      memoryPatch: {
        zone,
        lastRestaurants: refs,
        // A new list is a new context: the previous restaurant / product list no longer applies.
        activeRestaurant: refs.length === 1 ? refs[0] : null,
        lastMenuView: null,
        foodHint: opts.category ?? opts.query ?? null,
        task: {
          food: opts.category || opts.query || opts.label ? { category: opts.category ?? null, query: opts.query ?? null, label: opts.label ?? null } : null,
          zone,
          cheap: wantsCheap(c.t),
          delivery: wantsDeliveryFilter(c.t),
          excluded: [],
          atMs: c.nowMs,
        },
        // A bare city never replaces the more precise place they already gave in that same city.
        ...(zone && (place || !(c.memory.summary.placeText && fold(c.memory.summary.placeText).includes(fold(zone))))
          ? { placeText: place ?? zone }
          : {}),
        ...(geo
          ? { geo: { lat: geo.lat, lng: geo.lng, label: geo.label ?? null, atMs: c.nowMs, ...(placeGeo ? { approx: 'place' as const } : {}) } }
          : {}),
        brainPending: followZone
          ? {
              kind: 'zone',
              topic,
              category: opts.category ?? null,
              query: opts.query ?? null,
              openOnly: Boolean(opts.openOnly),
              atMs: c.nowMs,
            }
          : null,
      },
    },
  );
}

/** True when an earlier reply in this conversation already said "veo que X está registrado". */
function alreadyGreetedShop(c: Ctx): boolean {
  return (c.memory.turns || []).some((t) => t.role === 'assistant' && /est[aá] registrado con nosotros/i.test(t.text));
}

/** Deterministic rotation so repeated turns never read identical (the LLM composer varies further). */
function pickVariant(c: Ctx, options: string[]): string {
  const n = (c.memory.turns || []).length;
  return options[n % options.length];
}

async function merchantFlow(c: Ctx, domain: MerchantDomain, kind: 'ops' | 'report' | 'account' | 'diag'): Promise<BrainResult> {
  const copy = DOMAIN_COPY[domain] || DOMAIN_COPY.settings;
  const shop = pickShop(c);
  const topic: CentralTopic =
    kind === 'ops' ? 'merchant_ops' : kind === 'report' ? 'merchant_report' : kind === 'account' ? 'merchant_account' : 'merchant_diag';

  // Real DB answer: public links are public data, safe to give for the linked shop.
  if (domain === 'links' && shop?.slug) {
    const links = buildPublicMenuLinks({ slug: shop.slug, siteBase: c.config.publicSiteUrl });
    c.tools.push('menu_links');
    return reply(
      c,
      topic,
      [
        P(
          `Vale, veo que *${shop.publicName}* está registrado con nosotros. Estos son tus enlaces:`,
          `• Menú público (compártelo por WhatsApp o Instagram): ${links.menuUrl}\n• Para tu código QR: ${links.qrUrl}\n• Para recibir pedidos: ${links.ordersUrl}`,
          'El QR y el enlace de pedidos llevan al mismo menú; el del QR solo marca que la visita vino del código.',
        ),
      ],
      { memoryPatch: { selectedComercioId: shop.comercioId } },
    );
  }

  const url = await businessHandoff(c, { intent: copy.intent, pendingOp: copy.pendingOp, shop });
  const memPatch: Partial<WaMasterSummary> = {
    ...(shop ? { selectedComercioId: shop.comercioId } : {}),
    activeService: 'admin',
    lastHandoffUrl: url ?? c.memory.summary.lastHandoffUrl ?? null,
    lastHandoffAtMs: url ? c.nowMs : c.memory.summary.lastHandoffAtMs,
    brainPending: url
      ? { kind: 'offer', topic, url, panelHint: copy.panel, atMs: c.nowMs }
      : null,
  };

  const intro = shop
    ? c.shops.length > 1
      ? `Vale, veo ${c.shops.length} negocios ligados a este número; sigo con *${shop.publicName}* (si es otro, dímelo).`
      : alreadyGreetedShop(c)
        ? pickVariant(c, [
            `Claro, seguimos con *${shop.publicName}*.`,
            `Listo, con *${shop.publicName}*.`,
            `Perfecto, vamos con eso para *${shop.publicName}*.`,
          ])
        : `Vale, veo que *${shop.publicName}* está registrado con nosotros.`
    : 'Por este número no veo un negocio registrado, así que por seguridad no puedo tocar nada sin verificarte.';

  if (kind === 'report') {
    return reply(
      c,
      topic,
      [
        P(
          intro,
          'Los pedidos y las ventas de tu negocio los consulto con tu sesión verificada: con solo el número de teléfono no puedo mostrarte cifras privadas.',
          url
            ? `Entra aquí con tu cuenta y pídelo directamente al asistente del negocio, que ya tiene tu solicitud: ${url}`
            : 'Entra a app.elmenuxfa.com y míralo en la sección de pedidos.',
        ),
      ],
      { memoryPatch: memPatch },
    );
  }

  if (kind === 'account') {
    const multi = /\b(otro local|dos|segundo|administrar|cambiar)\b/.test(c.t);
    const sub = /\b(vence|suscripcion|plan|membresia)\b/.test(c.t);
    const mail = /\bcorreo\b/.test(c.t);
    const names = c.shops.map((s) => `• ${s.publicName}`).join('\n');
    return reply(
      c,
      topic,
      [
        P(
          shop && multi && c.shops.length > 1
            ? `Vale, en este número veo estos negocios:\n${names}\n\nPuedo trabajar con cualquiera: dime cuál.`
            : intro,
          sub
            ? 'Tu plan y la fecha de vencimiento los muestro con tu sesión verificada, no solo con el teléfono.'
            : mail
              ? 'El correo de la cuenta lo cambias estando dentro de tu sesión; por seguridad no lo modifico por WhatsApp.'
              : multi
                ? 'Para vincular otro local a tu cuenta necesito que el sistema verifique que eres el dueño, así que se hace con tu sesión.'
                : 'Para revisar tu cuenta necesito que entres con tu sesión; por WhatsApp no pido ni recibo claves.',
          url
            ? `Continúa aquí con el contexto ya cargado: ${url}`
            : 'Entra a app.elmenuxfa.com.',
          'Si no logras resolverlo, escribe *asesor* y registro tu caso para que te contacte una persona.',
        ),
      ],
      { memoryPatch: memPatch },
    );
  }

  if (kind === 'diag') {
    let checkLine: string | null = null;
    if (shop?.slug && /\b(funcionando|visible|aparecen|pendiente|revisar)\b/.test(c.t)) {
      const { ok, cards } = await dirSearch(c, 'search_restaurants', { query: shop.slug, limit: 8 });
      const hit = cards.find((r) => r.slug === shop.slug) || null;
      if (ok && hit) {
        checkLine = `Revisé y *${hit.nombre}* aparece en el directorio público (${openWord(hit)}). Tu menú: ${absMenu(hit, c.config)}`;
      } else if (ok) {
        checkLine =
          'No te veo en el directorio público ahora mismo. Eso puede ser porque lo tienes oculto o aún sin publicar; el enlace directo de tu menú sí puede funcionar.';
      }
    }
    return reply(
      c,
      topic,
      [
        P(
          intro,
          checkLine,
          url
            ? `Para revisar productos, pendientes y configuración con tu cuenta, el asistente del negocio ya tiene tu caso: ${url}`
            : 'Para revisar el detalle de tu cuenta entra a app.elmenuxfa.com.',
          'Si algo sigue fallando, dime qué ves y lo escalo con una persona.',
        ),
      ],
      { memoryPatch: memPatch },
    );
  }

  // ops
  const withShop = url
    ? P(
        intro,
        `Para *${copy.need}* lo más fácil es hacerlo juntos en el asistente del negocio: ya tiene tu solicitud, inicia sesión aquí y lo resolvemos paso a paso:\n${url}`,
        `Si prefieres hacerlo tú, ${copy.panel}.`,
        shop ? null : 'Si aún no tienes negocio registrado, dime y te ayudo a empezar.',
      )
    : P(
        intro,
        `Para *${copy.need}*, ${copy.panel}.`,
        shop ? null : 'Si aún no tienes negocio registrado, dime y te ayudo a empezar.',
      );
  return reply(c, topic, [withShop], { memoryPatch: memPatch });
}

const GENERIC_PROSPECT_PROMPT =
  '¡Claro! Cuéntame qué tipo de negocio tienes y cómo recibes los pedidos hoy, así te explico qué herramientas de ElMenúXFA te sirven.';

async function featureFlow(c: Ctx, topic: CentralTopic): Promise<BrainResult> {
  const kb = matchFeature(c.text);
  if (kb) {
    return reply(c, topic, [
      P(kb.answer, '¿Tienes un negocio? Cuéntame de qué tipo y te digo cómo te encaja.'),
    ]);
  }
  return reply(c, topic, [GENERIC_PROSPECT_PROMPT]);
}

async function assistantInfo(c: Ctx): Promise<BrainResult> {
  const { cards } = await dirSearch(c, 'search_restaurants', { limit: 12 });
  const withChat = cards.find((r) => r.chatUrl);
  return reply(c, 'assistant_info', [
    P(
      'Cada restaurante puede tener su asistente virtual: responde a los clientes con la información real del negocio (productos, precios, horarios) y los orienta para pedir. Funciona cuando el negocio lo tiene habilitado.',
      'Un menú digital muestra tu carta; el asistente además conversa con el cliente y resuelve dudas.',
      withChat?.chatUrl ? `Puedes probar uno real ahora: *${withChat.nombre}* → ${withChat.chatUrl}` : null,
      '¿Tienes un negocio y quieres uno?',
    ),
  ]);
}

async function exampleMenu(c: Ctx): Promise<BrainResult> {
  const { cards } = await dirSearch(c, 'search_restaurants', { limit: 5 });
  const card = cards[0];
  return reply(c, 'example_menu', [
    card
      ? P(
          `Claro, mira uno real funcionando: *${card.nombre}* → ${absMenu(card, c.config)}`,
          'Así lo ve tu cliente en su teléfono, sin descargar nada. ¿Te cuento cómo sería con tu negocio?',
        )
      : P('Aún no puedo mostrarte un ejemplo en vivo desde aquí.', GENERIC_PROSPECT_PROMPT),
  ]);
}

async function coverageFlow(c: Ctx): Promise<BrainResult> {
  const cities = c.tr.cities.length ? c.tr.cities.slice(0, 3) : [];
  if (!cities.length) {
    return reply(c, 'coverage', [
      P(
        `${BRAND} funciona por internet, no depende de una app. Lo que cambia es qué restaurantes hay en tu zona.`,
        '¿En qué ciudad estás? Reviso el directorio y te digo qué hay.',
      ),
    ], { memoryPatch: { brainPending: { kind: 'zone', topic: 'browse_directory', atMs: c.nowMs } } });
  }
  const lines: string[] = [];
  for (const city of cities) {
    const { ok, cards } = await dirSearch(c, 'search_restaurants', { region: city, limit: 5 });
    if (!ok) continue;
    lines.push(
      cards.length
        ? `• *${city}*: sí, tengo ${cards.length >= 5 ? 'varios' : cards.length} restaurante(s) en el directorio.`
        : `• *${city}*: por ahora no veo restaurantes registrados ahí.`,
    );
  }
  return reply(c, 'coverage', [
    lines.length
      ? P('Te cuento lo que veo en el directorio:', lines.join('\n'), '¿Quieres que te muestre las opciones de alguna zona?')
      : 'No logro consultar el directorio ahora mismo; intenta en un momento o escribe *asesor*.',
  ]);
}

function staticTopic(c: Ctx, topic: CentralTopic): BrainResult | null {
  const hasShops = c.shops.length > 0;
  switch (topic) {
    case 'greeting': {
      if (hasShops) {
        const n = c.shops[0].publicName;
        return reply(c, topic, [
          c.shops.length > 1
            ? `¡Hola! 👋 Veo ${c.shops.length} negocios ligados a este número. ¿Te ayudo con alguno o buscas comida?`
            : `¡Hola! 👋 Veo *${n}* ligado a este número. ¿Te ayudo con el negocio o buscas comida?`,
        ]);
      }
      return reply(c, topic, [
        `¡Hola! 👋 Soy el asistente de *${BRAND}*. Puedo buscarte restaurantes y menús, explicarte cómo tener tu propio menú digital o ayudarte con tu negocio. ¿Qué necesitas?`,
      ]);
    }
    case 'thanks':
      return reply(c, topic, ['¡Con gusto! Si necesitas algo más, aquí estoy. 🙌']);
    case 'what_is':
      return reply(c, topic, [
        P(
          `¡Hola! Somos *${BRAND}*, una plataforma que ayuda a restaurantes y comercios a publicar su menú digital y recibir pedidos; y a los clientes a encontrar dónde pedir.`,
          PLATFORM_WHAT_IS.split('\n').slice(1).join(' ') || null,
          '¿Lo quieres usar como cliente o tienes un negocio?',
        ),
      ]);
    case 'who_are_you':
      return reply(c, topic, [
        `Soy el asistente virtual de *${BRAND}*: te ayudo a encontrar restaurantes y menús, y a resolver dudas de la plataforma. Si prefieres hablar con una persona, escribe *asesor*. ¿Qué necesitas?`,
      ]);
    case 'official_number':
      return reply(c, topic, [
        `Sí, este es el WhatsApp central de *${BRAND}* (elmenuxfa.com). Aquí te ayudo a buscar restaurantes, ver menús o conocer el servicio para tu negocio. ¿Qué necesitas?`,
      ]);
    case 'how_start':
      return reply(c, topic, [
        P(
          '¡Con gusto te oriento! Cuéntame qué necesitas:',
          '• si buscas comida, dime qué se te antoja y en qué ciudad estás;\n• si tienes un negocio, te explico cómo tener tu menú digital;\n• si ya estás registrado, dime con qué te ayudo.',
        ),
      ]);
    case 'no_app':
      return reply(c, topic, [
        'No necesitas descargar ninguna aplicación ni crear una cuenta para ver menús: se abren desde el navegador de tu teléfono. Si quieres administrar un negocio, te indico el acceso.',
      ]);
    case 'vs_apps':
      return reply(c, topic, [
        `${BRAND} no es una app de delivery con repartidores propios: cada restaurante tiene su menú digital y gestiona sus pedidos (delivery o retiro). Tú entras al menú desde el navegador, sin descargar nada. ¿Buscas algún restaurante en particular?`,
      ]);
    case 'order_by_chat':
      return reply(c, topic, [
        P(
          'Por aquí no tomo pedidos: te ayudo a encontrar el restaurante y su menú, y el pedido lo haces ahí (delivery o retiro, según tenga activo).',
          'Dime qué se te antoja y en qué zona estás, y te paso opciones.',
        ),
      ]);
    case 'support_info':
      return reply(c, topic, [
        'Claro, puedo ayudarte por aquí. Y si necesitas atención de una persona, registro tu solicitud con el contexto de esta conversación y un asesor se comunica contigo lo antes posible. ¿Qué necesitas resolver?',
      ]);
    case 'sensitive':
      return reply(c, topic, [
        'Eso no lo puedo compartir: por privacidad no doy claves, códigos ni datos privados de otras personas o negocios. Si necesitas algo de tu propio negocio, entra a app.elmenuxfa.com con tu cuenta.',
      ]);
    case 'order_issue':
      return reply(c, topic, [
        P(
          'Lamento el inconveniente. Los pedidos los gestiona directamente cada restaurante: desde aquí no puedo ver, cancelar ni confirmar el estado de un pedido.',
          'Dime el nombre del restaurante y qué ocurrió; te paso su menú y su asistente o contacto publicado, y si no responden o es algo serio, registro tu caso para que te contacte un asesor.',
        ),
      ], { memoryPatch: { brainPending: { kind: 'name', topic: 'contact_of', atMs: c.nowMs } } });
    case 'link_broken':
      return reply(c, topic, [
        P(
          'Prueba abrirlo desde el navegador del teléfono (Chrome o Safari) en vez de dentro de otra app.',
          'Si sigue sin abrir, dime el nombre del restaurante y te paso el enlace actualizado.',
        ),
      ], { memoryPatch: { brainPending: { kind: 'name', topic: 'menu_of', atMs: c.nowMs } } });
    case 'order_howto':
      return reply(c, topic, [
        P(
          'Para pedir: abre el menú del restaurante, elige tus productos y completa el pedido ahí (delivery o retiro, según lo que tenga activo). Yo por aquí no tomo pedidos.',
          'Dime qué restaurante o qué comida quieres y te paso el enlace.',
        ),
      ]);
    case 'consumer_howto': {
      const t = c.t;
      let lead =
        'Eso depende de cada restaurante y se ve en su menú (opciones de los productos, notas del pedido, formas de pago y retiro o delivery).';
      if (/\b(bolivares|bs|tasa|precios)\b/.test(t)) {
        lead =
          'En el menú de cada restaurante ves los precios; si acepta bolívares, los muestra con la tasa que ese local tenga configurada (los que usan BCV la actualizan con la tasa del día).';
      } else if (/\b(compartir|familia|otra persona)\b/.test(t)) {
        lead = 'Sí, el menú es un enlace público: puedes reenviarlo por WhatsApp a quien quieras.';
      } else if (/\b(mismo|enviaron)\b/.test(t)) {
        lead =
          'El menú digital es el que el restaurante mantiene actualizado en la plataforma; si ves algo distinto al físico, dime el restaurante y lo confirmamos con ellos.';
      }
      return reply(c, topic, [
        P(lead, 'Dime cuál restaurante es y te paso su menú; si tiene asistente virtual, también puedes preguntarle ahí.'),
      ]);
    }
    case 'merchant_access':
      return null;
    default:
      return null;
  }
}

function pricingFlow(c: Ctx): BrainResult {
  const note = pricingNote(c.text);
  return reply(c, 'pricing', [
    P(note, formatPublishedPricing(c.config.businessLandingUrl), note ? ADVISOR_OFFER : null),
  ]);
}

function registerFlow(c: Ctx): BrainResult {
  const wantsLink = /\b(enlace|link)\b/.test(c.t);
  const draft = c.memory.summary.signupDraft;
  if (draft?.businessName) {
    return {
      ...reply(c, 'register', []),
      delegate: { specialist: 'commercial', intent: 'commercial.register' },
    };
  }
  return reply(
    c,
    'register',
    [
      P(
        '¡Excelente! Te ayudo a registrar tu negocio.',
        wantsLink ? `El registro es aquí: ${c.config.businessRegisterUrl}` : null,
        'Primero dime el nombre de tu negocio, qué tipo de comercio es y en qué ciudad funciona, y te indico los pasos.',
        /\b(hablar|persona|alguien)\b/.test(c.t) ? 'Y si prefieres que te explique una persona, escribe *asesor*.' : null,
      ),
    ],
    { memoryPatch: { pendingQuestion: 'business_name', activeService: 'commercial' } },
  );
}

const GEO_TTL_MS = 6 * 60 * 60 * 1000;
const NEAR_ME =
  /\b(cerca de mi|cerca de aqui|cerca de donde|cerca de casa|cerca de mi casa|por aqui cerca|cercan[oa]s?|mas cerca|mi zona|por mi zona|en mi zona|a mi alrededor|alrededor mio|por donde vivo|donde estoy|mi sector|por mi sector|cerquita)\b/;

/** "Valencia" alone is a city answer for the legacy zone filter, not an address to geocode. */
function CITY_ONLY(t: string, cities: string[]): boolean {
  return cities.length > 0 && t.split(/\s+/).length <= 3 && !looksLikeAddress(t);
}

type Dest = { lat: number; lng: number; label?: string | null; approx?: 'city' | 'place' };

function recentGeo(c: Ctx): Dest | null {
  const g = c.memory.summary.geo;
  return g && c.nowMs - g.atMs <= GEO_TTL_MS ? g : null;
}

/**
 * Where the person is, for delivery coverage — most precise first: an address typed now, a
 * location shared recently, then the place they described earlier ("Los Palos Grandes, Caracas").
 * A place described in words is approximate and flagged so a fee is never presented as exact.
 */
async function resolveDest(c: Ctx): Promise<{ dest: Dest | null; fresh: boolean }> {
  if (looksLikeAddress(c.text)) {
    const p = await geocodeAddress(c.text);
    if (p) return { dest: p, fresh: true };
  }
  const g = recentGeo(c);
  if (g) return { dest: g, fresh: false };
  const place = c.memory.summary.placeText;
  if (place) {
    const p = await geocodeAddress(place);
    if (p) {
      const approx: 'city' | 'place' = isBareCity(place, extractCities(fold(place))) ? 'city' : 'place';
      return { dest: { lat: p.lat, lng: p.lng, label: place, approx }, fresh: true };
    }
  }
  return { dest: null, fresh: false };
}

function askLocation(
  c: Ctx,
  topic: 'search_food' | 'browse_directory' | 'open_now' | 'delivery_find',
  extra: Partial<WaMasterBrainPending> = {},
  label?: string | null,
): BrainResult {
  return reply(
    c,
    topic,
    [
      P(
        label
          ? `Claro 📍 Para decirte dónde conseguir *${label}* cerca de ti, primero necesito saber dónde estás.`
          : 'Claro 📍 Para decirte los más cercanos necesito saber dónde estás.',
        'Compárteme tu *ubicación actual* (toca el clip 📎 → *Ubicación* → *Enviar tu ubicación actual*; la ubicación en tiempo real también me sirve) o escríbeme tu dirección, sector o un punto de referencia.',
      ),
    ],
    { memoryPatch: { brainPending: { kind: 'zone', near: true, topic, atMs: c.nowMs, ...extra } } },
  );
}

/** Restaurants sorted by distance from a point the person shared or typed. */
async function nearbyFlow(
  c: Ctx,
  point: { lat: number; lng: number; label?: string | null },
  pend: WaMasterBrainPending | null,
): Promise<BrainResult> {
  const topic = (['search_food', 'browse_directory', 'open_now', 'delivery_find'] as const).includes(
    pend?.topic as never,
  )
    ? (pend!.topic as 'search_food' | 'browse_directory' | 'open_now' | 'delivery_find')
    : 'browse_directory';
  const out = await foodFlow(c, topic, {
    zone: null,
    category: pend?.category,
    query: pend?.query,
    label: pend?.query || pend?.category || null,
    openOnly: pend?.openOnly,
    geo: point,
  });
  const base = point.label ? `Listo, te ubiqué cerca de *${point.label}* 📍` : 'Listo, ya tengo tu ubicación 📍';
  if (out.replies[0]) out.replies = [P(base, out.replies[0]), ...out.replies.slice(1)];
  out.memoryPatch = {
    ...out.memoryPatch,
    geo: { lat: point.lat, lng: point.lng, label: point.label ?? null, atMs: c.nowMs },
  };
  return out;
}

/**
 * Location first: a food / delivery / "open now" search with no city in the message only
 * lists places once we know where the person is (recent share, address in the message),
 * otherwise we ask BEFORE showing anything that may be far away.
 */
async function locationGate(
  c: Ctx,
  topic: 'search_food' | 'open_now' | 'delivery_find',
  extra: Partial<WaMasterBrainPending>,
  label: string | null,
): Promise<BrainResult> {
  let geo = recentGeo(c);
  if (!geo && looksLikeAddress(c.text)) geo = await geocodeAddress(c.text);
  if (!geo) return askLocation(c, topic, extra, label);
  return nearbyFlow(c, geo, { kind: 'zone', near: true, topic, atMs: c.nowMs, ...extra });
}

/** The speaker declared they are the owner: switch role cleanly and offer next steps. */
async function ownerWelcome(c: Ctx): Promise<BrainResult> {
  const shop = pickShop(c);
  const url = await businessHandoff(c, { intent: 'admin.settings', pendingOp: 'admin_help', shop });
  return reply(
    c,
    'merchant_ops',
    [
      P(
        shop
          ? `Perfecto, seguimos con tu negocio *${shop.publicName}* 👍`
          : 'Perfecto, hablemos de tu negocio 👍 Por este número no veo un negocio registrado, pero te ayudo igual.',
        '¿Qué quieres hacer: precios, productos, agotados, horario, tasa, pedidos o tus enlaces? Cuéntame y lo resolvemos.',
        url
          ? `Si prefieres hacerlo directo en el chat de tu negocio, aquí lo tienes (ya sabe lo que hablamos):\n${url}`
          : null,
      ),
    ],
    {
      memoryPatch: {
        ...(shop ? { selectedComercioId: shop.comercioId } : {}),
        activeService: 'admin',
        lastRestaurants: [],
        zone: null,
        brainPending: url ? { kind: 'offer', topic: 'merchant_ops', url, atMs: c.nowMs } : null,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Photos / payment receipts
// ---------------------------------------------------------------------------

const OWNER_PHOTO_WORDS = /\b(producto|mi menu|mi negocio|mi restaurante|cambiar|cambia|actualiz|subir|sube|poner|pon|foto del|imagen del|logo)\b/;

/**
 * An inbound photo / PDF, already described by the vision model. Never pretends to verify a
 * payment; routes receipts to the restaurant and food photos to the real directory.
 */
async function imageFlow(c: Ctx, img: ImageTurn, params: BrainParams): Promise<BrainResult> {
  const readable = describeImageTurn(img);
  const cc: Ctx = { ...c, text: readable, t: fold(img.pie || '') };
  const owner = c.shops.length > 0;
  const last = c.memory.summary.lastRestaurants || [];
  const captionT = fold(img.pie || '');
  const rerun = (text: string) => runCentralBrainInner({ ...params, text });
  const prefixFirst = (out: BrainResult | null, intro: string): BrainResult | null => {
    if (out?.replies[0]) out.replies = [P(intro, out.replies[0]), ...out.replies.slice(1)];
    return out;
  };

  if (img.tipo === 'comprobante') {
    const bits = [
      img.monto && `por *${img.monto}*`,
      img.banco && `de *${img.banco}*`,
      img.referencia && `ref. ${img.referencia}`,
      img.fecha && `del ${img.fecha}`,
    ].filter(Boolean);
    const ack = bits.length
      ? `Recibí tu comprobante ${bits.join(', ')} 🧾`
      : 'Recibí tu imagen 🧾, pero no logro leer bien los datos del pago (monto, banco o referencia).';
    const honest =
      'Te aclaro algo: yo no recibo ni verifico pagos desde este chat; el comprobante lo confirma directamente el restaurante.';
    if (last.length === 1) {
      const r = last[0];
      return reply(cc, 'order_howto', [
        P(
          ack,
          honest,
          `Si es del pedido en *${r.nombre}*, mándaselo por su chat para que lo validen: ${r.chatUrl || r.menuUrl}`,
          bits.length ? null : 'Si puedes, reenvíalo con mejor luz y sin recortes para que se lea bien.',
        ),
      ]);
    }
    if (owner && !last.length) {
      const shop = pickShop(cc);
      const url = await businessHandoff(cc, { intent: 'admin.settings', pendingOp: 'order_status', shop });
      return reply(
        cc,
        'merchant_ops',
        [
          P(
            ack,
            'Si eres el dueño y quieres revisar o confirmar el pago de un pedido, eso lo haces con la sesión de tu negocio (yo desde aquí no apruebo pagos).',
            url
              ? `Entra por aquí y dile al asistente qué pedido es; ya sabe lo que hablamos:\n${url}`
              : 'Entra a app.elmenuxfa.com → Pedidos para verlo.',
          ),
        ],
        { memoryPatch: { brainPending: url ? { kind: 'offer', topic: 'merchant_ops', url, atMs: c.nowMs } : null } },
      );
    }
    return reply(
      cc,
      'order_howto',
      [
        P(
          ack,
          honest,
          last.length > 1
            ? `¿Para cuál restaurante es? Estuvimos viendo ${last.map((r) => r.nombre).slice(0, 4).join(', ')}.`
            : '¿Para qué restaurante es el pago? Dime el nombre y te paso su chat para que se lo envíes.',
        ),
      ],
      { memoryPatch: { brainPending: { kind: 'name', topic: 'restaurant_assistant', atMs: c.nowMs } } },
    );
  }

  if (img.tipo === 'plato') {
    if (owner && (merchantish(captionT) || OWNER_PHOTO_WORDS.test(captionT))) {
      const out = await merchantFlow(cc, 'photo', 'ops');
      out.memoryPatch = { ...out.memoryPatch, lastRestaurants: [], zone: null };
      return out;
    }
    if (img.busqueda) {
      const out = await rerun(`donde venden ${img.busqueda}`);
      const hit = prefixFirst(out, `Por tu foto parece *${img.busqueda}* 😋`);
      if (hit) {
        if (owner && hit.replies[0]) {
          hit.replies = [P(hit.replies[0], 'Y si la foto es para un producto de tu negocio, dímelo y te paso al asistente del negocio.')];
        }
        return hit;
      }
    }
    return reply(cc, 'search_food', [
      P(
        `Qué rico se ve 😋${img.resumen ? ` (${img.resumen.toLowerCase().replace(/\.$/, '')})` : ''}`,
        '¿Quieres que te diga dónde conseguir algo así? Cuéntame qué plato es y desde dónde lo pides.',
      ),
    ]);
  }

  if (owner && (img.tipo === 'menu' || img.tipo === 'logo')) {
    const shop = pickShop(cc);
    const url = await businessHandoff(cc, { intent: 'admin.edit_product', pendingOp: 'edit_products', shop });
    return reply(
      cc,
      'merchant_ops',
      [
        P(
          img.tipo === 'menu'
            ? 'Veo la foto de un menú 📋 Si quieres cargarlo en tu negocio, el asistente del negocio lo lee y te ayuda a armar los productos.'
            : 'Veo un logo / imagen de marca 🎨 Para ponerlo en tu negocio, lo haces desde el asistente del negocio.',
          url ? `Entra por aquí y envíala allí; ya tiene el contexto:\n${url}` : 'Entra a app.elmenuxfa.com y súbela desde tu panel.',
        ),
      ],
      { memoryPatch: { brainPending: url ? { kind: 'offer', topic: 'merchant_ops', url, atMs: c.nowMs } : null } },
    );
  }

  // Anything else: what was typed with the photo drives the answer; otherwise describe and ask.
  if (img.pie) {
    const out = await rerun(img.pie);
    if (out) return out;
  }
  const seen = img.resumen ? `Veo ${img.resumen.charAt(0).toLowerCase()}${img.resumen.slice(1).replace(/\.$/, '')}.` : 'Recibí tu imagen.';
  if (img.tipo === 'menu') {
    return reply(cc, 'search_food', [
      P(
        'Veo la foto de un menú 📋 Desde una foto no armo pedidos.',
        'Si quieres, dime qué plato te interesa y te digo dónde conseguirlo, o dime el nombre del restaurante y te paso su menú digital.',
      ),
    ]);
  }
  return reply(cc, 'unknown', [
    P(`${seen} 📷`, '¿Qué necesitas con ella? Puedo ayudarte a buscar un plato o restaurante, o resolver algo de tu negocio si lo tienes registrado.'),
  ]);
}

function merchantish(t: string): boolean {
  return /\b(mi (negocio|menu|restaurante|producto|local)|producto|cambiar|actualiz|subir|sube)\b/.test(t);
}

// ---------------------------------------------------------------------------
// "¿Hacen delivery hasta mi casa y cuánto cobran?"
// ---------------------------------------------------------------------------

const DELIVERY_ASK =
  /\b(delivery|domicilio|a domicilio|envio|envios|reparto|repartidor|despacho|despachan|llevan|llegan|llega|mandan|traen|entregan|envian)\b/;
const DELIVERY_SPECIFIC =
  /(cuanto (cobra|cobran|cuesta|sale|es|me cobra|seria|me cobrarian)|cobran|cobra\b|tarifa|costo|precio|hacen|hace\b|tienen|tiene\b|llevan|llegan|llega\b|mandan|traen|entregan|envian|hasta (mi|donde|aqui|casa)|a mi (casa|zona|ubicacion|sector)|donde (estoy|me encuentro|vivo))/;
const DELIVERY_PRICE_ISH = /\b(cuanto|cobr\w*|tarifa|costo|precio|hasta (mi|donde|aqui|casa)|a mi (casa|zona|ubicacion))\b/;

export function isDeliveryQuestion(t: string): boolean {
  return DELIVERY_ASK.test(t) && DELIVERY_SPECIFIC.test(t);
}

const LOCATION_HOWTO =
  'compárteme tu *ubicación actual* (toca el clip 📎 → *Ubicación* → *Enviar tu ubicación actual*) o escríbeme tu dirección o sector';

/** The same link twice in a conversation reads like a bot: send it once, then just answer. */
function linkAlreadySent(c: Ctx, url: string): boolean {
  return (c.memory.turns || []).some((t) => t.role === 'assistant' && t.text.includes(url));
}

function activeRef(c: Ctx): WaMasterRestaurantRef | null {
  const a = c.memory.summary.activeRestaurant;
  if (!a?.id) return null;
  // A restaurant stays "the one we are on" only while the conversation is still about it.
  const at = c.memory.summary.activeAtMs;
  if (at && c.nowMs - at > TASK_TTL_MS) return null;
  return a;
}

/** Keeps the list the person is choosing from; only replaces it when the ref is not in it. */
function keepList(c: Ctx, ref: WaMasterRestaurantRef): WaMasterRestaurantRef[] {
  const last = c.memory.summary.lastRestaurants || [];
  return last.some((r) => r.id === ref.id) ? last : [ref];
}

function geoPatchOf(c: Ctx, dest: Dest | null, fresh: boolean): Partial<WaMasterSummary> {
  return dest && fresh
    ? { geo: { lat: dest.lat, lng: dest.lng, label: dest.label ?? null, atMs: c.nowMs, ...(dest.approx ? { approx: dest.approx } : {}) } }
    : {};
}

async function deliveryFlow(
  c: Ctx,
  ref: WaMasterRestaurantRef,
  dest: Dest | null,
  opts: { fresh: boolean; ageNote?: boolean; pendingTopic?: string },
): Promise<BrainResult> {
  const load = c.loadShopDelivery ?? loadShopDeliveryFromDb;
  let info = null as Awaited<ReturnType<LoadShopDelivery>>;
  try {
    info = await load(ref.id);
  } catch {
    info = null;
  }
  c.tools.push('delivery_quote');
  const base = { lastRestaurants: keepList(c, ref), activeRestaurant: ref };
  if (!info) {
    return reply(
      c,
      'delivery_find',
      [
        P(
          `Ahora mismo no logro leer la configuración de delivery de *${ref.nombre}* 😕`,
          `Míralo directo en su menú (ahí ves si llega a tu zona y cuánto cuesta): ${ref.menuUrl}`,
        ),
      ],
      { skipCompose: true, memoryPatch: { ...base, brainPending: null } },
    );
  }
  // A whole city is too coarse to quote a fee, but it is enough to say "that is far away".
  const km = dest && info.origin ? haversineKm(info.origin, dest) : null;
  const tooCoarse = dest?.approx === 'city' && !(km != null && km > MAX_SANE_DELIVERY_KM);
  const effective = tooCoarse ? null : dest;
  const ans = describeDelivery({ ...info, nombre: info.nombre || ref.nombre }, effective);
  const geoPatch = geoPatchOf(c, dest, opts.fresh);
  const needLocationText =
    tooCoarse && dest?.label
      ? `Me dijiste *${dest.label}*, pero para confirmar si te llega y cuánto cuesta necesito algo más preciso: ${LOCATION_HOWTO}.`
      : `Para confirmarte si llega hasta donde estás y cuánto te costaría exactamente, ${LOCATION_HOWTO}.`;
  if (ans.needsLocation || tooCoarse) {
    return reply(
      c,
      'delivery_find',
      [P(...ans.lines, needLocationText)],
      {
        skipCompose: true,
        memoryPatch: {
          ...base,
          ...geoPatch,
          brainPending: { kind: 'delivery', comercioId: ref.id, topic: opts.pendingTopic ?? 'delivery_find', atMs: c.nowMs },
        },
      },
    );
  }
  const approxNote =
    dest?.approx === 'place' && dest.label
      ? `Lo calculé con la zona que me dijiste (*${dest.label}*), que es aproximada; si me compartes tu ubicación exacta lo afino.`
      : null;
  const alternatives = !ans.delivers && dest ? await alternativesNote(c, ref.id, dest) : null;
  return reply(
    c,
    'delivery_find',
    [
      P(
        ...ans.lines,
        approxNote,
        alternatives,
        opts.ageNote
          ? 'Usé la ubicación que me compartiste antes; si ya no estás ahí, mándame la nueva y lo recalculo.'
          : null,
        linkAlreadySent(c, ref.menuUrl)
          ? null
          : ans.delivers
            ? `Para pedir, entra a su menú: ${ref.menuUrl}`
            : `Si quieres, ves su menú aquí: ${ref.menuUrl}`,
      ),
    ],
    { skipCompose: true, memoryPatch: { ...base, brainPending: null, ...geoPatch } },
  );
}

/** Which restaurant a delivery question is about: named, or the one we were just talking about. */
async function resolveDeliveryShop(
  c: Ctx,
): Promise<{ ref?: WaMasterRestaurantRef; ambiguous?: WaMasterRestaurantRef[]; notFound?: string }> {
  const last = c.memory.summary.lastRestaurants || [];
  const mentioned = last.find((r) => mentionsRestaurant(c.t, r.nombre));
  if (mentioned) return { ref: mentioned };
  const active = activeRef(c);
  const name = c.tr.restaurantName;
  if (name) {
    const { card } = await findByName(c, name);
    if (card) return { ref: toRefs([card], c.config)[0] };
    // A capitalised place ("Los Palos Grandes") is not a restaurant: stay with the one we are on.
    if (!active) return { notFound: name };
  }
  if (active) return { ref: active };
  if (last.length === 1) return { ref: last[0] };
  if (last.length > 1) return { ambiguous: last };
  return {};
}

async function deliveryQuestionFlow(c: Ctx): Promise<BrainResult | null> {
  const found = await resolveDeliveryShop(c);
  if (found.notFound) {
    return reply(c, 'delivery_find', [
      P(
        `No ubico un restaurante llamado *${found.notFound}* en el directorio de ${BRAND} 🤔`,
        '¿Me confirmas el nombre exacto o la ciudad? Así reviso su delivery.',
      ),
    ], { memoryPatch: { brainPending: { kind: 'name', topic: 'delivery_find', atMs: c.nowMs } } });
  }
  if (found.ambiguous) {
    return reply(c, 'delivery_find', [
      P(
        `¿De cuál restaurante quieres saber el delivery? Estuvimos viendo ${found.ambiguous.map((r) => `*${r.nombre}*`).slice(0, 4).join(', ')}.`,
        'Dime el nombre y te digo si llega a tu zona y cuánto cobra.',
      ),
    ], { memoryPatch: { brainPending: { kind: 'name', topic: 'delivery_find', atMs: c.nowMs } } });
  }
  if (!found.ref) {
    if (!DELIVERY_PRICE_ISH.test(c.t)) return null; // generic "who has delivery": the directory flow answers
    return reply(c, 'delivery_find', [
      '¡Claro! Dime de qué restaurante quieres saber el delivery (nombre y ciudad si la sabes) y te digo si llega hasta donde estás y cuánto cobra 🛵',
    ], { memoryPatch: { brainPending: { kind: 'name', topic: 'delivery_find', atMs: c.nowMs } } });
  }
  // Where is the person? An address in this message, a recent share, or the place they described.
  const { dest, fresh } = await resolveDest(c);
  const g = c.memory.summary.geo;
  const ageNote = Boolean(dest && !fresh && g && c.nowMs - g.atMs > 30 * 60 * 1000);
  return deliveryFlow(c, found.ref, dest, { fresh, ageNote });
}

// ---------------------------------------------------------------------------
// The restaurant's real menu: cheapest, compare, price, total, budget, variants
// ---------------------------------------------------------------------------

const VIEW_TTL_MS = 60 * 60 * 1000;
const MENU_PRESCREEN =
  /\b(barat\w*|economic\w*|menor precio|mas bajo|mas car\w*|costos|premium|total|subtotal|cuanto (cuesta|cuestan|vale|valen|sale|salen|seria|serian|me|son|es)|precio|precios|a como|valor|recomiend\w*|recomend\w*|aconsej\w*|sugier\w*|presupuesto|conviene|que (tienen|hay|venden|manejan|ofrecen)|menu|carta|categorias|opciones|agotad\w*|disponib\w*|tiene|tienen|hay|viene|vienen|sin |doble|extra|combo|tamano|sabor|primera|segunda|tercera|cuarta|quinta|esas|esos|todas|todos|suma|calcula\w*|cuenta|pagar\w*)\b|\b\d[\d.,]*\s*(mil|k|cop|usd|bs|pesos|dolares)\b|\btengo\s+\d/;

async function getSnapshot(c: Ctx, ref: WaMasterRestaurantRef): Promise<MenuSnapshot | null> {
  const load = c.loadPublicMenu ?? loadMenuSnapshotFromDb;
  try {
    const snap = await load(ref.slug || ref.id);
    if (snap) c.tools.push('menu_query');
    return snap;
  } catch {
    return null;
  }
}

function currentView(c: Ctx, snap: MenuSnapshot) {
  const v = c.memory.summary.lastMenuView;
  return v && v.slug === snap.slug && c.nowMs - v.atMs <= VIEW_TTL_MS ? v : null;
}

function menuReply(
  c: Ctx,
  ref: WaMasterRestaurantRef,
  lines: Array<string | null | undefined | false>,
  extraPatch: Partial<WaMasterSummary> = {},
): BrainResult {
  return reply(c, 'menu_of', [P(...lines)], {
    skipCompose: true,
    memoryPatch: { activeRestaurant: ref, lastRestaurants: keepList(c, ref), brainPending: null, ...extraPatch },
  });
}

const HERE_NEXT =
  'Cuando quieras te calculo el total con delivery hasta donde estás, o comparo con otra categoría.';

/**
 * Answers a question about the active restaurant's products from its real public menu.
 * Returns null when the message is not about products (the normal brain continues).
 */
async function menuTurn(c: Ctx, ref: WaMasterRestaurantRef): Promise<BrainResult | null> {
  if (!MENU_PRESCREEN.test(c.t)) return null;
  const snap = await getSnapshot(c, ref);
  if (!snap) {
    // Only complain when the message is clearly a price / product question.
    if (!/\b(barat|economic|total|precio|cuanto|recomiend|presupuesto|menu)\b/.test(c.t)) return null;
    return menuReply(c, ref, [
      `Ahora mismo no logro consultar el menú de *${ref.nombre}* para darte precios exactos 😕`,
      'Dame un momento y vuelve a preguntarme; si prefieres verlo tú, está aquí: ' + ref.menuUrl,
    ]);
  }
  const view = currentView(c, snap);
  const ask = parseMenuAsk(c.text, snap, view);
  if (!isMenuAsk(ask, Boolean(view?.productIds.length))) return null;

  if (!snap.online) {
    return menuReply(c, ref, [
      `El menú de *${snap.nombre}* no está disponible ahora mismo (el negocio lo tiene en mantenimiento), así que no puedo darte precios confiables.`,
      'Prueba más tarde o escribe *asesor* si necesitas ayuda de una persona.',
    ]);
  }

  const cur = snap.currency;
  // They asked for delivery earlier in this search ("opciones con delivery"): totals include it.
  const wantsDelivery = ask.withDelivery || Boolean(taskOf(c)?.delivery);

  // Delivery fee for this order (needs where the person is).
  const quoteFor = async (subtotal: number) => {
    const { dest, fresh } = await resolveDest(c);
    const far = dest && snap.delivery.origin ? haversineKm(snap.delivery.origin, dest) : null;
    const coarse = dest?.approx === 'city' && !(far != null && far > MAX_SANE_DELIVERY_KM);
    const used = coarse ? null : dest;
    const quote = quoteShopDelivery(snap.delivery, used, subtotal, snap.convert);
    return { quote, dest: used, origDest: dest, fresh, coarse };
  };
  const patchView = (ids: string[], category: string | null, qty: Record<string, number>): Partial<WaMasterSummary> => ({
    lastMenuView: { slug: snap.slug, category, productIds: ids.slice(0, 12), qty, atMs: c.nowMs },
  });
  const placeLabel = (d: Dest | null) => (d?.label ? `*${d.label}*` : null);

  // ---- Budget / "which do you recommend" ----------------------------------------------
  if (ask.budget || ask.recommend) {
    const sel = selectProducts(snap, { ...ask, cheapest: false, priciest: false, products: [] }, view);
    const pool = sel.pool;
    const sorted = [...pool].sort((a, b) => a.price - b.price || a.nombre.localeCompare(b.nombre, 'es'));
    if (!ask.budget) {
      const cheap = sorted.slice(0, 3);
      return menuReply(
        c,
        ref,
        [
          `Para recomendarte bien en *${snap.nombre}* dime tu presupuesto (en ${cur}) y si es con delivery.`,
          cheap.length ? `Mientras tanto, lo más económico${sel.category ? ` de ${sel.category.nombre}` : ''}:\n${cheap.map((p) => productLine(snap, p)).join('\n')}` : null,
        ],
        patchView(cheap.map((p) => p.id), sel.category?.nombre ?? null, {}),
      );
    }
    let fee = 0;
    let feeNote: string | null = null;
    let pendingLoc = false;
    if (wantsDelivery || view) {
      const q = await quoteFor(ask.budget.amount);
      if (q.quote.kind === 'fee') {
        fee = q.quote.free ? 0 : q.quote.fee;
        feeNote = `Descontando el delivery${placeLabel(q.dest) ? ` hasta ${placeLabel(q.dest)}` : ''}: ${money(snap, fee)}.`;
      } else if (wantsDelivery) {
        const t = describeTotal(snap, computeTotals([]), q.quote, null);
        pendingLoc = t.needsLocation || q.coarse;
        feeNote = pendingLoc
          ? `Para descontar el delivery necesito saber dónde estás (${LOCATION_HOWTO}); por ahora lo calculo sin delivery.`
          : t.lines.filter((l) => !l.startsWith('Subtotal')).join('\n') || null;
      }
    }
    const plan = planBudget(snap, ask.budget, pool, fee, { withSide: /\b(bebida|bebidas|jugo|refresco|gaseosa|malta|combo|acompan\w*|papas)\b/.test(c.t) });
    if (plan.ok === false && plan.reason === 'currency') {
      return menuReply(c, ref, [
        `Tu presupuesto está en ${plan.budget.currency} pero este menú cobra en ${cur} y no tengo una tasa verificable para convertir, así que no voy a mezclar monedas.`,
        `¿Me lo dices en ${cur}?`,
      ]);
    }
    if (plan.ok === false) {
      return menuReply(
        c,
        ref,
        [
          `Con ${money(snap, ask.budget.amount)}${fee ? ` (menos ${money(snap, fee)} de delivery)` : ''} no alcanza ni para lo más barato${sel.category ? ` de ${sel.category.nombre}` : ''}: ${plan.cheapest ? productLine(snap, plan.cheapest) : 'no hay productos con precio'}.`,
          plan.needed ? `Necesitarías al menos ${money(snap, plan.needed)}${fee ? ' con el delivery' : ''}.` : null,
        ],
        patchView(plan.cheapest ? [plan.cheapest.id] : [], sel.category?.nombre ?? null, {}),
      );
    }
    const convNote =
      ask.budget.currency && ask.budget.currency !== cur
        ? `(Convertí tu presupuesto de ${ask.budget.currency} a ${cur} con la tasa del menú: ${money(snap, plan.available + fee)}.)`
        : null;
    const unspecified = !ask.budget.currency ? `Tomé tu presupuesto en ${cur}, la moneda de este menú.` : null;
    const picks = [plan.main, ...(plan.side ? [plan.side] : [])];
    const total = round(plan.main.price + (plan.side?.price ?? 0) + fee);
    return menuReply(
      c,
      ref,
      [
        convNote,
        unspecified,
        `Con ${money(snap, ask.budget.amount)} te recomiendo en *${snap.nombre}*:`,
        `${productLine(snap, plan.main)}${plan.side ? `\n${productLine(snap, plan.side)}   (bebida más económica)` : ''}`,
        `Eso suma ${money(snap, plan.main.price + (plan.side?.price ?? 0))}${fee ? ` + delivery ${money(snap, fee)} = ${money(snap, total)}` : ''}${plan.leftover > 0 ? `; te sobran ${money(snap, plan.leftover)}` : ''}.`,
        plan.alternatives.length ? `Si prefieres algo más ligero:\n${plan.alternatives.map((p) => productLine(snap, p)).join('\n')}` : null,
        feeNote,
      ],
      {
        ...patchView(picks.map((p) => p.id), sel.category?.nombre ?? null, {}),
        ...(pendingLoc ? { brainPending: { kind: 'delivery', comercioId: ref.id, topic: 'menu_total', atMs: c.nowMs } } : {}),
      },
    );
  }

  // ---- Products: cheapest / priciest / named / from the last list ---------------------
  const sel = selectProducts(snap, ask, view);

  const wordsInCategory = sel.source === 'category' && ask.optionWords.length > 0;
  if (
    (ask.availability || ask.list) &&
    (!sel.lines.length || wordsInCategory) &&
    (!ask.categories.length || wordsInCategory) &&
    !ask.cheapest &&
    !ask.priciest
  ) {
    // "¿tienen algo con pollo?", "¿viene sin cebolla?", "¿hamburguesa de pescado?": search
    // ingredients / options / names (inside the category when one was named).
    const words = ask.optionWords.filter((w) => w.length >= 3);
    const hits = words.length
      ? snap.products.filter(
          (p) =>
            (!ask.categories.length || ask.categories.some((cat) => cat.id === p.categoriaId)) &&
            words.every((w) => productMentions(p, w)),
        )
      : [];
    if (hits.length) {
      const top = hits.slice(0, 6);
      return menuReply(
        c,
        ref,
        [
          `Sí, en *${snap.nombre}* veo ${hits.length === 1 ? 'esto' : 'estas opciones'} con *${words.join(' ')}*:`,
          top.map((p) => productLine(snap, p)).join('\n'),
          hits.length > top.length ? `Y ${hits.length - top.length} más.` : null,
        ],
        patchView(top.map((p) => p.id), null, {}),
      );
    }
    if (words.length) {
      return menuReply(c, ref, [
        `No veo *${words.join(' ')}* en el menú publicado de *${snap.nombre}*. El menú público solo muestra lo que está disponible ahora, así que puede estar agotado o simplemente no lo manejan.`,
        'Si quieres, te muestro lo más parecido por categoría o por precio.',
      ]);
    }
  }

  if (!sel.lines.length) {
    if (ask.list || ask.categories.length === 0) {
      if (ask.list) {
        const cats = snap.categories.map((cat) => {
          const min = Math.min(...snap.products.filter((p) => p.categoriaId === cat.id && p.price > 0).map((p) => p.price));
          return `• ${cat.nombre} (${cat.count})${Number.isFinite(min) ? ` — desde ${money(snap, min)}` : ''}`;
        });
        return menuReply(c, ref, [`Esto tiene *${snap.nombre}* (precios en ${cur}):`, cats.join('\n'), 'Dime la categoría o lo que se te antoja y te muestro los productos con sus precios.']);
      }
    }
    return menuReply(c, ref, [
      `¿De cuáles productos de *${snap.nombre}* quieres que lo calcule? Dime el nombre, o pídeme «las más baratas» de una categoría y lo armo.`,
    ]);
  }

  const lines = sel.lines;
  const ids = lines.map((l) => l.product.id);
  const qty: Record<string, number> = {};
  for (const l of lines) if (l.qty !== 1) qty[l.product.id] = l.qty;
  const catLabel = sel.category ? ` de ${sel.category.nombre}` : '';
  const header =
    sel.source === 'cheapest'
      ? `Las ${lines.length === 1 ? 'más económica' : `${lines.length} más económicas`}${catLabel} en *${snap.nombre}* (precios en ${cur}):`
      : sel.source === 'priciest'
        ? `Las ${lines.length === 1 ? 'más cara' : `${lines.length} más caras`}${catLabel} en *${snap.nombre}* (precios en ${cur}):`
        : sel.source === 'category'
          ? `${sel.category?.nombre ?? 'Productos'} en *${snap.nombre}*, de menor a mayor (precios en ${cur}):`
          : `Esto es lo que dice el menú de *${snap.nombre}* (precios en ${cur}):`;
  const body = lines.map((l) => productLine(snap, l.product, l.qty)).join('\n');
  const tieNote = sel.ties.length
    ? `Ojo: ${sel.ties.slice(0, 3).map((p) => p.nombre).join(', ')} ${sel.ties.length > 1 ? 'cuestan' : 'cuesta'} lo mismo (${money(snap, lines[lines.length - 1].product.price)}), por si quieres cambiar.`
    : null;
  const fromNote = lines.some((l) => l.product.from)
    ? 'Los marcados «desde» cambian según lo que elijas dentro del producto.'
    : null;

  // Variants of the product(s) asked about.
  let optionsBlock: string | null = null;
  if (ask.availability && sel.source === 'named') {
    const blocks: string[] = [];
    for (const l of lines.slice(0, 3)) {
      const opts = describeProductOptions(snap, l.product).slice(0, 5);
      blocks.push(
        `*${l.product.nombre}* sí aparece disponible (${money(snap, l.product.price)}${l.product.from ? ' desde' : ''}).${opts.length ? `\n${opts.map((o) => `  – ${o}`).join('\n')}` : ' No tiene variantes ni extras configurados.'}`,
      );
    }
    optionsBlock = blocks.join('\n');
    // "sin cebolla": answer from the product's own removable ingredients.
    const sin = /\bsin\s+([a-zñ ]{3,30}?)(?:\s+y\s|\s+por\b|[?.,]|$)/.exec(fold(c.text));
    if (sin) {
      const word = sin[1].trim();
      const removable = lines.filter((l) => l.product.removals.some((r) => fold(r).includes(word) || word.includes(fold(r))));
      optionsBlock += removable.length
        ? `\nSí puedes pedirlo *sin ${word}*: está entre lo que se puede quitar.`
        : `\nNo veo *${word}* entre los ingredientes que se pueden quitar; si lo necesitas, déjalo anotado al pedir o pregúntale al local.`;
    }
  }

  // Order total (+ delivery) — only when asked.
  let totalBlock: string[] | null = null;
  let pending: Partial<WaMasterSummary> = {};
  let approxNote: string | null = null;
  let askLocation: string | null = null;
  let altNote: string | null = null;
  const wantsTotal = ask.total || (wantsDelivery && !ask.price && !ask.availability) || (ask.total && wantsDelivery);
  if (wantsTotal || (ask.price && wantsDelivery)) {
    const totals = computeTotals(lines);
    if (wantsDelivery) {
      const q = await quoteFor(totals.subtotal);
      const quoteKind = q.coarse ? ({ kind: 'needs_location' } as const) : q.quote;
      const t = describeTotal(snap, totals, quoteKind, placeLabel(q.dest));
      totalBlock = t.lines;
      if (t.needsLocation) {
        askLocation =
          q.coarse && q.origDest?.label
            ? `Me dijiste *${q.origDest.label}*, pero para sumarte el delivery necesito algo más preciso: ${LOCATION_HOWTO}.`
            : `Para sumarte el delivery necesito saber dónde estás: ${LOCATION_HOWTO}.`;
        pending = { brainPending: { kind: 'delivery', comercioId: ref.id, topic: 'menu_total', atMs: c.nowMs } };
      }
      if (q.dest?.approx === 'place' && q.dest.label && t.total != null && q.quote.kind === 'fee') {
        approxNote = `La tarifa la calculé con la zona que me dijiste (*${q.dest.label}*), que es aproximada; con tu ubicación exacta puede variar.`;
      }
      Object.assign(pending, geoPatchOf(c, q.origDest, q.fresh));
      if (q.quote.kind === 'blocked' && q.dest) altNote = await alternativesNote(c, ref.id, q.dest);
    } else {
      totalBlock = describeTotal(snap, totals, null, null).lines;
      totalBlock.push(`Total estimado sin delivery: ${money(snap, totals.subtotal)}`);
      totalBlock.push('Si lo quieres con delivery, dime dónde estás y te lo sumo.');
    }
  }
  const orderLink =
    totalBlock && !linkAlreadySent(c, ref.menuUrl) ? `Cuando quieras pedirlo, desde su menú: ${ref.menuUrl}` : null;
  const closing = !totalBlock && !optionsBlock && sel.source !== 'named' ? HERE_NEXT : null;

  return menuReply(
    c,
    ref,
    [
      header,
      body,
      tieNote,
      fromNote,
      optionsBlock,
      totalBlock ? totalBlock.join('\n') : null,
      approxNote,
      askLocation,
      altNote,
      totalBlock ? 'Es un cálculo con los precios publicados ahora mismo; el total final lo confirma el menú al pedir.' : null,
      orderLink,
      closing,
    ],
    { ...patchView(ids, sel.category?.nombre ?? lastCategoryOf(snap, lines), qty), ...pending },
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** We asked where the person is to add the delivery to the order we had listed: finish it. */
async function totalFromView(c: Ctx, ref: WaMasterRestaurantRef, point: Dest): Promise<BrainResult | null> {
  const snap = await getSnapshot(c, ref);
  const view = snap ? currentView(c, snap) : null;
  if (!snap || !view) return null;
  const lines = view.productIds
    .map((id) => snap.products.find((p) => p.id === id))
    .filter((p): p is MenuProduct => Boolean(p))
    .map((product) => ({ product, qty: view.qty?.[product.id] ?? 1 }));
  if (!lines.length) return null;
  const totals = computeTotals(lines);
  const quote = quoteShopDelivery(snap.delivery, point, totals.subtotal, snap.convert);
  const t = describeTotal(snap, totals, quote, point.label ? `*${point.label}*` : null);
  const body = lines.map((l) => productLine(snap, l.product, l.qty)).join('\n');
  return menuReply(
    c,
    ref,
    [
      `Listo, con tu ubicación el cálculo de *${snap.nombre}* (precios en ${snap.currency}):`,
      body,
      t.lines.join('\n'),
      t.total != null ? 'Es un cálculo con los precios publicados ahora mismo; el total final lo confirma el menú al pedir.' : null,
    ],
    geoPatchOf(c, point, true),
  );
}

/** The category shared by every shown product (so "las más baratas" later stays on topic). */
function lastCategoryOf(snap: MenuSnapshot, lines: Array<{ product: MenuProduct }>): string | null {
  const cats = new Set(lines.map((l) => l.product.categoria).filter(Boolean));
  return cats.size === 1 ? [...cats][0] : null;
}

/**
 * The person picked this restaurant: resolve first (what it sells, whether it can reach them),
 * links after. Answers the question in the same message when there is one.
 */
async function selectRestaurant(c: Ctx, ref: WaMasterRestaurantRef): Promise<BrainResult> {
  const asked = await menuTurn(c, ref);
  if (asked) return asked;
  const snap = await getSnapshot(c, ref);
  // What they were looking for becomes the default category ("las más baratas" = of the burgers).
  const hint = c.memory.summary.foodHint;
  const hintCat = snap && hint ? matchCategories(snap, hint)[0] : null;
  const patch: Partial<WaMasterSummary> = {
    activeRestaurant: ref,
    lastRestaurants: keepList(c, ref),
    lastMenuView: snap && hintCat ? { slug: snap.slug, category: hintCat.nombre, productIds: [], atMs: c.nowMs } : null,
    brainPending: null,
  };
  if (!snap) {
    return reply(
      c,
      'menu_of',
      [
        P(
          `Perfecto, *${ref.nombre}*: ${ref.menuUrl}`,
          ref.chatUrl ? `Y su asistente virtual, por si quieres preguntarle algo: ${ref.chatUrl}` : null,
          'Ahí eliges tus productos y completas el pedido.',
        ),
      ],
      { skipCompose: true, memoryPatch: patch },
    );
  }
  const cats = snap.categories.map((cat) => {
    const min = Math.min(...snap.products.filter((p) => p.categoriaId === cat.id && p.price > 0).map((p) => p.price));
    return `${cat.nombre}${Number.isFinite(min) ? ` (desde ${money(snap, min)})` : ''}`;
  });
  const addr = snap.delivery.address?.split('\n')[0]?.trim();
  // Is it even near the person? Say it now instead of letting them find out at checkout.
  let farNote: string | null = null;
  let farAlt: string | null = null;
  const place = c.memory.summary.placeText;
  const g = recentGeo(c);
  if (snap.delivery.origin && (g || place)) {
    const p = g ?? (place ? await geocodeAddress(place) : null);
    const km = p ? haversineKm(snap.delivery.origin, p) : null;
    if (km != null && km > MAX_SANE_DELIVERY_KM) {
      const where = (g?.label || place) ? `*${g?.label || place}*` : 'donde estás';
      farNote = `⚠️ Ojo: queda${addr ? ` en ${addr}` : ''}, a unos ${String(Math.round(km)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} km de ${where}, así que lo más probable es que no te lleguen (te lo confirmo con tu ubicación exacta si quieres).`;
      if (p) {
        farAlt = await alternativesNote(c, ref.id, {
          lat: p.lat,
          lng: p.lng,
          label: g?.label || place || null,
          approx: g?.approx ?? (place && isBareCity(place, extractCities(fold(place))) ? 'city' : 'place'),
        });
      }
    }
  }
  return reply(
    c,
    'menu_of',
    [
      P(
        `Perfecto, *${snap.nombre}*${addr ? ` (${addr})` : ''}.`,
        snap.categories.length ? `En su menú veo: ${cats.join(', ')}. Precios en ${snap.currency}.` : null,
        farNote,
        farAlt,
        'Pregúntame lo que necesites: las más baratas, comparar precios, qué variantes tiene un plato, el total de tu pedido con delivery…',
        linkAlreadySent(c, ref.menuUrl) && !/\b(link|enlace|url|pagina|manda\w*|pasa\w*|enviame|ver (el )?menu)\b/.test(c.t)
          ? null
          : `Menú completo, por si quieres verlo: ${ref.menuUrl}`,
      ),
    ],
    { skipCompose: true, memoryPatch: patch },
  );
}

// ---------------------------------------------------------------------------
// The current search task: "tres opciones con delivery", "no quiero X", "empecemos de nuevo",
// "¿cuál es la más económica?". The LAST explicit intent decides; memory only fills the gaps.
// ---------------------------------------------------------------------------

type TaskFood = NonNullable<WaMasterTask['food']>;

const cityOfPlace = (place: string | null | undefined): string | null =>
  place ? extractCities(fold(place))[0] ?? null : null;

function taskOf(c: Ctx): WaMasterTask | null {
  return freshTask(c.memory.summary.task, c.nowMs);
}

/** The dishes of the wanted food in this menu: its category first, then dish words. No duplicates. */
function foodPool(snap: MenuSnapshot, food: TaskFood | null): MenuProduct[] {
  const priced = snap.products.filter((p) => p.price > 0);
  if (!food) return dedupeProducts(priced);
  const words = [food.label, food.category, food.query].filter(Boolean).join(' ');
  const cats = matchCategories(snap, words);
  if (cats.length) {
    const ids = new Set(cats.map((x) => x.id));
    return dedupeProducts(priced.filter((p) => p.categoriaId && ids.has(p.categoriaId)));
  }
  const ws = words.split(/\s+/).filter((w) => w.length >= 4);
  return dedupeProducts(priced.filter((p) => ws.some((w) => productMentions(p, w))));
}

const cheapestOf = (pool: MenuProduct[]): MenuProduct | null =>
  pool.length ? [...pool].sort((a, b) => a.price - b.price || a.nombre.localeCompare(b.nombre, 'es'))[0] : null;

const canDeliver = (q: ShopDeliveryQuote | null) => q?.kind === 'fee' || q?.kind === 'agreed';

type Candidate = {
  card: WaMasterDiscoveryCard;
  ref: WaMasterRestaurantRef;
  snap: MenuSnapshot | null;
  km: number | null;
  cheapest: MenuProduct | null;
  quote: ShopDeliveryQuote | null;
};

/** Real menu + real delivery rules of every candidate (nothing is guessed from the directory card). */
async function evaluateCandidates(
  c: Ctx,
  cards: WaMasterDiscoveryCard[],
  food: TaskFood | null,
  dest: Dest | null,
): Promise<Candidate[]> {
  const coarse = dest?.approx === 'city';
  return Promise.all(
    cards.map(async (card) => {
      const ref = toRefs([card], c.config)[0];
      const snap = await getSnapshot(c, ref);
      const cheapest = snap ? cheapestOf(foodPool(snap, food)) : null;
      const origin = snap?.delivery.origin ?? null;
      const km =
        typeof card.distanceKm === 'number'
          ? card.distanceKm
          : dest && !coarse && origin
            ? Math.round((haversineKm(origin, dest) ?? 0) * 10) / 10
            : null;
      const quote = snap ? quoteShopDelivery(snap.delivery, coarse ? null : dest, cheapest?.price ?? 0, snap.convert) : null;
      return { card, ref, snap, km, cheapest, quote };
    }),
  );
}

function deliveryTag(x: Candidate): string {
  const q = x.quote;
  if (!q || !x.snap) return 'delivery: no pude leerlo ahora';
  switch (q.kind) {
    case 'fee':
      return q.free ? 'delivery gratis' : `delivery ${money(x.snap, q.fee)}`;
    case 'agreed':
      return 'delivery a convenir con el local';
    case 'none':
    case 'no_tariff':
      return 'sin delivery (solo retiro en el local)';
    case 'blocked':
      return 'no te llega (fuera de su zona de delivery)';
    case 'needs_location':
      return 'delivery: depende de tu ubicación exacta';
    default:
      return 'delivery: no pude verificarlo';
  }
}

const km1 = (km: number) => km.toFixed(1).replace('.', ',');

/** A single capitalised word after "en/por" ("en Altamira") — a neighbourhood, not a dish. */
function loosePlace(original: string): string | null {
  const m = /(?:^|\s)(?:en|por|desde|cerca de)\s+([A-ZÁÉÍÓÚÑ][\p{L}]{3,})\s*[.!?]*$/u.exec(original.trim());
  return m ? m[1] : null;
}

type SmartOpts = { exclusion?: Exclusion | null; recommend?: boolean };

/**
 * Restaurant search driven by the whole current task (food, city, preferences, exclusions) —
 * every candidate is checked against its real menu and delivery rules before it is listed.
 * Returns null when the directory has nothing at all, so the classic flow can widen the search.
 */
async function smartSearchFlow(c: Ctx, opts: SmartOpts): Promise<BrainResult | null> {
  const sum = c.memory.summary;
  const prev = taskOf(c);
  const food: TaskFood | null = c.tr.food ?? prev?.food ?? null;
  const zone = c.tr.cities[0] ?? prev?.zone ?? sum.zone ?? cityOfPlace(sum.placeText) ?? null;
  const same = sameSearch(prev, food, zone);
  const cheap = wantsCheap(c.t) || (same && Boolean(prev?.cheap));
  const delivery = wantsDeliveryFilter(c.t) || (same && Boolean(prev?.delivery));
  const excluded = [...new Set([...(same ? prev?.excluded ?? [] : []), ...(opts.exclusion?.names ?? [])])];
  const cities = zone ? [zone] : [];

  // Where: a place named now > a typed address > a recent share > the place described earlier.
  const named = extractPlaceText(c.text, cities) ?? loosePlace(c.text);
  let dest: Dest | null = null;
  let newPlace = false;
  if (named && !isBareCity(named, cities)) {
    const q = zone && !fold(named).includes(fold(zone)) ? `${named}, ${zone}` : named;
    const p = await geocodeAddress(q);
    if (p) {
      dest = { lat: p.lat, lng: p.lng, label: q, approx: 'place' };
      newPlace = true;
    }
  }
  if (!dest && looksLikeAddress(c.text)) {
    const p = await geocodeAddress(c.text);
    if (p) {
      dest = p;
      newPlace = true;
    }
  }
  if (!dest) dest = recentGeo(c);
  if (!dest && sum.placeText && (!zone || fold(sum.placeText).includes(fold(zone)))) {
    const p = await geocodeAddress(sum.placeText);
    if (p) dest = { lat: p.lat, lng: p.lng, label: sum.placeText, approx: isBareCity(sum.placeText, cities) ? 'city' : 'place' };
  }
  if (!dest && named) {
    const p = await geocodeAddress(named);
    if (p) dest = { lat: p.lat, lng: p.lng, label: named, approx: 'city' };
  }
  const coarse = dest?.approx === 'city';

  if (delivery && (!dest || coarse)) {
    return askLocation(c, 'search_food', { category: food?.category ?? null, query: food?.query ?? null }, food?.label ?? null);
  }

  const args: Record<string, unknown> = { limit: 15 };
  if (zone) args.region = zone;
  if (dest && !coarse) {
    args.lat = dest.lat;
    args.lng = dest.lng;
  }
  if (food?.category) args.category = food.category;
  if (food?.query) args.query = food.query;
  const dishQuery = !food?.category && food?.query ? food.query : null;
  if (dishQuery) args.includeDishes = true;
  const res = await dirSearch(c, 'search_restaurants', args);
  if (!res.ok) return null;
  let cards = dishQuery
    ? res.cards.map((card) => ({ ...card, matchedDish: dishEvidence(card, dishQuery) })).filter((card) => card.matchedDish)
    : res.cards;
  const found = cards.length;
  if (!found && !opts.exclusion) return null;
  cards = cards.filter((card) => !isExcluded(card.nombre, excluded)).slice(0, 8);

  const cands = await evaluateCandidates(c, cards, food, dest);
  const pool = delivery ? cands.filter((x) => canDeliver(x.quote)) : cands;
  const rank = (x: Candidate) => (canDeliver(x.quote) ? 0 : x.quote?.kind === 'blocked' ? 3 : x.quote?.kind === 'none' || x.quote?.kind === 'no_tariff' ? 2 : 1);
  const byKm = (a: Candidate, b: Candidate) => (a.km ?? 1e9) - (b.km ?? 1e9);
  const sorted = [...pool].sort((a, b) => {
    if (cheap) return (a.cheapest?.price ?? 1e12) - (b.cheapest?.price ?? 1e12) || byKm(a, b);
    if (opts.recommend) return rank(a) - rank(b) || byKm(a, b);
    return byKm(a, b);
  });
  const n = Math.min(parseCount(c.t) ?? (opts.recommend ? 3 : 5), 5);
  const shown = sorted.slice(0, n);

  const foodName = food?.label ?? food?.query ?? food?.category ?? null;
  const what = foodName ? ` de *${foodName}*` : '';
  const where = zone ? ` en *${zone}*` : '';
  const placeLabel = dest?.label ? `*${dest.label}*` : null;
  const task: WaMasterTask = { food, zone, cheap, delivery, excluded, atMs: c.nowMs };
  const basePatch: Partial<WaMasterSummary> = {
    task,
    zone,
    activeRestaurant: null,
    activeAtMs: null,
    lastMenuView: null,
    brainPending: null,
    foodHint: food?.category ?? food?.query ?? null,
    ...(newPlace && dest
      ? {
          geo: { lat: dest.lat, lng: dest.lng, label: dest.label ?? null, atMs: c.nowMs, ...(dest.approx ? { approx: dest.approx } : {}) },
          placeText: dest.label ?? null,
        }
      : {}),
  };
  const droppedNames = (opts.exclusion?.names ?? []).map((nm) => {
    const known = [...(sum.lastRestaurants || []), ...(sum.activeRestaurant ? [sum.activeRestaurant] : [])].find((r) => fold(r.nombre) === nm);
    return `*${known?.nombre ?? nm.toUpperCase()}*`;
  });

  if (!shown.length) {
    const lines: string[] = [];
    if (delivery && cands.length) {
      const pickup = cands.filter((x) => x.quote?.kind === 'none' || x.quote?.kind === 'no_tariff').slice(0, 3);
      lines.push(
        `De los ${cands.length} restaurantes${what}${where} que veo, ninguno tiene delivery verificado${placeLabel ? ` hasta ${placeLabel}` : ''}.`,
        pickup.length
          ? `Para retirar en el local tienes: ${pickup.map((x) => `*${x.card.nombre}*`).join(', ')}.`
          : 'Si quieres, busco en otra zona o con otra comida.',
      );
    } else {
      lines.push(
        `No me quedan otros restaurantes${what}${where}${droppedNames.length ? ` aparte de ${droppedNames.join(', ')}` : ''} en el directorio de ${BRAND} ahora mismo.`,
        'Puedo buscar en otra zona o con otro tipo de comida, ¿cuál probamos?',
      );
    }
    return reply(c, 'search_food', [P(...lines)], { skipCompose: true, memoryPatch: { ...basePatch, lastRestaurants: [] } });
  }

  const header = opts.exclusion
    ? `Dejé fuera ${droppedNames.join(', ') || 'ese restaurante'}. Estos son otros restaurantes${what}${where}${cheap ? ', del precio más bajo al más alto' : ''}:`
    : delivery
      ? `Estos son ${shown.length} restaurantes${what}${where} que sí te llegan${placeLabel ? ` hasta ${placeLabel}` : ''}${cheap ? ', del precio más bajo al más alto' : ''}:`
      : opts.recommend
        ? `Te recomiendo ${shown.length === 1 ? 'este restaurante' : `estos ${shown.length} restaurantes`}${what}${where} (primero los que te llegan con delivery y quedan más cerca):`
        : cheap
          ? `Estos son restaurantes${what}${where}, del precio más bajo al más alto:`
          : `Estos son ${shown.length} restaurantes${what}${where}:`;
  const list = shown
    .map((x, i) => {
      const bits = [
        x.km != null ? `a ${km1(x.km)} km` : null,
        x.cheapest && x.snap ? `${foodName ?? 'lo más barato'} desde ${money(x.snap, x.cheapest.price)}` : null,
        deliveryTag(x),
      ].filter(Boolean);
      return `${i + 1}. *${x.card.nombre}* — ${bits.join(' · ')}`;
    })
    .join('\n');
  const approxNote =
    dest?.approx === 'place' && dest.label && shown.some((x) => x.quote?.kind === 'fee')
      ? `Calculé el delivery con la zona que me dijiste (*${dest.label}*), que es aproximada; con tu ubicación exacta lo afino.`
      : !dest || coarse
        ? 'Dime tu zona o comparte tu ubicación y te confirmo cuáles te llegan y cuánto cobran.'
        : null;
  return reply(
    c,
    'search_food',
    [P(header, list, approxNote, 'Dime cuál te interesa y te muestro su menú con precios, o pídeme «la más económica» para compararlas.')],
    { skipCompose: true, memoryPatch: { ...basePatch, lastRestaurants: shown.map((x) => x.ref) } },
  );
}

/**
 * This restaurant cannot serve the person (too far, no delivery): find the ones that can, with the
 * same food and city, checked against their real delivery rules — instead of leaving them stuck.
 */
async function alternativesNote(c: Ctx, exceptId: string, dest: Dest | null): Promise<string | null> {
  if (!dest || dest.approx === 'city') return null;
  const task = taskOf(c);
  const zone = cityOfPlace(dest.label) ?? task?.zone ?? c.memory.summary.zone ?? null;
  if (!zone) return null;
  const hint = c.memory.summary.foodHint;
  const food: TaskFood | null = task?.food ?? (hint ? { category: hint, query: null, label: hint } : null);
  const args: Record<string, unknown> = { limit: 10, region: zone, lat: dest.lat, lng: dest.lng };
  if (food?.category) args.category = food.category;
  if (food?.query) args.query = food.query;
  const res = await dirSearch(c, 'search_restaurants', args);
  if (!res.ok) return null;
  const cards = res.cards.filter((card) => card.id !== exceptId && !isExcluded(card.nombre, task?.excluded ?? [])).slice(0, 6);
  if (!cards.length) return null;
  const cands = (await evaluateCandidates(c, cards, food, dest)).filter((x) => canDeliver(x.quote));
  cands.sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
  const top = cands.slice(0, 3);
  if (!top.length) return null;
  const foodName = food?.label ?? food?.query ?? food?.category ?? null;
  return P(
    `Estos sí te llegan${foodName ? ` (de *${foodName}*)` : ''}${dest.label ? ` hasta *${dest.label}*` : ''}:`,
    top
      .map(
        (x) =>
          `• *${x.card.nombre}*${x.km != null ? ` — a ${km1(x.km)} km` : ''}${x.cheapest && x.snap ? ` · desde ${money(x.snap, x.cheapest.price)}` : ''} · ${deliveryTag(x)}`,
      )
      .join('\n'),
    'Dime cuál te interesa y te muestro su menú.',
  );
}

/** "¿Cuál es la más económica?" over the restaurants on the table: compares their real menus. */
async function crossCompareFlow(c: Ctx, dir: 'cheapest' | 'priciest'): Promise<BrainResult | null> {
  const sum = c.memory.summary;
  const task = taskOf(c);
  const refs = (sum.lastRestaurants || []).filter((r) => !isExcluded(r.nombre, task?.excluded ?? []));
  if (refs.length < 2) return null;
  const food = task?.food ?? null;
  const { dest } = await resolveDest(c);
  const coarse = dest?.approx === 'city';
  const loaded = (await Promise.all(refs.map(async (ref) => ({ ref, snap: await getSnapshot(c, ref) })))).filter(
    (x): x is { ref: WaMasterRestaurantRef; snap: MenuSnapshot } => Boolean(x.snap),
  );
  if (loaded.length < 2) return null;
  if (new Set(loaded.map((x) => x.snap.currency)).size > 1) {
    return reply(
      c,
      'search_food',
      [P('Estos restaurantes cobran en monedas distintas y no tengo una tasa verificable entre ellas, así que no los comparo por precio para no mezclar monedas.', 'Dime de cuál quieres ver los precios y te los detallo.')],
      { skipCompose: true },
    );
  }
  type Row = { ref: WaMasterRestaurantRef; snap: MenuSnapshot; product: MenuProduct; quote: ShopDeliveryQuote; km: number | null };
  let rows: Row[] = [];
  for (const { ref, snap } of loaded) {
    const best = (dir === 'cheapest' ? cheapestOf(foodPool(snap, food)) : [...foodPool(snap, food)].sort((a, b) => b.price - a.price)[0]) ?? null;
    if (!best) continue;
    const quote = quoteShopDelivery(snap.delivery, coarse ? null : dest, best.price, snap.convert);
    const km = dest && !coarse && snap.delivery.origin ? Math.round((haversineKm(snap.delivery.origin, dest) ?? 0) * 10) / 10 : null;
    rows.push({ ref, snap, product: best, quote, km });
  }
  if (task?.delivery) rows = rows.filter((r) => canDeliver(r.quote));
  if (!rows.length) return null;
  rows.sort((a, b) => (dir === 'cheapest' ? a.product.price - b.product.price : b.product.price - a.product.price) || (a.km ?? 1e9) - (b.km ?? 1e9) || a.ref.nombre.localeCompare(b.ref.nombre, 'es'));
  const win = rows[0];
  const foodName = food?.label ?? food?.query ?? 'productos';
  const line = (r: Row) => `• ${r.product.nombre} — ${money(r.snap, r.product.price)} en *${r.ref.nombre}*${r.km != null ? ` (a ${km1(r.km)} km)` : ''}`;
  let total: string | null = null;
  if (win.quote.kind === 'fee') {
    const fee = win.quote.free ? 0 : win.quote.fee;
    total = `Con delivery${dest?.label ? ` hasta *${dest.label}*` : ''}: ${money(win.snap, win.product.price)} + ${money(win.snap, fee)} = *${money(win.snap, win.product.price + fee)}*${dest?.approx === 'place' ? ' (tarifa calculada con la zona que me dijiste, aproximada)' : ''}.`;
  } else if (win.quote.kind === 'needs_location' || coarse || !dest) {
    total = 'Dime tu zona exacta o comparte tu ubicación y te calculo el total con delivery.';
  } else if (win.quote.kind === 'blocked') {
    total = `Ojo: *${win.ref.nombre}* no te llega con delivery (${win.quote.reason}).`;
  } else if (win.quote.kind === 'none' || win.quote.kind === 'no_tariff') {
    total = `*${win.ref.nombre}* no hace delivery: sería para retirar en el local.`;
  }
  const rest = rows.slice(1, 3);
  return reply(
    c,
    'search_food',
    [
      P(
        `${dir === 'cheapest' ? 'Lo más económico' : 'Lo más caro'} en ${foodName} entre estas ${rows.length} opciones:`,
        line(win),
        rest.length ? `Le ${rest.length === 1 ? 'sigue' : 'siguen'}:\n${rest.map(line).join('\n')}` : null,
        total,
      ),
    ],
    {
      skipCompose: true,
      memoryPatch: {
        activeRestaurant: win.ref,
        activeAtMs: c.nowMs,
        lastRestaurants: keepList(c, win.ref),
        lastMenuView: { slug: win.snap.slug, category: win.product.categoria || null, productIds: [win.product.id], atMs: c.nowMs },
        brainPending: null,
      },
    },
  );
}

export async function runCentralBrain(params: BrainParams): Promise<BrainResult | null> {
  const out = await runCentralBrainInner(params);
  // The restaurant we are "on" expires: stamp it whenever the brain (re)selects or clears one.
  if (out && 'activeRestaurant' in out.memoryPatch && !('activeAtMs' in out.memoryPatch)) {
    out.memoryPatch = { ...out.memoryPatch, activeAtMs: out.memoryPatch.activeRestaurant ? params.nowMs : null };
  }
  // The brain never executes legacy admin proposals; a stale one must not block it
  // (or resurface later), so drop it as soon as the brain owns the turn.
  if (out && params.memory.summary.pendingAdminProposal) {
    out.memoryPatch = { ...(out.memoryPatch || {}), pendingAdminProposal: null };
  }
  return out;
}

async function runCentralBrainInner(params: BrainParams): Promise<BrainResult | null> {
  const { memory, identity, text } = params;
  const sum = memory.summary;

  // Legacy multi-step flows keep their own logic.
  if (sum.pendingQuestion === 'business_name' || sum.pendingQuestion === 'comercio_select') return null;

  const shops = identity.comercios || [];
  const t = fold(text);
  const tr0 = classifyCentralTopic({ text, hasShops: shops.length > 0 });
  const c: Ctx = { ...params, tr: tr0, t, shops, tools: [] };

  // A photo / PDF the vision model already described (payment receipt, dish, menu, …).
  const imageTurn = parseImageTurn(text);
  if (imageTurn) return imageFlow(c, imageTurn, params);

  // The role follows THIS turn's words: an owner's command must never be read as a diner's
  // zone answer / list pick left over from an earlier consumer conversation.
  const inOwnerThread =
    sum.activeService === 'admin' &&
    (Boolean(sum.brainPending?.kind === 'offer' && params.nowMs - sum.brainPending.atMs <= BRAIN_PENDING_TTL_MS) ||
      Boolean(sum.lastHandoffAtMs && params.nowMs - sum.lastHandoffAtMs <= BRAIN_PENDING_TTL_MS));
  const merchantVoice = detectMerchantVoice(text, shops.length > 0, inOwnerThread);
  if (merchantVoice && isBareOwnerStatement(text)) {
    return ownerWelcome(c);
  }

  // "Empecemos de nuevo": the previous task (restaurant, list, exclusions, open question) is dropped;
  // where the person is and what they like are kept — they never asked to forget those.
  if (!merchantVoice) {
    const rs = detectReset(text);
    if (rs.reset) {
      const resetPatch: Partial<WaMasterSummary> = {
        activeRestaurant: null,
        activeAtMs: null,
        lastRestaurants: [],
        lastMenuView: null,
        brainPending: null,
        task: null,
        foodHint: null,
      };
      if (fold(rs.rest).length >= 3) {
        const out = await runCentralBrainInner({
          ...params,
          text: rs.rest,
          memory: { ...memory, summary: { ...sum, ...resetPatch } },
        });
        if (out) {
          return {
            ...out,
            replies: out.replies.length ? [`Listo, empezamos de nuevo 🙌\n\n${out.replies[0]}`, ...out.replies.slice(1)] : out.replies,
            memoryPatch: { ...resetPatch, ...out.memoryPatch },
          };
        }
      }
      const place = sum.placeText || sum.geo?.label || null;
      return reply(
        c,
        'greeting',
        [
          P(
            `Listo, empezamos de nuevo 🙌${place ? ` Sigo con tu ubicación (*${place}*).` : ''}`,
            '¿Qué se te antoja y en qué ciudad lo buscamos?',
          ),
        ],
        { skipCompose: true, memoryPatch: resetPatch },
      );
    }
  }

  const pending: WaMasterBrainPending | null =
    !merchantVoice && sum.brainPending && params.nowMs - sum.brainPending.atMs <= BRAIN_PENDING_TTL_MS
      ? sum.brainPending
      : null;

  // The person is working with one restaurant: questions about its products, prices, variants,
  // totals and budget are answered from its real menu — before anything else can swallow them
  // (a pending "where are you?" would read "las 3 más baratas" as an address).
  const knownRefs = [...(sum.lastRestaurants || []), ...(sum.activeRestaurant ? [sum.activeRestaurant] : [])];

  // An explicit new intent beats whatever the previous search left behind: "no quiero X, busca
  // otros", "tres opciones con delivery en…", "recomiéndame tres restaurantes", "¿cuál es la más barata?".
  if (!merchantVoice && !extractCoords(text)) {
    const deliveryQ = isDeliveryQuestion(t) && !isRestaurantListAsk(t);
    const searchTopics: string[] = ['search_food', 'browse_directory', 'open_now', 'delivery_find', 'menu_of', 'unknown'];
    const topicOk = searchTopics.includes(tr0.topic);
    const exclusion = topicOk ? detectExclusion(text, knownRefs) : null;
    const hasActive = Boolean(activeRef(c));
    const listAsk = isRestaurantListAsk(t);
    const others = wantsOthers(t) || /\brestaurantes?\b/.test(t);
    const smart =
      topicOk &&
      !deliveryQ &&
      (Boolean(exclusion) ||
        (listAsk &&
          (!hasActive || others) &&
          (Boolean(parseCount(t)) ||
            wantsCheap(t) ||
            wantsDeliveryFilter(t) ||
            wantsOthers(t) ||
            /\b(recomiend\w*|recomend\w*|sugier\w*)\b/.test(t) ||
            Boolean(taskOf(c)))) ||
        (tr0.topic === 'search_food' && tr0.cities.length > 0 && (wantsCheap(t) || wantsDeliveryFilter(t))));
    if (smart) {
      // "No quiero X, quiero la de Y": pick Y (X stays out of this task).
      const picked = exclusion
        ? knownRefs.find((r) => !exclusion.ids.includes(r.id) && mentionsRestaurant(t, r.nombre))
        : null;
      if (picked) {
        const out = await selectRestaurant(c, picked);
        const prevTask = taskOf(c);
        if (prevTask) {
          out.memoryPatch = {
            ...out.memoryPatch,
            task: { ...prevTask, excluded: [...new Set([...prevTask.excluded, ...exclusion!.names])], atMs: c.nowMs },
          };
        }
        return out;
      }
      const out = await smartSearchFlow(c, { exclusion, recommend: /\b(recomiend\w*|recomend\w*|sugier\w*)\b/.test(t) });
      if (out) return out;
    }
    const cross = crossAsk(t);
    if (
      cross &&
      !deliveryQ &&
      (sum.lastRestaurants || []).length >= 2 &&
      (!hasActive || /\b(entre (estas|esas|ellas|los|las)|de las opciones|de estos|de esos)\b/.test(t)) &&
      !knownRefs.some((r) => mentionsRestaurant(t, r.nombre))
    ) {
      const out = await crossCompareFlow(c, cross);
      if (out) return out;
    }
  }

  const otherMentioned = knownRefs.find((r) => r.id !== sum.activeRestaurant?.id && mentionsRestaurant(t, r.nombre));
  const menuRef = otherMentioned ?? activeRef(c);
  const searchish =
    (tr0.topic === 'search_food' || tr0.topic === 'browse_directory' || tr0.topic === 'open_now') && tr0.cities.length > 0;
  if (
    menuRef &&
    !merchantVoice &&
    !searchish &&
    !extractCoords(text) &&
    !(looksLikeAddress(text) && (pending?.kind === 'delivery' || pending?.kind === 'zone'))
  ) {
    const menuOut = await menuTurn(c, menuRef);
    if (menuOut) return menuOut;
  }

  // They named one of the restaurants we listed ("me interesa Bladi Jaiper"): that is the pick —
  // never a new search (a name like "Hamburguesería X" contains "hamburguesa").
  if (
    !merchantVoice &&
    !isDeliveryQuestion(t) &&
    !extractCoords(text) &&
    (['menu_of', 'search_food', 'browse_directory', 'open_now', 'unknown'] as string[]).includes(tr0.topic)
  ) {
    const named = (sum.lastRestaurants || []).find((r) => mentionsRestaurant(t, r.nombre));
    if (named) return selectRestaurant(c, named);
  }

  // We asked where they are to quote a restaurant's delivery: location or address answers it.
  if (pending?.kind === 'delivery' && pending.comercioId) {
    const ref =
      (sum.lastRestaurants || []).find((r) => r.id === pending.comercioId) ??
      (sum.activeRestaurant?.id === pending.comercioId ? sum.activeRestaurant : undefined);
    if (ref) {
      let point: Dest | null = extractCoords(text);
      const addressLike =
        looksLikeAddress(text) ||
        (tr0.topic === 'unknown' &&
          t.length <= 200 &&
          t.length >= 4 &&
          !/^(no|nada|gracias|ok|okey|listo|dale|si|olvidalo|cancel\w*|luego|despues|mas tarde)\b/.test(t));
      if (!point && addressLike) point = await geocodeAddress(text);
      if (point && pending.topic === 'menu_total') {
        const total = await totalFromView(c, ref, point);
        if (total) return total;
      }
      if (point) return deliveryFlow(c, ref, point, { fresh: true });
      if (addressLike) {
        return reply(
          c,
          'delivery_find',
          [
            P(
              'No logré ubicar esa dirección 🤔',
              `Pruébala con sector y ciudad, o ${LOCATION_HOWTO}.`,
            ),
          ],
          { memoryPatch: { brainPending: { ...pending, atMs: c.nowMs } } },
        );
      }
    }
  }

  // A shared WhatsApp location (current or live), a maps link or raw coordinates.
  const sharedPoint = merchantVoice ? null : extractCoords(text);
  if (sharedPoint) {
    return nearbyFlow(c, sharedPoint, pending?.kind === 'zone' ? pending : null);
  }

  // A typed address / sector in answer to "where are you?" (or clearly describing a place).
  if (
    pending?.kind === 'zone' &&
    t.length <= 200 &&
    (pending.near || looksLikeAddress(text)) &&
    !CITY_ONLY(t, tr0.cities)
  ) {
    const point = await geocodeAddress(text);
    if (point) return nearbyFlow(c, point, pending);
    if (pending.near) {
      return reply(
        c,
        (pending.topic as CentralTopic) || 'search_food',
        [
          P(
            'No logré ubicar esa dirección 🤔',
            'Prueba escribiéndola con el sector y la ciudad (por ejemplo «Av. Bolívar Norte, urbanización La Viña, Valencia»), o compárteme tu *ubicación actual* desde el clip 📎 → *Ubicación*.',
          ),
        ],
        { memoryPatch: { brainPending: { ...pending, atMs: c.nowMs } } },
      );
    }
  }

  // Pending follow-ups first (short answers to our last question).
  if (pending) {
    if (pending.kind === 'offer') {
      if (AFFIRM.test(t) && t.length < 40 && pending.url) {
        return reply(c, 'merchant_ops', [`Aquí lo tienes de nuevo: ${pending.url}\n\nInicia sesión ahí y continúa; ya tiene el contexto de tu solicitud.`], {
          memoryPatch: { brainPending: null },
        });
      }
      if (PANEL.test(t) && t.length < 40 && pending.panelHint) {
        return reply(c, 'merchant_ops', [`Perfecto: ${pending.panelHint}. Si te atoras, me avisas.`], {
          memoryPatch: { brainPending: null },
        });
      }
    }
    if (pending.kind === 'zone' && (tr0.topic === 'unknown' || tr0.topic === 'coverage' || tr0.topic === 'how_start') && t.length <= 60) {
      const zone = extractCities(t)[0] || cleanName(text) || null;
      if (zone) {
        const topic = (['search_food', 'browse_directory', 'open_now', 'delivery_find'] as const).includes(pending.topic as never)
          ? (pending.topic as 'search_food' | 'browse_directory' | 'open_now' | 'delivery_find')
          : 'browse_directory';
        const out = await foodFlow(c, topic, {
          zone,
          category: pending.category,
          query: pending.query,
          label: pending.query || pending.category || null,
          openOnly: pending.openOnly,
        });
        out.memoryPatch = { ...out.memoryPatch, zone };
        return out;
      }
    }
    if (
      pending.kind === 'name' &&
      (tr0.topic === 'unknown' || tr0.topic === 'menu_of' || tr0.topic === 'contact_of' || tr0.topic === 'how_start') &&
      t.length <= 80
    ) {
      const name = extractRestaurantName(text) || cleanName(text);
      if (name && pending.topic === 'delivery_find') {
        const { card } = await findByName(c, name);
        if (card) {
          let dest: { lat: number; lng: number; label?: string | null } | null = recentGeo(c);
          if (!dest && looksLikeAddress(text)) dest = await geocodeAddress(text);
          return deliveryFlow(c, toRefs([card], c.config)[0], dest, { fresh: false });
        }
        return reply(
          c,
          'delivery_find',
          [P(`No ubico un restaurante llamado *${name}* 🤔`, '¿Me das el nombre exacto o la ciudad?')],
          { memoryPatch: { brainPending: { ...pending, atMs: c.nowMs } } },
        );
      }
      if (name) {
        const topic = (['menu_of', 'contact_of', 'hours_of', 'payments', 'restaurant_assistant'] as const).includes(pending.topic as never)
          ? (pending.topic as CentralTopic)
          : 'menu_of';
        return restaurantFlow(c, topic, name);
      }
    }
  }

  // Ordinal pick from a list we just showed ("la segunda", "2").
  const last = sum.lastRestaurants || [];
  if (!merchantVoice && last.length && (/\b(la |el )?(primera|primero|segunda|segundo|tercera|tercero)\b/.test(t) || /^[1-5]$/.test(t.trim()))) {
    const idx = /primer|^1$/.test(t) ? 0 : /segund|^2$/.test(t) ? 1 : /tercer|^3$/.test(t) ? 2 : Number(t.trim()) - 1;
    const pick = last[idx] || last[0];
    if (pick) return selectRestaurant(c, pick);
  }

  // Bare digit with no open question: never invent a menu — ask naturally.
  if (/^[0-9]$/.test(t.trim())) {
    return reply(c, 'greeting', ['Disculpa, no te entendí. Explícame mejor qué necesitas, porfa.'], {
      memoryPatch: { brainPending: null },
    });
  }

  const topic = tr0.topic;
  const clearPending = { brainPending: null } as Partial<WaMasterSummary>;
  const finish = (r: BrainResult | null): BrainResult | null => {
    if (!r) return r;
    if (!('brainPending' in r.memoryPatch)) r.memoryPatch = { ...r.memoryPatch, ...clearPending };
    return r;
  };

  if (merchantVoice && CONSUMER_FLAVOURED.has(topic)) {
    const out = await merchantFlow(c, inferMerchantDomain(text), 'ops');
    out.memoryPatch = { ...out.memoryPatch, lastRestaurants: [], zone: null };
    return out;
  }

  // "¿Hacen delivery hasta mi casa y cuánto cobran?": answer from the restaurant's real tariff.
  if (!merchantVoice && isDeliveryQuestion(t)) {
    const out = await deliveryQuestionFlow(c);
    if (out) return out;
  }

  // "Restaurantes cerca de mí": ask for the live location / address (or reuse a fresh one).
  const nearTopics = ['search_food', 'browse_directory', 'open_now', 'delivery_find'] as const;
  type NearTopic = (typeof nearTopics)[number];
  const isNearTopic = (nearTopics as readonly string[]).includes(topic);
  if ((isNearTopic || topic === 'unknown') && NEAR_ME.test(t) && tr0.cities.length === 0) {
    const nearTopic: NearTopic = isNearTopic ? (topic as NearTopic) : 'browse_directory';
    const extra: Partial<WaMasterBrainPending> = {
      category: tr0.food?.category ?? null,
      query: tr0.food?.query ?? null,
      openOnly: topic === 'open_now',
    };
    let geo = recentGeo(c);
    if (!geo && looksLikeAddress(text)) geo = await geocodeAddress(text);
    if (!geo) return askLocation(c, nearTopic, extra);
    return nearbyFlow(c, geo, { kind: 'zone', near: true, topic: nearTopic, atMs: c.nowMs, ...extra });
  }

  switch (topic) {
    case 'human_now':
      return {
        ...reply(c, topic, []),
        specialist: 'support',
        intent: 'support.human',
        escalateHuman: true,
        memoryPatch: { ...clearPending, humanIntervened: true },
      };
    case 'search_food': {
      const zone = tr0.cities[0] || null;
      if (!zone) {
        return finish(
          await locationGate(
            c,
            'search_food',
            { category: tr0.food?.category ?? null, query: tr0.food?.query ?? null },
            tr0.food?.label ?? null,
          ),
        );
      }
      return finish(
        await foodFlow(c, 'search_food', {
          zone,
          category: tr0.food?.category,
          query: tr0.food?.query,
          label: tr0.food?.label,
        }),
      );
    }
    case 'browse_directory': {
      const r = await foodFlow(c, 'browse_directory', { zone: tr0.cities[0] || null });
      if (/\b(mi negocio|mi emprendimiento|para mi)\b/.test(t) && r.replies[0]) {
        r.replies = [P(r.replies[0], 'Y para tu negocio, cuéntame qué tipo de comercio es y cómo recibes pedidos hoy.')];
      }
      return finish(r);
    }
    case 'open_now': {
      if (!tr0.cities[0]) {
        return finish(await locationGate(c, 'open_now', { openOnly: true }, null));
      }
      return finish(await foodFlow(c, 'open_now', { zone: tr0.cities[0] || null, openOnly: true }));
    }
    case 'delivery_find': {
      if (/\b(cuanto cuesta|costo|tarifa|precio)\b/.test(t)) {
        return finish(
          reply(c, topic, [
            P(
              'La tarifa del delivery la define cada restaurante según tu zona, así que necesito saber de cuál hablamos.',
              'Dime el nombre del restaurante y te calculo cuánto te cobraría hasta donde estás.',
            ),
          ], { memoryPatch: { brainPending: { kind: 'name', topic: 'delivery_find', atMs: c.nowMs } } }),
        );
      }
      const zone = tr0.cities[0] || null;
      if (!zone) {
        return finish(
          await locationGate(
            c,
            'delivery_find',
            { query: tr0.food?.query ?? null, category: tr0.food?.category ?? null },
            tr0.food?.label ?? null,
          ),
        );
      }
      return finish(
        await foodFlow(c, 'delivery_find', {
          zone,
          category: tr0.food?.category,
          query: tr0.food?.query,
          label: tr0.food?.label,
        }),
      );
    }
    case 'menu_of':
    case 'contact_of':
    case 'hours_of':
    case 'payments':
    case 'restaurant_assistant': {
      if (topic === 'payments' && !tr0.restaurantName && tr0.paymentHint) {
        const { ok, cards } = await dirSearch(c, 'filter_restaurants', { payment: tr0.paymentHint, region: tr0.cities[0] });
        if (ok && cards.length) {
          return finish(
            reply(c, topic, [
              P(`Estos restaurantes publican *${tr0.paymentHint}*:`, bulletList(cards, c.config)),
            ], { memoryPatch: { lastRestaurants: toRefs(cards, c.config) } }),
          );
        }
        if (ok) {
          return finish(
            reply(c, topic, [
              P(
                `No veo restaurantes que tengan *${tr0.paymentHint}* publicado en el directorio ahora mismo.`,
                'Si me dices un restaurante en concreto, reviso los métodos que tenga.',
              ),
            ]),
          );
        }
      }
      return finish(await restaurantFlow(c, topic, tr0.restaurantName || null));
    }
    case 'coverage':
      return finish(await coverageFlow(c));
    case 'pricing':
      return finish(pricingFlow(c));
    case 'register':
      return finish(registerFlow(c));
    case 'example_menu':
      return finish(await exampleMenu(c));
    case 'feature':
      return finish(await featureFlow(c, topic));
    case 'assistant_info':
      return finish(await assistantInfo(c));
    case 'merchant_ops':
      return finish(await merchantFlow(c, tr0.domain || 'settings', 'ops'));
    case 'merchant_report':
      return finish(await merchantFlow(c, 'settings', 'report'));
    case 'merchant_account':
      return finish(await merchantFlow(c, 'settings', 'account'));
    case 'merchant_diag': {
      if (/\b(sin entrar al panel|desde el chat|resolverlo por aqui)\b/.test(t)) {
        const shop = pickShop(c);
        const url = await businessHandoff(c, { intent: 'admin.settings', pendingOp: 'admin_help', shop });
        return finish(
          reply(c, topic, [
            P(
              shop ? `Vale, veo que *${shop.publicName}* está registrado con nosotros.` : 'Por este número no veo un negocio registrado.',
              'Muchos cambios (precios, productos, disponibilidad, tasa) los puedes hacer conversando con el asistente del negocio, sin navegar el panel. Por seguridad yo, desde este chat, no modifico nada sin verificar tu sesión.',
              url ? `Entra aquí, inicia sesión y dile qué necesitas; ya tiene el contexto de esta conversación:\n${url}` : 'Entra a app.elmenuxfa.com para hacerlo.',
            ),
          ], {
            memoryPatch: {
              ...(shop ? { selectedComercioId: shop.comercioId } : {}),
              brainPending: url ? { kind: 'offer', topic, url, atMs: c.nowMs } : null,
            },
          }),
        );
      }
      const generic = !/\b(funcionando|visible|aparecen|pendiente|revisar|notificaciones|no puede|asistente no|resolverlo|chat)\b/.test(t);
      if (generic && shops.length && /\b(ya tengo|necesito ayuda|ya les explique|tienen esa informacion)\b/.test(t)) {
        const shop = pickShop(c)!;
        const resumed = /\bya les explique|tienen esa informacion\b/.test(t);
        return finish(
          reply(c, topic, [
            P(
              `Vale, veo que *${shop.publicName}* está registrado con nosotros.`,
              resumed
                ? 'Esta conversación queda guardada, así que no tienes que repetirlo todo: cuéntame en una línea qué pasaba y lo retomo. Si ya tenías un caso abierto con un asesor, escribe *asesor* y lo conecto con el contexto.'
                : '¿Qué necesitas: cambiar algo del menú (precios, productos, tasa, horario), revisar pedidos o ver tus enlaces? Cuéntame y lo resolvemos.',
            ),
          ], { memoryPatch: { selectedComercioId: shop.comercioId } }),
        );
      }
      return finish(await merchantFlow(c, 'settings', 'diag'));
    }
    case 'merchant_access': {
      if (/\basistente\b/.test(t)) {
        const shop = pickShop(c);
        const url = await businessHandoff(c, { intent: 'admin.settings', pendingOp: 'admin_help', shop });
        return finish(
          reply(c, topic, [
            P(
              shop ? `Vale, veo que *${shop.publicName}* está registrado con nosotros.` : 'Por este número no veo un negocio registrado, pero igual puedes entrar con tu cuenta.',
              url
                ? `El asistente del negocio está aquí; inicia sesión con tu cuenta y ya tiene el contexto de esta conversación:\n${url}`
                : 'El asistente del negocio está en app.elmenuxfa.com/asistente: inicia sesión con tu cuenta.',
              'No me pases claves ni códigos por WhatsApp.',
            ),
          ], {
            memoryPatch: {
              ...(shop ? { selectedComercioId: shop.comercioId } : {}),
              brainPending: url ? { kind: 'offer', topic, url, atMs: c.nowMs } : null,
            },
          }),
        );
      }
      return finish(
        reply(c, topic, [
          P(
            'Para entrar usa solo el acceso oficial: app.elmenuxfa.com. Por WhatsApp no pido ni recibo contraseñas, tokens ni códigos de verificación.',
            'Si no logras entrar o recuperar el acceso, escribe *asesor* y registro tu caso para que una persona te ayude a verificar tu cuenta.',
          ),
        ]),
      );
    }
    case 'greeting':
    case 'thanks':
    case 'what_is':
    case 'who_are_you':
    case 'official_number':
    case 'how_start':
    case 'no_app':
    case 'vs_apps':
    case 'order_by_chat':
    case 'support_info':
    case 'sensitive':
    case 'order_issue':
    case 'link_broken':
    case 'order_howto':
    case 'consumer_howto':
      return finish(staticTopic(c, topic));
    default:
      return null;
  }
}

export { ADVISOR_OFFER };
