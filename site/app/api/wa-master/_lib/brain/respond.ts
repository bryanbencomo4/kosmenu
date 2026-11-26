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
} from '../types';
import { ADVISOR_OFFER, matchFeature, pricingNote } from './kb';
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
    .map((c) => `• *${c.nombre}* (${openWord(c)})\n  ${absMenu(c, config)}`)
    .join('\n');
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
  const patch = { lastRestaurants: refs, brainPending: null };

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
  // menu_of
  return reply(
    c,
    topic,
    [
      P(
        `Este es el menú de *${card.nombre}*: ${url}`,
        card.chatUrl ? `Y si quieres que te oriente con sus platos, tiene asistente: ${card.chatUrl}` : null,
        'Ahí eliges tus productos y completas el pedido (delivery o retiro, según lo que tenga activo).',
      ),
    ],
    { memoryPatch: patch },
  );
}

async function foodFlow(c: Ctx, topic: 'search_food' | 'browse_directory' | 'open_now' | 'delivery_find', opts: {
  zone: string | null;
  category?: string | null;
  query?: string | null;
  label?: string | null;
  openOnly?: boolean;
}): Promise<BrainResult> {
  const { zone } = opts;
  const args: Record<string, unknown> = { limit: 5 };
  if (zone) args.region = zone;
  if (opts.category) args.category = opts.category;
  if (opts.query) args.query = opts.query;
  const tool = opts.openOnly ? 'filter_restaurants' : 'search_restaurants';
  if (opts.openOnly) args.openOnly = true;
  const { ok, cards } = await dirSearch(c, tool, args);
  if (!ok) {
    return reply(c, topic, [
      'Ahora mismo no logro consultar el directorio. Intenta de nuevo en un momento, o escribe *asesor* y te ayuda una persona.',
    ]);
  }
  const what = opts.label ? `*${opts.label}*` : 'lo que buscas';
  const where = zone ? ` en *${zone}*` : '';
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
  const intro = opts.openOnly
    ? `Estos son los que veo abiertos${where}:`
    : opts.label
      ? `Encontré estas opciones de ${what}${where}:`
      : `Estos son algunos restaurantes${where}:`;
  const followZone = !zone && cards.length >= 5;
  const follow = followZone
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
  const withShop = P(
    intro,
    `Para *${copy.need}*, ${copy.panel}.`,
    url
      ? `Y si prefieres que lo hagamos juntos, el asistente del negocio ya tiene tu solicitud: inicia sesión aquí y lo resolvemos paso a paso:\n${url}`
      : null,
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

export async function runCentralBrain(params: BrainParams): Promise<BrainResult | null> {
  const { memory, identity, text } = params;
  const sum = memory.summary;

  // Legacy multi-step flows keep their own logic.
  if (sum.pendingAdminProposal) return null;
  if (sum.pendingQuestion === 'business_name' || sum.pendingQuestion === 'comercio_select') return null;

  const shops = identity.comercios || [];
  const t = fold(text);
  const tr0 = classifyCentralTopic({ text, hasShops: shops.length > 0 });
  const c: Ctx = { ...params, tr: tr0, t, shops, tools: [] };

  const pending: WaMasterBrainPending | null =
    sum.brainPending && params.nowMs - sum.brainPending.atMs <= BRAIN_PENDING_TTL_MS ? sum.brainPending : null;

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
  if (last.length && (/\b(la |el )?(primera|primero|segunda|segundo|tercera|tercero)\b/.test(t) || /^[1-5]$/.test(t.trim()))) {
    const idx = /primer|^1$/.test(t) ? 0 : /segund|^2$/.test(t) ? 1 : /tercer|^3$/.test(t) ? 2 : Number(t.trim()) - 1;
    const pick = last[idx] || last[0];
    if (pick) {
      return reply(c, 'menu_of', [
        P(
          `Perfecto, *${pick.nombre}*: ${pick.menuUrl}`,
          pick.chatUrl ? `Y su asistente virtual, por si quieres preguntarle algo: ${pick.chatUrl}` : null,
          'Ahí eliges tus productos y completas el pedido.',
        ),
      ], { memoryPatch: { brainPending: null } });
    }
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
    case 'open_now':
      return finish(await foodFlow(c, 'open_now', { zone: tr0.cities[0] || null, openOnly: true }));
    case 'delivery_find': {
      if (/\b(cuanto cuesta|costo|tarifa|precio)\b/.test(t)) {
        return finish(
          reply(c, topic, [
            P(
              'La tarifa del delivery la define cada restaurante según tu zona; la ves en su menú al elegir delivery.',
              'Dime cuál restaurante (o tu zona) y te paso el menú.',
            ),
          ]),
        );
      }
      const zone = tr0.cities[0] || null;
      if (!zone) {
        return askZone(
          c,
          'delivery_find',
          'Reviso qué negocios tienen delivery para tu zona. ¿En qué ciudad o sector necesitas recibir el pedido?',
          { query: tr0.food?.query ?? null, category: tr0.food?.category ?? null },
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
