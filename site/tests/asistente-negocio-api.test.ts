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
      authenticated: boolean;
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.authenticated).toBe(false);
    expect(json.text).toMatch(/Margarita|precio/i);
    expect(json.text).toMatch(/inicia sesión|acceso/i);
    expect(json.needsAuth).toBe(true);

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
    const json = (await res.json()) as { text: string };
    expect(json.text).toMatch(/venció|expir/i);
  });
});
