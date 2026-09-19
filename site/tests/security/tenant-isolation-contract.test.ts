import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260917120000_merchant_panel_real_modules.sql'),
  'utf8',
);

describe('multi-comercio tenant contract (OMG Burgers vs Demo Restaurant)', () => {
  it('defines is_comercio_owner as authenticated uid owning that comercio only', () => {
    expect(migration).toContain('create or replace function public.is_comercio_owner');
    expect(migration).toContain('auth.uid() is not null');
    expect(migration).toContain('c.owner_id = auth.uid()');
  });

  it('scopes pedidos, productos and analytics to the requested comercio', () => {
    expect(migration).toContain('using (public.is_comercio_member(comercio_id))');
    expect(migration).toMatch(/pedidos_member_select[\s\S]*is_comercio_member\(comercio_id\)/);
    expect(migration).toMatch(
      /productos_member_update[\s\S]*comercio_has_role\(comercio_id, array\['administrador'\]/,
    );
    expect(migration).toContain('not public.is_comercio_member(p_comercio_id)');
  });

  it('does not grant anon execute on owner or member helpers', () => {
    expect(migration).toContain(
      'revoke all on function public.is_comercio_owner(uuid) from public, anon',
    );
    expect(migration).toContain(
      'revoke all on function public.is_comercio_member(uuid) from public, anon',
    );
    expect(migration).toContain(
      'revoke all on function public.comercio_has_role(uuid, text[]) from public, anon',
    );
  });
});
