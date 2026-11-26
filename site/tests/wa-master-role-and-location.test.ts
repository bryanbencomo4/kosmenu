/**
 * Central Master: role follows the words of each turn (owner ↔ diner ↔ owner),
 * and "near me" flows (shared WhatsApp location / typed address / maps link).
 */
import { describe, expect, it, vi } from 'vitest';

import {
  createEmptyMemory,
  loadWaMasterConfig,
  resolveWaMasterIdentity,
  runWaMasterOrchestrator,
  type WaMasterIdentityCatalogRow,
  type WaMasterMemory,
} from '../app/api/wa-master/_lib';
import type { WaMasterDiscoveryExecute } from '../app/api/wa-master/_lib/discovery-bridge';
import { createMemoryWaHandoffStore } from '../app/api/_lib/wa-handoff';
import { extractCoords, looksLikeAddress } from '../app/api/_lib/geocode';
import { detectMerchantVoice } from '../app/api/wa-master/_lib/brain/stance';

const OWNER = '584140821633';
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

const calls: Array<Record<string, unknown>> = [];
const discovery: WaMasterDiscoveryExecute = async (name, args) => {
  calls.push({ name, ...args });
  return {
    ok: true,
    tool: name,
    restaurants: [
      {
        id: 'r1',
        slug: 'pizzas-el-trueno',
        nombre: 'Pizzas El Trueno',
        menuUrl: 'https://elmenuxfa.com/v/pizzas-el-trueno',
        isOpen: true,
        distanceKm: typeof args.lat === 'number' ? 1.8 : null,
      },
    ],
  };
};

function cfg() {
  return loadWaMasterConfig({
    PLATFORM_WA_MASTER: '1',
    PLATFORM_WA_MASTER_RECEPTIONIST: '1',
    PLATFORM_WA_MASTER_BRAIN: '1',
  } as unknown as NodeJS.ProcessEnv);
}

async function say(text: string, memory: WaMasterMemory, nowMs = Date.now()) {
  const identity = resolveWaMasterIdentity({ fromDigits: OWNER, catalog: CATALOG });
  const out = await runWaMasterOrchestrator(
    { fromDigits: OWNER, text, messageId: `m_${Math.random().toString(36).slice(2)}`, nowMs, identity, memory },
    cfg(),
    { executeDiscovery: discovery, handoffStore: createMemoryWaHandoffStore() },
  );
  return { out, memory: out.memory };
}

describe('role follows each turn', () => {
  it('detects owner voice without hijacking diners', () => {
    expect(detectMerchantVoice('agrega una pizza margarita a 12', true)).toBe(true);
    expect(detectMerchantVoice('cambia el precio de la pizza hawaiana a 14', true)).toBe(true);
    expect(detectMerchantVoice('soy el dueño de Pizzas El Trueno', true)).toBe(true);
    expect(detectMerchantVoice('quiero pedir una pizza', true)).toBe(false);
    expect(detectMerchantVoice('restaurantes cerca de mi zona', true)).toBe(false);
    expect(detectMerchantVoice('tengo hambre, algo de pizza', false)).toBe(false);
  });

  it('owner → diner → owner: the last turn is treated as the owner again', async () => {
    let m = createEmptyMemory(OWNER, Date.now(), 86_400_000);
    const first = await say('quiero cambiar el precio de mi pizza campesina', m);
    expect(first.out.specialist).toBe('admin');
    m = first.memory;

    const diner = await say('ahora busco pizza para cenar en san cristobal', m);
    expect(diner.out.specialist).toBe('consumer');
    m = diner.memory;

    // Food words in an owner command must NOT be read as a diner search.
    const back = await say('agrega una pizza margarita a 12', m);
    expect(back.out.specialist).toBe('admin');
    expect(back.out.replies.join('\n')).toMatch(/Pizzas El Trueno/);
    m = back.memory;

    const declared = await say('soy el dueño, sigamos con mi negocio', diner.memory);
    expect(declared.out.specialist).toBe('admin');
    expect(declared.out.replies.join('\n')).toMatch(/Pizzas El Trueno/);
  });

  it('a diner list answer left open does not capture an owner command', async () => {
    let m = createEmptyMemory(OWNER, Date.now(), 86_400_000);
    const ask = await say('quiero pizza', m);
    m = ask.memory;
    const owner = await say('cambia el precio de la pizza campesina a 15', m);
    expect(owner.out.specialist).toBe('admin');
  });
});

describe('near me', () => {
  it('parses shared locations, maps links and raw coordinates', () => {
    expect(extractCoords('Mi ubicación: 7.766900, -72.225000 (Plaza Bolívar)')).toMatchObject({
      lat: 7.7669,
      lng: -72.225,
    });
    expect(extractCoords('https://www.google.com/maps/@10.4961,-66.8983,17z')).toMatchObject({ lat: 10.4961 });
    expect(extractCoords('https://maps.google.com/?q=7.7669,-72.2250')).toMatchObject({ lng: -72.225 });
    expect(extractCoords('tengo 10, 20 pizzas')).toBeNull();
    expect(looksLikeAddress('Av. Carabobo, urbanización La Concordia')).toBe(true);
    expect(looksLikeAddress('pizza')).toBe(false);
  });

  it('asks for the live location, then answers with distance', async () => {
    calls.length = 0;
    let m = createEmptyMemory(OWNER, Date.now(), 86_400_000);
    const ask = await say('qué restaurantes hay cerca de mi zona', m);
    expect(ask.out.replies.join('\n')).toMatch(/ubicaci[oó]n actual/i);
    expect(calls.length).toBe(0);
    m = ask.memory;

    const shared = await say('Mi ubicación: 7.766900, -72.225000 (Plaza Bolívar)', m);
    const txt = shared.out.replies.join('\n');
    expect(txt).toMatch(/Pizzas El Trueno/);
    expect(txt).toMatch(/1,8 km/);
    expect(calls.some((c) => c.lat === 7.7669 && c.lng === -72.225)).toBe(true);
    expect(shared.memory.summary.geo?.lat).toBeCloseTo(7.7669);
  });

  it('understands a typed address through the geocoder', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([{ lat: '7.8100', lon: '-72.2000', display_name: 'Av. Carabobo, San Cristóbal, Táchira' }]), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      calls.length = 0;
      let m = createEmptyMemory(OWNER, Date.now(), 86_400_000);
      m = (await say('restaurantes cercanos', m)).memory;
      const typed = await say('estoy en la Av. Carabobo, urbanización La Concordia', m);
      expect(fetchMock).toHaveBeenCalled();
      expect(typed.out.replies.join('\n')).toMatch(/Pizzas El Trueno/);
      expect(calls.some((c) => c.lat === 7.81)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
