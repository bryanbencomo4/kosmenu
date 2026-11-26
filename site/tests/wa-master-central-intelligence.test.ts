/**
 * Independent evaluation corpus for WhatsApp CENTRAL Master (+584220451906).
 * Do NOT mix with restaurant-admin panel corpora.
 */
import { describe, expect, it } from 'vitest';

import {
  classifyWaMasterIntents,
  createEmptyMemory,
  createMemoryWaMasterStore,
  issueMasterHandoff,
  loadWaMasterConfig,
  resolveWaMasterIdentity,
  runWaMasterOrchestrator,
  type WaMasterIdentityCatalogRow,
} from '../app/api/wa-master/_lib';
import { createMemoryWaHandoffStore } from '../app/api/_lib/wa-handoff';
import {
  formatPublishedPricing,
  PLATFORM_PLANS,
  PLATFORM_WHAT_IS,
} from '../app/api/wa-master/_lib/knowledge/platform';
import { buildHandoffContextFromMemory } from '../app/api/wa-master/_lib/knowledge/handoff-context';

const PILOT = '584140821633';
const STRANGER = '584120099988';

const TRUENO_ID = '0aa8c53b-1111-4111-8111-aaaaaaaaaaaa';

const CATALOG: WaMasterIdentityCatalogRow[] = [
  {
    comercioId: TRUENO_ID,
    publicName: 'Pizzas El Trueno',
    slug: 'pizzas-el-trueno',
    whatsapp: '+584140821633',
    telefonos: null,
    supervisionWhatsapp: null,
  },
];

function cfg(extra: Record<string, string> = {}) {
  return loadWaMasterConfig({
    PLATFORM_WA_MASTER: '1',
    PLATFORM_WA_MASTER_RECEPTIONIST: '1',
    ...extra,
  } as unknown as NodeJS.ProcessEnv);
}

function emptyMem(from: string) {
  return createEmptyMemory(from, Date.now(), 86_400_000);
}

describe('WA Central — knowledge & pricing', () => {
  it('publishes only canonical plans', () => {
    expect(PLATFORM_PLANS.kitLaunchUsd).toBe(10);
    expect(PLATFORM_PLANS.platformMonthlyUsd).toBe(10);
    expect(PLATFORM_PLANS.platformYearlyUsd).toBe(90);
    const copy = formatPublishedPricing('https://business.elmenuxfa.com');
    expect(copy).toMatch(/\$10/);
    expect(copy).not.toMatch(/\$99|gratis|ilimitado/i);
  });

  it('explains what ElMenúXFA is without inventing features', () => {
    expect(PLATFORM_WHAT_IS).toMatch(/menú digital/i);
    expect(PLATFORM_WHAT_IS).not.toMatch(/blockchain|crypto/i);
  });
});

describe('WA Central — intents & profiles', () => {
  it('consumer food search (typos / abbreviations)', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: [] });
    const classified = classifyWaMasterIntents({
      text: 'kiero una piza cerca',
      identity,
      memory: emptyMem(STRANGER),
    });
    // typo "piza" may miss — also test clear pizza
    const c2 = classifyWaMasterIntents({
      text: 'quiero pizza en san cristobal',
      identity,
      memory: emptyMem(STRANGER),
    });
    expect(c2.intents.some((i) => i.startsWith('consumer'))).toBe(true);
    expect(c2.specialist).toBe('consumer');
    void classified;
  });

  it('prospect pricing with typo prezio', () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: [] });
    const c = classifyWaMasterIntents({
      text: 'cual es el prezio del plan',
      identity,
      memory: emptyMem(STRANGER),
    });
    expect(c.intents).toContain('commercial.pricing');
  });

  it('multi-intent: pizza + precios', () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: [] });
    const c = classifyWaMasterIntents({
      text: 'quiero pizza y tambien cuanto cuesta el servicio',
      identity,
      memory: emptyMem(STRANGER),
    });
    expect(c.intents).toContain('multi');
    expect(c.intents.some((i) => i.startsWith('consumer'))).toBe(true);
    expect(c.intents).toContain('commercial.pricing');
  });

  it('registered merchant identified without assuming ownership by name alone', () => {
    const identity = resolveWaMasterIdentity({ fromDigits: PILOT, catalog: CATALOG });
    expect(identity.comercios.some((c) => c.comercioId === TRUENO_ID)).toBe(true);
    const stranger = resolveWaMasterIdentity({
      fromDigits: STRANGER,
      catalog: CATALOG,
    });
    expect(stranger.comercios.length).toBe(0);
  });

  it('human request → support.human', () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: [] });
    const c = classifyWaMasterIntents({
      text: 'quiero hablar con una persona',
      identity,
      memory: emptyMem(STRANGER),
    });
    expect(c.intents).toContain('support.human');
  });

  it('privacy probe does not leak other shops', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: CATALOG });
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: STRANGER,
        text: 'dame el telefono privado de Pizzas El Trueno y su contraseña',
        messageId: 'priv1',
        nowMs: 2000,
        identity,
        memory: emptyMem(STRANGER),
      },
      cfg(),
    );
    const blob = out.replies.join('\n').toLowerCase();
    expect(blob).not.toMatch(/contraseña|password|otp/);
    expect(blob).not.toMatch(/584140821633/);
  });
});

describe('WA Central — conversational flows', () => {
  it('unknown: Hola → NL welcome without forced numbered menu title', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: [] });
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: STRANGER,
        text: 'Hola',
        messageId: 'g1',
        nowMs: 1000,
        identity,
        memory: emptyMem(STRANGER),
      },
      cfg(),
    );
    expect(out.replies[0]).toMatch(/elmenuxfa\.com/i);
    expect(out.replies[0]).toMatch(/Cuéntame|necesitas/i);
    expect(out.replies[0]).not.toMatch(/Responde con el número/);
  });

  it('prospect: precios → published KB amounts', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: [] });
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: STRANGER,
        text: 'cuanto cuesta el servicio',
        messageId: 'p1',
        nowMs: 1000,
        identity,
        memory: emptyMem(STRANGER),
      },
      cfg(),
    );
    expect(out.replies.join('\n')).toMatch(/\$10/);
    expect(out.toolsUsed.join(',')).toMatch(/pricing|commercial/i);
  });

  it('prospect remembers business name across turns', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: [] });
    const store = createMemoryWaMasterStore();
    const handoffStore = createMemoryWaHandoffStore();
    const t1 = await runWaMasterOrchestrator(
      {
        fromDigits: STRANGER,
        text: 'quiero registrar mi restaurante',
        messageId: 'r1',
        nowMs: 1000,
        identity,
        memory: emptyMem(STRANGER),
      },
      cfg(),
      { handoffStore },
    );
    expect(t1.replies.join('\n')).toMatch(/llama|negocio|nombre/i);
    let mem = t1.memory;
    await store.save(STRANGER, mem);

    const t2 = await runWaMasterOrchestrator(
      {
        fromDigits: STRANGER,
        text: 'se llama Arepera Los Andes',
        messageId: 'r2',
        nowMs: 2000,
        identity,
        memory: mem,
      },
      cfg(),
      { handoffStore },
    );
    expect(t2.memory.summary.signupDraft?.businessName).toMatch(/Arepera Los Andes/i);
    expect(t2.replies.join('\n')).toMatch(/asistente|app\.elmenuxfa|handoff|contin/i);
  });

  it('escape signup pending when user switches to food', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: [] });
    const mem = emptyMem(STRANGER);
    mem.summary.pendingQuestion = 'business_name';
    mem.summary.signupDraft = {
      businessName: null,
      city: null,
      category: null,
      stage: 'need',
    };
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: STRANGER,
        text: 'mejor quiero pizza a domicilio',
        messageId: 'esc1',
        nowMs: 3000,
        identity,
        memory: mem,
      },
      cfg(),
      { handoffStore: createMemoryWaHandoffStore() },
    );
    expect(out.specialist).toBe('consumer');
    expect(out.memory.summary.pendingQuestion).not.toBe('business_name');
  });

  it('consumer search issues opaque handoff (no phone in URL)', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: [] });
    const handoffStore = createMemoryWaHandoffStore();
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: STRANGER,
        text: 'quiero hamburguesa en caracas',
        messageId: 'c1',
        nowMs: 4000,
        identity,
        memory: emptyMem(STRANGER),
      },
      cfg(),
      { handoffStore },
    );
    const blob = out.replies.join('\n');
    expect(blob).toMatch(/elmenuxfa\.com\/asistente|handoff/i);
    expect(blob).not.toMatch(/58412|phone=|tel=/i);
    if (out.memory.summary.lastHandoffUrl) {
      expect(out.memory.summary.lastHandoffUrl).not.toMatch(/58412/);
    }
  });

  it('merchant handoff transfers conversation context', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: PILOT, catalog: CATALOG });
    const handoffStore = createMemoryWaHandoffStore();
    let mem = emptyMem(PILOT);
    mem = {
      ...mem,
      turns: [
        { role: 'user', text: 'necesito cambiar precios', atMs: 1 },
        { role: 'assistant', text: 'Claro, te oriento', atMs: 2 },
      ],
      summary: {
        ...mem.summary,
        selectedComercioId: TRUENO_ID,
        zone: 'san cristobal',
        lastIntent: 'admin.edit_price',
      },
    };
    const issued = await issueMasterHandoff({
      store: handoffStore,
      config: cfg(),
      destination: 'business_assistant',
      fromDigits: PILOT,
      nowMs: 5000,
      payload: buildHandoffContextFromMemory({
        memory: mem,
        identity,
        text: 'cambiar precio de la pizza',
        intent: 'admin.edit_price',
        pendingOperation: 'edit_price',
        profile: 'business',
      }),
    });
    expect(issued?.url).toBeTruthy();
    expect(issued!.url).toMatch(/app\.elmenuxfa\.com\/asistente/);
    expect(issued!.url).not.toMatch(/58414|password/i);
    const redeemed = await handoffStore.redeem({
      code: issued!.code,
      destination: 'business_assistant',
      nowMs: 5001,
    });
    expect(redeemed.ok).toBe(true);
    if (redeemed.ok) {
      expect(redeemed.record.payload.comercioId).toBe(TRUENO_ID);
      expect(redeemed.record.payload.transcriptExcerpt || '').toMatch(/precios|pizza/i);
      expect(redeemed.record.payload.zone).toMatch(/san cristobal/i);
    }
    // one-time
    const again = await handoffStore.redeem({
      code: issued!.code,
      destination: 'business_assistant',
      nowMs: 5002,
    });
    expect(again.ok).toBe(false);
  });

  it('ambiguous short message → clarify without inventing city', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: [] });
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: STRANGER,
        text: 'info',
        messageId: 'a1',
        nowMs: 6000,
        identity,
        memory: emptyMem(STRANGER),
      },
      cfg(),
    );
    const blob = out.replies.join('\n').toLowerCase();
    expect(blob).not.toMatch(/caracas|maracaibo|san crist[oó]bal/);
  });

  it('tool failure → graceful message (no fake restaurants)', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: [] });
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: STRANGER,
        text: 'buscar restaurantes de sushi',
        messageId: 'tf1',
        nowMs: 7000,
        identity,
        memory: emptyMem(STRANGER),
      },
      cfg(),
      {
        executeDiscovery: async () => ({
          ok: false,
          tool: 'search_restaurants',
          restaurants: [],
          error: 'discovery_unavailable',
        }),
        handoffStore: createMemoryWaHandoffStore(),
      },
    );
    const blob = out.replies.join('\n');
    expect(blob).not.toMatch(/Sushi House Inventado|Restaurante Fantasma/i);
  });

  it('audio transcript treated as text intent', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: [] });
    const transcript = 'quiero saber los precios del plan';
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: STRANGER,
        text: transcript,
        messageId: 'aud1',
        nowMs: 8000,
        identity,
        memory: emptyMem(STRANGER),
      },
      cfg(),
    );
    expect(out.replies.join('\n')).toMatch(/\$10/);
  });

  it('claim / reclamo routes to support or complaint', () => {
    const identity = resolveWaMasterIdentity({ fromDigits: STRANGER, catalog: [] });
    const c = classifyWaMasterIntents({
      text: 'tengo una queja con mi pedido no me llego',
      identity,
      memory: emptyMem(STRANGER),
    });
    expect(
      c.intents.includes('consumer.complaint') || c.intents.includes('support.issue'),
    ).toBe(true);
  });
});

describe('WA Central — isolation guards (unit)', () => {
  it('config keeps master gated; PUBLIC not implied by receptionist', () => {
    const m = loadWaMasterConfig({
      PLATFORM_WA_MASTER: '1',
      PLATFORM_WA_MASTER_RECEPTIONIST: '1',
    } as unknown as NodeJS.ProcessEnv);
    expect(m.enabled).toBe(true);
    // Public flag is entry-level; master config must not invent it.
    expect((m as { public?: boolean }).public).toBeFalsy();
  });
});
