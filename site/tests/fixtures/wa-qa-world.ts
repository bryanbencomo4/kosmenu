/**
 * Isolated QA world for the WhatsApp consumer assistant (nothing here touches real data):
 * restaurants built from the captured PUBLIC menu of hamburgueseria-bladi-jaiper (same payload
 * `/v/{slug}` renders), relocated to Caracas with different prices, delivery rules, categories and
 * currencies, plus a directory mock that behaves like `search_restaurants` (region / category /
 * query / distance sorting / pagination with total + hasMore, dishes limited to AVAILABLE products).
 */
import fixture from './qa-bladi-menu.json';
import { buildMenuSnapshot, type LoadMenu, type MenuSnapshot } from '../../app/api/wa-master/_lib/brain/menu';
import type { WaMasterDiscoveryCard, WaMasterDiscoveryExecute } from '../../app/api/wa-master/_lib/discovery-bridge';
import { haversineKm } from '../../app/_lib/delivery-config';

type Source = Parameters<typeof buildMenuSnapshot>[0];
type RawMenu = { comercio: Record<string, unknown>; productos: Array<Record<string, unknown>> };
const RAW = fixture as unknown as RawMenu & Record<string, unknown>;

export type QaShopDef = {
  key: string;
  nombre: string;
  zona: string; // city
  barrio: string;
  lat: number;
  lng: number;
  /** Multiplies every price of the captured menu. */
  mult: number;
  /** What the shop sells as its main dish: its menu category is renamed accordingly. */
  categoria: 'hamburguesas' | 'pizzas';
  delivery: boolean;
  /** Menu currency (default COP). */
  currency?: string;
  /** Every dish of the main category is sold out (the directory must not list it for that food). */
  soldOut?: boolean;
};

export const QA_SHOPS: QaShopDef[] = [
  { key: 'toro-bravo', nombre: 'TORO BRAVO', zona: 'Caracas', barrio: 'Los Palos Grandes', lat: 10.5013, lng: -66.8395, mult: 1, categoria: 'hamburguesas', delivery: true },
  { key: 'qa-smash-palos', nombre: 'QA Smash House', zona: 'Caracas', barrio: 'Los Palos Grandes', lat: 10.503, lng: -66.841, mult: 0.8, categoria: 'hamburguesas', delivery: true },
  { key: 'qa-burger-altamira', nombre: 'QA Burger Altamira', zona: 'Caracas', barrio: 'Altamira', lat: 10.519, lng: -66.849, mult: 0.9, categoria: 'hamburguesas', delivery: true },
  { key: 'qa-grill-chacao', nombre: 'QA Grill Chacao', zona: 'Caracas', barrio: 'Chacao', lat: 10.495, lng: -66.856, mult: 0.6, categoria: 'hamburguesas', delivery: false },
  { key: 'qa-burger-maracaibo', nombre: 'QA Burger Maracaibo', zona: 'Maracaibo', barrio: 'Centro', lat: 10.6544, lng: -71.6406, mult: 0.5, categoria: 'hamburguesas', delivery: true },
  // Burgers on the menu but every one sold out: it must never be offered for "hamburguesas".
  { key: 'qa-agotado-chacao', nombre: 'QA Agotado Chacao', zona: 'Caracas', barrio: 'Chacao', lat: 10.496, lng: -66.855, mult: 0.7, categoria: 'hamburguesas', delivery: true, soldOut: true },
  { key: 'qa-pizza-palos', nombre: 'QA Pizza Palos', zona: 'Caracas', barrio: 'Los Palos Grandes', lat: 10.5, lng: -66.8405, mult: 1.1, categoria: 'pizzas', delivery: true },
  { key: 'qa-pizza-chacao', nombre: 'QA Pizza Chacao', zona: 'Caracas', barrio: 'Chacao', lat: 10.494, lng: -66.857, mult: 0.9, categoria: 'pizzas', delivery: true },
  { key: 'qa-pizza-altamira', nombre: 'QA Pizza Altamira', zona: 'Caracas', barrio: 'Altamira', lat: 10.52, lng: -66.85, mult: 1, categoria: 'pizzas', delivery: false },
  // Prices in USD (a different currency than the rest of the city).
  { key: 'qa-pizza-usd', nombre: 'QA Pizza Dólar', zona: 'Caracas', barrio: 'La Castellana', lat: 10.503, lng: -66.853, mult: 0.0002, categoria: 'pizzas', delivery: false, currency: 'USD' },
  { key: 'qa-pizza-maracaibo', nombre: 'QA Pizza Maracaibo', zona: 'Maracaibo', barrio: 'Bella Vista', lat: 10.66, lng: -71.63, mult: 0.7, categoria: 'pizzas', delivery: true },
];

/** Burger dish → pizza dish, same position in the menu (so prices keep their ordering). */
const PIZZA_NAMES: Record<string, string> = {
  VILLA: 'PIZZA MARGARITA',
  'CROQ. DE CARNE': 'PIZZA PEPPERONI',
  LOMITO: 'PIZZA JAMON',
  'MECHADO POLLO': 'PIZZA POLLO',
  'MECHADO-CARNE': 'PIZZA CARNES',
  MILANESA: 'PIZZA NAPOLITANA',
  CHULETA: 'PIZZA CUATRO QUESOS',
  '2 CARNES': 'PIZZA FAMILIAR',
  'MIXTA CON CHULETA': 'PIZZA MIXTA',
  '3 CARNES': 'PIZZA GIGANTE',
};
const BURGER_CAT = (RAW.categorias as Array<{ id: string; nombre: string }>).find((c) => c.nombre === 'HAMBURGUESAS')!.id;

function sourceFor(def: QaShopDef): Source {
  const id = `qa-${def.key}-0001`;
  const tarifas = { ...(RAW.comercio.delivery_tarifas as Record<string, unknown>), enabled: def.delivery };
  const pizza = def.categoria === 'pizzas';
  return {
    ...RAW,
    categorias: (RAW.categorias as Array<{ id: string; nombre: string }>).map((c) =>
      pizza && c.id === BURGER_CAT ? { ...c, nombre: 'PIZZAS' } : c,
    ),
    comercio: {
      ...RAW.comercio,
      id,
      slug: def.key,
      nombre: def.nombre,
      direccion: `${def.barrio}, ${def.zona}\nReferencia: QA aislado`,
      latitud: def.lat,
      longitud: def.lng,
      permite_delivery: def.delivery,
      delivery_tarifas: tarifas,
      ...(def.currency ? { moneda: def.currency } : {}),
    },
    productos: RAW.productos.map((p) => {
      const main = p.categoria_id === BURGER_CAT;
      return {
        ...p,
        id: `${def.key}:${String(p.id)}`,
        comercio_id: id,
        nombre: pizza && main ? PIZZA_NAMES[String(p.nombre)] ?? String(p.nombre) : p.nombre,
        precio: Math.max(1, Math.round((Number(p.precio) || 0) * def.mult)),
        disponible: def.soldOut && main ? false : p.disponible,
      };
    }),
  } as unknown as Source;
}

export const QA_SNAPS: Record<string, MenuSnapshot> = Object.fromEntries(
  QA_SHOPS.map((d) => [d.key, buildMenuSnapshot(sourceFor(d))]),
);

export const loadQaMenu: LoadMenu = async (key) => {
  for (const s of Object.values(QA_SNAPS)) if (s.slug === key || s.id === key) return s;
  return null;
};

export const menuLoads: string[] = [];
/** Same as `loadQaMenu` but records which menus were opened (to prove a search does not open menus). */
export const loadQaMenuTracked: LoadMenu = async (key) => {
  const snap = await loadQaMenu(key);
  if (snap) menuLoads.push(snap.slug);
  return snap;
};

export const deliveryLoads: string[] = [];
export const loadQaDelivery = async (id: string) => {
  for (const s of Object.values(QA_SNAPS)) if (s.id === id) {
    deliveryLoads.push(s.slug);
    return s.delivery;
  }
  return null;
};

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const directoryCalls: Array<{ tool: string; args: Record<string, unknown> }> = [];
/** Max results per page the mock directory returns (the real one caps at 120). */
export const directory = { pageCap: 120 };

/** Names of the dishes the directory would index: AVAILABLE products only. */
function availableNames(snap: MenuSnapshot): string[] {
  return snap.products.map((p) => p.nombre);
}

/** Behaves like the real `search_restaurants`: city filter, category/query match, distance sort, paging. */
export const qaDiscovery: WaMasterDiscoveryExecute = async (name, args) => {
  directoryCalls.push({ tool: name, args });
  const region = args.region ? fold(String(args.region)) : '';
  const lat = typeof args.lat === 'number' ? args.lat : null;
  const lng = typeof args.lng === 'number' ? args.lng : null;
  const q = args.query ? fold(String(args.query)) : '';
  const cat = args.category ? fold(String(args.category)) : '';
  const limit = Math.max(1, Math.min(Number(args.limit) || 24, directory.pageCap));
  const offset = Math.max(0, Number(args.offset) || 0);
  const all: WaMasterDiscoveryCard[] = [];
  for (const def of QA_SHOPS) {
    const snap = QA_SNAPS[def.key];
    if (region && !fold(def.zona).includes(region) && !region.includes(fold(def.zona))) continue;
    const dishNames = availableNames(snap);
    const nameHit = q && fold(def.nombre).includes(q);
    const dishHit = q && dishNames.some((n) => fold(n).includes(q.replace(/s$/, '')));
    const stem = cat.replace(/s$/, '');
    const catHit =
      cat &&
      (!def.soldOut && fold(def.categoria).includes(stem) ||
        snap.products.some((p) => fold(p.categoria || '').includes(stem)));
    if ((q || cat) && !(nameHit || dishHit || catHit)) continue;
    const dist = lat != null && lng != null ? Math.round((haversineKm({ lat: def.lat, lng: def.lng }, { lat, lng }) ?? 0) * 10) / 10 : null;
    all.push({
      id: snap.id,
      slug: snap.slug,
      nombre: snap.nombre,
      menuUrl: `https://elmenuxfa.com/v/${snap.slug}`,
      isOpen: true,
      zona: `${def.barrio}, ${def.zona}`,
      categoria: def.soldOut ? 'restaurante' : def.categoria,
      distanceKm: dist,
      ...(args.includeDishes ? { matchedDish: q || null, productNames: dishNames } : {}),
    });
  }
  if (lat != null) all.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  const page = all.slice(offset, offset + limit);
  return {
    ok: true,
    tool: name,
    restaurants: page,
    total: all.length,
    offset,
    limit,
    hasMore: offset + page.length < all.length,
  };
};

/** Geocoder stand-in (the real one is Nominatim): neighbourhood-level for Caracas places. */
export function qaGeocode(text: string): { lat: number; lng: number; label: string } | null {
  const t = fold(text);
  if (t.includes('palos grandes')) return { lat: 10.4985, lng: -66.842, label: 'Los Palos Grandes, Caracas' };
  if (t.includes('altamira')) return { lat: 10.5185, lng: -66.8495, label: 'Altamira, Caracas' };
  if (t.includes('chacao')) return { lat: 10.4965, lng: -66.8545, label: 'Chacao, Caracas' };
  if (t.includes('caracas')) return { lat: 10.5061, lng: -66.9146, label: 'Caracas' };
  return null;
}
