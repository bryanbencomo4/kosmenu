import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getChatbotConfig,
  isChatbotRuntimeAllowed,
} from '../app/api/chat/_lib/config';
import {
  chatRequestSchema,
  sanitizeChatRequestMessages,
} from '../app/api/chat/_lib/schema';
import { buildChatbotWelcomeMessage } from '../app/_lib/chatbot-preview';

describe('chatbot runtime gates', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires CHATBOT_ENABLED and blocks production by default', () => {
    vi.stubEnv('CHATBOT_ENABLED', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(isChatbotRuntimeAllowed(getChatbotConfig()).ok).toBe(false);

    vi.stubEnv('CHATBOT_ENABLED', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CHATBOT_ALLOW_PRODUCTION', '');
    vi.stubEnv('CHATBOT_QUOTA_BACKEND', 'postgres');
    expect(isChatbotRuntimeAllowed(getChatbotConfig()).ok).toBe(false);

    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CHATBOT_QUOTA_BACKEND', 'filesystem');
    vi.stubEnv('GEMINI_API_KEY', 'fake-key-for-gate-test');
    expect(isChatbotRuntimeAllowed(getChatbotConfig()).ok).toBe(true);
  });

  it('does not treat NEXT_PUBLIC flags as server enablement', () => {
    vi.stubEnv('CHATBOT_ENABLED', '');
    vi.stubEnv('NEXT_PUBLIC_CHATBOT_PREVIEW', '1');
    expect(isChatbotRuntimeAllowed(getChatbotConfig()).ok).toBe(false);
  });

  it('rejects body schema with empty messages', () => {
    expect(() => chatRequestSchema.parse({ messages: [] })).toThrow();
  });

  it('sanitizes empty onboarding TTS bubbles so the turn still parses', () => {
    const cleaned = sanitizeChatRequestMessages({
      messages: [
        { role: 'assistant', text: '¡Hola!' },
        { role: 'assistant', text: '' },
        { role: 'assistant', text: '   ' },
        { role: 'user', text: 'hola que productos hay ?' },
      ],
    });
    const parsed = chatRequestSchema.parse(cleaned);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[1]?.text).toMatch(/productos/i);
  });

  it('welcome copy is short and uses the restaurant name', () => {
    const demo = buildChatbotWelcomeMessage('Lunetz');
    const live = buildChatbotWelcomeMessage('Lunetz', { runtimeEnabled: true });
    expect(demo).toContain('Lunetz');
    expect(live).toContain('Lunetz');
    expect(live).toMatch(/bienvenido/i);
    expect(live).not.toMatch(/solo se agregan al carrito/i);
    expect(live.split('\n').length).toBeLessThanOrEqual(6);
  });
});

describe('chatbot gemini client (mocked)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns text from Gemini without inventing cart actions', async () => {
    const { runChatWithGemini, __disableLiveBudgetForTests } = await import(
      '../app/api/chat/_lib/gemini'
    );
    __disableLiveBudgetForTests();
    const { getChatbotConfig } = await import('../app/api/chat/_lib/config');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Tenemos Hamburguesa de Pollo a $7.50.' }],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 8 },
        }),
      })),
    );

    const config = {
      ...getChatbotConfig(),
      enabled: true,
      geminiApiKey: 'fake-key',
      model: 'gemini-3.1-flash-lite',
      modelFallback: 'gemini-2.5-flash-lite',
      modelWarnings: [],
      timeoutMs: 5000,
      maxToolRounds: 2,
      maxHistoryMessages: 10,
      maxOutputTokens: 128,
    };

    const result = await runChatWithGemini({
      config,
      toolCtx: {
        commerceId: '11111111-1111-4111-8111-111111111111',
        menu: {
          resolvedComercioId: '11111111-1111-4111-8111-111111111111',
          ownerId: 'o',
          isOnline: true,
          comercioRow: {},
          comercio: { nombre: 'Demo', moneda: 'USD' } as any,
          categorias: [],
          productos: [],
          metodosPago: [],
          checkoutExchange: {} as any,
          marketRates: null,
          upsellSettings: null,
          upsellRules: [],
          bundles: [],
          preCheckoutUpsell: null as any,
        },
      },
      businessName: 'Demo',
      messages: [{ role: 'user', text: '¿Tienen hamburguesa de pollo?' }],
      requestId: 'req_test',
    });

    expect(result.text).toMatch(/Hamburguesa de Pollo/i);
    expect(result.cartActions).toEqual([]);
    expect(result.attribution?.requestId).toBe('req_test');
    expect(result.tokensInput).toBe(10);
    expect(result.toolCalls).toBe(0);
    // Endpoint contract: no cart/order mutations from this layer
    expect((result as any).cart_actions).toBeUndefined();
  });

  it('maps Gemini 429 and 503 to typed errors without inventing replies', async () => {
    const { runChatWithGemini, GeminiChatError, __disableLiveBudgetForTests } =
      await import('../app/api/chat/_lib/gemini');
    __disableLiveBudgetForTests();
    const { getChatbotConfig } = await import('../app/api/chat/_lib/config');

    const baseConfig = {
      ...getChatbotConfig(),
      geminiApiKey: 'fake-key',
      timeoutMs: 5000,
      maxToolRounds: 1,
      maxHistoryMessages: 5,
      maxOutputTokens: 64,
      model: 'gemini-3.1-flash-lite',
      modelFallback: 'gemini-2.5-flash-lite',
      modelWarnings: [],
    };
    const toolCtx = {
      commerceId: '11111111-1111-4111-8111-111111111111',
      menu: {
        resolvedComercioId: '11111111-1111-4111-8111-111111111111',
        ownerId: 'o',
        isOnline: true,
        comercioRow: {},
        comercio: { nombre: 'Demo' } as any,
        categorias: [],
        productos: [],
        metodosPago: [],
        checkoutExchange: {} as any,
        marketRates: null,
        upsellSettings: null,
        upsellRules: [],
        bundles: [],
        preCheckoutUpsell: null as any,
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })),
    );
    await expect(
      runChatWithGemini({
        config: baseConfig,
        toolCtx,
        businessName: 'Demo',
        messages: [{ role: 'user', text: 'hola' }],
        requestId: 'req_test',
      }),
    ).rejects.toMatchObject({ code: 'gemini_rate_limited', status: 429 });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );
    await expect(
      runChatWithGemini({
        config: baseConfig,
        toolCtx,
        businessName: 'Demo',
        messages: [{ role: 'user', text: 'hola' }],
        requestId: 'req_test',
      }),
    ).rejects.toMatchObject({ code: 'gemini_unavailable', status: 503 });

    expect(GeminiChatError).toBeDefined();
  });

  it('maps timeout to GeminiChatError', async () => {
    const { runChatWithGemini, GeminiChatError, __disableLiveBudgetForTests } =
      await import('../app/api/chat/_lib/gemini');
    __disableLiveBudgetForTests();
    const { getChatbotConfig } = await import('../app/api/chat/_lib/config');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }),
    );

    const config = {
      ...getChatbotConfig(),
      geminiApiKey: 'fake-key',
      timeoutMs: 10,
      maxToolRounds: 1,
      maxHistoryMessages: 5,
      maxOutputTokens: 64,
      model: 'gemini-3.1-flash-lite',
      modelFallback: 'gemini-2.5-flash-lite',
      modelWarnings: [],
    };

    await expect(
      runChatWithGemini({
        config,
        toolCtx: {
          commerceId: '11111111-1111-4111-8111-111111111111',
          menu: {
            resolvedComercioId: '11111111-1111-4111-8111-111111111111',
            ownerId: 'o',
            isOnline: true,
            comercioRow: {},
            comercio: { nombre: 'Demo' } as any,
            categorias: [],
            productos: [],
            metodosPago: [],
            checkoutExchange: {} as any,
            marketRates: null,
            upsellSettings: null,
            upsellRules: [],
            bundles: [],
            preCheckoutUpsell: null as any,
          },
        },
        businessName: 'Demo',
        messages: [{ role: 'user', text: 'hola' }],
        requestId: 'req_test',
      }),
    ).rejects.toBeInstanceOf(GeminiChatError);
  });

  it('falls back to the cheaper Flash-Lite model on primary 404 and still runs tools', async () => {
    const { runChatWithGemini, __disableLiveBudgetForTests } = await import(
      '../app/api/chat/_lib/gemini'
    );
    __disableLiveBudgetForTests();
    const { getChatbotConfig } = await import('../app/api/chat/_lib/config');
    const { CHAT_TOOL_DECLARATIONS } = await import('../app/api/chat/_lib/tools');

    expect(CHAT_TOOL_DECLARATIONS.length).toBeGreaterThan(0);

    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        call += 1;
        if (call === 1) {
          expect(String(url)).toContain('gemini-3.1-flash-lite');
          return { ok: false, status: 404, json: async () => ({}) };
        }
        expect(String(url)).toContain('gemini-2.5-flash-lite');
        if (call === 2) {
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
                          name: 'search_products',
                          args: { query: 'pollo' },
                        },
                      },
                    ],
                  },
                },
              ],
              usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Según el menú, hay opciones con pollo.' }],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10 },
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
        maxToolRounds: 2,
        maxHistoryMessages: 8,
        maxOutputTokens: 128,
      },
      toolCtx: {
        commerceId: '11111111-1111-4111-8111-111111111111',
        menu: {
          resolvedComercioId: '11111111-1111-4111-8111-111111111111',
          ownerId: 'o',
          isOnline: true,
          comercioRow: {},
          comercio: { nombre: 'Demo', moneda: 'USD' } as any,
          categorias: [{ id: 'c1', nombre: 'Platos', orden: 1 } as any],
          productos: [
            {
              id: 'p1',
              categoria_id: 'c1',
              nombre: 'Pollo asado',
              precio: 8,
              disponible: true,
              descripcion: 'Con ensalada',
            } as any,
          ],
          metodosPago: [],
          checkoutExchange: {} as any,
          marketRates: null,
          upsellSettings: null,
          upsellRules: [],
          bundles: [],
          preCheckoutUpsell: null as any,
        },
      },
      businessName: 'Demo',
      messages: [{ role: 'user', text: '¿tienen pollo?' }],
      requestId: 'req_test',
    });

    expect(result.model).toBe('gemini-2.5-flash-lite');
    expect(result.toolCalls).toBe(1);
    expect(result.text).toMatch(/pollo/i);
    expect(result.tokensInput).toBe(32);
    expect(result.geminiHttpCalls).toBe(3);
  });

  it('echoes thoughtSignature on tool rounds (Gemini 3 requirement)', async () => {
    const { runChatWithGemini, __disableLiveBudgetForTests } = await import(
      '../app/api/chat/_lib/gemini'
    );
    __disableLiveBudgetForTests();
    const { getChatbotConfig } = await import('../app/api/chat/_lib/config');

    const bodies: unknown[] = [];
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { body?: string }) => {
        call += 1;
        if (init?.body) bodies.push(JSON.parse(init.body));
        if (call === 1) {
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
                          name: 'search_products',
                          args: { query: 'pollo' },
                        },
                        thoughtSignature: 'sig_test_abc',
                      },
                    ],
                  },
                },
              ],
              usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Hay pollo asado.' }],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 3 },
          }),
        };
      }),
    );

    await runChatWithGemini({
      config: {
        ...getChatbotConfig(),
        geminiApiKey: 'fake-key',
        model: 'gemini-3.1-flash-lite',
        modelFallback: 'gemini-2.5-flash-lite',
        modelWarnings: [],
        timeoutMs: 5000,
        maxToolRounds: 2,
        maxHistoryMessages: 8,
        maxOutputTokens: 128,
      },
      toolCtx: {
        commerceId: '11111111-1111-4111-8111-111111111111',
        menu: {
          resolvedComercioId: '11111111-1111-4111-8111-111111111111',
          ownerId: 'o',
          isOnline: true,
          comercioRow: {},
          comercio: { nombre: 'Demo', moneda: 'USD' } as any,
          categorias: [{ id: 'c1', nombre: 'Platos', orden: 1 } as any],
          productos: [
            {
              id: 'p1',
              categoria_id: 'c1',
              nombre: 'Pollo asado',
              precio: 8,
              disponible: true,
            } as any,
          ],
          metodosPago: [],
          checkoutExchange: {} as any,
          marketRates: null,
          upsellSettings: null,
          upsellRules: [],
          bundles: [],
          preCheckoutUpsell: null as any,
        },
      },
      businessName: 'Demo',
      messages: [{ role: 'user', text: '¿tienen pollo?' }],
      requestId: 'req_test',
    });

    expect(bodies.length).toBe(2);
    const second = bodies[1] as {
      contents: Array<{ role: string; parts: Array<{ thoughtSignature?: string }> }>;
      generationConfig: { thinkingConfig: unknown; temperature: number };
    };
    const modelTurn = second.contents.find((c) => c.role === 'model');
    expect(modelTurn?.parts?.[0]?.thoughtSignature).toBe('sig_test_abc');
    expect(second.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: 'MINIMAL',
    });
    expect(second.generationConfig.temperature).toBe(1);
  });
});
