import { describe, expect, it } from 'vitest';

import {
  foldSearchText,
  fuzzyIncludes,
  scoreFoldedMatch,
} from '../app/_lib/search-text';

describe('foldSearchText', () => {
  it('matches a letter with or without an accent', () => {
    const folded = foldSearchText('Jamón Selvanegra');
    expect(folded.includes(foldSearchText('jamon'))).toBe(true);
    expect(folded.includes(foldSearchText('jamón'))).toBe(true);
    expect(foldSearchText('PizZá El Trueno')).toBe('pizza el trueno');
    expect(foldSearchText('Niño').includes(foldSearchText('nino'))).toBe(true);
  });
});

describe('fuzzyIncludes / scoreFoldedMatch', () => {
  it('tolerates single-character typos on longer tokens', () => {
    expect(fuzzyIncludes('hamburguesa clasica', 'hamburgesa')).toBe(true);
    expect(fuzzyIncludes('pizza margarita', 'piza')).toBe(true);
    expect(scoreFoldedMatch('arepa de queso', 'arepa')).toBeGreaterThan(0);
  });

  it('scores accent-folded dish queries', () => {
    const haystack = foldSearchText('Jamón Ibérico');
    const needle = foldSearchText('jamon');
    expect(scoreFoldedMatch(haystack, needle)).toBeGreaterThan(0);
  });
});
