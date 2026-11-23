import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCatalogDigest } from '../app/api/chat/_lib/catalog-digest';
import {
  assertLiveBudgetAllowsNextCall,
  configureLiveBudget,
  configureLiveBudgetFromEnv,
  getLiveBudgetSnapshot,
  LiveBudgetExceededError,
  recordLiveBudgetGeminiHttpCall,
} from '../app/api/chat/_lib/live-budget';
import { buildChatSystemPrompt } from '../app/api/chat/_lib/prompt';
import {
  executeChatTool,
  findCheapestProducts,
  type ChatToolContext,
} from '../app/api/chat/_lib/tools';
import type { LoadedPublicMenu } from '../app/api/menu/_lib/load-public-menu';
import {
  __disableLiveBudgetForTests,
  __resetLiveBudgetBootstrapForTests,
} from '../app/api/chat/_lib/gemini';

const COMMERCE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function pizzaMenu(): LoadedPublicMenu {
  const sizeGrupos = {
    activadas: true,
    grupos: [
      {
        id: 'tam',
        nombre: 'Tamaños',
        tipo: 'unica',
        obligatorio: true,
        min: 1,
        max: 1,
        opciones: [
          { id: 'n', nombre: 'Normal', precio: 0, activo: true },
          { id: 'g', nombre: 'Grande', precio: 5.25, activo: true },
        ],
      },
      {
        id: 'ex',
        nombre: 'Extras',
        tipo: 'multiple',
        obligatorio: false,
        min: 0,
        max: 3,
        opciones: [{ id: 'e1', nombre: 'Añadir extra', precio: 0.5, activo: true }],
      },
    ],
  };

  return {
    resolvedComercioId: COMMERCE,
    ownerId: 'o',
    isOnline: false,
    comercioRow: {
      branding_ia: { config_negocio: { inicio_menu: { delivery: true } } },
    },
    comercio: {
      nombre: 'pizzas el trueno',
      moneda: 'USD',
      en_linea: false,
      permite_delivery: true,
    } as any,
    categorias: [
      { id: 'c-pizza', nombre: 'PIZZAS' },
      { id: 'c-beb', nombre: 'BEBIDAS' },
    ],
    productos: [
      {
        id: 'p-marg',
        categoria_id: 'c-pizza',
        nombre: 'Margarita',
        descripcion: 'Solo Queso',
        precio: 3.5,
        disponible: true,
        opciones_menu: sizeGrupos,
      },
      {
        id: 'p-haw',
        categoria_id: 'c-pizza',
        nombre: 'Hawaiana',
        descripcion: 'Jamón, Queso, Piña',
        precio: 3.5,
        disponible: true,
        opciones_menu: sizeGrupos,
      },
      {
        id: 'p-jq',
        categoria_id: 'c-pizza',
        nombre: 'Jamón y Queso',
        descripcion: 'Jamón, Queso',
        precio: 3.51,
        disponible: true,
        opciones_menu: sizeGrupos,
      },
      {
        id: 'p-gran',
        categoria_id: 'c-pizza',
        nombre: 'Granjera',
        descripcion: 'Jamón, Queso, Pollo, Maíz, Champiñón',
        precio: 4.8,
        disponible: true,
        opciones_menu: sizeGrupos,
      },
      {
        id: 'p-agua',
        categoria_id: 'c-beb',
        nombre: 'Agua 200 ml.',
        precio: 0.44,
        disponible: true,
      },
    ],
    metodosPago: [],
    checkoutExchange: {} as any,
    marketRates: null,
    upsellSettings: null,
    upsellRules: [],
    bundles: [],
    preCheckoutUpsell: null as any,
  };
}

describe('find_cheapest_products (deterministic)', () => {
  const menu = pizzaMenu();
  const ctx: ChatToolContext = { menu, commerceId: COMMERCE };

  it('returns $3.50 pizzas as cheapest in PIZZAS (not $3.51 Jamón y Queso)', () => {
    const hit = executeChatTool(ctx, 'find_cheapest_products', {
      category: 'PIZZAS',
      limit: 10,
    }) as any;
    expect(hit.cheapest_price_min).toBe(3.5);
    expect(hit.tie_count).toBeGreaterThanOrEqual(2);
    expect(hit.results.every((r: any) => r.price_min === 3.5)).toBe(true);
    expect(hit.results.some((r: any) => r.name === 'Jamón y Queso')).toBe(false);
    expect(hit.results.some((r: any) => /Margarita|Hawaiana/i.test(r.name))).toBe(
      true,
    );
  });

  it('exposes price_base vs price_min/max for size variations', () => {
    const hit = findCheapestProducts(menu, { category: 'PIZZAS', limit: 1 }) as any;
    const row = hit.results[0];
    expect(row.price_base).toBe(3.5);
    expect(row.price_min).toBe(3.5);
    expect(row.price_max).toBeGreaterThan(row.price_min);
  });

  it('sorts search_products by price_min so slice cannot hide cheaper items', () => {
    const hit = executeChatTool(ctx, 'search_products', {
      category: 'PIZZAS',
      limit: 2,
    }) as any;
    expect(hit.sorted_by).toBe('price_min_asc');
    expect(hit.results[0].price_min).toBe(3.5);
    expect(hit.results[0].price_min).toBeLessThanOrEqual(hit.results[1].price_min);
  });
});

describe('Hawaiana ingredients + delivery + recommendations helpers', () => {
  const menu = pizzaMenu();
  const ctx: ChatToolContext = { menu, commerceId: COMMERCE };

  it('returns Hawaiana ingredients from catalog description/options', () => {
    const d = executeChatTool(ctx, 'get_product_details', {
      product_name: 'Hawaiana',
    }) as any;
    expect(d.found).toBe(true);
    expect(d.product.description).toMatch(/Piña/i);
    expect(d.product.option_groups.some((g: any) => /Tama/i.test(g.name))).toBe(
      true,
    );
  });

  it('reports delivery availability from public flags', () => {
    const f = executeChatTool(ctx, 'get_available_fulfillment_methods', {}) as any;
    expect(f.delivery).toBe(true);
  });

  it('budget search supports recommendations for two (max_price filter)', () => {
    const hit = executeChatTool(ctx, 'search_products', {
      category: 'PIZZAS',
      max_price: 8,
      limit: 6,
    }) as any;
    expect(hit.count).toBeGreaterThan(0);
    expect(hit.results.every((r: any) => r.price_min <= 8)).toBe(true);
  });
});

describe('catalog digest + prompt (fewer unnecessary tool rounds)', () => {
  it('builds a compact digest with cheapest items without dumping full catalog', () => {
    const menu = pizzaMenu();
    const digest = buildCatalogDigest(menu);
    expect(digest.length).toBeLessThanOrEqual(1200);
    expect(digest).toMatch(/find_cheapest_products/);
    expect(digest).toMatch(/Margarita|Hawaiana|Agua/);
    expect(digest.length).toBeLessThan(JSON.stringify(menu.productos).length);
  });

  it('system prompt requires find_cheapest_products for cheapest queries', () => {
    const prompt = buildChatSystemPrompt({
      businessName: 'pizzas el trueno',
      currency: 'USD',
      catalogDigest: buildCatalogDigest(pizzaMenu()),
    });
    expect(prompt).toMatch(/find_cheapest_products/);
    expect(prompt).toMatch(/UNA sola ronda/);
    expect(prompt).toMatch(/get_delivery_conditions/);
    expect(prompt).toMatch(/prepare_cart_line_proposal/);
    expect(prompt).toMatch(/NO inventes un monto exacto|requires_customer_address/);
  });
});

describe('live budget persistence across restart', () => {
  afterEach(() => {
    __resetLiveBudgetBootstrapForTests();
    vi.unstubAllEnvs();
  });

  it('survives reconfigure without resetting counters (hydrate from disk)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'live-budget-'));
    const file = join(dir, 'budget.json');

    configureLiveBudget({
      enabled: true,
      maxGeminiHttpCalls: 6,
      maxEstimatedCostUsd: 0.02,
      persistPath: file,
      resetCounters: true,
    });
    recordLiveBudgetGeminiHttpCall();
    recordLiveBudgetGeminiHttpCall();
    recordLiveBudgetGeminiHttpCall();
    expect(getLiveBudgetSnapshot().geminiHttpCalls).toBe(3);
    expect(existsSync(file)).toBe(true);

    // Simulate process restart: re-bootstrap from env + disk
    __resetLiveBudgetBootstrapForTests();
    vi.stubEnv('CHATBOT_LIVE_HARD_CAPS', '1');
    vi.stubEnv('CHATBOT_LIVE_MAX_GEMINI_CALLS', '6');
    vi.stubEnv('CHATBOT_LIVE_MAX_COST_USD', '0.02');
    vi.stubEnv('CHATBOT_LIVE_BUDGET_FILE', file);
    vi.stubEnv('CHATBOT_LIVE_BUDGET_RESET', '');
    configureLiveBudgetFromEnv(process.env);

    expect(getLiveBudgetSnapshot().geminiHttpCalls).toBe(3);
    expect(() => {
      recordLiveBudgetGeminiHttpCall();
      recordLiveBudgetGeminiHttpCall();
      recordLiveBudgetGeminiHttpCall();
      assertLiveBudgetAllowsNextCall();
    }).toThrow(LiveBudgetExceededError);

    const disk = JSON.parse(readFileSync(file, 'utf8'));
    expect(disk.geminiHttpCalls).toBe(6);
  });

  it('CHATBOT_LIVE_BUDGET_RESET=1 clears counters for a new authorized smoke', () => {
    const dir = mkdtempSync(join(tmpdir(), 'live-budget-reset-'));
    const file = join(dir, 'budget.json');
    configureLiveBudget({
      enabled: true,
      maxGeminiHttpCalls: 6,
      persistPath: file,
      resetCounters: true,
    });
    recordLiveBudgetGeminiHttpCall();
    recordLiveBudgetGeminiHttpCall();

    vi.stubEnv('CHATBOT_LIVE_HARD_CAPS', '1');
    vi.stubEnv('CHATBOT_LIVE_BUDGET_FILE', file);
    vi.stubEnv('CHATBOT_LIVE_BUDGET_RESET', '1');
    configureLiveBudgetFromEnv(process.env);
    expect(getLiveBudgetSnapshot().geminiHttpCalls).toBe(0);
  });
});

describe('gemini tool-round reduction (mocked HTTP)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __disableLiveBudgetForTests();
  });

  it('answers with a single Gemini HTTP when no tools are needed', async () => {
    __disableLiveBudgetForTests();
    const { runChatWithGemini } = await import('../app/api/chat/_lib/gemini');
    const { getChatbotConfig } = await import('../app/api/chat/_lib/config');

    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: 'Tenemos Margarita y Hawaiana desde 3.50 USD según el catálogo.',
                    },
                  ],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
          }),
        };
      }),
    );

    const result = await runChatWithGemini({
      config: {
        ...getChatbotConfig(),
        geminiApiKey: 'fake',
        model: 'gemini-3.1-flash-lite',
        modelFallback: 'gemini-2.5-flash-lite',
        modelWarnings: [],
        timeoutMs: 5000,
        maxToolRounds: 2,
        maxHistoryMessages: 8,
        maxOutputTokens: 128,
      },
      toolCtx: { menu: pizzaMenu(), commerceId: COMMERCE },
      businessName: 'pizzas el trueno',
      messages: [{ role: 'user', text: '¿Qué pizzas tienen?' }],
      requestId: 'req_test',
    });

    expect(calls).toBe(1);
    expect(result.geminiHttpCalls).toBe(1);
    expect(result.toolCalls).toBe(0);
  });

  it('uses one tool round (2 HTTP) for find_cheapest_products then final answer', async () => {
    __disableLiveBudgetForTests();
    const { runChatWithGemini } = await import('../app/api/chat/_lib/gemini');
    const { getChatbotConfig } = await import('../app/api/chat/_lib/config');

    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { body?: string }) => {
        calls += 1;
        if (calls === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        functionCall: {
                          name: 'find_cheapest_products',
                          args: { category: 'PIZZAS' },
                        },
                        thoughtSignature: 'sig',
                      },
                    ],
                  },
                },
              ],
              usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 10 },
            }),
          };
        }
        const body = init?.body ? JSON.parse(init.body) : {};
        const contents = body.contents || [];
        const hasFnResponse = contents.some(
          (c: any) =>
            Array.isArray(c.parts) &&
            c.parts.some((p: any) => p.functionResponse?.name === 'find_cheapest_products'),
        );
        expect(hasFnResponse).toBe(true);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: 'Las pizzas más económicas cuestan desde 3.50 USD (Margarita, Hawaiana…).',
                    },
                  ],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 25 },
          }),
        };
      }),
    );

    const result = await runChatWithGemini({
      config: {
        ...getChatbotConfig(),
        geminiApiKey: 'fake',
        model: 'gemini-3.1-flash-lite',
        modelFallback: 'gemini-2.5-flash-lite',
        modelWarnings: [],
        timeoutMs: 5000,
        maxToolRounds: 2,
        maxHistoryMessages: 8,
        maxOutputTokens: 128,
      },
      toolCtx: { menu: pizzaMenu(), commerceId: COMMERCE },
      businessName: 'pizzas el trueno',
      messages: [{ role: 'user', text: '¿Cuál es la pizza más económica?' }],
      requestId: 'req_test',
    });

    expect(result.geminiHttpCalls).toBe(2);
    expect(result.toolCalls).toBe(1);
    expect(result.text).toMatch(/3\.50/);
    expect(calls).toBe(2);
  });
});
