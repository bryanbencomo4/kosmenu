import { describe, expect, it } from 'vitest';

/**
 * Contract tests documenting the intended post-2A.2 access matrix.
 * These do not hit Supabase; they guard against accidental policy regressions in docs/code.
 */

const proposed = {
  pedidos: {
    anon: [] as string[],
    authenticated: ['SELECT', 'UPDATE'],
  },
  categorias: {
    anon: ['SELECT'],
    authenticated: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  delivery_couriers: {
    anon: [] as string[],
    authenticated: ['SELECT'],
  },
} as const;

describe('proposed RLS grant matrix contract', () => {
  it('denies anon any pedidos privileges', () => {
    expect(proposed.pedidos.anon).toEqual([]);
  });

  it('does not grant anon catalog writes', () => {
    expect(proposed.categorias.anon).toEqual(['SELECT']);
    expect(proposed.categorias.anon).not.toContain('INSERT');
    expect(proposed.categorias.anon).not.toContain('UPDATE');
    expect(proposed.categorias.anon).not.toContain('DELETE');
    expect(proposed.categorias.anon).not.toContain('TRUNCATE');
  });

  it('keeps authenticated owner updates on pedidos without insert/delete', () => {
    expect(proposed.pedidos.authenticated).toEqual(['SELECT', 'UPDATE']);
  });

  it('keeps delivery_couriers closed to anon', () => {
    expect(proposed.delivery_couriers.anon).toEqual([]);
  });
});
