/** Last delivery reference and instructions, plus a short history of what this device typed. */

export const DELIVERY_NOTES_CACHE_KEY = 'elmenuxfa:delivery-notes-v1';

export const DEFAULT_REFERENCE_SUGGESTIONS = [
  'Al frente de',
  'Diagonal a',
  'Detrás de',
  'Al lado de',
  'Cerca de',
];
export const DEFAULT_INSTRUCTION_SUGGESTIONS = [
  'Tocar timbre',
  'Llamar al llegar',
  'No tocar timbre',
  'Dejar en portería',
  'Estoy en la puerta',
];

export type DeliveryNoteField = 'reference' | 'instructions';

export type DeliveryNotesCache = {
  reference: string;
  instructions: string;
  references: string[];
  instructionsHistory: string[];
};

const EMPTY_CACHE: DeliveryNotesCache = {
  reference: '',
  instructions: '',
  references: [],
  instructionsHistory: [],
};

function clean(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function cleanList(value: unknown, maxItem: number) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const entry of value) {
    const text = clean(entry, maxItem);
    const key = text.toLocaleLowerCase('es');
    if (!text || seen.has(key)) continue;
    seen.add(key);
    list.push(text);
    if (list.length >= 4) break;
  }
  return list;
}

export function readDeliveryNotesCache(): DeliveryNotesCache {
  if (typeof window === 'undefined') return EMPTY_CACHE;
  try {
    const raw = window.localStorage.getItem(DELIVERY_NOTES_CACHE_KEY);
    if (!raw) return EMPTY_CACHE;
    const parsed = JSON.parse(raw) as Partial<DeliveryNotesCache>;
    return {
      reference: clean(parsed.reference, 120),
      instructions: clean(parsed.instructions, 280),
      references: cleanList(parsed.references, 120),
      instructionsHistory: cleanList(parsed.instructionsHistory, 280),
    };
  } catch {
    return EMPTY_CACHE;
  }
}

function writeDeliveryNotesCache(cache: DeliveryNotesCache) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DELIVERY_NOTES_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Private mode / quota — the field still works for this order.
  }
}

export function rememberDeliveryNote(field: DeliveryNoteField, value: string): DeliveryNotesCache {
  const current = readDeliveryNotesCache();
  const max = field === 'reference' ? 120 : 280;
  const text = clean(value, max);
  if (!text) return current;
  const historyKey = field === 'reference' ? 'references' : 'instructionsHistory';
  const history = [
    text,
    ...current[historyKey].filter((item) => item.toLocaleLowerCase('es') !== text.toLocaleLowerCase('es')),
  ].slice(0, 4);
  const next: DeliveryNotesCache = {
    ...current,
    [field]: text,
    [historyKey]: history,
  };
  writeDeliveryNotesCache(next);
  return next;
}

/**
 * Chip list for delivery notes. Defaults stay visible (horizontal scroll);
 * remembered phrases from this device come after, without duplicates.
 */
export function deliveryNoteSuggestions(history: string[], defaults: string[], limit = 8) {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const entry of [...defaults, ...history]) {
    const text = entry.trim();
    const key = text.toLocaleLowerCase('es');
    if (!text || seen.has(key)) continue;
    seen.add(key);
    list.push(text);
    if (list.length >= limit) break;
  }
  return list;
}
