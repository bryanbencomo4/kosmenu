import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

import {
  LOCAL_OFFLINE_CHATBOT_COMMERCE_ID,
  LOCAL_OFFLINE_CHATBOT_SLUG,
} from '../app/api/chat/_lib/commerce-auth';
import { canGuaranteeCostCap } from '../app/api/chat/_lib/live-budget';
import {
  executeChatTool,
  findCheapestProducts,
  type ChatToolContext,
} from '../app/api/chat/_lib/tools';
import type { LoadedPublicMenu } from '../app/api/menu/_lib/load-public-menu';

const hasDb =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

describe('Pizzas El Trueno catalog readiness (read-only)', () => {
  it('guarantees USD 0.02 with 6×7k×256 at Flash-Lite prices', () => {
    const check = canGuaranteeCostCap({
      maxGeminiHttpCalls: 6,
      maxOutputTokensPerCall: 256,
      assumedMaxInputTokensPerCall: 7000,
      priceInputPer1M: 0.25,
      priceOutputPer1M: 1.5,
      maxEstimatedCostUsd: 0.02,
    });
    expect(check.ok).toBe(true);
  });

  it.runIf(hasDb)(
    'loads 35 real products and tools stay tenant-bound',
    async () => {
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );

      const { data: comercio } = await sb
        .from('comercios')
        .select('id,slug,nombre,en_linea,moneda')
        .eq('id', LOCAL_OFFLINE_CHATBOT_COMMERCE_ID)
        .maybeSingle();
      expect(comercio?.slug).toBe(LOCAL_OFFLINE_CHATBOT_SLUG);

      const { data: categorias } = await sb
        .from('categorias')
        .select('id,nombre,orden')
        .eq('comercio_id', LOCAL_OFFLINE_CHATBOT_COMMERCE_ID);
      const { data: productos } = await sb
        .from('productos')
        .select(
          'id,categoria_id,nombre,descripcion,precio,disponible,opciones_menu,comercio_id',
        )
        .eq('comercio_id', LOCAL_OFFLINE_CHATBOT_COMMERCE_ID);

      expect(productos?.length).toBe(35);
      expect(
        (productos || []).every(
          (p) => p.comercio_id === LOCAL_OFFLINE_CHATBOT_COMMERCE_ID,
        ),
      ).toBe(true);

      const menu = {
        resolvedComercioId: LOCAL_OFFLINE_CHATBOT_COMMERCE_ID,
        ownerId: 'test',
        isOnline: false,
        comercioRow: comercio as any,
        comercio: {
          nombre: comercio?.nombre,
          moneda: comercio?.moneda || 'USD',
          en_linea: comercio?.en_linea,
        } as any,
        categorias: categorias || [],
        productos: productos || [],
        metodosPago: [],
        checkoutExchange: {} as any,
        marketRates: null,
        upsellSettings: null,
        upsellRules: [],
        bundles: [],
        preCheckoutUpsell: null as any,
      } satisfies LoadedPublicMenu;

      const ctx: ChatToolContext = {
        menu,
        commerceId: LOCAL_OFFLINE_CHATBOT_COMMERCE_ID,
      };

      const cats = executeChatTool(ctx, 'get_categories', {}) as {
        categories: Array<{ name: string; available_count: number }>;
      };
      expect(cats.categories.length).toBeGreaterThanOrEqual(3);

      const pizzas = executeChatTool(ctx, 'search_products', {
        category: 'PIZZAS',
        available_only: true,
        limit: 12,
      }) as { count: number; results: Array<{ name: string; price_min: number }> };
      expect(pizzas.count).toBeGreaterThan(0);
      expect(pizzas.results[0]?.price_min).toBeGreaterThan(0);

      const cheapest = findCheapestProducts(menu, {
        category: 'PIZZAS',
        limit: 15,
      }) as {
        cheapest_price_min: number;
        results: Array<{ name: string; price_min: number }>;
      };
      expect(cheapest.cheapest_price_min).toBe(3.5);
      expect(
        cheapest.results.every((r) => r.price_min === 3.5),
      ).toBe(true);
      expect(cheapest.results.some((r) => /Jam[oó]n y Queso/i.test(r.name))).toBe(
        false,
      );

      const pluralSearch = executeChatTool(ctx, 'search_products', {
        query: 'hawaianas',
        available_only: true,
        limit: 8,
      }) as { count: number; results: Array<{ name: string }> };
      expect(pluralSearch.count).toBeGreaterThan(0);
      expect(pluralSearch.results.some((r) => /Hawaiana/i.test(r.name))).toBe(
        true,
      );

      const hawaiana = executeChatTool(ctx, 'get_product_details', {
        product_name: 'Hawaiana',
      }) as {
        found: boolean;
        product?: {
          name: string;
          description?: string;
          options_summary?: string | null;
          available: boolean;
          has_option_groups?: boolean;
        };
      };
      expect(hawaiana.found).toBe(true);
      expect(hawaiana.product?.name).toMatch(/Hawaiana/i);
      expect(hawaiana.product?.available).toBe(true);

      const pluralDetails = executeChatTool(ctx, 'get_product_details', {
        product_name: 'hawaianas',
      }) as { found: boolean; product?: { name: string } };
      expect(pluralDetails.found).toBe(true);
      expect(pluralDetails.product?.name).toMatch(/Hawaiana/i);
      expect(
        (hawaiana.product?.description || '').length +
          (hawaiana.product?.options_summary || '').length,
      ).toBeGreaterThan(0);

      const extras = executeChatTool(ctx, 'get_product_details', {
        product_name: 'Hawaiana',
      }) as { product?: { option_groups?: unknown[] } };
      expect((extras.product?.option_groups || []).length).toBeGreaterThan(0);

      const fulfillment = executeChatTool(
        ctx,
        'get_available_fulfillment_methods',
        {},
      ) as Record<string, unknown>;
      expect(fulfillment).toBeTruthy();

      // Tenant lock: mismatched commerceId must throw (no cross-tenant tools)
      expect(() =>
        executeChatTool(
          { ...ctx, commerceId: '11111111-1111-4111-8111-111111111111' },
          'search_products',
          { query: 'Hawaiana' },
        ),
      ).toThrow(/Tenant mismatch/i);
    },
  );
});
