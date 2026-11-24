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
