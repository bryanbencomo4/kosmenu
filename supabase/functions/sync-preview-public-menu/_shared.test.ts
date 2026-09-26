import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertSyncOrigins,
  constantTimeEqual,
  clearInvisibleCatalogReferences,
  PREVIEW_SUPABASE_URL,
  PRODUCTION_SUPABASE_URL,
  toPreviewCommerceRow,
} from './_shared.ts';

Deno.test('sync origins are pinned to Production source and Preview destination', () => {
  assertSyncOrigins(PRODUCTION_SUPABASE_URL, PREVIEW_SUPABASE_URL);
  assertThrows(
    () => assertSyncOrigins(PREVIEW_SUPABASE_URL, PRODUCTION_SUPABASE_URL),
    Error,
    'source',
  );
  assertThrows(
    () => assertSyncOrigins(PRODUCTION_SUPABASE_URL, PRODUCTION_SUPABASE_URL),
    Error,
    'target',
  );
});

Deno.test('sync secret comparison rejects empty, missing, or unequal values', () => {
  assertEquals(constantTimeEqual('preview-secret', 'preview-secret'), true);
  assertEquals(constantTimeEqual('preview-secret', 'other-secret'), false);
  assertEquals(constantTimeEqual('', ''), false);
});

Deno.test('commerce mapping keeps only public fields and whitelisted checkout config', () => {
  const mapped = toPreviewCommerceRow({
    id: 'commerce-1',
    nombre: 'Demo',
    slug: 'demo',
    en_linea: true,
    owner_id: 'must-not-copy',
    metodos_pago: [{ numero: 'must-not-copy' }],
    checkout_currencies: ['VES'],
    exchange_rates: { VES: 1000 },
    social_links: {
      instagram: 'https://instagram.com/demo',
      internal: 'must-not-copy',
    },
  });

  assertEquals(Object.hasOwn(mapped, 'owner_id'), false);
  assertEquals(Object.hasOwn(mapped, 'metodos_pago'), false);
  assertEquals(Object.hasOwn(mapped, 'checkout_currencies'), false);
  assertEquals(mapped.branding_ia, {
    config_negocio: {
      checkout_currencies: ['VES'],
      exchange_rates: { VES: 1000 },
      social_links: { instagram: 'https://instagram.com/demo' },
    },
  });
});

Deno.test('catalog references hidden by Production RLS are cleared for Preview foreign keys', () => {
  const categories = clearInvisibleCatalogReferences(
    [{ id: 'visible-catalog' }],
    [
      { id: 'category-visible-parent', catalogo_id: 'visible-catalog' },
      { id: 'category-hidden-parent', catalogo_id: 'hidden-catalog' },
      { id: 'category-no-parent', catalogo_id: null },
    ],
  );

  assertEquals(categories[0].catalogo_id, 'visible-catalog');
  assertEquals(categories[1].catalogo_id, null);
  assertEquals(categories[2].catalogo_id, null);
});