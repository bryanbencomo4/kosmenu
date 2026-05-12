import 'server-only';

import {
  categories as fallbackCategories,
  directoryTotalBusinesses,
  directoryTotalPages,
  discoveryPins as fallbackDiscoveryPins,
  featuredBusinesses as fallbackFeaturedBusinesses,
  nearbyBusinesses as fallbackNearbyBusinesses,
  promotedBusinesses as fallbackPromotedBusinesses,
  type ConsumerCategory,
  type DiscoveryPin,
  type FeaturedBusiness,
  type FoodArtworkTheme,
  type NearbyBusiness,
  type PromotedBusiness,
} from '../../data/consumerBusinesses';
import { getServerSupabaseClient } from '../api/_lib/supabase-server';

type CommerceRow = {
  id: string;
  nombre: string | null;
  categoria: string | null;
  slug: string | null;
  direccion: string | null;
  logo_url: string | null;
  latitud: number | string | null;
  longitud: number | string | null;
  permite_delivery: boolean | null;
  recibe_pedidos_whatsapp: boolean | null;
  en_linea: boolean | null;
  color_principal: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type CategoryRow = {
  id: string;
  comercio_id: string;
  nombre: string | null;
  icono: string | null;
  activo: boolean | null;
  orden: number | null;
};

type ProductRow = {
  id: string;
  comercio_id: string;
  categoria_id: string | null;
  nombre: string | null;
  descripcion: string | null;
  disponible: boolean | null;
  orden: number | null;
  imagen_url: string | null;
};

type CommerceEntry = {
  commerce: CommerceRow;
  categories: CategoryRow[];
  products: ProductRow[];
  theme: FoodArtworkTheme;
  accent: string;
  emoji: string;
  categoryLabel: string;
  href: string;
  imageUrl: string | null;
  zone: string;
  location: {
    lat: number;
    lng: number;
  };
  hasPreciseLocation: boolean;
  isLocalToMap: boolean;
  distanceKm: number;
  rating: string;
  etaMinutes: number;
};

export type PublicConsumerHomeData = {
  categories: ConsumerCategory[];
  featuredBusinesses: FeaturedBusiness[];
  promotedBusinesses: PromotedBusiness[];
  nearbyBusinesses: NearbyBusiness[];
  discoveryPins: DiscoveryPin[];
  mapCenter: {
    lat: number;
    lng: number;
  };
  hasRealNearbyData: boolean;
  totalBusinesses: number;
  totalPages: number;
};

const PROMOTED_LIMIT = 5;
const NEARBY_LIMIT = 3;
const CATEGORY_LIMIT = 8;
const ITEMS_PER_PAGE = 10;
const LOCAL_MAP_RADIUS_KM = 25;
const REAL_MAP_CLUSTER_RADIUS_KM = 18;
const MAX_DISCOVERY_PINS = 8;
const MAP_CENTER = { lat: 10.4966, lng: -66.8535 };

const THEME_PRESETS: Record<
  FoodArtworkTheme,
  {
    accent: string;
    emoji: string;
    label: string;
  }
> = {
  burger: { accent: '#facc15', emoji: '🍔', label: 'Hamburguesas' },
  pizza: { accent: '#f97316', emoji: '🍕', label: 'Pizza' },
  sushi: { accent: '#38bdf8', emoji: '🍣', label: 'Sushi' },
  dessert: { accent: '#f472b6', emoji: '🍰', label: 'Postres' },
  grill: { accent: '#fb923c', emoji: '🥩', label: 'Parrilla' },
  coffee: { accent: '#a78bfa', emoji: '☕', label: 'Café' },
  salad: { accent: '#34d399', emoji: '🥗', label: 'Healthy bowls' },
  tacos: { accent: '#f59e0b', emoji: '🌮', label: 'Mexicana' },
  noodles: { accent: '#22d3ee', emoji: '🥡', label: 'Asiática' },
};

function fallbackData(): PublicConsumerHomeData {
  return {
    categories: fallbackCategories,
    featuredBusinesses: fallbackFeaturedBusinesses,
    promotedBusinesses: fallbackPromotedBusinesses,
    nearbyBusinesses: fallbackNearbyBusinesses,
    discoveryPins: fallbackDiscoveryPins,
    mapCenter: MAP_CENTER,
    hasRealNearbyData: false,
    totalBusinesses: directoryTotalBusinesses,
    totalPages: directoryTotalPages,
  };
}

function normalizeText(...values: Array<string | null | undefined>) {
  return values
    .map((value) => (value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function pickTheme(...values: Array<string | null | undefined>): FoodArtworkTheme {
  const haystack = normalizeText(...values);

  if (/(burger|hamburg|smash)/.test(haystack)) return 'burger';
  if (/(pizza|focaccia|napoli)/.test(haystack)) return 'pizza';
  if (/(sushi|roll|nigiri|poke)/.test(haystack)) return 'sushi';
  if (/(postre|dulce|torta|helado|brownie|cake|dessert)/.test(haystack)) return 'dessert';
  if (/(parrill|grill|bbq|carne|asado|costilla)/.test(haystack)) return 'grill';
  if (/(cafe|brunch|bakery|panader|coffee)/.test(haystack)) return 'coffee';
  if (/(salad|ensalad|bowl|wrap|healthy|veg)/.test(haystack)) return 'salad';
  if (/(taco|burrito|quesadilla|mexic)/.test(haystack)) return 'tacos';
  if (/(wok|noodle|ramen|asiat|china|chino)/.test(haystack)) return 'noodles';

  return 'burger';
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidCoordinate(lat: number, lng: number) {
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return false;
  }

  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) {
    return false;
  }

  return true;
}

function toZone(address: string | null, fallback: string) {
  const zone = (address ?? '')
    .split(',')
    .map((segment) => segment.trim())
    .find(Boolean);

  return zone || fallback;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function resolveLocation(commerce: CommerceRow, index: number) {
  const lat = toNumber(commerce.latitud);
  const lng = toNumber(commerce.longitud);

  if (lat !== null && lng !== null && isValidCoordinate(lat, lng)) {
    return {
      location: { lat, lng },
      hasPreciseLocation: true,
    };
  }

  return {
    location: {
      lat: MAP_CENTER.lat + index * 0.0035,
      lng: MAP_CENTER.lng - index * 0.003,
    },
    hasPreciseLocation: false,
  };
}

function computeDistanceKm(location: { lat: number; lng: number }, index: number) {
  const distance = haversineKm(MAP_CENTER.lat, MAP_CENTER.lng, location.lat, location.lng);

  if (Number.isFinite(distance) && distance > 0) {
    return Math.max(0.2, Math.round(distance * 10) / 10);
  }

  return Math.round((0.4 + index * 0.3) * 10) / 10;
}

function normalizeDisplayDistance(distanceKm: number, index: number) {
  if (distanceKm <= LOCAL_MAP_RADIUS_KM) {
    return distanceKm;
  }

  return Math.round((0.5 + index * 0.35) * 10) / 10;
}

function computeRating(productsCount: number, categoriesCount: number, index: number) {
  const rating = Math.min(4.9, 4.3 + productsCount * 0.05 + categoriesCount * 0.03 + (index % 2) * 0.04);
  return rating.toFixed(1);
}

function computeEta(distanceKm: number, index: number) {
  return Math.max(9, Math.round(distanceKm * 10) + 8 + index);
}

function computeCategoryLabel(entry: { commerce: CommerceRow; categories: CategoryRow[]; theme: FoodArtworkTheme }) {
  const commerceCategory = (entry.commerce.categoria ?? '').trim();
  if (commerceCategory) {
    return commerceCategory;
  }

  const firstCategory = entry.categories.find((category) => (category.nombre ?? '').trim());
  if (firstCategory?.nombre) {
    return firstCategory.nombre.trim();
  }

  return THEME_PRESETS[entry.theme].label;
}

function computeCuisine(entry: CommerceEntry) {
  const categoryNames = entry.categories
    .map((category) => (category.nombre ?? '').trim())
    .filter(Boolean)
    .slice(0, 2);

  const firstProduct = entry.products.find((product) => (product.descripcion ?? '').trim());
  if (firstProduct?.descripcion) {
    return firstProduct.descripcion.trim();
  }

  if (categoryNames.length > 0) {
    return categoryNames.join(' y ');
  }

  return `Catálogo disponible de ${entry.categoryLabel.toLowerCase()}`;
}

function resolveImageUrl(commerce: CommerceRow, products: ProductRow[]) {
  const productImage = products
    .map((product) => product.imagen_url?.trim())
    .find((imageUrl): imageUrl is string => Boolean(imageUrl));

  if (productImage) {
    return productImage;
  }

  const logoUrl = commerce.logo_url?.trim();
  return logoUrl || null;
}

function menuHref(commerce: CommerceRow) {
  const slug = (commerce.slug ?? '').trim();
  return slug ? `/v/${slug}` : `/v/${commerce.id}`;
}

function sanitizeEmoji(icon: string | null | undefined, fallback: string) {
  const sanitized = (icon ?? '').trim();
  return sanitized ? Array.from(sanitized)[0] : fallback;
}

function formatDistance(distanceKm: number) {
  return `${Math.max(0.2, Math.round(distanceKm * 10) / 10).toFixed(1)} km`;
}

function averageLocation(entries: Array<{ location: { lat: number; lng: number } }>) {
  if (entries.length === 0) {
    return MAP_CENTER;
  }

  const totals = entries.reduce(
    (accumulator, entry) => ({
      lat: accumulator.lat + entry.location.lat,
      lng: accumulator.lng + entry.location.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: totals.lat / entries.length,
    lng: totals.lng / entries.length,
  };
}

function buildRealMapCluster(entries: CommerceEntry[]) {
  const preciseEntries = entries.filter((entry) => entry.hasPreciseLocation);

  if (preciseEntries.length === 0) {
    return null;
  }

  let bestCenter = averageLocation([preciseEntries[0]]);
  let bestScore = -Infinity;

  for (const seedEntry of preciseEntries) {
    const candidateCluster = preciseEntries
      .filter((entry) => {
        return (
          haversineKm(seedEntry.location.lat, seedEntry.location.lng, entry.location.lat, entry.location.lng) <=
          REAL_MAP_CLUSTER_RADIUS_KM
        );
      })
      .slice(0, MAX_DISCOVERY_PINS);
    const resolvedCluster = candidateCluster.length > 0 ? candidateCluster : [seedEntry];
    const candidateCenter = averageLocation(resolvedCluster);
    const candidateScore =
      resolvedCluster.length * 100 -
      resolvedCluster.reduce((total, entry) => {
        return total + haversineKm(candidateCenter.lat, candidateCenter.lng, entry.location.lat, entry.location.lng);
      }, 0);

    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      bestCenter = candidateCenter;
    }
  }

  const entriesByCenterDistance = [...preciseEntries]
    .sort((a, b) => {
      const aDistance = haversineKm(bestCenter.lat, bestCenter.lng, a.location.lat, a.location.lng);
      const bDistance = haversineKm(bestCenter.lat, bestCenter.lng, b.location.lat, b.location.lng);

      if (aDistance !== bDistance) {
        return aDistance - bDistance;
      }

      return compareByFreshness(a, b);
    })
    .slice(0, MAX_DISCOVERY_PINS);

  return {
    center: bestCenter,
    entries: entriesByCenterDistance,
  };
}

function compareByFreshness(a: CommerceEntry, b: CommerceEntry) {
  const aTimestamp = Date.parse(a.commerce.updated_at ?? a.commerce.created_at ?? '');
  const bTimestamp = Date.parse(b.commerce.updated_at ?? b.commerce.created_at ?? '');
  return (Number.isFinite(bTimestamp) ? bTimestamp : 0) - (Number.isFinite(aTimestamp) ? aTimestamp : 0);
}

export async function getPublicConsumerHomeData(): Promise<PublicConsumerHomeData> {
  try {
    const supabase = getServerSupabaseClient();
    const { data: commerces, error: commercesError } = await supabase
      .from('comercios')
      .select(
        'id,nombre,categoria,slug,direccion,logo_url,latitud,longitud,permite_delivery,recibe_pedidos_whatsapp,en_linea,color_principal,updated_at,created_at',
      )
      .eq('en_linea', true)
      .order('updated_at', { ascending: false })
      .limit(24);

    if (commercesError) {
      throw new Error(commercesError.message);
    }

    const validCommerces = (commerces ?? []).filter(
      (commerce): commerce is CommerceRow => Boolean(commerce?.id && (commerce.nombre ?? '').trim()),
    );

    if (validCommerces.length === 0) {
      return fallbackData();
    }

    const commerceIds = validCommerces.map((commerce) => commerce.id);
    const [categoriesResult, productsResult] = await Promise.all([
      supabase
        .from('categorias')
        .select('id,comercio_id,nombre,icono,activo,orden')
        .in('comercio_id', commerceIds)
        .order('orden', { ascending: true }),
      supabase
        .from('productos')
        .select('id,comercio_id,categoria_id,nombre,descripcion,disponible,orden,imagen_url')
        .in('comercio_id', commerceIds)
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true }),
    ]);

    if (categoriesResult.error) {
      throw new Error(categoriesResult.error.message);
    }

    if (productsResult.error) {
      throw new Error(productsResult.error.message);
    }

    const categories = (categoriesResult.data ?? []).filter((category): category is CategoryRow => {
      return Boolean(category?.comercio_id) && category.activo !== false;
    });

    const products = (productsResult.data ?? []).filter((product): product is ProductRow => {
      return Boolean(product?.comercio_id) && product.disponible !== false;
    });

    const entries = validCommerces
      .map((commerce, index) => {
        const commerceCategories = categories.filter((category) => category.comercio_id === commerce.id);
        const commerceProducts = products.filter((product) => product.comercio_id === commerce.id);

        if (commerceCategories.length === 0 && commerceProducts.length === 0) {
          return null;
        }

        const theme = pickTheme(
          commerce.categoria,
          ...commerceCategories.map((category) => category.nombre),
          ...commerceProducts.slice(0, 4).flatMap((product) => [product.nombre, product.descripcion]),
        );
        const preset = THEME_PRESETS[theme];
        const { location, hasPreciseLocation } = resolveLocation(commerce, index);
        const rawDistanceKm = computeDistanceKm(location, index);
        const isLocalToMap = hasPreciseLocation && rawDistanceKm <= LOCAL_MAP_RADIUS_KM;
        const distanceKm = normalizeDisplayDistance(rawDistanceKm, index);
        const categoryLabel = computeCategoryLabel({ commerce, categories: commerceCategories, theme });

        return {
          commerce,
          categories: commerceCategories,
          products: commerceProducts,
          theme,
          accent: commerce.color_principal?.trim() || preset.accent,
          emoji: preset.emoji,
          categoryLabel,
          href: menuHref(commerce),
          imageUrl: resolveImageUrl(commerce, commerceProducts),
          zone: toZone(commerce.direccion, (commerce.nombre ?? '').trim()),
          location,
          hasPreciseLocation,
          isLocalToMap,
          distanceKm,
          rating: computeRating(commerceProducts.length, commerceCategories.length, index),
          etaMinutes: computeEta(distanceKm, index),
        } satisfies CommerceEntry;
      })
      .filter((entry): entry is CommerceEntry => Boolean(entry));

    if (entries.length === 0) {
      return fallbackData();
    }

    const rankedEntries = [...entries].sort((a, b) => {
      const volumeDelta = b.products.length - a.products.length;
      if (volumeDelta !== 0) {
        return volumeDelta;
      }

      const categoryDelta = b.categories.length - a.categories.length;
      if (categoryDelta !== 0) {
        return categoryDelta;
      }

      return compareByFreshness(a, b);
    });

    const featuredBusinesses: FeaturedBusiness[] = rankedEntries.map((entry, index) => ({
      id: `featured-${entry.commerce.id}`,
      name: entry.commerce.nombre?.trim() || 'Negocio sin nombre',
      category: entry.categoryLabel,
      cuisine: computeCuisine(entry),
      rating: entry.rating,
      distance: entry.distanceKm.toFixed(1),
      eta: `${entry.etaMinutes} min`,
      status: 'ABIERTO',
      artwork: entry.theme,
      accent: entry.accent,
      imageUrl: entry.imageUrl,
      hasPreciseLocation: entry.hasPreciseLocation,
      zone: entry.zone,
      location: entry.location,
      tags: entry.commerce.permite_delivery ? ['Delivery', 'Retiro'] : ['Retiro'],
      href: entry.href,
      isPromoted: index < PROMOTED_LIMIT,
    }));

    const promotedBusinesses: PromotedBusiness[] = rankedEntries.slice(0, PROMOTED_LIMIT).map((entry, index) => ({
      id: `promo-${entry.commerce.id}`,
      name: entry.commerce.nombre?.trim() || 'Negocio sin nombre',
      category: entry.categoryLabel,
      rating: entry.rating,
      distance: `${entry.distanceKm.toFixed(1)} km`,
      eta: `${entry.etaMinutes + 4}-${entry.etaMinutes + 10} min`,
      status: 'ABIERTO',
      artwork: entry.theme,
      accent: entry.accent,
      imageUrl: entry.imageUrl,
      hasPreciseLocation: entry.hasPreciseLocation,
      zone: entry.zone,
      location: entry.location,
      promoLabel: 'PROMO DEL DIA',
      spotlightLabel: index === 0 ? 'DESTACADO' : undefined,
      promoTitle:
        entry.products[0]?.nombre?.trim() ||
        `Explora el menú de ${entry.commerce.nombre?.trim() || 'este negocio'}`,
      promoWindow: entry.commerce.recibe_pedidos_whatsapp ? 'Pedidos activos por WhatsApp' : 'Catálogo activo ahora',
      href: entry.href,
    }));

    const realMapCluster = buildRealMapCluster(rankedEntries);
    const nearbyBusinesses: NearbyBusiness[] = realMapCluster
      ? realMapCluster.entries.slice(0, NEARBY_LIMIT).map((entry, index) => {
          const clusterDistanceKm = haversineKm(
            realMapCluster.center.lat,
            realMapCluster.center.lng,
            entry.location.lat,
            entry.location.lng,
          );

          return {
            id: `nearby-${entry.commerce.id}`,
            name: entry.commerce.nombre?.trim() || 'Negocio sin nombre',
            category: entry.categoryLabel,
            rating: entry.rating,
            distance: formatDistance(clusterDistanceKm),
            eta: `${Math.max(6, computeEta(clusterDistanceKm, index) - 2)} min`,
            status: 'ABIERTO' as const,
            artwork: entry.theme,
            accent: entry.accent,
            imageUrl: entry.imageUrl,
            hasPreciseLocation: true,
            zone: entry.zone,
            location: entry.location,
            href: entry.href,
          };
        })
      : fallbackNearbyBusinesses.slice(0, NEARBY_LIMIT);

    const discoveryPins: DiscoveryPin[] = realMapCluster
      ? realMapCluster.entries.map((entry) => ({
          id: `pin-nearby-${entry.commerce.id}`,
          name: entry.commerce.nombre?.trim() || 'Negocio sin nombre',
          accent: entry.accent,
          category: entry.categoryLabel,
          location: entry.location,
        }))
      : fallbackDiscoveryPins;

    const categoryScores = new Map<
      string,
      {
        id: string;
        label: string;
        emoji: string;
        accent: string;
        count: number;
      }
    >();

    for (const entry of rankedEntries) {
      const seenLabels = new Set<string>();
      const candidateCategories = entry.categories.length
        ? entry.categories.map((category) => ({
            id: category.id,
            label: (category.nombre ?? '').trim(),
            emoji: sanitizeEmoji(category.icono, entry.emoji),
            accent: entry.accent,
          }))
        : [
            {
              id: `fallback-category-${entry.commerce.id}`,
              label: entry.categoryLabel,
              emoji: entry.emoji,
              accent: entry.accent,
            },
          ];

      for (const candidate of candidateCategories) {
        if (!candidate.label) {
          continue;
        }

        const normalized = candidate.label.toLowerCase();
        if (seenLabels.has(normalized)) {
          continue;
        }
        seenLabels.add(normalized);

        const previous = categoryScores.get(normalized);
        categoryScores.set(normalized, {
          id: previous?.id || candidate.id,
          label: candidate.label,
          emoji: candidate.emoji,
          accent: previous?.accent || candidate.accent,
          count: (previous?.count ?? 0) + 1,
        });
      }
    }

    const consumerCategories: ConsumerCategory[] = [...categoryScores.values()]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
      .slice(0, CATEGORY_LIMIT)
      .map((category) => ({
        id: category.id,
        label: category.label,
        emoji: category.emoji,
        accent: category.accent,
      }));

    return {
      categories: consumerCategories.length > 0 ? consumerCategories : fallbackCategories,
      featuredBusinesses,
      promotedBusinesses,
      nearbyBusinesses,
      discoveryPins,
      mapCenter: realMapCluster?.center ?? MAP_CENTER,
      hasRealNearbyData: Boolean(realMapCluster),
      totalBusinesses: rankedEntries.length,
      totalPages: Math.max(1, Math.ceil(rankedEntries.length / ITEMS_PER_PAGE)),
    };
  } catch {
    return fallbackData();
  }
}