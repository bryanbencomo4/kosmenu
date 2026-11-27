/**
 * What the person is trying to do RIGHT NOW (pure, deterministic helpers).
 *
 * The brain used to read every message as a fresh keyword match, so an explicit new intent
 * ("no quiero X, busca otros", "empecemos de nuevo", "tres opciones con delivery") lost to
 * whatever the previous search left in memory. These helpers extract the explicit parts of a turn
 * (reset, exclusion, count, price/delivery preference, "which one is cheapest") so the router can
 * give the LAST intent priority and carry over only what is still pertinent.
 */

import type { WaMasterTask } from '../types';
import { extractRestaurantName, fold, parseFood } from './topics';

export const TASK_TTL_MS = 45 * 60 * 1000;

/** Same length as the input (index-safe): lower-case without accents, char by char. */
export function lenFold(s: string): string {
  return s
    .split('')
    .map((ch) => (ch.normalize('NFD')[0] ?? ch).toLowerCase())
    .join('');
}

function stem(word: string): string {
  const w = fold(word);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

const GENERIC_NAME_WORDS = new Set([
  'restaurante', 'restaurant', 'hamburgueseria', 'hamburguesas', 'hamburguesa', 'pizzeria', 'pizza', 'pizzas',
  'arepera', 'pollos', 'pollo', 'cafe', 'parrilla', 'comida', 'comidas', 'rapida', 'casa', 'tequeneria',
  'pasteleria', 'panaderia', 'heladeria', 'sushi', 'bar', 'grill', 'del', 'los', 'las', 'qa',
]);

/** The person named this restaurant: whole name, or all of its distinctive words ("bladi jaiper"). */
export function mentionsRestaurant(t: string, nombre: string): boolean {
  const full = fold(nombre);
  if (!full) return false;
  if (t.includes(full)) return true;
  const distinctive = full.split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 3 && !GENERIC_NAME_WORDS.has(w));
  if (!distinctive.length) return false;
  const hay = t.split(/[^a-z0-9ñ]+/).map(stem);
  return distinctive.every((w) => hay.includes(stem(w)));
}

// ---------------------------------------------------------------------------
// "Empecemos de nuevo"
// ---------------------------------------------------------------------------

const RESET_RE =
  /\b(?:(?:empecemos|empezamos|empezar|comencemos|comenzamos|comenzar|arranquemos|reiniciemos|reiniciar|volvamos a empezar|volvamos a comenzar)(?:\s+(?:de nuevo|otra vez|desde cero|desde el principio|de cero))?|olvida(?:te)? (?:de )?(?:todo|lo anterior|eso|lo que dije)|(?:borra|ignora) (?:todo|lo anterior)|nueva busqueda|otra busqueda|busqueda nueva|como si empezaramos)\b/;

const RESET_NEEDS_SUFFIX = /^(?:empecemos|empezamos|empezar|comencemos|comenzamos|comenzar|arranquemos|reiniciemos|reiniciar)$/;

/**
 * "Empecemos de nuevo. Quiero hamburguesas económicas en Caracas" → reset + the rest of the message.
 * A bare "empezar" (as in "quiero empezar a vender") is NOT a reset: it needs "de nuevo/otra vez/…".
 */
export function detectReset(original: string): { reset: boolean; rest: string } {
  const f = lenFold(original);
  const m = RESET_RE.exec(f);
  if (!m) return { reset: false, rest: original };
  if (RESET_NEEDS_SUFFIX.test(m[0].trim())) return { reset: false, rest: original };
  const rest = `${original.slice(0, m.index)} ${original.slice(m.index + m[0].length)}`
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!¡?¿\-–—]+|[\s.,;:!¡?¿\-–—]+$/g, '')
    .trim();
  return { reset: true, rest };
}

// ---------------------------------------------------------------------------
// "No quiero TORO BRAVO"
// ---------------------------------------------------------------------------

const NEG_RE =
  /\b(?:no quiero(?: ir a| ver| pedir en| que)?|no me interesa(?:n)?|no me gusta(?:n)?|no me convence(?:n)?|ya no quiero|ya no me interesa|descart\w+|olvida(?:te)?(?: de)?|que no sea|excepto|nada de|tacha\w*|quita\w*|saca\w*|menos)\b/g;
const STRONG_NEG = /^(?:no quiero|no me|ya no|descart|olvida|que no sea|excepto|nada de)/;

export type Exclusion = { ids: string[]; names: string[] };

/**
 * Restaurants the person rules out in this message. Names are matched against the restaurants
 * already on the table first; an unknown capitalised name is accepted only after a strong
 * negation ("no quiero …", "descarta …").
 */
export function detectExclusion(original: string, known: Array<{ id: string; nombre: string }>): Exclusion | null {
  const f = lenFold(original);
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const m of f.matchAll(NEG_RE)) {
    const start = m.index! + m[0].length;
    const tail = f.slice(start, start + 70);
    const window = tail.split(/[.!?;\n]/)[0];
    let hit = false;
    for (const r of known) {
      if (mentionsRestaurant(fold(window), r.nombre)) {
        ids.add(r.id);
        names.add(fold(r.nombre));
        hit = true;
      }
    }
    if (hit || !STRONG_NEG.test(m[0].trim())) continue;
    const origWindow = original.slice(start, start + 70).split(/[.!?;\n]/)[0];
    const name = extractRestaurantName(origWindow);
    // "Pizzería Roma" is a restaurant; a lone "pizza" is just food.
    const bareFood = Boolean(parseFood(fold(name ?? ''))) && fold(name ?? '').split(' ').length === 1;
    if (name && !bareFood && fold(name).length >= 3) names.add(fold(name));
  }
  return ids.size || names.size ? { ids: [...ids], names: [...names] } : null;
}

export function isExcluded(nombre: string, excluded: string[]): boolean {
  const f = fold(nombre);
  return excluded.some((e) => e && (f === e || f.includes(e) || mentionsRestaurant(e, nombre)));
}

// ---------------------------------------------------------------------------
// Counts, preferences, list requests
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
};

const LIST_NOUN =
  /\b(restaurantes?|opciones|lugares|sitios|locales|alternativas|negocios|hamburgueserias?|pizzerias?|areperas?)\b/;
const COUNT_BEFORE_NOUN = new RegExp(
  `\\b(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})\\s+(?:mejores\\s+|buenos?\\s+|buenas\\s+|otros\\s+|otras\\s+|distintos\\s+|distintas\\s+)?${LIST_NOUN.source.replace(/^\\b/, '')}`,
);

/** "tres restaurantes", "3 opciones": how many places the person asked for (a count, never money). */
export function parseCount(t: string): number | null {
  const m = COUNT_BEFORE_NOUN.exec(t);
  if (!m) return null;
  const n = NUMBER_WORDS[m[1]] ?? Number(m[1]);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
}

export const wantsCheap = (t: string) =>
  /\b(barat\w*|economic\w*|accesible\w*|menor precio|mas bajo|precio bajo|buen precio|ahorrar|poco dinero)\b/.test(t);

export const wantsDeliveryFilter = (t: string) =>
  /\bcon (?:servicio de )?(?:delivery|domicilio|envio)\b|\ba domicilio\b|\bque (?:hagan|tengan|ofrezcan|presten) (?:delivery|domicilio|envio)\b|\bque (?:me )?(?:lleven|llegue\w*)\b/.test(t);

export const wantsOthers = (t: string) =>
  /\b(otros|otras|otro|distintos|distintas|diferentes|mas opciones|alternativas)\b/.test(t);

const LIST_VERB =
  /\b(recomiend\w*|recomend\w*|muestr\w*|ensen\w*|dame|dime|busca\w*|buscame|quiero|hay|sugier\w*|lista\w*|cuales|mejores|pasame|otros|otras)\b/;
const NOT_A_LIST = /\b(que opciones (?:tiene|tienen|trae|traen)|opciones del menu|opciones de pago|opcion de pago|metodos? de pago)\b/;

/** "Recomiéndame tres restaurantes", "otras opciones", "muéstrame tres opciones con delivery". */
export function isRestaurantListAsk(t: string): boolean {
  if (NOT_A_LIST.test(t)) return false;
  const noun = LIST_NOUN.exec(t);
  if (!noun) return false;
  if (!LIST_VERB.test(t)) return false;
  // One specific place ("el menú de un restaurante", "ese restaurante") is not a list request,
  // unless they want another one ("otro restaurante") or a suggestion ("recomiéndame un restaurante").
  if (
    /^(restaurante|hamburgueseria|pizzeria|arepera)$/.test(noun[1]) &&
    !wantsOthers(t) &&
    !/\b(recomiend\w*|recomend\w*|sugier\w*)\b/.test(t)
  ) {
    return false;
  }
  // "opciones" alone is also a menu word: it only means "other restaurants" with a count / "otras" / delivery.
  if (/^opciones$/.test(noun[1]) && !/\brestaurantes?\b/.test(t)) {
    return Boolean(parseCount(t)) || wantsOthers(t) || wantsDeliveryFilter(t) || /\bmuestr\w*|recomiend\w*\b/.test(t);
  }
  return true;
}

export type CrossAsk = 'cheapest' | 'priciest';

/** "¿Cuál es la más económica?" without naming a restaurant: compare across the options on the table. */
export function crossAsk(t: string): CrossAsk | null {
  if (/\b(?:mas|la|el)\s+(?:barat\w*|economic\w*)\b|\bmenor precio\b|\bmas bajo\b|\bmas accesible\b/.test(t)) return 'cheapest';
  if (/\b(?:mas|la|el)\s+(?:car[ao]s?)\b|\bmayor precio\b|\bmas alto\b|\bpremium\b/.test(t)) return 'priciest';
  return null;
}

// ---------------------------------------------------------------------------
// Task state
// ---------------------------------------------------------------------------

export function freshTask(task: WaMasterTask | null | undefined, nowMs: number): WaMasterTask | null {
  return task && nowMs - task.atMs <= TASK_TTL_MS ? task : null;
}

/** The same search (same food and city) keeps its exclusions; a different one starts clean. */
export function sameSearch(a: WaMasterTask | null, food: WaMasterTask['food'], zone: string | null): boolean {
  if (!a) return false;
  const key = (f: WaMasterTask['food']) => fold(f?.category || f?.query || f?.label || '');
  return key(a.food) === key(food) && fold(a.zone || '') === fold(zone || '');
}
