import { createEmptyMemory } from './memory';
import type { WaMasterMemory } from './types';

export interface WaMasterMemoryStore {
  get(fromDigits: string): Promise<WaMasterMemory | null>;
  save(fromDigits: string, memory: WaMasterMemory): Promise<void>;
  delete(fromDigits: string): Promise<void>;
}

/** In-process store for sim/tests — never touches production. */
export function createMemoryWaMasterStore(seed?: Map<string, WaMasterMemory>): WaMasterMemoryStore {
  const map = seed ? new Map(seed) : new Map<string, WaMasterMemory>();
  return {
    async get(fromDigits) {
      return map.get(fromDigits) ?? null;
    },
    async save(fromDigits, memory) {
      map.set(fromDigits, memory);
    },
    async delete(fromDigits) {
      map.delete(fromDigits);
    },
  };
}

export async function loadOrCreateMemory(
  store: WaMasterMemoryStore,
  fromDigits: string,
  nowMs: number,
  profileTtlMs: number,
): Promise<WaMasterMemory> {
  const existing = await store.get(fromDigits);
  if (existing) return existing;
  return createEmptyMemory(fromDigits, nowMs, profileTtlMs);
}

/** A database failure (as opposed to "no such session"). Never confuse the two. */
export class WaMasterMemoryStoreError extends Error {
  readonly op: string;
  constructor(op: string, message: string) {
    super(`wa_master_memory ${op}: ${message}`);
    this.name = 'WaMasterMemoryStoreError';
    this.op = op;
  }
}

export type SafeMemoryLoad = {
  memory: WaMasterMemory;
  /**
   * True when the stored session could NOT be read. The memory is an empty stand-in so the user still
   * gets an answer, and it must NOT be saved (it would overwrite the real history with a blank one).
   */
  degraded: boolean;
  error?: string;
};

/**
 * Like loadOrCreateMemory but a store failure never throws: the turn continues on a blank stand-in
 * flagged `degraded` so the caller skips the write-back instead of destroying the stored session.
 */
export async function loadMemorySafe(
  store: WaMasterMemoryStore,
  fromDigits: string,
  nowMs: number,
  profileTtlMs: number,
  log: (msg: string, extra?: Record<string, unknown>) => void = defaultMemoryLog,
): Promise<SafeMemoryLoad> {
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const existing = await store.get(fromDigits);
      return { memory: existing ?? createEmptyMemory(fromDigits, nowMs, profileTtlMs), degraded: false };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'memory_read_failed';
    }
  }
  log('memory_read_failed', { error: lastError.slice(0, 160) });
  return {
    memory: createEmptyMemory(fromDigits, nowMs, profileTtlMs),
    degraded: true,
    error: lastError,
  };
}

/**
 * Write-back with a bounded retry. Returns false (and logs) instead of throwing: the user's reply is
 * already decided, a failed write must not turn into a 500 / lost message. `save` is idempotent.
 */
export async function saveMemorySafe(
  store: WaMasterMemoryStore,
  fromDigits: string,
  memory: WaMasterMemory,
  log: (msg: string, extra?: Record<string, unknown>) => void = defaultMemoryLog,
): Promise<boolean> {
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await store.save(fromDigits, memory);
      return true;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'memory_write_failed';
    }
  }
  log('memory_write_failed', { error: lastError.slice(0, 160) });
  return false;
}

function defaultMemoryLog(msg: string, extra?: Record<string, unknown>) {
  console.error(`[wa-master] ${msg}`, extra ?? {});
}