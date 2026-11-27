/**
 * Load / stability checks for the consumer Master brain (isolated QA world).
 *
 * 1) Many consecutive turns of the SAME user: the active restaurant and the
 *    recent history must survive the unified turn cap (no silent loss).
 * 2) Consistency: the SAME conversation replayed many times must produce
 *    byte-identical replies (compared turn by turn, with independent golden values
 *    from the raw menu fixture) — and the comparator itself is proven to fail on drift.
 * 3) Gemini simulation. WHAT IS USED: a CONTROLLED MOCK of `fetch` for
 *    `generativelanguage.googleapis.com ... :generateContent` (vi.stubGlobal). NO real
 *    API key is read or sent and no network call is made; the key in this file is a
 *    dummy string. The mock reproduces the request contract of `geminiCompose`
 *    (systemInstruction, generationConfig, the transcript inside the user prompt) so we
 *    can assert temperature 0.3, the 40-turn history window and the 45-minute TTL end to
 *    end through the real orchestrator + real `geminiCompose` + real `validateComposed`.
 *    A live-Gemini run is NOT covered here (it would need a key and is non-deterministic).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fixture from './fixtures/qa-bladi-menu.json';

import {
  appendTurn,
  createEmptyMemory,
  loadWaMasterConfig,
  resolveWaMasterIdentity,
  runWaMasterOrchestrator,
  WA_MASTER_TURN_CAP,
  type WaMasterMemory,
} from '../app/api/wa-master/_lib';
import { createMemoryWaHandoffStore } from '../app/api/_lib/wa-handoff';
import { ACTIVE_REF_TTL_MS, TASK_TTL_MS } from '../app/api/wa-master/_lib/brain/task';
import {
  COMPOSE_TEMPERATURE,
  geminiCompose,
  validateComposed,
} from '../app/api/wa-master/_lib/brain/compose';
import {
  directoryCalls,
  loadQaDelivery,
  loadQaMenu,
  qaDiscovery,
  QA_SNAPS,
} from './fixtures/wa-qa-world';

vi.mock('../app/api/_lib/geocode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/api/_lib/geocode')>();
  const world = await import('./fixtures/wa-qa-world');
  return { ...actual, geocodeAddress: async (text: string) => world.qaGeocode(text) };
});

const USER = '584120077788';
const cfg = () =>
  loadWaMasterConfig({
    PLATFORM_WA_MASTER: '1',
    PLATFORM_WA_MASTER_RECEPTIONIST: '1',
    PLATFORM_WA_MASTER_BRAIN: '1',
  } as unknown as NodeJS.ProcessEnv);

const body = (r: { replies: string[] }) => r.replies.join('\n');
const fresh = () => createEmptyMemory(USER, Date.now(), 86_400_000);

beforeEach(() => {
  directoryCalls.length = 0;
});

async function say(
  text: string,
  memory: WaMasterMemory,
  opts: {
    compose?: (input: { userText: string; drafts: string[] }) => Promise<string[] | null>;
    nowMs?: number;
    /** Use the REAL geminiCompose (its HTTP goes to the stubbed fetch). */
    useGemini?: boolean;
  } = {},
) {
  const identity = resolveWaMasterIdentity({ fromDigits: USER, catalog: [] });
  return runWaMasterOrchestrator(
    {
      fromDigits: USER,
      text,
      messageId: `m_${Math.random().toString(36).slice(2)}`,
      nowMs: opts.nowMs ?? Date.now(),
      identity,
      memory,
    },
    cfg(),
    {
      executeDiscovery: qaDiscovery,
      loadShopDelivery: loadQaDelivery,
      loadPublicMenu: loadQaMenu,
      handoffStore: createMemoryWaHandoffStore(),
      ...(opts.useGemini
        ? {}
        : {
            compose: opts.compose
              ? async (input: { userText: string; drafts: string[] }) => opts.compose!(input)
              : async () => null, // load tests stay deterministic: never hit the network
          }),
    },
  );
}

describe('TTL alignment (active restaurant / task / menu view)', () => {
  it('ACTIVE_REF_TTL_MS is the same clock as TASK_TTL_MS', () => {
    expect(ACTIVE_REF_TTL_MS).toBe(TASK_TTL_MS);
    expect(ACTIVE_REF_TTL_MS).toBe(45 * 60 * 1000);
  });

  it('an active restaurant without activeAtMs does not linger forever', async () => {
    const toro = QA_SNAPS['toro-bravo'];
    const ref = {
      id: toro.id,
      slug: toro.slug,
      nombre: 'TORO BRAVO',
      menuUrl: `https://elmenuxfa.com/v/${toro.slug}`,
      chatUrl: null,
    };
    const m = fresh();
    m.summary.activeRestaurant = ref;
    m.summary.lastRestaurants = [ref];
    // Legacy snapshot: restaurant set, stamp missing → must NOT answer from that menu.
    m.summary.activeAtMs = null;
    const r = await say('Dime las tres hamburguesas más económicas', m);
    expect(body(r)).not.toMatch(/VILLA — 15\.000 COP/);
  });
});

describe('unified history cap', () => {
  it('config, appendTurn and compose share WA_MASTER_TURN_CAP', () => {
    expect(WA_MASTER_TURN_CAP).toBe(40);
    expect(cfg().maxTurnsInPrompt).toBe(WA_MASTER_TURN_CAP);
    let mem = fresh();
    for (let i = 0; i < WA_MASTER_TURN_CAP + 25; i++) {
      mem = appendTurn(mem, { role: i % 2 === 0 ? 'user' : 'assistant', text: `t${i}`, atMs: Date.now() + i });
    }
    expect(mem.turns).toHaveLength(WA_MASTER_TURN_CAP);
    expect(mem.turns[0].text).toBe(`t${25}`); // oldest kept after the overflow
    expect(mem.turns.at(-1)!.text).toBe(`t${WA_MASTER_TURN_CAP + 24}`);
  });
});

describe('load: many consecutive turns keep the active restaurant and history', () => {
  it('survives 60 menu follow-ups without dropping TORO BRAVO or recent turns', async () => {
    let m = fresh();
    m = (await say('Busco hamburguesas en Los Palos Grandes, Caracas', m)).memory;
    m = (await say('Me interesa TORO BRAVO', m)).memory;
    expect(m.summary.activeRestaurant?.nombre).toBe('TORO BRAVO');
    expect(m.summary.activeAtMs).toBeTruthy();

    const followUps = [
      'Dime las tres hamburguesas más económicas',
      '¿Cuáles son las más caras?',
      '¿Qué bebidas tiene?',
      'Dime las papas',
      '¿Cuánto cuesta la VILLA?',
    ];

    const N = 60;
    for (let i = 0; i < N; i++) {
      const r = await say(followUps[i % followUps.length], m);
      m = r.memory;
      expect(m.summary.activeRestaurant?.nombre).toBe('TORO BRAVO');
      expect(typeof m.summary.activeAtMs).toBe('number');
      expect(Date.now() - (m.summary.activeAtMs as number)).toBeLessThan(ACTIVE_REF_TTL_MS);
      expect(m.turns.length).toBeLessThanOrEqual(WA_MASTER_TURN_CAP);
      expect(m.turns.length).toBeGreaterThanOrEqual(2);
      // The last user turn is always retained (cap never drops the current exchange).
      expect(m.turns.at(-2)?.role === 'user' || m.turns.at(-1)?.role === 'user').toBe(true);
    }

    // After the load, a price question still answers from TORO BRAVO's real menu.
    const last = await say('Dime las tres hamburguesas más económicas', m);
    expect(body(last)).toMatch(/VILLA — 15\.000 COP/);
    expect(last.memory.summary.activeRestaurant?.nombre).toBe('TORO BRAVO');
    expect(last.memory.turns.length).toBe(WA_MASTER_TURN_CAP);
    // Recent turns still include the last follow-up (not wiped by the cap).
    expect(last.memory.turns.some((t) => t.role === 'user' && /hamburguesas más económicas/.test(t.text))).toBe(true);
  });
});

describe('load: Gemini compose consistency under repeated inputs', () => {
  it('COMPOSE_TEMPERATURE is low and deterministic for stability', () => {
    expect(COMPOSE_TEMPERATURE).toBe(0.3);
    expect(COMPOSE_TEMPERATURE).toBeLessThan(0.5);
  });

  it('geminiCompose sends the low temperature on every identical request', async () => {
    const temps: number[] = [];
    const drafts = ['Hola, te ayudo con el menú de *TORO BRAVO*. https://elmenuxfa.com/v/toro-bravo'];
    const identity = resolveWaMasterIdentity({ fromDigits: USER, catalog: [] });
    const memory = fresh();
    memory.turns = [
      { role: 'user', text: 'Hola', atMs: 1 },
      { role: 'assistant', text: 'Hola', atMs: 2 },
      { role: 'user', text: 'Me interesa TORO BRAVO', atMs: 3 },
    ];

    const fetchMock = vi.fn(async (_url: string, init?: { body?: string }) => {
      const bodyJson = JSON.parse(String(init?.body || '{}')) as {
        generationConfig?: { temperature?: number };
      };
      temps.push(bodyJson.generationConfig?.temperature ?? -1);
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: drafts[0] }] } }],
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      for (let i = 0; i < 5; i++) {
        const out = await geminiCompose(
          {
            userText: 'Me interesa TORO BRAVO',
            drafts,
            memory,
            identity,
            maxTurnsInPrompt: WA_MASTER_TURN_CAP,
          },
          {
            PLATFORM_WA_MASTER_COMPOSE: '1',
            GEMINI_API_KEY: 'test-key-not-real',
            CHATBOT_GEMINI_MODEL: 'gemini-2.5-flash-lite',
          } as unknown as NodeJS.ProcessEnv,
        );
        expect(out?.[0]).toContain('TORO BRAVO');
      }
    } finally {
      vi.unstubAllGlobals();
    }

    expect(temps).toHaveLength(5);
    expect(new Set(temps).size).toBe(1);
    expect(temps[0]).toBe(COMPOSE_TEMPERATURE);
  });
});

// ---------------------------------------------------------------------------
// Consistency: the same conversation, replayed, must say exactly the same thing
// ---------------------------------------------------------------------------
type RawProduct = { nombre: string; precio: number; categoria_id: string; disponible: boolean };
const RAW = fixture as unknown as { categorias: Array<{ id: string; nombre: string }>; productos: RawProduct[] };
const BURGER_CAT = RAW.categorias.find((c) => c.nombre === 'HAMBURGUESAS')!.id;
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
/** Cheapest three DISTINCT burgers at TORO BRAVO (multiplier 1), computed from the raw fixture. */
const CHEAPEST3 = RAW.productos
  .filter((p) => p.categoria_id === BURGER_CAT && p.disponible)
  .map((p) => ({ nombre: p.nombre, price: p.precio }))
  .sort((a, b) => a.price - b.price || a.nombre.localeCompare(b.nombre, 'es'))
  .filter((b, i, a) => a.findIndex((x) => x.nombre === b.nombre && x.price === b.price) === i)
  .slice(0, 3);
const CHEAPEST3_LINES = CHEAPEST3.map((b) => `• ${b.nombre} — ${fmt(b.price)} COP`);

/** Fails with the first differing turn: a drift can never pass silently. */
function assertSameRun(reference: string[], candidate: string[], label: string) {
  expect(candidate.length, `${label}: number of turns`).toBe(reference.length);
  reference.forEach((expected, i) => {
    expect(candidate[i], `${label}: reply of turn ${i + 1} deviates`).toBe(expected);
  });
}

const CONSISTENCY_SCRIPT = [
  'Busco hamburguesas en Los Palos Grandes, Caracas',
  'Me interesa TORO BRAVO',
  'Dime las tres hamburguesas más económicas',
  '¿Cuánto cuesta el delivery hasta mi ubicación?',
  'Dime las tres hamburguesas más económicas y el total con delivery',
  'No quiero TORO BRAVO. Busca otros restaurantes',
  'Empecemos de nuevo. Quiero hamburguesas en Caracas',
];

async function replayScript(script: string[], baseMs: number) {
  let m = fresh();
  const replies: string[] = [];
  const facts: string[] = [];
  for (let i = 0; i < script.length; i++) {
    const r = await say(script[i], m, { nowMs: baseMs + i * 10_000 });
    m = r.memory;
    replies.push(body(r));
    facts.push(
      JSON.stringify({
        active: m.summary.activeRestaurant?.id ?? null,
        food: m.summary.task?.food?.category ?? null,
        excluded: m.summary.task?.excluded ?? [],
        op: m.summary.task?.op ?? null,
        shown: m.summary.lastRestaurants.map((x) => x.id),
        zone: m.summary.zone ?? null,
      }),
    );
  }
  return { replies, facts };
}

describe('consistency: replaying the same conversation 12 times', () => {
  it('every replay is byte-identical, turn by turn, in replies AND in memory facts', async () => {
    const base = Date.UTC(2026, 10, 27, 12, 0, 0);
    const reference = await replayScript(CONSISTENCY_SCRIPT, base);

    // Independent golden values (raw fixture, not the code under test).
    expect(reference.replies[2]).toContain(CHEAPEST3_LINES[0]); // VILLA — 15.000 COP
    for (const line of CHEAPEST3_LINES) expect(reference.replies[2]).toContain(line);
    expect(reference.replies[4]).toContain(`Subtotal: ${fmt(CHEAPEST3.reduce((s, b) => s + b.price, 0))} COP`);
    expect(reference.replies[5]).not.toMatch(/TORO BRAVO\*? —/); // exclusion honoured
    expect(reference.replies[6]).toMatch(/^Listo, empezamos de nuevo/);
    expect(JSON.parse(reference.facts[1]).active).toBeTruthy();
    expect(JSON.parse(reference.facts[5]).excluded).toContain('toro bravo');
    expect(JSON.parse(reference.facts[6]).excluded).toEqual([]);

    for (let run = 1; run <= 12; run++) {
      const again = await replayScript(CONSISTENCY_SCRIPT, base);
      assertSameRun(reference.replies, again.replies, `run ${run} replies`);
      assertSameRun(reference.facts, again.facts, `run ${run} memory facts`);
    }
  });

  it('the comparator really fails when a reply drifts (negative control)', async () => {
    const base = Date.UTC(2026, 10, 27, 12, 0, 0);
    const reference = await replayScript(CONSISTENCY_SCRIPT, base);
    const drifted = [...reference.replies];
    drifted[2] = drifted[2].replace(CHEAPEST3_LINES[0], `• VILLA — ${fmt(CHEAPEST3[0].price + 1)} COP`);
    expect(() => assertSameRun(reference.replies, drifted, 'drift')).toThrow(/turn 3 deviates/);
    const shortRun = reference.replies.slice(0, -1);
    expect(() => assertSameRun(reference.replies, shortRun, 'short')).toThrow(/number of turns/);
  });
});

// ---------------------------------------------------------------------------
// Gemini simulation (controlled fetch mock) under TTL 45 min, 40-turn history, temperature 0.3
// ---------------------------------------------------------------------------
/** Prior turns visible to Gemini when the 40-turn memory window is full (the 40th is the current message). */
const PRIOR_TURNS_AT_CAP = WA_MASTER_TURN_CAP - 1;

type GeminiCall = { model: string; temperature: number; topP: number; historyLines: number; draft: string; system: string };

/** Installs a controlled `generateContent` endpoint. `mode` decides what the "model" answers. */
function installGeminiMock(mode: 'rephrase' | 'hallucinate' | 'verbatim') {
  const calls: GeminiCall[] = [];
  const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
    expect(String(url)).toContain('generativelanguage.googleapis.com');
    expect(String(url)).toContain(':generateContent');
    const req = JSON.parse(String(init?.body || '{}')) as {
      systemInstruction?: { parts?: Array<{ text?: string }> };
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
      generationConfig?: { temperature?: number; topP?: number };
    };
    const prompt = req.contents?.[0]?.parts?.[0]?.text ?? '';
    const draft = /BORRADOR \(hechos verificados\):\n([\s\S]*?)\nRedacta ahora la respuesta final\./.exec(prompt)?.[1] ?? '';
    const transcript = /CONVERSACIÓN RECIENTE:\n([\s\S]*?)\nMENSAJE ACTUAL/.exec(prompt)?.[1] ?? '';
    const historyLines = transcript ? transcript.split('\n').filter((l) => /^(Usuario|Tú): /.test(l)).length : 0;
    calls.push({
      model: /models\/([^:]+):/.exec(String(url))?.[1] ?? '',
      temperature: req.generationConfig?.temperature ?? -1,
      topP: req.generationConfig?.topP ?? -1,
      historyLines,
      draft,
      system: req.systemInstruction?.parts?.[0]?.text ?? '',
    });
    const text =
      mode === 'verbatim'
        ? draft
        : mode === 'rephrase'
          ? `Claro. ${draft}` // same facts, different wording: valid
          : 'El delivery cuesta 9.999 COP, es gratis en https://evil.example/promo y *Pizzería Fantasma* te lo lleva.';
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

/** 55 turns: brain-owned menu questions (never composed) with a compose-eligible "gracias" every 5th. */
const LOAD_SCRIPT: string[] = (() => {
  const facts = ['Dime las tres hamburguesas más económicas', '¿Cuáles son las más caras?', '¿Cuánto cuesta la VILLA?', 'Dime las tres hamburguesas más baratas otra vez'];
  const out: string[] = [];
  for (let i = 0; i < 55; i++) out.push(i % 5 === 4 ? 'gracias' : facts[i % facts.length]);
  return out;
})();

async function openConversation(baseMs: number) {
  let m = fresh();
  m = (await say('Busco hamburguesas en Los Palos Grandes, Caracas', m, { nowMs: baseMs })).memory;
  m = (await say('Me interesa TORO BRAVO', m, { nowMs: baseMs + 1000 })).memory;
  return m;
}

describe('Gemini simulation (controlled fetch mock — no real key, no network)', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key-not-real');
    vi.stubEnv('PLATFORM_WA_MASTER_COMPOSE', '1');
    vi.stubEnv('CHATBOT_GEMINI_MODEL', 'gemini-2.5-flash-lite');
    vi.stubEnv('PLATFORM_WA_MASTER_COMPOSE_MODEL', '');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('55 turns: every Gemini request carries temperature 0.3, topP 0.9 and a history that never exceeds 40 turns', async () => {
    const { calls } = installGeminiMock('rephrase');
    const base = Date.UTC(2026, 10, 27, 12, 0, 0);
    let m = await openConversation(base);
    const factReplies = new Map<string, string>();

    for (let i = 0; i < LOAD_SCRIPT.length; i++) {
      const text = LOAD_SCRIPT[i];
      const before = calls.length;
      const r = await say(text, m, { nowMs: base + 2000 + i * 20_000, useGemini: true });
      m = r.memory;
      const composed = calls.length > before;

      if (text === 'gracias') {
        expect(composed, `turn ${i + 1}: small talk goes through compose`).toBe(true);
        expect(body(r)).toMatch(/^Claro\. ¡Con gusto!/); // composed from the verified draft, facts intact
      } else {
        // Facts are brain-owned: Gemini is never asked, and the answer is the real menu.
        expect(composed, `turn ${i + 1}: "${text}" must not reach Gemini`).toBe(false);
        expect(body(r)).not.toMatch(/^Claro\./);
        const key = text;
        const prev = factReplies.get(key);
        if (prev !== undefined) expect(body(r), `turn ${i + 1}: "${text}" deviates from its first answer`).toBe(prev);
        else factReplies.set(key, body(r));
      }
      // The restaurant we are on never changes under chatter + Gemini traffic.
      expect(m.summary.activeRestaurant?.nombre, `turn ${i + 1}`).toBe('TORO BRAVO');
    }

    expect(calls.length).toBe(LOAD_SCRIPT.filter((t) => t === 'gracias').length);
    for (const [i, c] of calls.entries()) {
      expect(c.temperature, `call ${i + 1} temperature`).toBe(COMPOSE_TEMPERATURE);
      expect(c.temperature).toBe(0.3);
      expect(c.topP, `call ${i + 1} topP`).toBe(0.9);
      expect(c.historyLines, `call ${i + 1} history`).toBeLessThanOrEqual(WA_MASTER_TURN_CAP);
      expect(c.model).toBeTruthy();
      expect(c.system).toMatch(/SOLO los hechos del borrador/);
    }
    // Once the window is full: memory holds 40 turns INCLUDING the current user message, which compose passes
    // separately (MENSAJE ACTUAL) — so the prompt carries exactly 39 prior turns + the current one = 40.
    expect(calls.at(-1)!.historyLines).toBe(PRIOR_TURNS_AT_CAP);
    expect(calls[0].historyLines).toBeLessThan(WA_MASTER_TURN_CAP);
    // History grows monotonically up to the cap.
    const hist = calls.map((c) => c.historyLines);
    expect(hist).toEqual([...hist].sort((a, b) => a - b));

    // After all that traffic the price answer is still the real one.
    const last = await say('Dime las tres hamburguesas más económicas', m, { nowMs: base + 2000 + LOAD_SCRIPT.length * 20_000, useGemini: true });
    for (const line of CHEAPEST3_LINES) expect(body(last)).toContain(line);
  });

  it('a model that invents data cannot change what the user reads: the verified draft wins (hallucination guard)', async () => {
    const { calls } = installGeminiMock('hallucinate');
    const base = Date.UTC(2026, 10, 27, 12, 0, 0);
    let m = await openConversation(base);
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await say('gracias', m, { nowMs: base + 5000 + i * 20_000, useGemini: true });
      m = r.memory;
      seen.push(body(r));
    }
    expect(calls).toHaveLength(8);
    for (const [i, reply] of seen.entries()) {
      expect(reply, `reply ${i + 1} must be exactly the verified draft the model was given`).toBe(calls[i].draft);
      expect(reply).not.toMatch(/9\.999|evil\.example|Fantasma/);
    }
    expect(new Set(seen).size).toBe(1); // identical input → identical output
    expect(m.summary.activeRestaurant?.nombre).toBe('TORO BRAVO');
  });

  it('identical turn, 10 times, with the model rephrasing: identical final text every time', async () => {
    installGeminiMock('rephrase');
    const base = Date.UTC(2026, 10, 27, 12, 0, 0);
    const outs: string[] = [];
    for (let i = 0; i < 10; i++) {
      const m = await openConversation(base);
      const r = await say('gracias', m, { nowMs: base + 5000, useGemini: true });
      outs.push(body(r));
    }
    expect(outs[0]).toBe('Claro. ¡Con gusto! Si necesitas algo más, aquí estoy. 🙌');
    outs.forEach((o, i) => expect(o, `repetition ${i + 1}`).toBe(outs[0]));
  });

  it('TTL 45 min: at +44 min the restaurant answers; at +46 min it has expired — while the 40-turn history is NOT lost', async () => {
    const { calls } = installGeminiMock('verbatim');
    const base = Date.UTC(2026, 10, 27, 12, 0, 0);
    const MIN = 60_000;
    let m = await openConversation(base);
    // Fill the history window well past 40 turns with brain-owned questions (each refreshes the stamp).
    let t = base + 2000;
    for (let i = 0; i < 24; i++) {
      t += 20_000;
      m = (await say(i % 2 ? '¿Cuánto cuesta la VILLA?' : 'Dime las tres hamburguesas más económicas', m, { nowMs: t, useGemini: true })).memory;
    }
    expect(m.turns.length).toBe(WA_MASTER_TURN_CAP);
    const stamp = m.summary.activeAtMs as number;
    expect(stamp).toBeGreaterThan(base);

    // +44 min: still the same conversation.
    const inside = await say('Dime las tres hamburguesas más económicas', m, { nowMs: stamp + 44 * MIN, useGemini: true });
    for (const line of CHEAPEST3_LINES) expect(body(inside)).toContain(line);
    expect(inside.memory.summary.activeRestaurant?.nombre).toBe('TORO BRAVO');

    // +46 min from the SAME stamp: expired — no answer from TORO BRAVO's menu (never a stale price).
    const outside = await say('Dime las tres hamburguesas más económicas', m, { nowMs: stamp + 46 * MIN, useGemini: true });
    for (const line of CHEAPEST3_LINES) expect(body(outside)).not.toContain(line);

    // History is a different clock: at +46 min a composed turn still receives the full 40-turn window at 0.3.
    calls.length = 0;
    await say('gracias', m, { nowMs: stamp + 46 * MIN, useGemini: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].historyLines).toBe(PRIOR_TURNS_AT_CAP);
    expect(calls[0].temperature).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------------------------
// Deviations detected by the simulation. `it.fails` PASSES while the defect exists and turns RED the
// day it is fixed (then flip to `it`). They document real behaviour, they do not endorse it.
// ---------------------------------------------------------------------------------------------
describe('known deviations found by the Gemini simulation (open defects)', () => {
  const base = Date.UTC(2026, 10, 27, 12, 0, 0);

  it.fails('D1: "¿Qué bebidas tiene?" on the active restaurant must answer from ITS menu (today: zone-wide search says nobody has bebidas)', async () => {
    const m = await openConversation(base);
    const r = await say('¿Qué bebidas tiene?', m, { nowMs: base + 5000 });
    expect(body(r)).not.toMatch(/no veo a ningún restaurante/);
    expect(body(r)).toMatch(/BEBIDAS|bebida/i);
    expect(body(r)).toMatch(/TORO BRAVO/);
  });

  it.fails('D2: "Dime las papas" on the active restaurant must answer from its menu (today: generic "no te entendí")', async () => {
    const m = await openConversation(base);
    const r = await say('Dime las papas', m, { nowMs: base + 5000 });
    expect(body(r)).not.toMatch(/no te entendí/);
    expect(body(r)).toMatch(/PAPAS/i);
  });
});