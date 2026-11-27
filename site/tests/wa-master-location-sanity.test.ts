/**
 * Location sanity: "siempre me ubica cerca de Holss, Carrera 5, Palomino".
 *
 * Root cause: after "¿dónde estás?" ANY text (a greeting, a mis-transcribed voice note) went to the
 * geocoder, which invented a place (a "Holss" street in Colombia, 400-600 km from every restaurant),
 * presented it as "cerca de ti" and remembered it for 6 hours.
 *
 * Guards covered here:
 *   1. Greetings / filler are never geocoded.
 *   2. A typed place that is nowhere near any result is NOT presented as "cerca de ti" and NOT remembered.
 *   3. A shared pin stays trusted; a real nearby place still works.
 *   4. "esa no es mi ubicación" forgets the place.
 *   5. The geocoder looks in Venezuela first; Colombia only when the text points there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEmptyMemory,
  loadWaMasterConfig,
  resolveWaMasterIdentity,
  runWaMasterOrchestrator,
  type WaMasterMemory,
} from '../app/api/wa-master/_lib';
import { createMemoryWaHandoffStore } from '../app/api/_lib/wa-handoff';
import { geocodeAddress, looksLikePlaceAnswer } from '../app/api/_lib/geocode';
import { directoryCalls, loadQaDelivery, loadQaMenu, qaDiscovery } from './fixtures/wa-qa-world';

const geocodeCalls: string[] = [];

vi.mock('../app/api/_lib/geocode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/api/_lib/geocode')>();
  const world = await import('./fixtures/wa-qa-world');
  return {
    ...actual,
    geocodeAddress: async (text: string) => {
      geocodeCalls.push(text);
      // The bad geocoder answer from production: a homonymous street in Colombia.
      if (/holss|hola|carrera 5/i.test(text)) {
        return { lat: 11.2437, lng: -73.5663, label: 'Holss, Carrera 5, Palomino' };
      }
      return world.qaGeocode(text);
    },
  };
});

const USER = '584120077744';
const cfg = loadWaMasterConfig({
  PLATFORM_WA_MASTER: '1',
  PLATFORM_WA_MASTER_RECEPTIONIST: '1',
  PLATFORM_WA_MASTER_BRAIN: '1',
} as unknown as NodeJS.ProcessEnv);

async function converse(texts: string[], start?: WaMasterMemory) {
  const identity = resolveWaMasterIdentity({ fromDigits: USER, catalog: [] });
  let m = start ?? createEmptyMemory(USER, Date.now(), 86_400_000);
  const out: Array<Awaited<ReturnType<typeof runWaMasterOrchestrator>> & { text: string }> = [];
  for (const text of texts) {
    const r = await runWaMasterOrchestrator(
      { fromDigits: USER, text, messageId: `m_${Math.random().toString(36).slice(2)}`, nowMs: Date.now(), identity, memory: m },
      cfg,
      {
        executeDiscovery: qaDiscovery,
        loadShopDelivery: loadQaDelivery,
        loadPublicMenu: loadQaMenu,
        handoffStore: createMemoryWaHandoffStore(),
        compose: async () => null,
      },
    );
    m = r.memory;
    out.push({ ...r, text });
  }
  return out;
}

const body = (r: { replies: string[] }) => r.replies.join('\n');

beforeEach(() => {
  directoryCalls.length = 0;
  geocodeCalls.length = 0;
});

describe('greetings and filler are never sent to the geocoder', () => {
  it.each(['Holss', 'Hola', 'hola!', 'ok', 'gracias', 'Buenas'])('«%s» after "¿dónde estás?" is not a place', async (text) => {
    const [, r] = await converse(['restaurantes cerca de mi', text]);
    expect(geocodeCalls, `geocoded: ${geocodeCalls.join('|')}`).not.toContain(text);
    expect(body(r)).not.toMatch(/te ubiqué cerca/);
    expect(body(r)).not.toMatch(/Palomino/);
    expect(r.memory.summary.geo ?? null).toBeNull();
  });
});

describe('a typed place nowhere near any restaurant is not presented as "cerca de ti"', () => {
  it('says it is far, asks for a better location and remembers nothing', async () => {
    const [, r] = await converse(['restaurantes cerca de mi', 'Carrera 5, Palomino']);
    expect(geocodeCalls).toContain('Carrera 5, Palomino');
    expect(body(r)).not.toMatch(/Listo, te ubiqué cerca/);
    expect(body(r)).toMatch(/Tomé \*Holss, Carrera 5, Palomino\* como tu ubicación/);
    expect(body(r)).toMatch(/queda a unos \d+ km/);
    expect(body(r)).toMatch(/ubicación actual|dirección con sector y ciudad/);
    expect(r.memory.summary.geo ?? null).toBeNull();
    // The conversation keeps waiting for a better location.
    expect(r.memory.summary.brainPending).toMatchObject({ kind: 'zone', near: true });
  });

  it('the wrong place is not reused by the next "cerca de mí" search', async () => {
    const [, , r3] = await converse(['restaurantes cerca de mi', 'Carrera 5, Palomino', 'pizza cerca de mi']);
    expect(body(r3)).toMatch(/necesito saber dónde estás/);
    expect(body(r3)).not.toMatch(/Palomino/);
  });

  it('a better answer after the bad one works', async () => {
    const [, , r3] = await converse(['restaurantes cerca de mi', 'Carrera 5, Palomino', 'Los Palos Grandes']);
    expect(body(r3)).toMatch(/Listo, te ubiqué cerca de \*Los Palos Grandes, Caracas\*/);
    expect(r3.memory.summary.geo).toMatchObject({ label: 'Los Palos Grandes, Caracas' });
  });
});

describe('real places and shared pins keep working', () => {
  it('a typed sector in Caracas is located and remembered', async () => {
    const [, r] = await converse(['restaurantes cerca de mi', 'Altamira']);
    expect(body(r)).toMatch(/Listo, te ubiqué cerca de \*Altamira, Caracas\*/);
    expect(r.memory.summary.geo).toMatchObject({ label: 'Altamira, Caracas' });
  });

  it('a shared pin is trusted even when far from every restaurant (no second-guessing)', async () => {
    const [, r] = await converse(['restaurantes cerca de mi', 'ubicación: 11.2437, -73.5663']);
    expect(body(r)).not.toMatch(/Tomé .* como tu ubicación/);
    expect(r.memory.summary.geo).toMatchObject({ lat: 11.2437, lng: -73.5663 });
  });
});

describe('"esa no es mi ubicación" forgets the place', () => {
  it('clears the remembered location and asks again', async () => {
    const [, , r3] = await converse(['restaurantes cerca de mi', 'Altamira', 'esa no es mi ubicación']);
    expect(body(r3)).toMatch(/olvido esa ubicación/);
    expect(r3.memory.summary.geo ?? null).toBeNull();
    expect(r3.memory.summary.brainPending).toMatchObject({ kind: 'zone', near: true });
  });

  it.each(['no estoy ahí', 'me ubicaste mal', 'otra ubicación', 'cambiar mi ubicación'])('«%s»', async (text) => {
    const [, , r3] = await converse(['restaurantes cerca de mi', 'Altamira', text]);
    expect(r3.memory.summary.geo ?? null).toBeNull();
  });
});

describe('looksLikePlaceAnswer (pure)', () => {
  it.each(['Holss', 'Hola', 'hola!!', 'ok', 'gracias', 'buenas tardes', 'jajaja', 'si', 'no', 'dale', 'mmm', 'aaaa', '   ', ''])(
    'rejects «%s»',
    (t) => expect(looksLikePlaceAnswer(t)).toBe(false),
  );
  it.each([
    'Altamira',
    'Los Palos Grandes, Caracas',
    'Carrera 5, Palomino',
    'Av. Bolívar Norte, La Viña, Valencia',
    'frente a la plaza Bolívar',
    'Chacao',
    'calle 10 con avenida 3',
  ])('accepts «%s»', (t) => expect(looksLikePlaceAnswer(t)).toBe(true));
});

describe('geocodeAddress country order (real function, stubbed network)', () => {
  const urls: string[] = [];
  beforeEach(() => {
    urls.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const stub = (hits: Record<string, boolean>) =>
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      const cc = /countrycodes=([^&]+)/.exec(url)?.[1] ?? '';
      return {
        ok: true,
        json: async () => (hits[cc] ? [{ lat: '10.5', lon: '-66.9', display_name: 'Algún lugar, Caracas, Venezuela' }] : []),
      };
    });
  const countries = () => urls.map((u) => /countrycodes=([^&]+)/.exec(u)?.[1]);

  // The mocked module replaces geocodeAddress for the flow tests; load the real one here.
  const real = async () => (await vi.importActual<typeof import('../app/api/_lib/geocode')>('../app/api/_lib/geocode')).geocodeAddress;

  it('looks in Venezuela only for a vague text', async () => {
    stub({ ve: false, co: true });
    const g = await (await real())('Holss Carrera cinco');
    expect(g).toBeNull();
    expect(countries()).toEqual(['ve']);
  });

  it('falls back to Colombia only when the text points there', async () => {
    stub({ ve: false, co: true });
    const g = await (await real())('calle 10, Cúcuta, Colombia');
    expect(g).not.toBeNull();
    expect(countries()).toEqual(['ve', 'co']);
  });

  it('a Venezuelan hit never touches Colombia', async () => {
    stub({ ve: true, co: true });
    const g = await (await real())('Altamira');
    expect(g).not.toBeNull();
    expect(countries()).toEqual(['ve']);
  });

  it('exports are the real ones outside the flow mock', () => {
    expect(typeof geocodeAddress).toBe('function');
  });
});
