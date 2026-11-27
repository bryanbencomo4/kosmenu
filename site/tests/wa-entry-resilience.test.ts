/**
 * Resilience of the WhatsApp entry + Master memory against infrastructure failures.
 *
 * Three fronts (diagnosis "sin respuesta"):
 *  1. Claim of an inbound message is retryable (a failed attempt must not make the provider retry a duplicate).
 *  2. Master memory (Supabase store + wiring) survives database read/write errors without breaking the turn
 *     or overwriting the stored session with a blank one.
 *  3. The send lock can no longer drop a message silently.
 *
 * Everything runs against in-memory stores and a fake Supabase client — no network, no real data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadWaEntryConfig } from '../app/api/wa-entry/_lib/config';
import { processWaEntryEvent } from '../app/api/wa-entry/_lib/process';
import { createSimWaEntrySender, type WaEntrySender } from '../app/api/wa-entry/_lib/sender';
import { createMemoryWaEntryStore, createFileWaEntryStore } from '../app/api/wa-entry/_lib/store';
import { createSupabaseWaEntryStore } from '../app/api/wa-entry/_lib/store-supabase';
import {
  createEmptyMemory,
  createMemoryWaMasterStore,
  createSupabaseWaMasterMemoryStore,
  loadMemorySafe,
  saveMemorySafe,
  WA_MASTER_TURN_CAP,
  WA_MASTER_IDENTITY_FIXTURES,
  WaMasterMemoryStoreError,
  type WaMasterMemoryStore,
} from '../app/api/wa-master/_lib';
import type { WaMasterMemory } from '../app/api/wa-master/_lib/types';

// ---- orchestrator switch (real | throw | two replies) -------------------------------------------
const orch = vi.hoisted(() => ({ mode: 'real' as 'real' | 'throw' | 'two' }));
vi.mock('../app/api/wa-master/_lib/orchestrator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/api/wa-master/_lib/orchestrator')>();
  return {
    ...actual,
    runWaMasterOrchestrator: async (...args: Parameters<typeof actual.runWaMasterOrchestrator>) => {
      if (orch.mode === 'throw') throw new Error('boom: brain exploded');
      const out = await actual.runWaMasterOrchestrator(...args);
      return orch.mode === 'two' ? { ...out, replies: ['primera respuesta', 'segunda respuesta'] } : out;
    },
  };
});

// ---- fake Supabase client ----------------------------------------------------------------------
type Row = Record<string, unknown>;
type Fault = { table: string; op: string; times: number; mode: 'error' | 'throw' };

class FakeDb {
  tables: Record<string, Row[]> = {};
  faults: Fault[] = [];
  seq = 0;
  log: string[] = [];

  fail(table: string, op: string, times = Infinity, mode: Fault['mode'] = 'error') {
    this.faults.push({ table, op, times, mode });
  }
  clearFaults() {
    this.faults = [];
  }
  rows(table: string): Row[] {
    return (this.tables[table] ||= []);
  }
  from(table: string) {
    return new Query(this, table);
  }
}

class Query implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private op: 'select' | 'insert' | 'upsert' | 'delete' = 'select';
  private filters: Array<(r: Row) => boolean> = [];
  private orders: Array<{ col: string; asc: boolean }> = [];
  private lim = Infinity;
  private payload: Row[] = [];
  private after = false;
  private single = false;
  constructor(private db: FakeDb, private table: string) {}

  select() {
    if (this.op === 'insert') this.after = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(row: Row) {
    this.op = 'upsert';
    this.payload = [row];
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  not(col: string, _kind: string, list: string) {
    const ids = new Set(list.replace(/[()]/g, '').split(',').map((s) => s.trim()));
    this.filters.push((r) => !ids.has(String(r[col])));
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.orders.push({ col, asc: o?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private run(): { data: unknown; error: { message: string } | null } {
    const f = this.db.faults.find((x) => x.table === this.table && x.op === this.op && x.times > 0);
    if (f) {
      f.times -= 1;
      this.db.log.push(`${this.table}.${this.op}:FAIL`);
      if (f.mode === 'throw') throw new Error('fetch failed');
      return { data: null, error: { message: `injected ${this.table}.${this.op}` } };
    }
    this.db.log.push(`${this.table}.${this.op}`);
    const rows = this.db.rows(this.table);
    const match = (r: Row) => this.filters.every((fn) => fn(r));
    if (this.op === 'insert') {
      const added = this.payload.map((p) => ({ id: ++this.db.seq, ...p }));
      rows.push(...added);
      return { data: this.after ? added.map((r) => ({ id: r.id })) : null, error: null };
    }
    if (this.op === 'upsert') {
      const p = this.payload[0];
      const i = rows.findIndex((r) => r.from_digits === p.from_digits);
      if (i >= 0) rows[i] = { ...rows[i], ...p };
      else rows.push({ ...p });
      return { data: null, error: null };
    }
    if (this.op === 'delete') {
      this.db.tables[this.table] = rows.filter((r) => !match(r));
      return { data: null, error: null };
    }
    let out = rows.filter(match);
    for (const o of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => {
        const x = Number(a[o.col] ?? 0);
        const y = Number(b[o.col] ?? 0);
        return o.asc ? x - y : y - x;
      });
    }
    out = out.slice(0, this.lim);
    return { data: this.single ? (out[0] ?? null) : out, error: null };
  }

  then<R1, R2>(
    onfulfilled?: ((v: { data: unknown; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    try {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    } catch (e) {
      return Promise.reject(e).then(onfulfilled, onrejected);
    }
  }
}

const FROM = '584140821633';

/** A provider that is down: every attempt (including the bounded retry) fails. */
function failingSender(): WaEntrySender {
  return {
    async send(req) {
      return {
        ok: false,
        alreadySent: false,
        record: { id: 'fail', to: req.to, text: req.text, eventId: req.eventId, dedupeKey: req.dedupeKey, result: 'simulated_fail', atMs: 1, attempt: 1, origin: 'wa_entry_bot', textHash: 'h' } as never,
      };
    },
  };
}
const asClient = (db: FakeDb) => db as never;

function memoryWithTurns(n: number, from = FROM): WaMasterMemory {
  const m = createEmptyMemory(from, 1_000, 86_400_000);
  m.turns = Array.from({ length: n }, (_, i) => ({
    role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
    text: `turno ${i + 1}`,
    atMs: 1_000 + i,
  }));
  m.summary = { ...m.summary, updatedAtMs: 5_000, activeService: 'consumer' };
  return m;
}

// =================================================================================================
// FRENTE 1 — retryable claim
// =================================================================================================
const PILOT = FROM;

function entryConfig() {
  return {
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
}

const discovery = async (name: string) => ({ ok: true, tool: name, restaurants: [], text: 'ok' }) as never;

function payloadFor(text: string, id: string, from = PILOT) {
  return {
    event: 'messages.upsert',
    sessionId: 'ELMENUXFA1',
    data: {
      message: {
        id,
        from: `${from}@s.whatsapp.net`,
        fromMe: false,
        text,
        timestamp: Math.floor(Date.now() / 1000),
      },
    },
  };
}

type Harness = {
  entryStore: ReturnType<typeof createMemoryWaEntryStore>;
  memStore: WaMasterMemoryStore;
  saves: number;
  run: (
    text: string,
    id: string,
    extra?: Partial<Parameters<typeof processWaEntryEvent>[0]>,
  ) => ReturnType<typeof processWaEntryEvent>;
};

function harness(opts?: { memStore?: WaMasterMemoryStore; entryStore?: ReturnType<typeof createMemoryWaEntryStore> }): Harness {
  const entryStore = opts?.entryStore ?? createMemoryWaEntryStore();
  const base = opts?.memStore ?? createMemoryWaMasterStore();
  const state = { saves: 0 };
  const memStore: WaMasterMemoryStore = {
    get: (d) => base.get(d),
    save: async (d, m) => {
      state.saves += 1;
      return base.save(d, m);
    },
    delete: (d) => base.delete(d),
  };
  const h: Harness = {
    entryStore,
    memStore,
    get saves() {
      return state.saves;
    },
    run: (text, id, extra) => {
      const payload = payloadFor(text, id);
      return processWaEntryEvent({
        config: entryConfig(),
        store: entryStore,
        sender: createSimWaEntrySender(entryStore),
        rawBody: JSON.stringify(payload),
        payload,
        masterMemoryStore: memStore,
        masterIdentityCatalog: WA_MASTER_IDENTITY_FIXTURES,
        masterDiscoveryExecute: discovery,
        sendLockWaitsMs: [5, 5],
        ...extra,
      });
    },
  } as Harness;
  return h;
}

beforeEach(() => {
  orch.mode = 'real';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('front 1 — the claim of an inbound message is retryable', () => {
  it('releaseClaim lets exactly the released message be claimed again (memory + file stores)', () => {
    const mem = createMemoryWaEntryStore();
    expect(mem.tryClaimMessage('m1')).toBe(true);
    expect(mem.tryClaimMessage('m1')).toBe(false);
    mem.releaseClaim('m1');
    expect(mem.tryClaimMessage('m1')).toBe(true);
    expect(mem.tryClaimMessage('m1')).toBe(false);
    mem.releaseClaim('never-claimed'); // harmless

    const dir = `${process.cwd()}/.tmp-wa-entry-claim-${process.pid}-${Date.now()}`;
    const file = createFileWaEntryStore(dir);
    expect(file.tryClaimMessage('f1')).toBe(true);
    file.releaseClaim('f1');
    expect(createFileWaEntryStore(dir).tryClaimMessage('f1')).toBe(true); // persisted release
    file.clear();
  });

  it('Supabase store: releaseClaim deletes the claimed row (no schema change) and reports failures', async () => {
    const db = new FakeDb();
    const store = createSupabaseWaEntryStore(asClient(db));
    db.rows('wa_entry_seen_messages').push({ message_id: 'wamid.1' }, { message_id: 'wamid.2' });
    await store.releaseClaim!('wamid.1');
    expect(db.rows('wa_entry_seen_messages')).toEqual([{ message_id: 'wamid.2' }]);
    db.fail('wa_entry_seen_messages', 'delete');
    await expect(store.releaseClaim!('wamid.2')).rejects.toThrow(/releaseClaim/);
  });

  it('send failure → action error AND the retry of the SAME message is processed (not dropped as duplicate)', async () => {
    const h = harness();
    const first = await h.run('Hola, quiero información', 'wamid.retry.1', { sender: failingSender() });
    expect(first.action).toBe('error');

    const retry = await h.run('Hola, quiero información', 'wamid.retry.1');
    expect(retry.action).toBe('replied');
    expect(retry.reason).toBe('ok');
    expect(retry.replies).toHaveLength(1);

    // ...and processing is NOT duplicated once it succeeded: a third delivery is a duplicate.
    const third = await h.run('Hola, quiero información', 'wamid.retry.1');
    expect(third.action).toBe('ignored');
    expect(third.reason).toBe('duplicate');
    expect(h.entryStore.listOutbound().filter((o) => o.result === 'simulated_ok')).toHaveLength(1);
  });

  it('an exception after the claim (store down) rethrows for a 5xx but gives the claim back', async () => {
    const entryStore = createMemoryWaEntryStore();
    let failures = 1;
    const flaky = {
      ...entryStore,
      saveThread: (t: Parameters<typeof entryStore.saveThread>[0]) => {
        if (failures-- > 0) throw new Error('wa_entry saveThread: connection reset');
        entryStore.saveThread(t);
      },
    } as typeof entryStore;
    const h = harness({ entryStore: flaky });

    await expect(h.run('Hola, quiero información', 'wamid.throw.1')).rejects.toThrow(/connection reset/);
    const retry = await h.run('Hola, quiero información', 'wamid.throw.1');
    expect(retry.action).toBe('replied');
  });

  it('concurrent deliveries of one message: exactly one is processed (claim stays atomic)', async () => {
    const h = harness();
    const [a, b] = await Promise.all([
      h.run('Hola, quiero información', 'wamid.same'),
      h.run('Hola, quiero información', 'wamid.same'),
    ]);
    const outcomes = [a, b].map((r) => `${r.action}:${r.reason}`).sort();
    expect(outcomes).toEqual(['ignored:duplicate', 'replied:ok']);
  });

  it('a policy refusal is final: the claim is NOT released (no retry storm)', async () => {
    const entryStore = createMemoryWaEntryStore();
    const refusing: WaEntrySender = {
      async send() {
        throw new Error('wa_entry_refused: real WaSender adapter disabled');
      },
    };
    const payload = payloadFor('Hola, quiero información', 'wamid.refused');
    const base = {
      config: entryConfig(),
      store: entryStore,
      sender: refusing,
      rawBody: JSON.stringify(payload),
      payload,
      masterMemoryStore: createMemoryWaMasterStore(),
      masterIdentityCatalog: WA_MASTER_IDENTITY_FIXTURES,
      masterDiscoveryExecute: discovery,
      sendLockWaitsMs: [5],
    };
    await expect(processWaEntryEvent(base)).rejects.toThrow(/wa_entry_refused/);
    const again = await processWaEntryEvent(base);
    expect(again.reason).toBe('duplicate');
  });
});

// =================================================================================================
// FRENTE 2 — memory protected against database errors
// =================================================================================================
describe('front 2 — Supabase memory store: reads, writes and failures', () => {
  it('a session that does not exist is null; a database error is NOT null', async () => {
    const db = new FakeDb();
    const store = createSupabaseWaMasterMemoryStore(asClient(db));
    expect(await store.get(FROM)).toBeNull();

    await store.save(FROM, memoryWithTurns(6));
    expect((await store.get(FROM))?.turns).toHaveLength(6);

    for (const table of ['wa_master_threads', 'wa_master_profiles', 'wa_master_turns']) {
      db.clearFaults();
      db.fail(table, 'select');
      await expect(store.get(FROM), table).rejects.toBeInstanceOf(WaMasterMemoryStoreError);
    }
    db.clearFaults();
    db.fail('wa_master_threads', 'select', Infinity, 'throw'); // network exception, not {error}
    await expect(store.get(FROM)).rejects.toBeInstanceOf(WaMasterMemoryStoreError);
  });

  it('round trip keeps the NEWEST 40 turns in order, even when stale rows pile up', async () => {
    const db = new FakeDb();
    const store = createSupabaseWaMasterMemoryStore(asClient(db));
    await store.save(FROM, memoryWithTurns(10));
    // Simulate an interleaved/failed prune: 60 extra stale rows (older at_ms) remain in the table.
    for (let i = 0; i < 60; i++) {
      db.rows('wa_master_turns').push({ id: ++db.seq, from_digits: FROM, role: 'user', text: `viejo ${i}`, at_ms: 100 + i });
    }
    const got = await store.get(FROM);
    expect(got!.turns.length).toBeLessThanOrEqual(WA_MASTER_TURN_CAP);
    expect(got!.turns.at(-1)!.text).toBe('turno 10'); // newest survives (old code returned the OLDEST 40)
    const times = got!.turns.map((t) => t.atMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('collapses exact duplicate turns and keeps insertion order for turns sharing a timestamp', async () => {
    const db = new FakeDb();
    const store = createSupabaseWaMasterMemoryStore(asClient(db));
    const m = createEmptyMemory(FROM, 1, 1);
    m.turns = [
      { role: 'user', text: 'hola', atMs: 50 },
      { role: 'assistant', text: 'primero', atMs: 50 },
      { role: 'assistant', text: 'segundo', atMs: 50 },
    ];
    await store.save(FROM, m);
    // duplicate of the whole batch (what an interleaved double write leaves behind)
    for (const t of m.turns) db.rows('wa_master_turns').push({ id: ++db.seq, from_digits: FROM, role: t.role, text: t.text, at_ms: t.atMs });
    const got = await store.get(FROM);
    expect(got!.turns.map((t) => t.text)).toEqual(['hola', 'primero', 'segundo']);
  });

  it('save: a failed insert leaves the previous history untouched (nothing deleted first)', async () => {
    const db = new FakeDb();
    const store = createSupabaseWaMasterMemoryStore(asClient(db));
    await store.save(FROM, memoryWithTurns(5));
    const before = (await store.get(FROM))!;

    db.fail('wa_master_turns', 'insert');
    await expect(store.save(FROM, memoryWithTurns(8))).rejects.toBeInstanceOf(WaMasterMemoryStoreError);
    db.clearFaults();
    const after = (await store.get(FROM))!;
    expect(after.turns).toEqual(before.turns);
    expect(after.summary.updatedAtMs).toBe(before.summary.updatedAtMs);
  });

  it('save: every step reports its error (no more silent success) and a retry converges', async () => {
    for (const [table, op] of [
      ['wa_master_threads', 'upsert'],
      ['wa_master_profiles', 'upsert'],
      ['wa_master_turns', 'delete'],
    ] as const) {
      const db = new FakeDb();
      const store = createSupabaseWaMasterMemoryStore(asClient(db));
      db.fail(table, op, 1);
      const m = memoryWithTurns(12);
      await expect(store.save(FROM, m), `${table}.${op}`).rejects.toBeInstanceOf(WaMasterMemoryStoreError);
      await store.save(FROM, m); // idempotent retry
      const got = (await store.get(FROM))!;
      expect(got.turns.map((t) => t.text)).toEqual(m.turns.map((t) => t.text));
      expect(db.rows('wa_master_turns')).toHaveLength(12); // no leftovers after the converging retry
    }
  });

  it('repeated saves never grow the table beyond the cap', async () => {
    const db = new FakeDb();
    const store = createSupabaseWaMasterMemoryStore(asClient(db));
    const m = memoryWithTurns(60); // more than the cap
    for (let i = 0; i < 5; i++) await store.save(FROM, m);
    expect(db.rows('wa_master_turns')).toHaveLength(WA_MASTER_TURN_CAP);
    const got = (await store.get(FROM))!;
    expect(got.turns).toHaveLength(WA_MASTER_TURN_CAP);
    expect(got.turns.at(-1)!.text).toBe('turno 60');
  });

  it('delete reports failures instead of pretending the erase worked', async () => {
    const db = new FakeDb();
    const store = createSupabaseWaMasterMemoryStore(asClient(db));
    await store.save(FROM, memoryWithTurns(3));
    db.fail('wa_master_threads', 'delete');
    await expect(store.delete(FROM)).rejects.toBeInstanceOf(WaMasterMemoryStoreError);
  });
});

describe('front 2 — loadMemorySafe / saveMemorySafe', () => {
  const quiet = () => {};

  it('a transient read error is retried and the real session is returned', async () => {
    const real = memoryWithTurns(4);
    let calls = 0;
    const store: WaMasterMemoryStore = {
      get: async () => {
        if (calls++ === 0) throw new WaMasterMemoryStoreError('get_thread', 'timeout');
        return real;
      },
      save: async () => {},
      delete: async () => {},
    };
    const r = await loadMemorySafe(store, FROM, 9, 1000, quiet);
    expect(r.degraded).toBe(false);
    expect(r.memory.turns).toHaveLength(4);
  });

  it('a persistent read error yields a blank stand-in flagged degraded — never a throw', async () => {
    const log = vi.fn();
    const store: WaMasterMemoryStore = {
      get: async () => {
        throw new WaMasterMemoryStoreError('get_thread', 'down');
      },
      save: async () => {},
      delete: async () => {},
    };
    const r = await loadMemorySafe(store, FROM, 9, 1000, log);
    expect(r.degraded).toBe(true);
    expect(r.memory.turns).toEqual([]);
    expect(log).toHaveBeenCalledWith('memory_read_failed', expect.anything());
  });

  it('a missing session is a normal new user (not degraded)', async () => {
    const r = await loadMemorySafe(createMemoryWaMasterStore(), FROM, 9, 1000, quiet);
    expect(r.degraded).toBe(false);
  });

  it('write failures are retried once, then reported as false (never thrown)', async () => {
    let n = 0;
    const flaky: WaMasterMemoryStore = {
      get: async () => null,
      save: async () => {
        if (n++ === 0) throw new Error('blip');
      },
      delete: async () => {},
    };
    expect(await saveMemorySafe(flaky, FROM, memoryWithTurns(1), quiet)).toBe(true);

    const dead: WaMasterMemoryStore = {
      get: async () => null,
      save: async () => {
        throw new Error('down');
      },
      delete: async () => {},
    };
    const log = vi.fn();
    expect(await saveMemorySafe(dead, FROM, memoryWithTurns(1), log)).toBe(false);
    expect(log).toHaveBeenCalledWith('memory_write_failed', expect.anything());
  });
});

describe('front 2 — the wa-entry flow with a failing memory database', () => {
  it('read failure: the user still gets an answer and the stored session is NOT overwritten', async () => {
    const db = new FakeDb();
    const supa = createSupabaseWaMasterMemoryStore(asClient(db));
    await supa.save(FROM, memoryWithTurns(10));
    const stored = JSON.stringify(await supa.get(FROM));

    db.fail('wa_master_threads', 'select'); // reads down, writes up
    const h = harness({ memStore: supa });
    const r = await h.run('Hola, quiero información', 'wamid.readfail');
    expect(r.action).toBe('replied');
    expect(r.replies).toHaveLength(1);

    db.clearFaults();
    expect(JSON.stringify(await supa.get(FROM))).toBe(stored); // untouched: no blank overwrite
    expect(db.log.filter((l) => l.startsWith('wa_master_turns.insert'))).toHaveLength(1); // only the seed save
  });

  it('write failure: the reply is still delivered and the turn is not lost as an HTTP error', async () => {
    const db = new FakeDb();
    const supa = createSupabaseWaMasterMemoryStore(asClient(db));
    db.fail('wa_master_turns', 'insert');
    const h = harness({ memStore: supa });
    const r = await h.run('Hola, quiero información', 'wamid.writefail');
    expect(r.action).toBe('replied');
    expect(r.replies).toHaveLength(1);
  });

  it('memory advances only after the reply is out: a failed send does not save, the retry saves once', async () => {
    const h = harness();
    const failed = await h.run('Hola, quiero información', 'wamid.order.1', { sender: failingSender() });
    expect(failed.action).toBe('error');
    expect(h.saves).toBe(0);
    expect(await h.memStore.get(PILOT)).toBeNull();

    const ok = await h.run('Hola, quiero información', 'wamid.order.1');
    expect(ok.action).toBe('replied');
    expect(h.saves).toBe(1);
    const mem = (await h.memStore.get(PILOT))!;
    expect(mem.turns.filter((t) => t.role === 'user' && t.text === 'Hola, quiero información')).toHaveLength(1);
  });

  it('"borrar mis datos" is not undone by writing the turn back', async () => {
    const h = harness();
    await h.run('Hola, quiero información', 'wamid.erase.1');
    expect((await h.memStore.get(PILOT))?.turns.length).toBeGreaterThan(0);
    const before = h.saves;

    await h.run('quiero borrar mis datos', 'wamid.erase.2');
    expect(await h.memStore.get(PILOT)).toBeNull();
    expect(h.saves).toBe(before); // nothing written back
  });

  it('an orchestrator crash answers with a safe fallback (no 500, no lost message, nothing persisted)', async () => {
    const h = harness();
    orch.mode = 'throw';
    const r = await h.run('Hola, quiero información', 'wamid.brain.crash');
    expect(r.action).toBe('replied');
    expect(r.replies[0].text).toMatch(/problema técnico/);
    expect(h.saves).toBe(0);
    // the claim is kept: the user was answered, so the provider retry is a duplicate
    orch.mode = 'real';
    expect((await h.run('Hola, quiero información', 'wamid.brain.crash')).reason).toBe('duplicate');
  });
});

// =================================================================================================
// FRENTE 3 — the lock can no longer drop a message silently
// =================================================================================================
describe('front 3 — send lock', () => {
  it('lock held by someone else for the whole wait: explicit error + claim released + nothing saved; retry succeeds', async () => {
    const h = harness();
    expect(h.entryStore.tryAcquireSendLock(PILOT, Date.now(), 15_000)).toBe(true); // another turn is sending

    const blocked = await h.run('Hola, quiero información', 'wamid.lock.1', { sendLockWaitsMs: [5, 5, 5] });
    expect(blocked.action).toBe('error'); // was: 'ignored' / 'rate_limited' with HTTP 200 → silent loss
    expect(blocked.reason).toBe('send_lock_busy');
    expect(blocked.replies).toEqual([]);
    expect(h.saves).toBe(0);
    expect(console.warn).toHaveBeenCalledWith('[wa-entry] send_lock_busy', expect.anything());

    h.entryStore.releaseSendLock(PILOT);
    const retry = await h.run('Hola, quiero información', 'wamid.lock.1');
    expect(retry.action).toBe('replied'); // the provider retry is processed
    expect(h.saves).toBe(1);
  });

  it('lock freed while waiting: the message is sent without any retry from the provider', async () => {
    const h = harness();
    h.entryStore.tryAcquireSendLock(PILOT, Date.now(), 15_000);
    setTimeout(() => h.entryStore.releaseSendLock(PILOT), 40);
    const r = await h.run('Hola, quiero información', 'wamid.lock.2', { sendLockWaitsMs: [30, 60, 120] });
    expect(r.action).toBe('replied');
    expect(r.replies).toHaveLength(1);
  });

  it('a failing lock release does not mask a successful send', async () => {
    const entryStore = createMemoryWaEntryStore();
    const store = {
      ...entryStore,
      releaseSendLock: () => {
        throw new Error('wa_entry releaseLock: network');
      },
    } as typeof entryStore;
    const h = harness({ entryStore: store });
    const r = await h.run('Hola, quiero información', 'wamid.lock.3');
    expect(r.action).toBe('replied');
  });

  it('every reply of one turn gets its own dedupe key (the queue used to drop replies #2..n)', async () => {
    orch.mode = 'two';
    const keys: string[] = [];
    const sender: WaEntrySender = {
      async send(req) {
        keys.push(req.dedupeKey);
        return {
          ok: true,
          alreadySent: false,
          record: { id: `o${keys.length}`, to: req.to, text: req.text, eventId: req.eventId, dedupeKey: req.dedupeKey, result: 'simulated_ok', atMs: 1, attempt: 1, origin: 'wa_entry_bot', textHash: 'h' } as never,
        };
      },
    };
    const h = harness();
    const r = await h.run('Hola, quiero información', 'wamid.multi', { sender });
    expect(r.replies).toHaveLength(2);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(keys[1]).toBe(`${keys[0]}:r1`);

    // deterministic → a retry of the same turn reuses the same keys (so the queue still dedupes it)
    const h2 = harness();
    const keys2: string[] = [];
    await h2.run('Hola, quiero información', 'wamid.multi', {
      sender: { send: async (req) => ((keys2.push(req.dedupeKey), (await sender.send(req)))) },
    });
    expect(keys2).toEqual(keys.slice(0, 2));
  });
});
