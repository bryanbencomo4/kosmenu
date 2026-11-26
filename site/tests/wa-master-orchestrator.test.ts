import { describe, expect, it } from 'vitest';

import {
  createEmptyMemory,
  createMemoryWaMasterStore,
  loadOrCreateMemory,
  loadWaMasterConfig,
  resolveWaMasterIdentity,
  runWaMasterOrchestrator,
  type WaMasterIdentityCatalogRow,
} from '../app/api/wa-master/_lib';
import { loadWaEntryConfig } from '../app/api/wa-entry/_lib/config';
import { processWaEntryEvent } from '../app/api/wa-entry/_lib/process';
import { createSimWaEntrySender } from '../app/api/wa-entry/_lib/sender';
import { createMemoryWaEntryStore } from '../app/api/wa-entry/_lib/store';

const CATALOG: WaMasterIdentityCatalogRow[] = [
  {
    comercioId: 'c-pizza',
    publicName: 'Pizzería Don Tomás',
    slug: 'don-tomas',
    whatsapp: '+584120000099',
    telefonos: null,
    supervisionWhatsapp: null,
  },
  {
    comercioId: 'c-burger',
    publicName: 'Burger Lab',
    slug: 'burger-lab',
    whatsapp: '04120000099',
    telefonos: null,
    supervisionWhatsapp: null,
  },
];

function masterCfg() {
  return loadWaMasterConfig({
    PLATFORM_WA_MASTER: '1',
  } as unknown as NodeJS.ProcessEnv);
}

function mem(from: string, patch: Record<string, unknown> = {}) {
  const base = createEmptyMemory(from, Date.now(), 86_400_000);
  return {
    ...base,
    summary: { ...base.summary, ...(patch.summary as object) },
    profile: { ...base.profile, ...(patch.profile as object), fromDigits: from },
  };
}

describe('wa-master Package 1', () => {
  it('flags default OFF', async () => {
    const m = loadWaMasterConfig({} as unknown as NodeJS.ProcessEnv);
    expect(m.enabled).toBe(false);
    expect(m.allowGemini).toBe(false);
    const e = loadWaEntryConfig({} as unknown as NodeJS.ProcessEnv);
    expect(e.masterAssistantEnabled).toBe(false);
  });

  it('1) número nuevo — Hola → bienvenida abierta sin menú 1/2', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: '584140000001', catalog: [] });
    const memory = {
      turns: [],
      summary: {
        activeService: null,
        selectedComercioId: null,
        goal: null,
        pendingQuestion: null,
        proposedAction: null,
        askedFields: [],
        recentErrors: [],
        humanIntervened: false,
        lastIntent: null,
        updatedAtMs: 1,
      },
      profile: {
        fromDigits: '584140000001',
        roles: ['unknown' as const],
        linkedComercioIds: [],
        preferences: {},
        preferenceProvenance: {},
        lastIntent: null,
        attentionState: 'ai' as const,
        lastActiveAtMs: 1,
        retentionUntilMs: null,
      },
    };
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584140000001',
        text: 'Hola',
        messageId: 'm1',
        nowMs: 1000,
        identity,
        memory,
      },
      masterCfg(),
    );
    expect(out.replies[0]).toMatch(/elmenuxfa\.com/);
    expect(out.replies[0]).not.toMatch(/Responde con el número/);
    expect(out.replies[0]).not.toMatch(/\*1️⃣/);
  });

  it('2) número nuevo — quiero información → clarify breve', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: '584140000002', catalog: [] });
    const store = createMemoryWaMasterStore();
    const mem = {
      turns: [],
      summary: {
        activeService: null,
        selectedComercioId: null,
        goal: null,
        pendingQuestion: null,
        proposedAction: null,
        askedFields: [],
        recentErrors: [],
        humanIntervened: false,
        lastIntent: null,
        updatedAtMs: 1,
      },
      profile: {
        fromDigits: '584140000002',
        roles: ['new_contact' as const],
        linkedComercioIds: [],
        preferences: {},
        preferenceProvenance: {},
        lastIntent: null,
        attentionState: 'ai' as const,
        lastActiveAtMs: 1,
        retentionUntilMs: null,
      },
    };
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584140000002',
        text: 'Quiero información',
        messageId: 'm2',
        nowMs: 2000,
        identity,
        memory: mem,
      },
      masterCfg(),
    );
    expect(out.replies[0]).toMatch(/comida|menú|negocio|explic/i);
    expect(out.memory.summary.askedFields).toContain('role_clarify');
    void store;
  });

  it('3) comerciante registrado — ayuda → contexto de menú', async () => {
    const identity = resolveWaMasterIdentity({
      fromDigits: '584120000099',
      catalog: [CATALOG[0]],
    });
    expect(identity.role).toBe('merchant_candidate');
    expect(identity.comercios.some((c) => c.publicName.includes('Don Tomás'))).toBe(true);

    const memory = {
      turns: [],
      summary: {
        activeService: null,
        selectedComercioId: null,
        goal: null,
        pendingQuestion: null,
        proposedAction: null,
        askedFields: [],
        recentErrors: [],
        humanIntervened: false,
        lastIntent: null,
        updatedAtMs: 1,
      },
      profile: {
        fromDigits: '584120000099',
        roles: ['merchant_candidate' as const],
        linkedComercioIds: [],
        preferences: {},
        preferenceProvenance: {},
        lastIntent: null,
        attentionState: 'ai' as const,
        lastActiveAtMs: 1,
        retentionUntilMs: null,
      },
    };
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584120000099',
        text: 'Hola, necesito ayuda.',
        messageId: 'm3',
        nowMs: 3000,
        identity,
        memory,
      },
      masterCfg(),
    );
    expect(out.replies[0]).toMatch(/menú/i);
  });

  it('4+6) consumidor busca comida; luego cambia a comercial', async () => {
    const store = createMemoryWaMasterStore();
    const from = '584140000010';
    let memory = await loadOrCreateMemory(store, from, 1, 86_400_000);
    const identity = resolveWaMasterIdentity({ fromDigits: from, catalog: [] });

    const r1 = await runWaMasterOrchestrator(
      {
        fromDigits: from,
        text: 'Quiero pedir hamburguesas',
        messageId: 'm4a',
        nowMs: 4000,
        identity,
        memory,
      },
      masterCfg(),
    );
    expect(r1.specialist).toBe('consumer');
    memory = r1.memory;
    await store.save(from, memory);

    const r2 = await runWaMasterOrchestrator(
      {
        fromDigits: from,
        text: 'Por cierto, quiero poner mi restaurante en la plataforma',
        messageId: 'm4b',
        nowMs: 5000,
        identity,
        memory,
      },
      masterCfg(),
    );
    expect(r2.specialist).toBe('commercial');
    expect(r2.replies[0]).toMatch(/elmenuxfa\.com|menú digital/);
    expect(r2.memory.turns.length).toBeGreaterThan(2);
  });

  it('5) mixed role: merchant phone asking for burgers → consumer path', async () => {
    const identity = resolveWaMasterIdentity({
      fromDigits: '584120000099',
      catalog: CATALOG,
      hints: { consumerOrderDigits: ['584120000099'] },
    });
    expect(identity.role).toBe('mixed');
    const memory = {
      turns: [],
      summary: {
        activeService: null,
        selectedComercioId: null,
        goal: null,
        pendingQuestion: null,
        proposedAction: null,
        askedFields: [],
        recentErrors: [],
        humanIntervened: false,
        lastIntent: null,
        updatedAtMs: 1,
      },
      profile: {
        fromDigits: '584120000099',
        roles: ['mixed' as const],
        linkedComercioIds: ['c-pizza'],
        preferences: {},
        preferenceProvenance: {},
        lastIntent: null,
        attentionState: 'ai' as const,
        lastActiveAtMs: 1,
        retentionUntilMs: null,
      },
    };
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584120000099',
        text: 'Quiero pedir hamburguesas',
        messageId: 'm5',
        nowMs: 6000,
        identity,
        memory,
      },
      masterCfg(),
    );
    expect(out.specialist).toBe('consumer');
  });

  it('8) referencia conversacional: no re-pregunta role si ya se preguntó', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: '584140000020', catalog: [] });
    const memory = {
      turns: [],
      summary: {
        activeService: null,
        selectedComercioId: null,
        goal: null,
        pendingQuestion: 'role_clarify',
        proposedAction: null,
        askedFields: ['role_clarify'],
        recentErrors: [],
        humanIntervened: false,
        lastIntent: 'clarify_role' as const,
        updatedAtMs: 1,
      },
      profile: {
        fromDigits: '584140000020',
        roles: ['new_contact' as const],
        linkedComercioIds: [],
        preferences: {},
        preferenceProvenance: {},
        lastIntent: null,
        attentionState: 'ai' as const,
        lastActiveAtMs: 1,
        retentionUntilMs: null,
      },
    };
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584140000020',
        text: 'Quiero información',
        messageId: 'm8',
        nowMs: 8000,
        identity,
        memory,
      },
      masterCfg(),
    );
    expect(out.replies[0]).toMatch(/restaurantes|menú de tu negocio|pedir/i);
  });

  it('11+12) admin price change → propose only, no false success', async () => {
    const identity = resolveWaMasterIdentity({
      fromDigits: '584120000099',
      catalog: [CATALOG[0]],
    });
    const memory = {
      turns: [],
      summary: {
        activeService: null,
        selectedComercioId: 'c-pizza',
        goal: null,
        pendingQuestion: null,
        proposedAction: null,
        askedFields: [],
        recentErrors: [],
        humanIntervened: false,
        lastIntent: null,
        updatedAtMs: 1,
      },
      profile: {
        fromDigits: '584120000099',
        roles: ['merchant_candidate' as const],
        linkedComercioIds: ['c-pizza'],
        preferences: {},
        preferenceProvenance: {},
        lastIntent: null,
        attentionState: 'ai' as const,
        lastActiveAtMs: 1,
        retentionUntilMs: null,
      },
    };
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584120000099',
        text: 'Cambia el precio de la pizza Margarita a 6 dólares',
        messageId: 'm11',
        nowMs: 11000,
        identity,
        memory,
      },
      masterCfg(),
    );
    expect(out.intents.some((i) => i === 'admin.edit_price')).toBe(true);
    expect(out.replies[0]).not.toMatch(/¡Listo!.*actualizado/i);
    expect(out.replies[0]).toMatch(/panel|seguridad|confirmación/i);
  });

  it('13) varios comercios → pide selección sin datos privados', async () => {
    const identity = resolveWaMasterIdentity({
      fromDigits: '584120000099',
      catalog: CATALOG,
    });
    expect(identity.comercios.length).toBeGreaterThanOrEqual(2);
    const memory = {
      turns: [],
      summary: {
        activeService: null,
        selectedComercioId: null,
        goal: null,
        pendingQuestion: null,
        proposedAction: null,
        askedFields: [],
        recentErrors: [],
        humanIntervened: false,
        lastIntent: null,
        updatedAtMs: 1,
      },
      profile: {
        fromDigits: '584120000099',
        roles: ['merchant_candidate' as const],
        linkedComercioIds: [],
        preferences: {},
        preferenceProvenance: {},
        lastIntent: null,
        attentionState: 'ai' as const,
        lastActiveAtMs: 1,
        retentionUntilMs: null,
      },
    };
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584120000099',
        text: 'Muéstrame mis productos agotados',
        messageId: 'm13',
        nowMs: 13000,
        identity,
        memory,
      },
      masterCfg(),
    );
    expect(out.replies[0]).toMatch(/Don Tomás|Burger Lab/);
    expect(out.replies[0]).not.toMatch(/owner_id|auth\.users/i);
  });

  it('17) pide persona → escalate + human pause via process hook', async () => {
    const store = createMemoryWaEntryStore();
    const mem = createMemoryWaMasterStore();
    const config = {
      ...loadWaEntryConfig({
        PLATFORM_WA_INBOUND: '1',
        PLATFORM_WA_ROUTER: '1',
        PLATFORM_WA_ADAPTER: 'sim',
        PLATFORM_WA_MASTER: '1',
      } as unknown as NodeJS.ProcessEnv),
      masterAssistantEnabled: true,
      masterAllowlistDigits: ['584140000030'],
    };
    const sender = createSimWaEntrySender(store);
    const payload = {
      event: 'messages.upsert',
      sessionId: 'ELMENUXFA1',
      data: {
        message: {
          id: 'wamid.HUMAN1',
          from: '584140000030@s.whatsapp.net',
          fromMe: false,
          text: 'Quiero hablar con una persona',
          timestamp: Math.floor(Date.now() / 1000),
        },
      },
    };
    const result = await processWaEntryEvent({
      config,
      store,
      sender,
      rawBody: JSON.stringify(payload),
      payload,
      masterMemoryStore: mem,
    });
    expect(result.action).toBe('replied');
    expect(result.state).toBe('human_handling');
    expect(result.replies[0]?.text).toMatch(/persona|equipo/i);
  });

  it('20) master OFF → router clásico intacto', async () => {
    const store = createMemoryWaEntryStore();
    const config = {
      ...loadWaEntryConfig({
        PLATFORM_WA_INBOUND: '1',
        PLATFORM_WA_ROUTER: '1',
        PLATFORM_WA_ADAPTER: 'sim',
      } as unknown as NodeJS.ProcessEnv),
      masterAssistantEnabled: false,
    };
    const sender = createSimWaEntrySender(store);
    const payload = {
      event: 'messages.upsert',
      sessionId: 'ELMENUXFA1',
      data: {
        message: {
          id: 'wamid.CLASSIC1',
          from: '584140000040@s.whatsapp.net',
          fromMe: false,
          text: 'Hola',
          timestamp: Math.floor(Date.now() / 1000),
        },
      },
    };
    const result = await processWaEntryEvent({
      config,
      store,
      sender,
      rawBody: JSON.stringify(payload),
      payload,
    });
    expect(result.action).toBe('replied');
    expect(result.replies[0]?.text).toMatch(/1️⃣|Responde con el número/);
  });

  it('shadow mode no envía', async () => {
    const store = createMemoryWaEntryStore();
    const config = {
      ...loadWaEntryConfig({
        PLATFORM_WA_INBOUND: '1',
        PLATFORM_WA_ROUTER: '1',
        PLATFORM_WA_ADAPTER: 'sim',
      } as unknown as NodeJS.ProcessEnv),
      masterAssistantEnabled: true,
      masterAssistantShadow: true,
      masterAllowlistDigits: ['584140000050'],
    };
    const sender = createSimWaEntrySender(store);
    const payload = {
      event: 'messages.upsert',
      sessionId: 'ELMENUXFA1',
      data: {
        message: {
          id: 'wamid.SHADOW1',
          from: '584140000050@s.whatsapp.net',
          fromMe: false,
          text: 'Hola',
          timestamp: Math.floor(Date.now() / 1000),
        },
      },
    };
    const result = await processWaEntryEvent({
      config,
      store,
      sender,
      rawBody: JSON.stringify(payload),
      payload,
      masterMemoryStore: createMemoryWaMasterStore(),
    });
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('master_shadow');
    expect(store.listOutbound()).toHaveLength(0);
  });
});
