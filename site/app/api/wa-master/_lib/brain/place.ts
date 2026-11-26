/**
 * The place a person describes in words ("hamburguesas en Los Palos Grandes, Caracas").
 * Kept in memory so delivery coverage can be checked later without asking again.
 */

import { looksLikeAddress } from '../../../_lib/geocode';
import { fold } from './topics';

const FOOD_OR_FILLER =
  /\b(pizza|pizzas|hamburgues\w*|burger\w*|sushi|arepa\w*|empanada\w*|pollo|comida|restaurante\w*|delivery|domicilio|menu|cena|almuerzo|desayuno|general|realidad|serio|verdad|linea|casa de)\b/;

/** The text after the last "en/por/desde …" that reads like a place, or null. */
export function extractPlaceText(original: string, cities: string[] = []): string | null {
  const text = String(original || '')
    .replace(/[¿?¡!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  let last: string | null = null;
  for (const m of text.matchAll(/(?:^|\s)(?:en|por|desde|cerca de|cerca del|por el sector|sector)\s+(.{3,80})$/gi)) {
    last = m[1];
  }
  // Also take the earliest "en …" when the sentence continues after the place.
  if (!last) {
    const m = /(?:^|\s)en\s+([^.;]{3,80})/i.exec(text);
    last = m?.[1] ?? null;
  }
  if (!last) return null;
  const place = last.replace(/[.]+$/, '').trim();
  const f = fold(place);
  if (!f || f.split(' ').length > 9) return null;
  if (/^(mi|tu|su|la zona|el|un|una)\b/.test(f) && !looksLikeAddress(place)) return null;
  if (FOOD_OR_FILLER.test(f)) return null;
  const hasCity = cities.some((c) => f.includes(fold(c)));
  if (hasCity || place.includes(',') || looksLikeAddress(place) || f.split(' ').length >= 2) return place;
  return null;
}

/** "Caracas" alone is a whole city: too coarse to quote a delivery fee. */
export function isBareCity(place: string, cities: string[]): boolean {
  const f = fold(place);
  return cities.some((c) => fold(c) === f);
}
