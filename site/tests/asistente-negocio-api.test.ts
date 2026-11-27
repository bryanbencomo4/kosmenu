import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMemoryWaHandoffStore,
  type WaHandoffStore,
} from '../app/api/_lib/wa-handoff';

vi.mock('../app/api/_lib/supabase-user-auth', () => ({
  getUserFromBearerRequest: vi.fn(async () => null),
}));

vi.mock('../app/api/_lib/supabase-server', () => ({
  getServiceSupabaseClient: vi.fn(() => {
    throw new Error('no_db_in_unit');
  }),
}));

vi.mock('../app/_lib/business-assistant', () => ({
  isBusinessAssistantApiEnabled: () => true,
  BUSINESS_ASSISTANT_APP_HOME: 'https://app.elmenuxfa.com/',
  BUSINESS_ASSISTANT_LOGIN_URL: 'https://app.elmenuxfa.com/?next=/asistente',
  BUSINESS_ASSISTANT_CANONICAL_APP_PATH: 'https://app.elmenuxfa.com/asistente',
  BUSINESS_ASSISTANT_NEXT_PATH: '/asistente-negocio',
}));

describe('POST /api/asistente-negocio', () => {
  let store: WaHandoffStore;

  beforeEach(() => {
    store = createMemoryWaHandoffStore();
    (globalThis as unknown as { __waHandoffStore?: WaHandoffStore }).__waHandoffStore = store;
  });

  it('boot peeks handoff and returns prepared edit_price greeting without auth', async () => {
    const rec = await store.issue({
      destination: 'business_assistant',
      payload: {
        pendingOperation: 'edit_price',
        conversationHint: 'cambiar precio Margarita',
        intent: 'admin.edit_price',
      },
    });
    const { POST } = await import('../app/api/asistente-negocio/route');
    const res = await POST(
      new Request('http://localhost/api/asistente-negocio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handoffCode: rec.code, handoffAction: 'peek' }),
      }),
    );
    const json = (await res.json()) as {
      ok: boolean;
      text: string;
      needsAuth?: boolean;
      showAuthCard?: boolean;
      authenticated: boolean;
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.authenticated).toBe(false);
    expect(json.text).toMatch(/Margarita|precio|cambio/i);
    expect(json.text).toMatch(/abajo|chat|entra/i);
    expect(json.needsAuth).toBe(true);
    expect(json.showAuthCard).toBe(true);

    const still = await store.validate({ code: rec.code });
    expect(still.ok).toBe(true);
  });

  it('expired handoff explains without empty shell', async () => {
    const rec = await store.issue({
      destination: 'business_assistant',
      payload: { pendingOperation: 'edit_price' },
      ttlMs: 1,
      nowMs: Date.now() - 60_000,
    });
    const { POST } = await import('../app/api/asistente-negocio/route');
    const res = await POST(
      new Request('http://localhost/api/asistente-negocio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handoffCode: rec.code, handoffAction: 'peek' }),
      }),
    );
    const json = (await res.json()) as { text: string; needsAuth?: boolean };
    // Never a dead end: no "link already used/expired" wording, just a way back in.
    expect(json.text).not.toMatch(/enlace|venci|expir|ya se us/i);
    expect(json.text).toMatch(/entra|cuenta/i);
    expect(json.needsAuth).toBe(true);
  });

  it('already-used handoff behaves like expired: friendly re-entry, not an error', async () => {
    const rec = await store.issue({
      destination: 'business_assistant',
      payload: { pendingOperation: 'edit_price' },
    });
    await store.redeem({ code: rec.code });
    const { POST } = await import('../app/api/asistente-negocio/route');
    const res = await POST(
      new Request('http://localhost/api/asistente-negocio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handoffCode: rec.code, handoffAction: 'peek' }),
      }),
    );
    const json = (await res.json()) as { text: string; showAuthCard?: boolean };
    expect(json.text).not.toMatch(/enlace|ya se us/i);
    expect(json.showAuthCard).toBe(true);
  });

  describe('"Sin respuesta" regression: the reply always carries text', () => {
    const post = async (body: unknown) => {
      const { POST } = await import('../app/api/asistente-negocio/route');
      const res = await POST(
        new Request('http://localhost/api/asistente-negocio', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: typeof body === 'string' ? body : JSON.stringify(body),
        }),
      );
      return { res, json: (await res.json()) as { text?: string; error?: string } };
    };

    it('a long saved thread (80 messages) is trimmed, not rejected', async () => {
      const messages = Array.from({ length: 80 }, (_, i) => ({
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        text: `mensaje ${i}`,
      }));
      messages.push({ role: 'user', text: 'Hola' });
      const { res, json } = await post({ messages });
      expect(res.status).toBe(200);
      expect(json.error).toBeUndefined();
      expect((json.text || '').length).toBeGreaterThan(5);
    });

    it('over-long and empty messages in the history are clipped / dropped, not rejected', async () => {
      const { res, json } = await post({
        messages: [
          { role: 'assistant', text: 'x'.repeat(5000) },
          { role: 'user', text: '   ' },
          { role: 'user', text: 'Hola' },
        ],
      });
      expect(res.status).toBe(200);
      expect(json.error).toBeUndefined();
      expect((json.text || '').length).toBeGreaterThan(5);
    });

    it('a request that cannot be read still answers with a human sentence', async () => {
      const { res, json } = await post('{not json');
      expect(res.status).toBe(400);
      expect((json.text || '').length).toBeGreaterThan(10);
    });

    it('an unexpected server error answers with text instead of an empty body', async () => {
      (globalThis as unknown as { __waHandoffStore?: unknown }).__waHandoffStore = {
        validate: async () => {
          throw new Error('boom');
        },
        redeem: async () => {
          throw new Error('boom');
        },
        issue: async () => {
          throw new Error('boom');
        },
      };
      const { res, json } = await post({ handoffCode: 'ABCDEFGH', handoffAction: 'peek' });
      expect(res.status).toBe(200);
      expect(json.text).toMatch(/problema técnico/i);
    });
  });
});
