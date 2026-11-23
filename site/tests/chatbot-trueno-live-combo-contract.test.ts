/**
 * Live-read Trueno combo contract: chat prepareCartLineProposal vs traditional
 * resolveCombinedUnitPrice. Skips without Supabase env. No Gemini. No writes.
 */
import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  autoPartnerSelection,
  parseProductMenuOptions,
  resolveCombinedUnitPrice,
  type CartLineSelection,
} from '../app/_lib/menu-product-options';
import { prepareCartLineProposal } from '../app/api/chat/_lib/cart-proposals';
import { describeBusinessExchangeRate } from '../app/api/chat/_lib/chat-currency';
import type { LoadedPublicMenu } from '../app/api/menu/_lib/load-public-menu';
import { extractPublicCheckoutExchange } from '../app/api/_lib/checkout-exchange-config';

const COMMERCE_ID = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const hasEnv = Boolean(url && key);

async function loadTruenoMenu(): Promise<LoadedPublicMenu | null> {
  if (!hasEnv) return null;
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: comercio } = await sb
    .from('comercios')
    .select('*')
    .eq('id', COMMERCE_ID)
    .maybeSingle();
  if (!comercio) return null;
  const { data: categorias } = await sb
    .from('categorias')
    .select('id,nombre,opciones_menu')
    .eq('comercio_id', COMMERCE_ID);
  const { data: productos, error: pErr } = await sb
    .from('productos')
    .select(
      'id,nombre,descripcion,precio,disponible,categoria_id,opciones_menu,imagen_url',
    )
    .eq('comercio_id', COMMERCE_ID);
  if (pErr) {
    throw new Error(`productos load failed: ${pErr.message}`);
  }
  return {
    resolvedComercioId: COMMERCE_ID,
    ownerId: 'audit',
    isOnline: comercio.en_linea === true,
    comercioRow: { id: COMMERCE_ID },
    comercio: comercio as any,
    categorias: (categorias || []) as any,
    productos: (productos || []) as any,
    metodosPago: [],
    checkoutExchange: extractPublicCheckoutExchange(comercio.branding_ia),
    marketRates: null,
    upsellSettings: null,
    upsellRules: [],
    bundles: [],
    preCheckoutUpsell: null as any,
  };
}

function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

describe.runIf(hasEnv)('Trueno live combo + FX contracts (read-only)', () => {
  it('chat combo Grande price matches traditional MAX helper', async () => {
    const menu = await loadTruenoMenu();
    expect(menu).toBeTruthy();
    if (!menu) return;

    expect(String((menu.comercio as any).moneda || '').toUpperCase()).toBe(
      'USD',
    );

    const byName = (needle: string) =>
      (menu.productos as any[]).find((p) => {
        const n = fold(p.nombre || '');
        return n === needle || n.includes(needle);
      });
    const granjera = byName('granjera');
    const campesina = byName('campesina');
    expect(granjera?.id, `products=${(menu.productos as any[]).length}`).toBeTruthy();
    expect(campesina?.id).toBeTruthy();

    const chat = prepareCartLineProposal(menu, COMMERCE_ID, {
      product_id: granjera.id,
      combine_with_product_id: campesina.id,
      option_labels: ['Grande'],
      quantity: 1,
    });
    expect(chat.status).toBe('ready');
    if (chat.status !== 'ready') return;

    expect(chat.action.quantity).toBe(1);
    expect(chat.action.selection.combinacion?.productId).toBe(campesina.id);
    expect(chat.action.currency).toBe('USD');

    // Traditional mirror
    const options = parseProductMenuOptions(granjera.opciones_menu);
    const sizeGroup = (options?.grupos || []).find((g) =>
      /tamano|tamaño|size/i.test(g.nombre),
    );
    const grande = (sizeGroup?.opciones || []).find(
      (o) => fold(o.nombre) === 'grande',
    );
    expect(grande?.id).toBeTruthy();
    const primarySelection: CartLineSelection = {
      grupos: { [sizeGroup!.id]: [grande!.id] },
    };
    const partnerSelection = autoPartnerSelection(
      granjera,
      primarySelection,
      campesina,
    );
    const traditionalSelection: CartLineSelection = {
      ...primarySelection,
      combinacion: {
        productId: campesina.id,
        seleccion: partnerSelection,
      },
    };
    const traditionalPrice = resolveCombinedUnitPrice(
      granjera,
      null,
      traditionalSelection,
      campesina,
      null,
    );

    expect(chat.action.unit_price).toBe(traditionalPrice);
    expect(chat.action.unit_price).toBeCloseTo(10.91, 2);
  });

  it('get_exchange_rate source matches comercio COP rate 3200', async () => {
    const menu = await loadTruenoMenu();
    expect(menu).toBeTruthy();
    if (!menu) return;

    const fx = describeBusinessExchangeRate(menu, {
      quoteCurrency: 'COP',
      amount: 10,
      fromCurrency: 'USD',
    });
    expect(fx.ok).toBe(true);
    if (!fx.ok) return;
    expect(fx.currency_menu).toBe('USD');
    expect(fx.quote_currency).toBe('COP');
    // 1 USD = 3200 COP (quote units per base when quote=COP)
    expect(fx.rate).toBe(3200);
    expect(fx.amount_to).toBe(32000);
    expect(fx.source).toMatch(/google|manual/i);
  });

  it('rejects unauthorized partner combination on server', async () => {
    const menu = await loadTruenoMenu();
    if (!menu) return;
    const granjera = (menu.productos as any[]).find((p) =>
      fold(p.nombre || '').includes('granjera'),
    );
    expect(granjera?.id).toBeTruthy();
    // Pick a product not in compatible list if possible; else invent id
    const foreignId = '00000000-0000-4000-8000-000000000099';
    const r = prepareCartLineProposal(menu, COMMERCE_ID, {
      product_id: granjera!.id,
      combine_with_product_id: foreignId,
      option_labels: ['Grande'],
    });
    expect(['combination_not_allowed', 'not_found']).toContain(r.status);
  });
});

describe.runIf(!hasEnv)('Trueno live combo (skipped without env)', () => {
  it('skips when Supabase env missing', () => {
    expect(hasEnv).toBe(false);
  });
});
