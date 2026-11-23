import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getChatbotConfig,
  isChatbotRuntimeAllowed,
} from '../app/api/chat/_lib/config';
import {
  ChatbotQuotaError,
  loadPeriodUsage,
  reserveChatbotRequest,
  reserveChatbotRequestAsync,
} from '../app/api/chat/_lib/quota';
import { chatRequestSchema } from '../app/api/chat/_lib/schema';
import {
  executeChatTool,
  type ChatToolContext,
} from '../app/api/chat/_lib/tools';
import type { LoadedPublicMenu } from '../app/api/menu/_lib/load-public-menu';

function fsConfig(dir: string, overrides: Partial<ReturnType<typeof getChatbotConfig>> = {}) {
  return {
    ...getChatbotConfig({
      NODE_ENV: 'test',
      CHATBOT_ENABLED: '1',
      CHATBOT_QUOTA_BACKEND: 'filesystem',
    } as NodeJS.ProcessEnv),
    usageDir: dir,
    maxRequestsPerSession: 2,
    maxMonthlyRequestsPerCommerce: 3,
    quotaBackend: 'filesystem' as const,
    ...overrides,
  };
}

function menuA(): LoadedPublicMenu {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  return {
    resolvedComercioId: id,
    ownerId: 'o1',
    isOnline: true,
    comercioRow: {},
    comercio: { id, nombre: 'Rest A', moneda: 'USD', en_linea: true } as any,
    categorias: [{ id: 'c1', nombre: 'Platos' }],
    productos: [
      {
        id: 'pa1',
        categoria_id: 'c1',
        nombre: 'Arepa A',
        precio: 3,
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

function menuB(): LoadedPublicMenu {
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  return {
    ...menuA(),
    resolvedComercioId: id,
    comercio: { id, nombre: 'Rest B', moneda: 'USD', en_linea: true } as any,
    productos: [
      {
        id: 'pb1',
        categoria_id: 'c1',
        nombre: 'Burger B',
        precio: 8,
        disponible: true,
      },
    ],
  };
}

describe('phase 2.1 activation controls', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('blocks production without allow + postgres quota backend', () => {
    vi.stubEnv('CHATBOT_ENABLED', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CHATBOT_ALLOW_PRODUCTION', '');
    vi.stubEnv('CHATBOT_QUOTA_BACKEND', 'filesystem');
    vi.stubEnv('GEMINI_API_KEY', 'fake-key-for-gate-test');
    vi.stubEnv(
      'CHATBOT_ALLOWED_COMMERCE_IDS',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(isChatbotRuntimeAllowed(getChatbotConfig()).reason).toBe(
      'production_blocked',
    );

    vi.stubEnv('CHATBOT_ALLOW_PRODUCTION', '1');
    expect(isChatbotRuntimeAllowed(getChatbotConfig()).reason).toBe(
      'quota_backend_not_persistent',
    );

    vi.stubEnv('CHATBOT_QUOTA_BACKEND', 'postgres');
    expect(isChatbotRuntimeAllowed(getChatbotConfig()).ok).toBe(true);
  });

  it('NEXT_PUBLIC preview alone never enables server runtime', () => {
    vi.stubEnv('CHATBOT_ENABLED', '');
    vi.stubEnv('NEXT_PUBLIC_CHATBOT_PREVIEW', '1');
    vi.stubEnv('NODE_ENV', 'development');
    expect(isChatbotRuntimeAllowed(getChatbotConfig()).ok).toBe(false);
  });
});

describe('phase 2.1 isolation + quota concurrency', () => {
  it('keeps two restaurants catalogs isolated', () => {
    const a: ChatToolContext = {
      menu: menuA(),
      commerceId: menuA().resolvedComercioId,
    };
    const b: ChatToolContext = {
      menu: menuB(),
      commerceId: menuB().resolvedComercioId,
    };
    const hitA = executeChatTool(a, 'search_products', { query: 'Burger B' }) as any;
    const hitB = executeChatTool(b, 'search_products', { query: 'Arepa A' }) as any;
    expect(hitA.count).toBe(0);
    expect(hitB.count).toBe(0);
    expect(
      (executeChatTool(a, 'search_products', { query: 'Arepa' }) as any).count,
    ).toBe(1);
  });

  it('enforces monthly quota under concurrent reserves', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chatbot-conc-'));
    const config = fsConfig(dir);
    const commerceId = 'c-conc-1';

    const tasks = Array.from({ length: 6 }, (_, i) =>
      Promise.resolve().then(() =>
        reserveChatbotRequest({
          config,
          commerceId,
          sessionId: `s_conc_${i}_${Date.now()}`,
        }),
      ),
    );

    const results = await Promise.allSettled(tasks);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const blocked = results.filter((r) => r.status === 'rejected').length;
    expect(ok).toBe(3);
    expect(blocked).toBe(3);
    expect(loadPeriodUsage(config, commerceId).requests).toBe(3);
  });

  it('enforces session message limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chatbot-sess-'));
    const config = fsConfig(dir);
    reserveChatbotRequest({
      config,
      commerceId: 'c1',
      sessionId: 's_limit_session_01',
    });
    reserveChatbotRequest({
      config,
      commerceId: 'c1',
      sessionId: 's_limit_session_01',
    });
    expect(() =>
      reserveChatbotRequest({
        config,
        commerceId: 'c1',
        sessionId: 's_limit_session_01',
      }),
    ).toThrow(ChatbotQuotaError);
  });

  it('maps postgres DB errors to quota_unavailable without calling Gemini', async () => {
    const fakeSb = {
      rpc: async () => ({ data: null, error: { message: 'relation missing' } }),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { chatbot_enabled: true }, error: null }),
          }),
        }),
      }),
    } as any;

    await expect(
      reserveChatbotRequestAsync({
        config: {
          ...fsConfig(mkdtempSync(join(tmpdir(), 'chatbot-pg-'))),
          quotaBackend: 'postgres',
          requireCommerceFlag: false,
        },
        commerceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sessionId: 's_pg_err_123456',
        supabase: fakeSb,
      }),
    ).rejects.toMatchObject({ code: 'quota_unavailable' });
  });

  it('rejects schema abuse (oversized message)', () => {
    expect(() =>
      chatRequestSchema.parse({
        messages: [{ role: 'user', text: 'x'.repeat(5000) }],
      }),
    ).toThrow();
  });
});

describe('phase 2.1 no cart/order side effects contract', () => {
  it('tools never return mutation instructions', () => {
    const ctx: ChatToolContext = {
      menu: menuA(),
      commerceId: menuA().resolvedComercioId,
    };
    const detail = executeChatTool(ctx, 'get_product_details', {
      product_id: 'pa1',
    }) as any;
    expect(JSON.stringify(detail)).not.toMatch(/add_to_cart|create_order|charge/i);
  });
});
