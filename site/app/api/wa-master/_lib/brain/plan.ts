/**
 * The decision step of a consumer turn: WHAT operation does the message ask for?
 *
 * The brain used to infer the operation as a side effect of whichever keyword rule matched first
 * ("precio" → commercial plans, "restaurante" → list, the active restaurant → its menu). This module
 * reads the message once and says explicitly:
 *
 *   - `search`  : find RESTAURANTS in the directory (all of them / three / the others…). It never
 *                 opens a menu or quotes delivery unless the message asks for it.
 *   - `compare` : open SEVERAL menus in one request and compare equivalent products.
 *
 * Everything else (a product question inside one restaurant, a delivery quote, a total…) returns
 * `null` and keeps going through the existing flows. Pure and deterministic: no I/O.
 */

import type { WaMasterTask } from '../types';
import type { Exclusion } from './task';
import {
  detectExclusion,
  detectReset,
  isRestaurantListAsk,
  mentionsRestaurant,
  wantsCheap,
  wantsDeliveryFilter,
  wantsOthers,
} from './task';
import { fold, type FoodQuery, type TopicResult } from './topics';

export type PlanOp = 'search' | 'compare';

export type TurnPlan = {
  op: PlanOp;
  /** Which rules fired (for tests and logs). */
  reasons: string[];
  /** The previous task is dropped (location and preferences are kept). */
  reset: boolean;
  /** Food named in THIS message (never "tres restaurantes"). */
  food: FoodQuery | null;
  /** The food differs from the one the person was looking for before. */
  foodChanged: boolean;
  zone: string | null;
  /** How many restaurants / menus were asked for ("tres"). */
  count: number | null;
  /** "todos", "el directorio completo": read every page of the directory. */
  all: boolean;
  /** The directory itself is the scope (not the restaurant we were on). */
  directoryWide: boolean;
  /** Only names: they asked for no products/prices, or never asked for them. */
  namesOnly: boolean;
  /** They asked NOT to be shown products or prices. */
  noProducts: boolean;
  /** They said NOT to look at delivery yet. */
  noDelivery: boolean;
  /** They asked for low prices: rank by real price (needs the menus). */
  cheap: boolean;
  /** They only want restaurants that deliver to where they are (needs the real delivery rules). */
  deliveryFilter: boolean;
  /** Restaurants other than the ones on the table / the one we were on. */
  others: boolean;
  exclusion: Exclusion | null;
  recommend: boolean;
};

export type PlanInput = {
  text: string;
  t: string;
  tr: Pick<TopicResult, 'topic' | 'food' | 'cities'>;
  /** Restaurants on the table (last list + the active one). */
  known: Array<{ id: string; nombre: string }>;
  active: { id: string; nombre: string } | null;
  /** Restaurants of the last list that are still fresh. */
  listed: Array<{ id: string; nombre: string }>;
  task: WaMasterTask | null;
  foodHint: string | null;
  hasCoords: boolean;
  /** A place was already given (a precise one or at least the city). */
  hasPlace?: boolean;
  /** "¿hacen delivery hasta mi casa?" style question about one restaurant. */
  deliveryQuestion: boolean;
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const NOT_FOOD = new Set([
  'restaurante', 'restaurantes', 'comercio', 'comercios', 'establecimiento', 'establecimientos', 'negocio', 'negocios',
  'local', 'locales', 'lugar', 'lugares', 'sitio', 'sitios', 'opcion', 'opciones', 'alternativa', 'alternativas',
  'menu', 'menus', 'carta', 'cartas', 'un', 'una', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'todos', 'todas',
  'los', 'las', 'de', 'del', 'que', 'tengan', 'tienen', 'con', 'en', 'para', 'mejores', 'buenos', 'buenas', 'otros', 'otras',
]);

/** A food only when it really is one ("tres restaurantes" is not a dish). */
export function cleanFood(food: FoodQuery | null | undefined): FoodQuery | null {
  if (!food) return null;
  if (food.category) return food;
  const words = fold(food.query ?? food.label ?? '')
    .split(' ')
    .filter(Boolean);
  if (!words.length || words.every((w) => NOT_FOOD.has(w) || /^\d+$/.test(w))) return null;
  return food;
}

export const foodKey = (f: { category?: string | null; query?: string | null; label?: string | null } | null | undefined): string =>
  fold(f?.category || f?.query || f?.label || '');

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};
const NUM = `\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')}`;
const PLACE_NOUN =
  'restaurantes?|comercios?|establecimientos?|negocios?|locales|lugares|sitios|opciones|alternativas|menus?|cartas?|catalogos?|hamburgueserias?|pizzerias?|areperas?';
const COUNT_NOUN = new RegExp(
  `\\b(${NUM})\\s+(?:de\\s+(?:los|las)\\s+)?(?:mejores\\s+|buenos?\\s+|buenas\\s+|otros\\s+|otras\\s+|distintos\\s+|distintas\\s+|primeros\\s+|primeras\\s+)?(?:${PLACE_NOUN})\\b`,
);
const COUNT_ARTICLE = new RegExp(`\\b(?:los|las)\\s+(${NUM})\\b(?!\\s+(?:hamburguesas?|pizzas?|productos?|platos?|mas|dolares?))`);
const ALL_RE =
  /\b(?:todos|todas)\b.{0,30}\b(?:restaurantes|comercios|establecimientos|negocios|locales|lugares|sitios|opciones)\b|\b(?:todo el directorio|directorio completo|directorio entero|todo el catalogo|busqueda (?:completa|exhaustiva)|lista completa|todos los que)\b/;
const DIRECTORY_RE = /\b(?:todo el directorio|directorio completo|directorio entero|todo el catalogo|busqueda (?:completa|exhaustiva)|todos los restaurantes|todos los comercios|todos los establecimientos)\b/;

/** "tres restaurantes" → 3; "todos los restaurantes" → all. Always a number of PLACES, never money. */
export function parseWanted(t: string): { count: number | null; all: boolean } {
  const all = ALL_RE.test(t);
  const m = COUNT_NOUN.exec(t) ?? COUNT_ARTICLE.exec(t);
  let count: number | null = null;
  if (m) {
    const n = NUMBER_WORDS[m[1]] ?? Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 10) count = n;
  }
  return { count: all ? null : count, all };
}

const NO_PRODUCTS = [
  /\bno (?:me )?(?:muestres|muestre|des|dar|ensenes|incluyas|pongas|listes|quiero ver)\b.{0,28}\b(?:productos|platos|precios|menus?|cartas?)\b/,
  /\bsin (?:mostrar |ver |consultar |incluir |poner )?(?:los |sus )?(?:productos|platos|precios|menus?)\b/,
  /\b(?:solo|solamente|unicamente)\s+(?:los |sus )?nombres\b/,
  /\bprimero\b.{0,24}\bnombres\b/,
  /\b(?:dame|dime|pasame|muestrame)\s+(?:solo\s+)?(?:sus |los )?nombres\b/,
];
const NO_DELIVERY = [
  /\b(?:sin|no)\s+(?:me\s+)?(?:consult\w*|calcul\w*|verific\w*|revis\w*|mir\w*|incluy\w*|muestr\w*|cobr\w*|des)\s+(?:el |la |los |las |nada de )?(?:delivery|domicilio|envio|tarifa)/,
  /\b(?:delivery|domicilio|envio)\b.{0,24}\b(?:todavia no|aun no|despues|luego|mas adelante)\b/,
];

const ABANDON =
  /\b(?:abandon\w*|olvid\w*\s+(?:de\s+)?(?:esa|eso|ese|la|el|lo)\s+(?:consulta|menu|busqueda|restaurante|anterior)|(?:deja|dejar|suelta|cancela|cancelar)\s+(?:esa|ese|eso|la|el)\s+(?:consulta|menu|busqueda)|(?:nueva|otra)\s+busqueda|busqueda\s+nueva)\b/;
/** "No quiero consultar el menú de X": stop looking at X's menu — NOT "leave X out of every search". */
const MENU_NEG =
  /\bno quiero (?:seguir )?(?:consultar|consultando|ver|viendo|revisar|revisando|mirar|mirando|abrir)\b.{0,30}\b(?:menu|carta|catalogo|consulta)\b/;

const SWITCH_MARK =
  /\b(?:cambi\w*|mejor|ahora|en vez de|en lugar de|prefiero|mas bien|corrijo|correccion|me referia|quise decir|dije|no era|en realidad|no[, ]+(?:quiero|busco|era)|olvida)\b/;
const SWITCH_RESTAURANT =
  /\b(?:cambi\w*|cambia)\s+de\s+(?:restaurante|local|comercio|negocio|lugar|sitio)\b|\b(?:otro|otra|distinto|diferente)\s+(?:restaurante|local|comercio|negocio|lugar|sitio|opcion)\b|\bprueba(?:mos)? con otro\b/;
const REST_PLURAL = /\b(?:restaurantes|comercios|establecimientos|negocios|locales|lugares|sitios|hamburgueserias|pizzerias|areperas)\b/;
const REST_NOUN = /\b(?:restaurantes?|comercios?|establecimientos?|negocios?|locales|lugares|sitios|hamburgueserias?|pizzerias?|areperas?)\b/;
const RECOMMEND = /\b(?:recomiend\w*|recomend\w*|sugier\w*)\b/;
export const PLATFORM_WORDS = /\b(?:planes?|suscripcion|mensualidad|membresia|afili\w+|registr\w+|mi negocio|mi restaurante|mi local|elmenuxfa|comision)\b/;

const BLOCKED_TOPICS = new Set([
  'human_now', 'sensitive', 'greeting', 'thanks', 'order_issue', 'merchant_ops', 'merchant_report', 'merchant_account',
  'merchant_diag', 'merchant_access', 'restaurant_assistant', 'payments', 'hours_of', 'contact_of', 'link_broken',
]);

const SEARCH_TOPICS = new Set<string>(['search_food', 'delivery_find']);

const PLURAL_REF =
  /\b(?:los|las)\s+(?:tres|dos|cuatro|cinco|\d)\b|\bambos\b|\bambas\b|\b(?:sus|esos|esas|estos|estas|todos los|todas las)\s+(?:restaurantes|comercios|menus|cartas|locales|negocios|establecimientos|precios|catalogos)\b/;
/** Plural references that only make sense when several restaurants are on the table. */
const LIST_REF =
  /\b(?:esos|esas|estos|estas|los|las)\s+(?:tres|dos|cuatro|cinco|seis|\d)\b|\b(?:los|las)\s+(?:menus|cartas|catalogos|precios)\s+de\s+(?:los|las|esos|esas|estos|estas|ambos|ambas|todos|todas)\b|\b(?:de|entre)\s+(?:ellos|ellas|esos|esas|estos|estas)\b/;
const VERB_CMP = /\b(?:compar\w*|contrast\w*|revis\w*|mir[ae]\w*|ver|abre|abrir|analiz\w*|checa\w*|investig\w*)\b/;
const OBJ_CMP = /\b(?:menus?|cartas?|catalogos?|precios?|productos?|platos?)\b/;

const match = (res: RegExp[], t: string) => res.some((r) => r.test(t));

/** Does the message ask to open and compare several restaurants' menus? */
export function wantsCompare(t: string, count: number | null, known: number): boolean {
  // "no me muestres productos ni precios" is a refusal, never a request to open menus.
  if (match(NO_PRODUCTS, t)) return false;
  const cmp = /\bcompar\w*\b/.test(t);
  if (cmp && (REST_NOUN.test(t) || PLURAL_REF.test(t) || (count != null && count >= 2) || (known >= 2 && /\b(?:sus|ellos|ellas|estos|esos|entre)\b/.test(t)))) {
    return true;
  }
  return VERB_CMP.test(t) && OBJ_CMP.test(t) && (PLURAL_REF.test(t) || (known >= 2 && LIST_REF.test(t)) || (count != null && count >= 2 && /\b(?:menus?|cartas?|catalogos?|precios?)\b/.test(t)));
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export function planTurn(i: PlanInput): TurnPlan | null {
  const { t, text } = i;
  if (i.hasCoords || !t) return null;
  if (BLOCKED_TOPICS.has(i.tr.topic)) return null;
  // "pricing"/"register" only when the person really talks about the platform.
  if ((i.tr.topic === 'pricing' || i.tr.topic === 'register' || i.tr.topic === 'feature') && PLATFORM_WORDS.test(t)) return null;

  const food = cleanFood(i.tr.food);
  const prevKey = foodKey(i.task?.food) || fold(i.foodHint ?? '');
  const foodChanged = Boolean(food) && prevKey !== '' && foodKey(food) !== prevKey;
  const zone = i.tr.cities[0] ?? null;
  const wanted = parseWanted(t);
  const directoryWide = DIRECTORY_RE.test(t);
  const hasTask = Boolean(i.task || i.foodHint || i.active || i.known.length);
  const isRestNoun = REST_NOUN.test(t);
  const recommend = RECOMMEND.test(t);

  const noProducts = match(NO_PRODUCTS, t);
  const noDelivery = match(NO_DELIVERY, t);
  const cheap = wantsCheap(t);
  const deliveryFilter = wantsDeliveryFilter(t) && !noDelivery;

  const abandon = ABANDON.test(t) || (MENU_NEG.test(t) && (directoryWide || wanted.all || isRestNoun));
  const reset = detectReset(text).reset || abandon;

  const menuNeg = MENU_NEG.test(t);
  const exclusionRaw = detectExclusion(text, i.known);
  let exclusion: Exclusion | null = exclusionRaw && !(menuNeg && !wantsOthers(t)) ? exclusionRaw : null;
  const others = wantsOthers(t) || SWITCH_RESTAURANT.test(t);
  if (others && !exclusion && i.active && !reset) exclusion = { ids: [i.active.id], names: [fold(i.active.nombre)] };

  const base = {
    reset,
    food,
    foodChanged,
    zone,
    count: wanted.count,
    all: wanted.all || directoryWide,
    directoryWide,
    noProducts,
    noDelivery,
    cheap,
    deliveryFilter,
    others,
    exclusion,
    recommend,
  };
  const namesOnly = noProducts || (!cheap && !deliveryFilter);
  const mk = (op: PlanOp, reasons: string[]): TurnPlan => ({ op, reasons, namesOnly, ...base });

  // 1. Compare several menus in one request.
  if (wantsCompare(t, wanted.count, i.listed.length) && !(i.known.length === 1 && wanted.count == null && mentionsRestaurant(t, i.known[0].nombre))) {
    return mk('compare', ['compare']);
  }

  // The person named a restaurant we know: that is a pick, not a search (unless they drop it/reset).
  const namesKnown = i.known.some((r) => mentionsRestaurant(t, r.nombre));
  if (namesKnown && !exclusion && !reset && !directoryWide && !wanted.all) return null;
  // A question about ONE restaurant's delivery is answered from that restaurant.
  const listAsk = isRestaurantListAsk(t) || (REST_PLURAL.test(t) && /\b(?:dame|dime|busca\w*|muestr\w*|quiero|hay|lista\w*|cuales|pasame|recomiend\w*|revisa\w*)\b/.test(t));
  if (i.deliveryQuestion && !listAsk && !wanted.all && !directoryWide) return null;

  // 2. Search the directory for restaurants.
  const reasons: string[] = [];
  if (directoryWide || (wanted.all && (isRestNoun || food))) reasons.push('directory');
  if (listAsk && (wanted.count != null || wanted.all || others || recommend || food || zone || hasTask)) reasons.push('list');
  if (reset && (food || zone || isRestNoun)) reasons.push('reset');
  if (food && foodChanged && (SWITCH_MARK.test(t) || isRestNoun || (i.tr.topic === 'search_food' && !i.active))) reasons.push('food_switch');
  // The same food said again with a change marker ("ahora quiero pizzas") is still a new search.
  if (food && !foodChanged && hasTask && SWITCH_MARK.test(t) && SEARCH_TOPICS.has(i.tr.topic)) reasons.push('food_restated');
  // "Busco pizzas en Caracas": a food and a city is a search of the directory, whatever we were on.
  if (food && zone && i.tr.topic === 'search_food') reasons.push('food_city');
  if (exclusion && (hasTask || isRestNoun)) reasons.push('exclusion');
  if (others && hasTask) reasons.push('others');
  // "las 3 hamburguesas más baratas" inside a restaurant is a product question: price/delivery only
  // drive a SEARCH when a city or the word restaurants is there (or nothing is open).
  if ((cheap || deliveryFilter) && food && SEARCH_TOPICS.has(i.tr.topic) && (zone || isRestNoun || (!i.active && (i.hasPlace || hasTask)))) reasons.push('criteria');
  if (!reasons.length) return null;
  return mk('search', reasons);
}
