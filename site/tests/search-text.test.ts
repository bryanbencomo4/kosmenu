import { describe, expect, it } from 'vitest';

import { foldSearchText } from '../app/_lib/search-text';

describe('foldSearchText', () => {
  it('matches a letter with or without an accent', () => {
    const folded = foldSearchText('Jamón Selvanegra');
    expect(folded.includes(foldSearchText('jamon'))).toBe(true);
    expect(folded.includes(foldSearchText('jamón'))).toBe(true);
    expect(foldSearchText('PizZá El Trueno')).toBe('pizza el trueno');
    expect(foldSearchText('Niño').includes(foldSearchText('nino'))).toBe(true);
  });
});
