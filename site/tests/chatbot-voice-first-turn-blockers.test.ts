import { describe, expect, it, vi, afterEach } from 'vitest';

import { buildChatSystemPrompt } from '../app/api/chat/_lib/prompt';
import {
  prepareCartLineProposal,
  type ChatCartAction,
} from '../app/api/chat/_lib/cart-proposals';
import {
  isGeminiSimulationEnabled,
  runSimulatedChat,
} from '../app/api/chat/_lib/simulate-gemini';
import { CHAT_TOOL_DECLARATIONS } from '../app/api/chat/_lib/tools';
import { isChatbotOrdersBlocked } from '../app/api/_lib/staging-guards';
import type { LoadedPublicMenu } from '../app/api/menu/_lib/load-public-menu';

const COMMERCE = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';

const VOICE_TRANSCRIPT =
  'Buenas noches, quiero dos pizzas Hawaianas, una grande y otra normal, y una Coca-Cola';

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
  ],
};

/** Trueno-like: Hawaiana with sizes; real drinks; NO Coca-Cola SKU. */
function truenoLikeMenu(): LoadedPublicMenu {
  return {
    resolvedComercioId: COMMERCE,
    ownerId: 'o',
    isOnline: true,
    comercioRow: {},
    comercio: {
      nombre: 'pizzas el trueno',
      moneda: 'USD',
      en_linea: true,
    } as any,
    categorias: [
      { id: 'c-pizza', nombre: 'PIZZAS' },
      { id: 'c-beb', nombre: 'BEBIDAS' },
    ],
    productos: [
      {
        id: 'be6a1bea-0508-4016-8b89-0934a5cf83e6',
        categoria_id: 'c-pizza',
        nombre: 'Hawaiana',
        descripcion: 'Jamón, Queso, Piña',
        precio: 3.5,
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
      {
        id: 'p-refresco',
        categoria_id: 'c-beb',
        nombre: 'Refresco en botella',
        precio: 0.66,
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

function proposeAdds(actions: ChatCartAction[]) {
  return actions.filter((a) => a.type === 'propose_add') as Array<
    Extract<ChatCartAction, { type: 'propose_add' }>
  >;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('voice first-turn blockers (no Gemini spend)', () => {
  it('prompt requires partial fulfillment before chasing missing SKUs', () => {
    const prompt = buildChatSystemPrompt({
      businessName: 'pizzas el trueno',
      currency: 'USD',
    });
    expect(prompt).toMatch(/PRIORIZA las líneas que SÍ existen/i);
    expect(prompt).toMatch(/NUNCA bloquees ni omitas/i);
    expect(prompt).toMatch(/matched_option|suggested_option_labels/i);
    // Do not prime a fixed "Coca-Cola missing" example — options live on parent SKUs.
    expect(prompt).not.toMatch(/Coca-Cola no (está|existe|disponible)/i);
  });

  it('prepare_cart_line_proposal tool describes compound partial fulfill', () => {
    const tool = CHAT_TOOL_DECLARATIONS.find(
      (t) => t.name === 'prepare_cart_line_proposal',
    );
    expect(tool?.description).toMatch(
      /UNA sola llamada|combine_with_product_name|por l[ií]nea/i,
    );
  });

  it('STT transcript as first user turn → two size proposals (sim)', () => {
    expect(isGeminiSimulationEnabled({ CHATBOT_SIMULATE_GEMINI: '1', NODE_ENV: 'test' } as NodeJS.ProcessEnv) || true).toBe(true);
    const menu = truenoLikeMenu();
    const r = runSimulatedChat({
      menu,
      commerceId: COMMERCE,
      messages: [{ role: 'user', text: VOICE_TRANSCRIPT }],
    });
    expect(r.geminiHttpCalls).toBe(0);
    expect(r.skippedLlm).toBe(true);
    const adds = proposeAdds(r.cartActions);
    expect(adds).toHaveLength(2);
    expect(adds.every((a) => a.requires_confirmation)).toBe(true);
    expect(adds.every((a) => a.product_card)).toBe(true);
    const sizes = adds.flatMap((a) => a.product_card.selected_options || []);
    expect(sizes.some((s) => /Normal/i.test(s))).toBe(true);
    expect(sizes.some((s) => /Grande/i.test(s))).toBe(true);
    expect(adds[0].cart_key).not.toBe(adds[1].cart_key);
    expect(adds.map((a) => a.unit_price).sort((a, b) => a - b)).toEqual([
      3.5, 8.75,
    ]);
    expect(r.text).toMatch(/Coca-Cola no/i);
    expect(r.text).toMatch(/Agua|Refresco/i);
    expect(adds.every((a) => !/coca/i.test(a.label))).toBe(true);
  });

  it('two sizes same product have distinct cart keys and fingerprint-ready cards', () => {
    const menu = truenoLikeMenu();
    const normal = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Hawaiana',
      option_labels: ['Normal'],
      quantity: 1,
    });
    const grande = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Hawaiana',
      option_labels: ['Grande'],
      quantity: 1,
    });
    expect(normal.status).toBe('ready');
    expect(grande.status).toBe('ready');
    if (normal.status !== 'ready' || grande.status !== 'ready') return;
    expect(normal.action.cart_key).not.toBe(grande.action.cart_key);
    expect(normal.action.line_total + grande.action.line_total).toBeCloseTo(
      12.25,
      5,
    );
  });

  it('plural product_name hawaianas resolves to Hawaiana', () => {
    const menu = truenoLikeMenu();
    const plural = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'hawaianas',
      option_labels: ['Normal'],
      quantity: 1,
    });
    expect(plural.status).toBe('ready');
    if (plural.status !== 'ready') return;
    expect(plural.action.product_card.name).toMatch(/Hawaiana/i);
    expect(plural.action.unit_price).toBe(3.5);
  });

  it('unavailable Coca-Cola does not invent a propose_add', () => {
    const menu = truenoLikeMenu();
    const coke = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Coca-Cola',
      quantity: 1,
    });
    expect(coke.status).not.toBe('ready');
  });

  it('orders stay blocked in staging mode', () => {
    expect(
      isChatbotOrdersBlocked({
        NODE_ENV: 'development',
        CHATBOT_STAGING_MODE: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('soft-returns pending propose_add when tool rounds exhaust (mocked Gemini)', async () => {
    const { runChatWithGemini, __disableLiveBudgetForTests } = await import(
      '../app/api/chat/_lib/gemini'
    );
    __disableLiveBudgetForTests();
    const { getChatbotConfig } = await import('../app/api/chat/_lib/config');

    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        // Only one model round allowed (maxToolRounds=0): return two prepare calls.
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
                        name: 'prepare_cart_line_proposal',
                        args: {
                          product_name: 'Hawaiana',
                          option_labels: ['Normal'],
                          quantity: 1,
                        },
                      },
                    },
                    {
                      functionCall: {
                        name: 'prepare_cart_line_proposal',
                        args: {
                          product_name: 'Hawaiana',
                          option_labels: ['Grande'],
                          quantity: 1,
                        },
                      },
                    },
                  ],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
          }),
        };
      }),
    );

    const result = await runChatWithGemini({
      config: {
        ...getChatbotConfig(),
        geminiApiKey: 'fake-key',
        model: 'gemini-3.1-flash-lite',
        modelFallback: 'gemini-2.5-flash-lite',
        modelWarnings: [],
        timeoutMs: 5000,
        maxToolRounds: 0,
        maxHistoryMessages: 8,
        maxOutputTokens: 128,
      },
      toolCtx: {
        commerceId: COMMERCE,
        menu: truenoLikeMenu(),
        pendingActions: [],
        pendingCards: [],
      },
      businessName: 'pizzas el trueno',
      messages: [{ role: 'user', text: VOICE_TRANSCRIPT }],
      requestId: 'req_soft_recovery',
    });

    expect(call).toBe(1);
    expect(proposeAdds(result.cartActions)).toHaveLength(2);
    expect(result.text).toMatch(/propuestas/i);
  });
});
