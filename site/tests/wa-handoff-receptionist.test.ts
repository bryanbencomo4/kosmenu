import { describe, expect, it } from 'vitest';

import {
  buildWaHandoffUrl,
  createMemoryWaHandoffStore,
  detectCommercialIntentFromText,
  hashWaHandoffDigits,
} from '../app/api/_lib/wa-handoff';
import { loadWaMasterConfig } from '../app/api/wa-master/_lib/config';
import { resolveWaMasterIdentity } from '../app/api/wa-master/_lib/identity';
import { createEmptyMemory } from '../app/api/wa-master/_lib/memory';
import { runWaMasterOrchestrator } from '../app/api/wa-master/_lib/orchestrator';

const PILOT = '584140821633';

function masterCfg(extra: Record<string, string> = {}) {
  return loadWaMasterConfig({
    PLATFORM_WA_MASTER: '1',
    PLATFORM_WA_MASTER_RECEPTIONIST: '1',
    PLATFORM_WA_MASTER_ALLOW_GEMINI: '0',
    PLATFORM_WA_MASTER_SIMULATE: '1',
    PLATFORM_WA_BUSINESS_ASSISTANT_URL: 'https://elmenuxfa.com/asistente-negocio',
    PLATFORM_WA_CONSUMER_URL: 'https://elmenuxfa.com/asistente?ref=wa',
    ...extra,
  } as unknown as NodeJS.ProcessEnv);
}

const mockDiscovery = async (name: string) => ({
  ok: true,
  tool: name,
  restaurants: [
    {
      id: '1',
      slug: 'demo',
      nombre: 'Demo Burger',
      menuUrl: 'https://elmenuxfa.com/v/demo',
    },
  ],
});

describe('wa handoff codes', () => {
  it('issues opaque code and redeems once', async () => {
    const store = createMemoryWaHandoffStore();
    const rec = await store.issue({
      destination: 'consumer_discovery',
      payload: { query: 'hamburguesas', zone: 'Caracas' },
      fromDigits: PILOT,
    });
    expect(rec.code.length).toBeGreaterThan(16);
    expect(rec.fromDigitsHash).toBe(hashWaHandoffDigits(PILOT));
    expect(rec.code.includes(PILOT)).toBe(false);

    const url = buildWaHandoffUrl({
      destination: 'consumer_discovery',
      code: rec.code,
      consumerBaseUrl: 'https://elmenuxfa.com/asistente?ref=wa',
      businessAssistantBaseUrl: 'https://elmenuxfa.com/asistente-negocio',
    });
    expect(url).toContain('h=');
    expect(url).not.toContain(PILOT);

    const ok = await store.redeem({ code: rec.code, destination: 'consumer_discovery' });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.record.payload.query).toBe('hamburguesas');

    const again = await store.redeem({ code: rec.code });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe('consumed');
  });

  it('rejects expired, revoked, mismatched destination, and peek-safe', async () => {
    const store = createMemoryWaHandoffStore();
    const now = Date.now();
    const expired = await store.issue({
      destination: 'business_assistant',
      payload: { intent: 'admin.edit_price' },
      ttlMs: 1,
      nowMs: now - 10_000,
    });
    const exp = await store.redeem({ code: expired.code, nowMs: now });
    expect(exp.ok).toBe(false);
    if (!exp.ok) expect(exp.error).toBe('expired');

    const live = await store.issue({
      destination: 'business_assistant',
      payload: { intent: 'x' },
    });
    await store.revoke(live.code);
    const rev = await store.redeem({ code: live.code });
    expect(rev.ok).toBe(false);
    if (!rev.ok) expect(rev.error).toBe('revoked');

    const consumer = await store.issue({
      destination: 'consumer_discovery',
      payload: { query: 'pizza' },
    });
    const mismatch = await store.redeem({
      code: consumer.code,
      destination: 'business_assistant',
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.error).toBe('destination_mismatch');

    const unknown = await store.redeem({ code: 'not-a-real-code' });
    expect(unknown.ok).toBe(false);
  });
});

describe('Master receptionist handoff', () => {
  it('consumer search → brief reply with prepared handoff URL', async () => {
    const store = createMemoryWaHandoffStore();
    const identity = resolveWaMasterIdentity({ fromDigits: PILOT, catalog: [] });
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: PILOT,
        text: 'Hola, quiero unas hamburguesas en Caracas',
        messageId: 'h1',
        nowMs: Date.now(),
        identity,
        memory: createEmptyMemory(PILOT, Date.now(), 86400000),
        forceDeterministic: true,
      },
      masterCfg(),
      { handoffStore: store, executeDiscovery: mockDiscovery, forceSimulateAgent: true },
    );
    expect(out.replies).toHaveLength(1);
    expect(out.replies[0]).toMatch(/asistente/i);
    expect(out.replies[0]).toMatch(/\?ref=wa&h=/);
    expect(out.replies[0]).toMatch(/Caracas/i);
    expect(out.toolsUsed).toContain('handoff_consumer');
    expect(out.replies[0]).not.toMatch(/1️⃣/);
  });

  it('memory recall answers directly without link spam', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: PILOT, catalog: [] });
    const memory = createEmptyMemory(PILOT, Date.now(), 86400000);
    memory.summary.signupDraft = {
      businessName: 'Pizza Nova Pilot',
      city: null,
      category: null,
      stage: 'waiting_panel',
    };
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: PILOT,
        text: '¿Recuerdas cómo se llama el restaurante que te comenté?',
        messageId: 'h2',
        nowMs: Date.now(),
        identity,
        memory,
        forceDeterministic: true,
      },
      masterCfg(),
      { forceSimulateAgent: true, executeDiscovery: mockDiscovery },
    );
    expect(out.replies[0]).toMatch(/Pizza Nova Pilot/);
    expect(out.replies[0]).not.toMatch(/https:\/\//);
  });

  it('merchant price change → business handoff, not write', async () => {
    const store = createMemoryWaHandoffStore();
    const identity = resolveWaMasterIdentity({
      fromDigits: PILOT,
      catalog: [
        {
          comercioId: 'c1',
          publicName: 'Pizzería Demo',
          slug: 'demo',
          whatsapp: '+584140821633',
          telefonos: null,
          supervisionWhatsapp: null,
        },
      ],
    });
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: PILOT,
        text: 'Necesito cambiar el precio de una pizza',
        messageId: 'h3',
        nowMs: Date.now(),
        identity,
        memory: createEmptyMemory(PILOT, Date.now(), 86400000),
        forceDeterministic: true,
      },
      masterCfg(),
      { handoffStore: store, forceSimulateAgent: true, executeDiscovery: mockDiscovery },
    );
    expect(out.replies[0]).toMatch(/asistente para negocios|acceso seguro/i);
    expect(out.replies[0]).toMatch(/asistente-negocio\?h=/);
    expect(out.toolsUsed).toContain('handoff_business');
  });

  it('prospect register → business assistant handoff', async () => {
    const store = createMemoryWaHandoffStore();
    const identity = resolveWaMasterIdentity({ fromDigits: PILOT, catalog: [] });
    const mem = createEmptyMemory(PILOT, Date.now(), 86400000);
    // First ask name
    const a = await runWaMasterOrchestrator(
      {
        fromDigits: PILOT,
        text: 'Quiero poner el menú de mi restaurante en la plataforma',
        messageId: 'h4a',
        nowMs: Date.now(),
        identity,
        memory: mem,
        forceDeterministic: true,
      },
      masterCfg(),
      { handoffStore: store, forceSimulateAgent: true, executeDiscovery: mockDiscovery },
    );
    expect(a.replies[0]).toMatch(/cómo se llama|Como se llama|se llama tu negocio/i);

    const b = await runWaMasterOrchestrator(
      {
        fromDigits: PILOT,
        text: 'Se llama Pizza Nova Pilot',
        messageId: 'h4b',
        nowMs: Date.now(),
        identity,
        memory: a.memory,
        forceDeterministic: true,
      },
      masterCfg(),
      { handoffStore: store, forceSimulateAgent: true, executeDiscovery: mockDiscovery },
    );
    expect(b.replies[0]).toMatch(/Pizza Nova Pilot/);
    expect(b.replies[0]).toMatch(/asistente-negocio\?h=/);
  });

  it('receptionist flag off keeps legacy long search path available', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: PILOT, catalog: [] });
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: PILOT,
        text: 'Quiero hamburguesas en Caracas',
        messageId: 'h5',
        nowMs: Date.now(),
        identity,
        memory: createEmptyMemory(PILOT, Date.now(), 86400000),
        forceDeterministic: true,
      },
      masterCfg({ PLATFORM_WA_MASTER_RECEPTIONIST: '0' }),
      { forceSimulateAgent: true, executeDiscovery: mockDiscovery },
    );
    expect(out.toolsUsed).toContain('search_restaurants');
    expect(out.replies[0]).toMatch(/Demo Burger|opciones/i);
  });
});

describe('Discovery commercial detection', () => {
  it('detects register / admin intents', () => {
    expect(detectCommercialIntentFromText('Quiero registrar mi restaurante').kind).toBe(
      'register',
    );
    expect(detectCommercialIntentFromText('Necesito editar mis productos').kind).toBe('admin');
    expect(detectCommercialIntentFromText('Quiero hamburguesas en Caracas').commercial).toBe(
      false,
    );
  });
});
