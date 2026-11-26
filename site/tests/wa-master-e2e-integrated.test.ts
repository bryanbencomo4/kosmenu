/**
 * Integrated Master Assistant conversation (sim Gemini + contract fixtures +
 * optional Preview Postgres memory).
 *
 * Pilot isolation: only PLATFORM_WA_MASTER_ALLOWLIST_DIGITS receives Master.
 */
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { loadWaEntryConfig } from '../app/api/wa-entry/_lib/config';
import { processWaEntryEvent } from '../app/api/wa-entry/_lib/process';
import { createSimWaEntrySender } from '../app/api/wa-entry/_lib/sender';
import { createMemoryWaEntryStore } from '../app/api/wa-entry/_lib/store';
import {
  createDualProcessMemoryHarness,
  createMemoryWaMasterAuthGate,
  createSupabaseWaMasterMemoryStore,
  loadWaMasterIdentity,
  WA_MASTER_IDENTITY_FIXTURES,
} from '../app/api/wa-master/_lib';
import type { WaMasterMenuSnapshot } from '../app/api/wa-master/_lib/specialists/admin';

const PILOT = '584140821633';
const OTHER = '584140000999';
const PREVIEW = 'gsfxqzvmyzjjgpigrste';

function mockDiscoveryExecute() {
  const burgers = [
    {
      id: 'r1',
      slug: 'burger-uno',
      nombre: 'Burger Uno',
      menuUrl: 'https://elmenuxfa.com/v/burger-uno',
    },
    {
      id: 'r2',
      slug: 'burger-dos',
      nombre: 'Burger Dos',
      menuUrl: 'https://elmenuxfa.com/v/burger-dos',
    },
  ];
  return async (name: string, args: Record<string, unknown>) => {
    if (name === 'prepare_restaurant_links') {
      const slug = String(args.slug || '');
      return {
        ok: true,
        tool: name,
        menuUrl: `https://elmenuxfa.com/v/${slug}`,
        chatUrl: null,
      };
    }
    return {
      ok: true,
      tool: name,
      restaurants: burgers,
      text: 'ok',
    };
  };
}

async function loadMenu(comercioId: string): Promise<WaMasterMenuSnapshot | null> {
  return {
    comercioId,
    publicName: 'Pizzería Don Tomás',
    currencyLabel: 'USD',
    exchangeRate: '36.50',
    openLabel: 'Abierto',
    permiteDelivery: true,
    products: [
      { id: 'p1', nombre: 'Pizza Margarita', precio: 5.5, disponible: true, categoria: 'Pizzas' },
      { id: 'p2', nombre: 'Refresco', precio: 1.5, disponible: false, categoria: 'Bebidas' },
    ],
  };
}

describe('wa-master E2E integrated', () => {
  it('full conversation 1–15 + pilot isolation + restart memory', async () => {
    const entryStore = createMemoryWaEntryStore();
    const harness = createDualProcessMemoryHarness();
    const memA = harness.makeStoreA();
    const auth = createMemoryWaMasterAuthGate();
    const catalog = WA_MASTER_IDENTITY_FIXTURES;

    const config = {
      ...loadWaEntryConfig({
        PLATFORM_WA_INBOUND: '1',
        PLATFORM_WA_ROUTER: '1',
        PLATFORM_WA_ADAPTER: 'sim',
        PLATFORM_WA_MASTER: '1',
        PLATFORM_WA_MASTER_ALLOWLIST_DIGITS: PILOT,
      } as unknown as NodeJS.ProcessEnv),
      masterAssistantEnabled: true,
      masterAllowlistDigits: [PILOT],
    };

    async function turn(text: string, from = PILOT, mem = memA) {
      const payload = {
        event: 'messages.upsert',
        sessionId: 'ELMENUXFA1',
        data: {
          message: {
            id: `wamid.e2e.${Math.random().toString(36).slice(2, 10)}`,
            from: `${from}@s.whatsapp.net`,
            fromMe: false,
            text,
            timestamp: Math.floor(Date.now() / 1000),
          },
        },
      };
      return processWaEntryEvent({
        config,
        store: entryStore,
        sender: createSimWaEntrySender(entryStore),
        rawBody: JSON.stringify(payload),
        payload,
        masterMemoryStore: mem,
        masterIdentityCatalog: catalog,
        masterAuthGate: auth,
        masterDiscoveryExecute: mockDiscoveryExecute(),
        masterLoadMenu: loadMenu,
      });
    }

    // 1–2 unknown wants info
    const r1 = await turn('Hola, quiero información');
    expect(r1.action).toBe('replied');
    expect(r1.replies[0]?.text).toMatch(/menú digital|pedir comida|comida para pedir|restaurantes/i);

    // 3–4 search → real directory options in WhatsApp
    const r3 = await turn('Busco restaurantes');
    expect(r3.action).toBe('replied');
    const r4 = await turn('Quiero hamburguesas en San Cristóbal');
    expect(r4.replies[0]?.text).toMatch(/Burger|opciones|Encontré/i);
    expect(r4.replies[0]?.text).not.toMatch(/58414|password/i);

    // 5–6 segunda → menu link
    const r5 = await turn('La segunda');
    expect(r5.replies[0]?.text).toMatch(/burger-dos|Burger Dos|menú|Menú/i);

    // 7–8 commercial switch + remember name
    const r7 = await turn('Quiero registrar mi restaurante en la plataforma');
    expect(r7.replies[0]?.text).toMatch(/elmenuxfa\.com|menú digital|negocio/i);
    const r8 = await turn('Mi negocio se llama Arepa Norte');
    expect(r8.replies[0]?.text).toMatch(/Arepa Norte|register|panel/i);
    const saved = await memA.get(PILOT);
    expect(saved?.summary.signupDraft?.businessName).toMatch(/Arepa Norte/);

    // 9–10 restart process (new memory store instance, same shared backend)
    const memB = harness.makeStoreB();
    const r10 = await turn('Hola, retomo lo de mi negocio', PILOT, memB);
    expect(r10.action).toBe('replied');
    const reloaded = await memB.get(PILOT);
    expect(reloaded?.summary.signupDraft?.businessName).toMatch(/Arepa Norte/);
    expect((reloaded?.turns.length || 0) > 0).toBe(true);

    // 11 merchant product consult (single-comercio catalog — phone ≠ ownership)
    const merchantFrom = '584120000099';
    const merchantCatalog = [WA_MASTER_IDENTITY_FIXTURES[0]];
    const merchantConfig = {
      ...config,
      masterAllowlistDigits: [PILOT, merchantFrom],
    };
    async function merchantTurn(id: string, text: string) {
      const payload = {
        event: 'messages.upsert',
        sessionId: 'ELMENUXFA1',
        data: {
          message: {
            id,
            from: `${merchantFrom}@s.whatsapp.net`,
            fromMe: false,
            text,
            timestamp: Math.floor(Date.now() / 1000),
          },
        },
      };
      return processWaEntryEvent({
        config: merchantConfig,
        store: entryStore,
        sender: createSimWaEntrySender(entryStore),
        rawBody: JSON.stringify(payload),
        payload,
        masterMemoryStore: memA,
        masterIdentityCatalog: merchantCatalog,
        masterAuthGate: auth,
        masterDiscoveryExecute: mockDiscoveryExecute(),
        masterLoadMenu: loadMenu,
      });
    }
    const r11 = await merchantTurn('wamid.e2e.merchant1', 'Muéstrame mis productos');
    expect(r11.replies[0]?.text).toMatch(/Margarita|productos|menú|Don Tomás/i);

    // 12–13 price change without auth
    const r12 = await merchantTurn(
      'wamid.e2e.merchant2',
      'Cambia el precio de la Margarita a 6 dólares',
    );
    expect(r12.replies[0]?.text).toMatch(/verificación|panel|5\.5/i);
    expect(r12.replies[0]?.text).not.toMatch(/¡Listo!.*actualizado/i);

    // 14–15 human handoff pause
    const r14 = await turn('Quiero hablar con una persona');
    expect(r14.state).toBe('human_handling');
    const r15 = await turn('hola otra vez');
    expect(r15.action).toBe('ignored');
    expect(r15.reason).toBe('human_handling');

    // Isolation: non-pilot gets classic router (numbered menu)
    const otherPayload = {
      event: 'messages.upsert',
      sessionId: 'ELMENUXFA1',
      data: {
        message: {
          id: 'wamid.e2e.other',
          from: `${OTHER}@s.whatsapp.net`,
          fromMe: false,
          text: 'Hola',
          timestamp: Math.floor(Date.now() / 1000),
        },
      },
    };
    const other = await processWaEntryEvent({
      config,
      store: createMemoryWaEntryStore(),
      sender: createSimWaEntrySender(createMemoryWaEntryStore()),
      rawBody: JSON.stringify(otherPayload),
      payload: otherPayload,
      masterMemoryStore: memA,
      masterDiscoveryExecute: mockDiscoveryExecute(),
    });
    expect(other.replies[0]?.text).toMatch(/1️⃣|Responde con el número/);
  });

  it('fail-closed: Master ON + empty allowlist ⇒ classic router', async () => {
    const store = createMemoryWaEntryStore();
    const config = {
      ...loadWaEntryConfig({
        PLATFORM_WA_INBOUND: '1',
        PLATFORM_WA_ROUTER: '1',
        PLATFORM_WA_ADAPTER: 'sim',
      } as unknown as NodeJS.ProcessEnv),
      masterAssistantEnabled: true,
      masterAllowlistDigits: [],
    };
    const payload = {
      event: 'messages.upsert',
      sessionId: 'ELMENUXFA1',
      data: {
        message: {
          id: 'wamid.e2e.failclosed',
          from: `${PILOT}@s.whatsapp.net`,
          fromMe: false,
          text: 'Hola',
          timestamp: Math.floor(Date.now() / 1000),
        },
      },
    };
    const r = await processWaEntryEvent({
      config,
      store,
      sender: createSimWaEntrySender(store),
      rawBody: JSON.stringify(payload),
      payload,
    });
    expect(r.replies[0]?.text).toMatch(/1️⃣|Responde con el número/);
  });

  it('identity fixtures distinguish phone match ≠ ownership', async () => {
    const id = await loadWaMasterIdentity({
      fromDigits: '584120000099',
      includeFixtures: true,
    });
    expect(id.role === 'merchant_candidate' || id.role === 'mixed').toBe(true);
    expect(id.provenanceNotes).toContain('phone_match_is_not_ownership');
  });

  it('Preview Postgres memory round-trip when credentials present', async () => {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url.includes(PREVIEW) || !key) {
      expect(true).toBe(true);
      return;
    }
    const client = createClient(url, key, { auth: { persistSession: false } });
    const store = createSupabaseWaMasterMemoryStore(client);
    const digits = `58414${String(Date.now()).slice(-7)}`;
    const identity = await loadWaMasterIdentity({ fromDigits: digits, includeFixtures: true });
    expect(identity.fromDigits).toBe(digits);

    const { createEmptyMemory } = await import('../app/api/wa-master/_lib/memory');
    const { runWaMasterOrchestrator } = await import('../app/api/wa-master/_lib/orchestrator');
    const { loadWaMasterConfig } = await import('../app/api/wa-master/_lib/config');

    let memory = createEmptyMemory(digits, Date.now(), 86_400_000);
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: digits,
        text: 'Hola, quiero información',
        messageId: `preview-${Date.now()}`,
        nowMs: Date.now(),
        identity,
        memory,
      },
      loadWaMasterConfig({ PLATFORM_WA_MASTER: '1' } as unknown as NodeJS.ProcessEnv),
      { executeDiscovery: mockDiscoveryExecute() },
    );
    await store.save(digits, out.memory);
    const reloaded = await store.get(digits);
    expect(reloaded?.turns.length).toBeGreaterThan(0);
    await store.delete(digits);
    expect(await store.get(digits)).toBeNull();
  });
});

