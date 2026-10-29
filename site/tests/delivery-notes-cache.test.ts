import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_INSTRUCTION_SUGGESTIONS,
  DEFAULT_REFERENCE_SUGGESTIONS,
  DELIVERY_NOTES_CACHE_KEY,
  deliveryNoteSuggestions,
  readDeliveryNotesCache,
  rememberDeliveryNote,
} from '../app/_lib/delivery-notes-cache';

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  });
  return store;
}

describe('delivery notes cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps prefix suggestions first and remembers the last reference', () => {
    stubStorage();
    rememberDeliveryNote('reference', '  Torre B, apto 4  ');
    const cached = readDeliveryNotesCache();
    expect(cached.reference).toBe('Torre B, apto 4');
    const chips = deliveryNoteSuggestions(cached.references, DEFAULT_REFERENCE_SUGGESTIONS);
    expect(chips.slice(0, 3)).toEqual(['Al frente de', 'Diagonal a', 'Detrás de']);
    expect(chips).toContain('Torre B, apto 4');
  });

  it('does not drop the other field when saving instructions', () => {
    const store = stubStorage();
    rememberDeliveryNote('reference', 'Casa');
    rememberDeliveryNote('instructions', 'Llamar al llegar');
    const cached = readDeliveryNotesCache();
    expect(cached.reference).toBe('Casa');
    expect(cached.instructions).toBe('Llamar al llegar');
    expect(store.has(DELIVERY_NOTES_CACHE_KEY)).toBe(true);
    expect(deliveryNoteSuggestions(cached.instructionsHistory, DEFAULT_INSTRUCTION_SUGGESTIONS)[0]).toBe(
      'Tocar timbre',
    );
    expect(deliveryNoteSuggestions(cached.instructionsHistory, DEFAULT_INSTRUCTION_SUGGESTIONS)).toContain(
      'Llamar al llegar',
    );
  });

  it('ignores an empty value', () => {
    stubStorage();
    rememberDeliveryNote('reference', 'Casa');
    rememberDeliveryNote('reference', '   ');
    expect(readDeliveryNotesCache().reference).toBe('Casa');
  });
});
