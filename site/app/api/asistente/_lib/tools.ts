/**
 * Discovery assistant tools — directory-backed only.
 * Never invent open/accepts-orders; reuse real isOpen/openLabel/currencies/paymentChannels.
 */

import {
  buildDiscoveryChatUrl,
  canOfferDiscoveryChatLink,
} from '../../../_lib/discovery-assistant';
import {
  listClientDirectory,
  type ClientDirectoryBusiness,
} from '../../_lib/public-directory';

export type DiscoveryRestaurantCard = {
  id: string;
  slug: string;
  nombre: string;
  logoUrl: string | null;
  categoria: string | null;
  zona: string | null;
  isOpen: boolean | null;
  openLabel: string | null;
  menuUrl: string;
  chatUrl?: string;
  distanceKm: number | null;
  currencies: string[];
  paymentChannels: string[];
  acceptsVesBcv: boolean;
};

export type DiscoveryToolContext = {
  lat?: number;
  lng?: number;
  region?: string;
  pageSize?: number;
  /** Injectable for tests. */
  listDirectory?: typeof listClientDirectory;
};

export const DISCOVERY_TOOL_DECLARATIONS = [
  {
    name: 'search_restaurants',
    description:
      'Search the public restaurant directory by query, category, region, or proximity.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Free-text dish or restaurant name' },
        category: {
          type: 'STRING',
          description:
            'Directory category chip id: hamburguesas, tacos, pizzas, criolla, sushi, cafe, postres, bares',
        },
        region: { type: 'STRING', description: 'Venezuela region / state label' },
        lat: { type: 'NUMBER' },
        lng: { type: 'NUMBER' },
        limit: { type: 'NUMBER' },
        offset: { type: 'NUMBER' },
      },
    },
  },
  {
    name: 'filter_restaurants',
    description:
      'Filter directory results by open status, currency, or payment channel using real fields only.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING' },
        category: { type: 'STRING' },
        region: { type: 'STRING' },
        lat: { type: 'NUMBER' },
        lng: { type: 'NUMBER' },
        openOnly: { type: 'BOOLEAN', description: 'Keep only isOpen===true' },
        currency: { type: 'STRING', description: 'USD | VES | COP' },
        payment: { type: 'STRING', description: 'Payment channel chip substring' },
        limit: { type: 'NUMBER' },
        offset: { type: 'NUMBER' },
      },
    },
  },
  {
    name: 'get_restaurant_public_info',
    description: 'Lookup one restaurant by slug or id inside the public directory.',
    parameters: {
      type: 'OBJECT',
      properties: {
        slug: { type: 'STRING' },
        id: { type: 'STRING' },
      },
    },
  },
  {
    name: 'prepare_restaurant_links',
    description:
      'Build public menu URL and optional chat URL (only when chatbot UX + preview allow).',
    parameters: {
      type: 'OBJECT',
      properties: {
        slug: { type: 'STRING' },
      },
      required: ['slug'],
    },
  },
] as const;

function zonaLabel(entry: ClientDirectoryBusiness): string | null {
  return (
    entry.zonaOperacion ||
    entry.direccion ||
    null
  );
}

export function toDiscoveryRestaurantCard(
  entry: ClientDirectoryBusiness,
  options?: { includeChatLink?: boolean },
): DiscoveryRestaurantCard {
  const card: DiscoveryRestaurantCard = {
    id: entry.id,
    slug: entry.slug,
    nombre: entry.nombre,
    logoUrl: entry.logoUrl,
    categoria: entry.categoria,
    zona: zonaLabel(entry),
    isOpen: entry.isOpen,
    openLabel:
      entry.isOpen === null
        ? 'Horario no confirmado'
        : entry.openLabel,
    menuUrl: entry.menuUrl,
    distanceKm: entry.distanceKm,
    currencies: entry.currencies ?? [],
    paymentChannels: entry.paymentChannels ?? [],
    acceptsVesBcv: entry.acceptsVesBcv === true,
  };
  if (options?.includeChatLink !== false && canOfferDiscoveryChatLink(entry.slug)) {
    card.chatUrl = buildDiscoveryChatUrl(entry.slug);
  }
  return card;
}

function listFn(ctx: DiscoveryToolContext) {
  return ctx.listDirectory ?? listClientDirectory;
}

async function searchRaw(
  ctx: DiscoveryToolContext,
  args: {
    query?: string;
    category?: string;
    region?: string;
    lat?: number;
    lng?: number;
    limit?: number;
    offset?: number;
  },
) {
  const pageSize = Math.min(
    Math.max(args.limit ?? ctx.pageSize ?? 24, 1),
    120,
  );
  return listFn(ctx)({
    query: args.query,
    category: args.category,
    region: args.region ?? ctx.region,
    lat: args.lat ?? ctx.lat,
    lng: args.lng ?? ctx.lng,
    limit: pageSize,
    offset: args.offset ?? 0,
  });
}

export async function executeDiscoveryTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: DiscoveryToolContext,
): Promise<{
  ok: boolean;
  tool: string;
  text?: string;
  restaurants?: DiscoveryRestaurantCard[];
  total?: number;
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  restaurant?: DiscoveryRestaurantCard | null;
  menuUrl?: string;
  chatUrl?: string | null;
  error?: string;
}> {
  const args = rawArgs || {};

  if (name === 'search_restaurants') {
    const payload = await searchRaw(ctx, {
      query: typeof args.query === 'string' ? args.query : undefined,
      category: typeof args.category === 'string' ? args.category : undefined,
      region: typeof args.region === 'string' ? args.region : undefined,
      lat: typeof args.lat === 'number' ? args.lat : undefined,
      lng: typeof args.lng === 'number' ? args.lng : undefined,
      limit: typeof args.limit === 'number' ? args.limit : undefined,
      offset: typeof args.offset === 'number' ? args.offset : undefined,
    });
    const restaurants = payload.results.map((r) => toDiscoveryRestaurantCard(r));
    return {
      ok: true,
      tool: name,
      restaurants,
      total: payload.total,
      offset: payload.offset,
      limit: payload.limit,
      hasMore: payload.hasMore,
      text:
        restaurants.length === 0
          ? 'No encontré restaurantes con esos criterios.'
          : `Encontré ${payload.total} resultado(s). Mostrando ${restaurants.length}.`,
    };
  }

  if (name === 'filter_restaurants') {
    // Fetch a larger window then filter with real fields only.
    const fetchLimit = Math.min(
      Math.max(typeof args.limit === 'number' ? args.limit * 3 : (ctx.pageSize ?? 24) * 3, 24),
      120,
    );
    const payload = await searchRaw(ctx, {
      query: typeof args.query === 'string' ? args.query : undefined,
      category: typeof args.category === 'string' ? args.category : undefined,
      region: typeof args.region === 'string' ? args.region : undefined,
      lat: typeof args.lat === 'number' ? args.lat : undefined,
      lng: typeof args.lng === 'number' ? args.lng : undefined,
      limit: fetchLimit,
      offset: typeof args.offset === 'number' ? args.offset : 0,
    });

    let filtered = payload.results;
    if (args.openOnly === true) {
      filtered = filtered.filter((r) => r.isOpen === true);
    }
    if (typeof args.currency === 'string' && args.currency.trim()) {
      const cur = args.currency.trim().toUpperCase();
      filtered = filtered.filter((r) =>
        (r.currencies || []).some((c) => c.toUpperCase() === cur),
      );
    }
    if (typeof args.payment === 'string' && args.payment.trim()) {
      const pay = args.payment.trim().toLowerCase();
      filtered = filtered.filter((r) =>
        (r.paymentChannels || []).some((c) => c.toLowerCase().includes(pay)),
      );
    }

    const limit = Math.min(
      Math.max(typeof args.limit === 'number' ? args.limit : ctx.pageSize ?? 24, 1),
      120,
    );
    const page = filtered.slice(0, limit);
    const restaurants = page.map((r) => toDiscoveryRestaurantCard(r));
    return {
      ok: true,
      tool: name,
      restaurants,
      total: filtered.length,
      offset: 0,
      limit,
      hasMore: filtered.length > limit,
      text:
        restaurants.length === 0
          ? 'Ningún restaurante coincide con esos filtros.'
          : `Filtré ${filtered.length} resultado(s). Mostrando ${restaurants.length}.`,
    };
  }

  if (name === 'get_restaurant_public_info') {
    const slug = typeof args.slug === 'string' ? args.slug.trim().toLowerCase() : '';
    const id = typeof args.id === 'string' ? args.id.trim() : '';
    const payload = await searchRaw(ctx, {
      query: slug || undefined,
      limit: 48,
      offset: 0,
    });
    const hit =
      payload.results.find(
        (r) =>
          (slug && r.slug.toLowerCase() === slug) ||
          (id && r.id === id),
      ) ||
      payload.results.find(
        (r) => slug && r.slug.toLowerCase().includes(slug),
      ) ||
      null;
    if (!hit) {
      return {
        ok: true,
        tool: name,
        restaurant: null,
        text: 'No encontré ese comercio en el directorio público.',
      };
    }
    const restaurant = toDiscoveryRestaurantCard(hit);
    return {
      ok: true,
      tool: name,
      restaurant,
      restaurants: [restaurant],
      text: `${restaurant.nombre} — ${restaurant.openLabel || (restaurant.isOpen === null ? 'Horario no confirmado' : '')}`,
    };
  }

  if (name === 'prepare_restaurant_links') {
    const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
    if (!slug) {
      return { ok: false, tool: name, error: 'missing_slug' };
    }
    const menuUrl = `/v/${encodeURIComponent(slug)}`;
    const chatUrl = canOfferDiscoveryChatLink(slug)
      ? buildDiscoveryChatUrl(slug)
      : null;
    return {
      ok: true,
      tool: name,
      menuUrl,
      chatUrl,
      text: chatUrl
        ? `Menú: ${menuUrl}. Asistente del restaurante disponible.`
        : `Menú: ${menuUrl}.`,
    };
  }

  return { ok: false, tool: name, error: 'unknown_tool' };
}
