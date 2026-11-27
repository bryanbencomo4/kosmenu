/**
 * Isolated QA world for the WhatsApp consumer assistant (nothing here touches real data):
 * several restaurants built from the captured PUBLIC menu of hamburgueseria-bladi-jaiper
 * (same payload `/v/{slug}` renders), relocated to Caracas with different prices, delivery
 * rules and categories, plus a directory mock that behaves like `search_restaurants`
 * (region / category / query / distance sorting).
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
  categoria: string;
  delivery: boolean;
  /** Max km the zones tariff reaches (captured tariff reaches 10 km). */
  open?: boolean;
};

export const QA_SHOPS: QaShopDef[] = [
  { key: 'toro-bravo', nombre: 'TORO BRAVO', zona: 'Caracas', barrio: 'Los Palos Grandes', lat: 10.5013, lng: -66.8395, mult: 1, categoria: 'hamburguesas', delivery: true },
  { key: 'qa-smash-palos', nombre: 'QA Smash House', zona: 'Caracas', barrio: 'Los Palos Grandes', lat: 10.503, lng: -66.841, mult: 0.8, categoria: 'hamburguesas', delivery: true },
  { key: 'qa-burger-altamira', nombre: 'QA Burger Altamira', zona: 'Caracas', barrio: 'Altamira', lat: 10.519, lng: -66.849, mult: 0.9, categoria: 'hamburguesas', delivery: true },
  { key: 'qa-grill-chacao', nombre: 'QA Grill Chacao', zona: 'Caracas', barrio: 'Chacao', lat: 10.495, lng: -66.856, mult: 0.6, categoria: 'hamburguesas', delivery: false },
  { key: 'qa-burger-maracaibo', nombre: 'QA Burger Maracaibo', zona: 'Maracaibo', barrio: 'Centro', lat: 10.6544, lng: -71.6406, mult: 0.5, categoria: 'hamburguesas', delivery: true },
];

function sourceFor(def: QaShopDef): Source {
  const id = `qa-${def.key}-0001`;
  const tarifas = { ...(RAW.comercio.delivery_tarifas as Record<string, unknown>), enabled: def.delivery };
  return {
    ...RAW,
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
    },
    productos: RAW.productos.map((p) => ({
      ...p,
      id: `${def.key}:${String(p.id)}`,
      comercio_id: id,
      precio: Math.round((Number(p.precio) || 0) * def.mult),
    })),
  } as unknown as Source;
}

export const QA_SNAPS: Record<string, MenuSnapshot> = Object.fromEntries(
  QA_SHOPS.map((d) => [d.key, buildMenuSnapshot(sourceFor(d))]),
);

export const loadQaMenu: LoadMenu = async (key) => {
  for (const s of Object.values(QA_SNAPS)) if (s.slug === key || s.id === key) return s;
  return null;
};

export const loadQaDelivery = async (id: string) => {
  for (const s of Object.values(QA_SNAPS)) if (s.id === id) return s.delivery;
  return null;
};

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const directoryCalls: Array<{ tool: string; args: Record<string, unknown> }> = [];

/** Behaves like the real `search_restaurants`: city filter, category/query match, distance sort. */
export const qaDiscovery: WaMasterDiscoveryExecute = async (name, args) => {
  directoryCalls.push({ tool: name, args });
  const region = args.region ? fold(String(args.region)) : '';
  const lat = typeof args.lat === 'number' ? args.lat : null;
  const lng = typeof args.lng === 'number' ? args.lng : null;
  const q = args.query ? fold(String(args.query)) : '';
  const cat = args.category ? fold(String(args.category)) : '';
  const limit = Math.max(1, Math.min(Number(args.limit) || 5, 20));
  const cards: WaMasterDiscoveryCard[] = [];
  for (const def of QA_SHOPS) {
    const snap = QA_SNAPS[def.key];
    if (region && !fold(def.zona).includes(region) && !region.includes(fold(def.zona))) continue;
    const nameHit = q && fold(def.nombre).includes(q);
    const dishNames = snap.products.map((p) => p.nombre);
    const dishHit = q && dishNames.some((n) => fold(n).includes(q.replace(/s$/, '')));
    const catHit = cat && (fold(def.categoria).includes(cat.replace(/s$/, '')) || snap.categories.some((c) => fold(c.nombre).includes(cat.replace(/s$/, ''))));
    if ((q || cat) && !(nameHit || dishHit || catHit)) continue;
    const dist = lat != null && lng != null ? Math.round((haversineKm({ lat: def.lat, lng: def.lng }, { lat, lng }) ?? 0) * 10) / 10 : null;
    cards.push({
      id: snap.id,
      slug: snap.slug,
      nombre: snap.nombre,
      menuUrl: `https://elmenuxfa.com/v/${snap.slug}`,
      isOpen: true,
      zona: `${def.barrio}, ${def.zona}`,
      categoria: def.categoria,
      distanceKm: dist,
      ...(args.includeDishes ? { matchedDish: q || null, productNames: dishNames } : {}),
    });
  }
  if (lat != null) cards.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  return { ok: true, tool: name, restaurants: cards.slice(0, limit) };
};

/** Geocoder stand-in (the real one is Nominatim): neighbourhood-level for Caracas places. */
export function qaGeocode(text: string): { lat: number; lng: number; label: string } | null {
  const t = fold(text);
  if (t.includes('palos grandes')) return { lat: 10.4985, lng: -66.842, label: 'Los Palos Grandes, Caracas' };
  if (t.includes('altamira')) return { lat: 10.5185, lng: -66.8495, label: 'Altamira, Caracas' };
  if (t.includes('caracas')) return { lat: 10.5061, lng: -66.9146, label: 'Caracas' };
  return null;
}
