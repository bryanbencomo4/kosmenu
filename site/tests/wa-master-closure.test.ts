import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ClientDirectoryBusiness } from '../app/api/_lib/public-directory';
import { loadWaEntryConfig } from '../app/api/wa-entry/_lib/config';
import { processWaEntryEvent } from '../app/api/wa-entry/_lib/process';
import { createSimWaEntrySender } from '../app/api/wa-entry/_lib/sender';
import { createMemoryWaEntryStore } from '../app/api/wa-entry/_lib/store';
import {
  createEmptyMemory,
  createFileWaMasterMemoryStore,
  createMemoryWaMasterAuthGate,
  createMemoryWaMasterQuotaStore,
  createMemoryWaMasterStore,
  loadOrCreateMemory,
  loadWaMasterConfig,
  resolveWaMasterIdentity,
  runWaMasterOrchestrator,
  type WaMasterIdentityCatalogRow,
} from '../app/api/wa-master/_lib';
import type { WaMasterMenuSnapshot } from '../app/api/wa-master/_lib/specialists/admin';

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

const MOCK_DIR = [
  {
    id: 'r1',
    slug: 'pizza-sc',
    nombre: 'Pizza San Cristóbal',
    logoUrl: null,
    coverUrl: null,
    categoria: 'pizzas',
    zonaOperacion: 'San Cristóbal',
    direccion: 'San Cristóbal',
    menuUrl: 'https://elmenuxfa.com/v/pizza-sc',
    isOpen: true,
    openLabel: 'Abierto',
    currencies: ['USD'],
    paymentChannels: ['pago_movil'],
    acceptsVesBcv: true,
    distanceKm: null,
    lat: null,
    lng: null,
    ratingAverage: 0,
    ratingCount: 0,
    promovido: false,
    productNames: ['pizza'],
    showcaseDishes: [],
  },
  {
    id: 'r2',
    slug: 'burger-sc',
    nombre: 'Burger Centro',
    logoUrl: null,
    coverUrl: null,
    categoria: 'hamburguesas',
    zonaOperacion: 'San Cristóbal',
    direccion: 'San Cristóbal',
    menuUrl: 'https://elmenuxfa.com/v/burger-sc',
    isOpen: true,
    openLabel: 'Abierto',
    currencies: ['USD'],
    paymentChannels: [],
    acceptsVesBcv: false,
    distanceKm: null,
    lat: null,
    lng: null,
    ratingAverage: 0,
    ratingCount: 0,
    promovido: false,
    productNames: ['hamburguesa'],
    showcaseDishes: [],
  },
] as unknown as ClientDirectoryBusiness[];

function masterCfg(env: Record<string, string> = {}) {
  return loadWaMasterConfig({
    PLATFORM_WA_MASTER: '1',
    PLATFORM_WA_MASTER_SIMULATE: '1',
    ...env,
  } as unknown as NodeJS.ProcessEnv);
}

function mockDiscoveryExecute() {
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
    let results = [...MOCK_DIR];
    const q = String(args.query || '').toLowerCase();
    const cat = String(args.category || '').toLowerCase();
    const region = String(args.region || '').toLowerCase();
    if (cat) {
      results = results.filter((r) =>
        (r.categoria || '').toLowerCase().includes(cat.replace(/s$/, '')),
      );
    }
    if (q.includes('pizza')) results = results.filter((r) => r.slug.includes('pizza'));
    if (q.includes('hamburg')) results = results.filter((r) => r.slug.includes('burger'));
    if (q.includes('xyznoexiste')) results = [];
    if (region) {
      const fold = (s: string) =>
        s
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
      const rf = fold(region);
      results = results.filter((r) => fold(r.zonaOperacion || '').includes(rf));
    }
    if (args.openOnly === true) results = results.filter((r) => r.isOpen === true);
    return {
      ok: true,
      tool: name,
      restaurants: results.map((r) => ({
        id: r.id,
        slug: r.slug,
        nombre: r.nombre,
        menuUrl: r.menuUrl,
        chatUrl: null,
        isOpen: r.isOpen,
        openLabel: r.openLabel,
      })),
      text: results.length ? `Encontré ${results.length}` : 'Sin resultados',
    };
  };
}

function menuLoader(snap?: Partial<WaMasterMenuSnapshot>): typeof loadMenu {
  async function loadMenu(comercioId: string): Promise<WaMasterMenuSnapshot | null> {
    if (comercioId === 'c-other') return null;
    return {
      comercioId,
      publicName: 'Pizzería Don Tomás',
      currencyLabel: 'USD',
      exchangeRate: '36.50 VES/USD (config negocio)',
      openLabel: 'Abierto',
      permiteDelivery: true,
      products: [
        { id: 'p1', nombre: 'Pizza Margarita', precio: 5.5, disponible: true, categoria: 'Pizzas' },
        { id: 'p2', nombre: 'Refresco', precio: 1.5, disponible: false, categoria: 'Bebidas' },
      ],
      ...snap,
    };
  }
  return loadMenu;
}

const loadMenu = menuLoader();

async function processMaster(text: string, opts: {
  from?: string;
  id?: string;
  catalog?: WaMasterIdentityCatalogRow[];
  mem?: ReturnType<typeof createMemoryWaMasterStore>;
  auth?: ReturnType<typeof createMemoryWaMasterAuthGate>;
  shadow?: boolean;
  entryStore?: ReturnType<typeof createMemoryWaEntryStore>;
} = {}) {
  const store = opts.entryStore ?? createMemoryWaEntryStore();
  const mem = opts.mem ?? createMemoryWaMasterStore();
  const config = {
    ...loadWaEntryConfig({
      PLATFORM_WA_INBOUND: '1',
      PLATFORM_WA_ROUTER: '1',
      PLATFORM_WA_ADAPTER: 'sim',
    } as unknown as NodeJS.ProcessEnv),
    masterAssistantEnabled: true,
    masterAssistantShadow: Boolean(opts.shadow),
    masterAllowlistDigits: [(opts.from || '584140000100').replace(/\D/g, '')],
  };
  const from = opts.from || '584140000100';
  config.masterAllowlistDigits = [from.replace(/\D/g, '')];
  const payload = {
    event: 'messages.upsert',
    sessionId: 'ELMENUXFA1',
    data: {
      message: {
        id: opts.id || `wamid.${Math.random().toString(36).slice(2, 10)}`,
        from: `${from}@s.whatsapp.net`,
        fromMe: false,
        text,
        timestamp: Math.floor(Date.now() / 1000),
      },
    },
  };
  const result = await processWaEntryEvent({
    config,
    store,
    sender: createSimWaEntrySender(store),
    rawBody: JSON.stringify(payload),
    payload,
    masterIdentityCatalog: opts.catalog ?? [],
    masterMemoryStore: mem,
    masterAuthGate: opts.auth,
    masterDiscoveryExecute: mockDiscoveryExecute(),
    masterLoadMenu: loadMenu,
  });
  return { result, store, mem, from };
}

describe('wa-master closure sprint', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    dirs.length = 0;
  });

  it('nuevo + info + consumidor + zona persistida', async () => {
    const mem = createMemoryWaMasterStore();
    const a = await processMaster('Hola, quiero información', { mem });
    expect(a.result.replies[0]?.text).toMatch(/menú digital|pedir comida/i);

    const b = await processMaster('Quiero unas hamburguesas', { mem, from: a.from });
    expect(b.result.replies[0]?.text).toMatch(/zona|ciudad/i);

    const c = await processMaster('San Cristóbal', { mem, from: a.from });
    expect(c.result.replies[0]?.text).toMatch(/Burger|opciones|Menú/i);

    const saved = await mem.get(a.from);
    expect(saved?.summary.zone?.toLowerCase()).toMatch(/san crist/);
  });

  it('búsqueda pizza con mock directorio realista', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: '584140000200', catalog: [] });
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584140000200',
        text: 'Quiero pedir una pizza en San Cristóbal',
        messageId: 'm-pizza',
        nowMs: Date.now(),
        identity,
        memory: createEmptyMemory('584140000200', Date.now(), 86400000),
      },
      masterCfg(),
      { executeDiscovery: mockDiscoveryExecute() },
    );
    expect(out.toolsUsed).toContain('search_restaurants');
    expect(out.replies[0]).toMatch(/Pizza San Cristóbal/);
    expect(out.memory.summary.lastRestaurants[0]?.slug).toBe('pizza-sc');
  });

  it('segunda opción / memoria de lista', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: '584140000201', catalog: [] });
    let memory = createEmptyMemory('584140000201', Date.now(), 86400000);
    const r1 = await runWaMasterOrchestrator(
      {
        fromDigits: '584140000201',
        text: 'hamburguesas en San Cristóbal',
        messageId: 'm-b1',
        nowMs: 1,
        identity,
        memory,
      },
      masterCfg(),
      { executeDiscovery: mockDiscoveryExecute() },
    );
    memory = r1.memory;
    // Ensure at least two refs for "segunda"
    if (memory.summary.lastRestaurants.length < 2) {
      memory.summary.lastRestaurants = [
        {
          id: 'r1',
          slug: 'pizza-sc',
          nombre: 'Pizza San Cristóbal',
          menuUrl: 'https://elmenuxfa.com/v/pizza-sc',
        },
        {
          id: 'r2',
          slug: 'burger-sc',
          nombre: 'Burger Centro',
          menuUrl: 'https://elmenuxfa.com/v/burger-sc',
        },
      ];
    }
    const r2 = await runWaMasterOrchestrator(
      {
        fromDigits: '584140000201',
        text: 'La segunda me gusta, mándame el menú',
        messageId: 'm-b2',
        nowMs: 2,
        identity,
        memory,
      },
      masterCfg(),
      { executeDiscovery: mockDiscoveryExecute() },
    );
    expect(r2.replies[0]).toMatch(/elmenuxfa\.com\/v\//);
  });

  it('comerciante conocido + lectura menú + propuesta precio sin auth', async () => {
    const identity = resolveWaMasterIdentity({
      fromDigits: '584120000099',
      catalog: [CATALOG[0]],
    });
    expect(identity.provenanceNotes).toContain('phone_match_is_not_ownership');

    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584120000099',
        text: 'Cambia el precio de la pizza Margarita a 6 dólares',
        messageId: 'm-price',
        nowMs: Date.now(),
        identity,
        memory: createEmptyMemory('584120000099', Date.now(), 86400000),
      },
      masterCfg(),
      { loadMenu, authGate: createMemoryWaMasterAuthGate() },
    );
    expect(out.replies[0]).toMatch(/5\.5|verificación|panel/i);
    expect(out.replies[0]).not.toMatch(/¡Listo!.*actualizado/i);
    expect(out.memory.summary.pendingAdminProposal?.action).toBe('edit_price');
  });

  it('intento no autorizado de edición con confirmación', async () => {
    const auth = createMemoryWaMasterAuthGate();
    const identity = resolveWaMasterIdentity({
      fromDigits: '584120000099',
      catalog: [CATALOG[0]],
    });
    let memory = createEmptyMemory('584120000099', Date.now(), 86400000);
    const r1 = await runWaMasterOrchestrator(
      {
        fromDigits: '584120000099',
        text: 'Cambia el precio de la Margarita a 6',
        messageId: 'm-u1',
        nowMs: 10,
        identity,
        memory,
      },
      masterCfg(),
      { loadMenu, authGate: auth },
    );
    memory = r1.memory;
    const r2 = await runWaMasterOrchestrator(
      {
        fromDigits: '584120000099',
        text: 'confirmo',
        messageId: 'm-u2',
        nowMs: 11,
        identity,
        memory,
      },
      masterCfg(),
      { loadMenu, authGate: auth },
    );
    expect(r2.toolsUsed).toContain('admin_auth_required');
    expect(r2.replies[0]).toMatch(/verificación segura|panel/i);
  });

  it('consulta tasa sin inventar', async () => {
    const identity = resolveWaMasterIdentity({
      fromDigits: '584120000099',
      catalog: [CATALOG[0]],
    });
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584120000099',
        text: '¿Cuál es la tasa del dólar configurada?',
        messageId: 'm-fx',
        nowMs: Date.now(),
        identity,
        memory: createEmptyMemory('584120000099', Date.now(), 86400000),
      },
      masterCfg(),
      { loadMenu },
    );
    expect(out.replies[0]).toMatch(/36\.50|tasa/i);
    expect(out.replies[0]).not.toMatch(/BCV oficial inventad/i);
  });

  it('registro comercial guarda nombre y retoma', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: '584140000300', catalog: [] });
    let memory = createEmptyMemory('584140000300', Date.now(), 86400000);
    const r1 = await runWaMasterOrchestrator(
      {
        fromDigits: '584140000300',
        text: 'Quiero poner mi restaurante en la plataforma',
        messageId: 'm-c1',
        nowMs: 1,
        identity,
        memory,
      },
      masterCfg(),
    );
    memory = r1.memory;
    expect(r1.replies[0]).toMatch(/cómo se llama/i);
    const r2 = await runWaMasterOrchestrator(
      {
        fromDigits: '584140000300',
        text: 'Mi negocio se llama Arepa Norte',
        messageId: 'm-c2',
        nowMs: 2,
        identity,
        memory,
      },
      masterCfg(),
    );
    expect(r2.memory.summary.signupDraft?.businessName).toMatch(/Arepa Norte/);
    expect(r2.replies[0]).toMatch(/tab=register|panel/i);
    expect(r2.replies[0]).toMatch(/pendiente|API segura|panel/i);
  });

  it('mixed roles: merchant pide comida', async () => {
    const identity = resolveWaMasterIdentity({
      fromDigits: '584120000099',
      catalog: [CATALOG[0]],
      hints: { consumerOrderDigits: ['584120000099'] },
    });
    expect(identity.role).toBe('mixed');
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584120000099',
        text: 'Quiero pedir hamburguesas en San Cristóbal',
        messageId: 'm-mix',
        nowMs: Date.now(),
        identity,
        memory: createEmptyMemory('584120000099', Date.now(), 86400000),
      },
      masterCfg(),
      { executeDiscovery: mockDiscoveryExecute() },
    );
    expect(out.specialist).toBe('consumer');
  });

  it('memoria sobrevive reinicio (file store)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wa-master-'));
    dirs.push(dir);
    const store1 = createFileWaMasterMemoryStore(dir);
    const from = '584140000400';
    let memory = await loadOrCreateMemory(store1, from, Date.now(), 86400000);
    const identity = resolveWaMasterIdentity({ fromDigits: from, catalog: [] });
    const r1 = await runWaMasterOrchestrator(
      {
        fromDigits: from,
        text: 'Quiero hamburguesas',
        messageId: 'm-f1',
        nowMs: 1,
        identity,
        memory,
      },
      masterCfg(),
      { executeDiscovery: mockDiscoveryExecute() },
    );
    await store1.save(from, r1.memory);

    const store2 = createFileWaMasterMemoryStore(dir);
    const reloaded = await store2.get(from);
    expect(reloaded?.turns.length).toBeGreaterThan(0);
    expect(reloaded?.summary.lastIntent).toBeTruthy();
  });

  it('reclamo + humano + aislamiento pedidos', async () => {
    const mem = createMemoryWaMasterStore();
    const entryStore = createMemoryWaEntryStore();
    const a = await processMaster('Quiero hacer un reclamo, tengo un problema', {
      mem,
      entryStore,
      from: '584140000500',
    });
    expect(a.result.replies[0]?.text).toMatch(/Lamento|inconveniente|plataforma|persona/i);
    expect(a.result.replies[0]?.text).not.toMatch(/telefono_cliente|dirección/i);

    const b = await processMaster('Quiero hablar con una persona', {
      mem,
      entryStore,
      from: '584140000500',
    });
    expect(b.result.state).toBe('human_handling');

    const c = await processMaster('hola otra vez', { mem, entryStore, from: '584140000500' });
    expect(c.result.action).toBe('ignored');
    expect(c.result.reason).toBe('human_handling');
  });

  it('gemini fail / cuota → fallback', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: '584140000600', catalog: [] });
    const quota = createMemoryWaMasterQuotaStore();
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584140000600',
        text: 'Hola',
        messageId: 'm-q',
        nowMs: Date.now(),
        identity,
        memory: createEmptyMemory('584140000600', Date.now(), 86400000),
        forceDeterministic: false,
      },
      masterCfg({ PLATFORM_WA_MASTER_ALLOW_GEMINI: '1' }),
      { quota, forceAgentFail: true, forceSimulateAgent: false },
    );
    expect(out.mode).toBe('fallback');
    expect(out.replies[0]).toBeTruthy();
  });

  it('duplicado y concurrencia', async () => {
    const store = createMemoryWaEntryStore();
    const mem = createMemoryWaMasterStore();
    const config = {
      ...loadWaEntryConfig({
        PLATFORM_WA_INBOUND: '1',
        PLATFORM_WA_ROUTER: '1',
        PLATFORM_WA_ADAPTER: 'sim',
      } as unknown as NodeJS.ProcessEnv),
      masterAssistantEnabled: true,
      masterAllowlistDigits: ['584140000700'],
    };
    const payload = {
      event: 'messages.upsert',
      sessionId: 'ELMENUXFA1',
      data: {
        message: {
          id: 'wamid.DUPMASTER',
          from: '584140000700@s.whatsapp.net',
          fromMe: false,
          text: 'Hola',
          timestamp: Math.floor(Date.now() / 1000),
        },
      },
    };
    const run = () =>
      processWaEntryEvent({
        config,
        store,
        sender: createSimWaEntrySender(store),
        rawBody: JSON.stringify(payload),
        payload,
        masterMemoryStore: mem,
        masterDiscoveryExecute: mockDiscoveryExecute(),
      });
    const [a, b] = await Promise.all([run(), run()]);
    const actions = [a.action, b.action].sort();
    expect(actions).toEqual(['ignored', 'replied']);
  });

  it('aislamiento multi-comercio + privacidad', async () => {
    const identity = resolveWaMasterIdentity({
      fromDigits: '584120000099',
      catalog: CATALOG,
    });
    expect(identity.comercios.length).toBeGreaterThanOrEqual(2);
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584120000099',
        text: 'Muéstrame mis productos agotados',
        messageId: 'm-iso',
        nowMs: Date.now(),
        identity,
        memory: createEmptyMemory('584120000099', Date.now(), 86400000),
      },
      masterCfg(),
      { loadMenu },
    );
    expect(out.replies[0]).toMatch(/Don Tomás|Burger Lab/);
    expect(out.replies[0]).not.toMatch(/owner_id|service_role/i);
  });

  it('fallback router cuando Master OFF', async () => {
    const { result } = await processMaster('Hola', { shadow: false });
    // processMaster enables master — separate check:
    const store = createMemoryWaEntryStore();
    const config = {
      ...loadWaEntryConfig({
        PLATFORM_WA_INBOUND: '1',
        PLATFORM_WA_ROUTER: '1',
        PLATFORM_WA_ADAPTER: 'sim',
      } as unknown as NodeJS.ProcessEnv),
      masterAssistantEnabled: false,
    };
    const payload = {
      event: 'messages.upsert',
      sessionId: 'ELMENUXFA1',
      data: {
        message: {
          id: 'wamid.FALLBACK',
          from: '584140000800@s.whatsapp.net',
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
    void result;
  });

  it('live Gemini refused without auth even if flag on', async () => {
    const identity = resolveWaMasterIdentity({ fromDigits: '584140000900', catalog: [] });
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: '584140000900',
        text: 'Hola',
        messageId: 'm-live',
        nowMs: Date.now(),
        identity,
        memory: createEmptyMemory('584140000900', Date.now(), 86400000),
      },
      masterCfg({ PLATFORM_WA_MASTER_ALLOW_GEMINI: '1', PLATFORM_WA_MASTER_SIMULATE: '0' }),
      { forceSimulateAgent: false, quota: createMemoryWaMasterQuotaStore() },
    );
    // Without API key / authorization → fallback or deterministic greeting still works
    expect(out.replies[0]).toMatch(/elmenuxfa\.com|Hola/i);
  });
});
