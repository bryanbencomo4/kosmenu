import { describe, expect, it } from 'vitest';

import { inferFollowUpIntent, parseBusinessIntent } from '../app/api/asistente-negocio/_lib/intents';
import { resolveProductMatch, type ProductRow } from '../app/api/asistente-negocio/_lib/product-match';

const P = (id: string, nombre: string): ProductRow =>
  ({ id, nombre, precio: 1, disponible: true, categoria_id: null, imagen_url: null }) as unknown as ProductRow;

const catalog = [
  P('1', 'Agua'),
  P('2', 'Agua 1 Lt.'),
  P('3', 'Agua 600 ml'),
  P('4', 'Pizza Campesina'),
  P('5', 'Pizza Margarita'),
  P('6', 'Coca-Cola 2 L'),
];

describe('product matching', () => {
  it('keeps numbers and units: "Agua 1 Lt." / "Agua 1L" / "agua 1 litro"', () => {
    for (const hint of ['cambiar foto Agua 1 Lt.', 'Agua 1L', 'agua 1 litro', 'La del agua 1 lt']) {
      const r = resolveProductMatch(catalog, hint);
      expect(r.status).toBe('exact');
      if (r.status === 'exact') expect(r.product.id).toBe('2');
    }
  });

  it('plain name picks the plain product over longer ones', () => {
    const r = resolveProductMatch(catalog, 'cambiar foto Agua');
    expect(r.status).toBe('exact');
    if (r.status === 'exact') expect(r.product.id).toBe('1');
  });

  it('ignores the new price when matching', () => {
    const r = resolveProductMatch(catalog, 'cambiar precio pizza campesina a 15');
    expect(r.status).toBe('exact');
    if (r.status === 'exact') expect(r.product.id).toBe('4');
  });

  it('is ambiguous for generic words', () => {
    expect(resolveProductMatch(catalog, 'pizza').status).toBe('ambiguous');
  });

  it('matches hyphenated names and plurals', () => {
    const r = resolveProductMatch(catalog, 'coca cola 2l');
    expect(r.status).toBe('exact');
  });
});

describe('product follow-ups', () => {
  it('answering "which product?" replays the photo request', () => {
    const prior = ['cambiar foto agua'];
    const f = inferFollowUpIntent('La del agua', '¿De cuál producto es la foto? 🖼️', prior);
    expect(f).toEqual({ kind: 'change_image', productHint: 'La del agua' });
    const again = inferFollowUpIntent('Agua 1L', '¿De cuál producto es la foto? 🖼️', [
      ...prior,
      'La del agua',
    ]);
    expect(again).toEqual({ kind: 'change_image', productHint: 'Agua 1L' });
  });

  it('bare number after "¿A cuánto lo dejamos?" applies to the named product', () => {
    const f = inferFollowUpIntent(
      '12',
      '*Agua 1 Lt.* está en *3* USD 💵\n\n¿A cuánto lo dejamos? (ej. “a 12”)',
      ['cambiar precio Agua 1 Lt.'],
    );
    expect(f).toMatchObject({ kind: 'propose_price', productHint: 'Agua 1 Lt.', newPrice: 12 });
  });

  it('chip text for photo parses as change_image', () => {
    expect(parseBusinessIntent('cambiar foto Agua 1 Lt.').kind).toBe('change_image');
  });
});
