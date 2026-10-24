import { describe, expect, it } from 'vitest';

import { directoryEntryMatchesRegion } from '../app/api/_lib/public-directory-geo';
import {
  formatVenezuelaOperatingStates,
  formatVenezuelaOperatingStatesPreview,
  operatingStatesMatchRegion,
  sanitizeVenezuelaStateSlugs,
  VENEZUELA_STATES,
} from '../app/_lib/venezuela-states';

describe('venezuela states catalog', () => {
  it('has 24 federal entities with unique slugs', () => {
    expect(VENEZUELA_STATES).toHaveLength(24);
    const slugs = VENEZUELA_STATES.map((state) => state.slug);
    expect(new Set(slugs).size).toBe(24);
  });

  it('sanitizes unknown and duplicate slugs', () => {
    expect(
      sanitizeVenezuelaStateSlugs(['miranda', 'MIRANDA', 'foo', 'distrito-capital']),
    ).toEqual(['distrito-capital', 'miranda']);
  });

  it('formats operating labels in Spanish', () => {
    expect(formatVenezuelaOperatingStates(['miranda'])).toBe('Miranda');
    expect(formatVenezuelaOperatingStates(['miranda', 'distrito-capital'])).toBe(
      'Distrito Capital y Miranda',
    );
  });

  it('previews many states without listing them all', () => {
    expect(
      formatVenezuelaOperatingStatesPreview(
        ['distrito-capital', 'miranda', 'zulia', 'aragua'],
        2,
      ),
    ).toBe('Distrito Capital, Miranda y 2 más');
    expect(formatVenezuelaOperatingStatesPreview(['miranda'], 2)).toBe('Miranda');
  });

  it('matches region aliases for virtual operating states', () => {
    expect(operatingStatesMatchRegion(['distrito-capital'], 'Caracas DC')).toBe(true);
    expect(operatingStatesMatchRegion(['distrito-capital'], 'Distrito Capital')).toBe(true);
    expect(operatingStatesMatchRegion(['la-guaira'], 'Vargas')).toBe(true);
    expect(operatingStatesMatchRegion(['miranda'], 'Zulia')).toBe(false);
  });

  it('matches directory region by address or operating states without mixing them up', () => {
    expect(
      directoryEntryMatchesRegion(
        { direccion: 'Av. Francisco de Miranda, Caracas', estadosOperacion: [] },
        'Miranda',
      ),
    ).toBe(true);

    expect(
      directoryEntryMatchesRegion(
        { direccion: null, estadosOperacion: ['zulia'] },
        'Zulia',
      ),
    ).toBe(true);

    expect(
      directoryEntryMatchesRegion(
        { direccion: null, estadosOperacion: ['zulia'] },
        'Miranda',
      ),
    ).toBe(false);

    // Physical shops without states still work; virtual without address needs states.
    expect(
      directoryEntryMatchesRegion(
        { direccion: null, estadosOperacion: [] },
        'Miranda',
      ),
    ).toBe(false);
  });
});
