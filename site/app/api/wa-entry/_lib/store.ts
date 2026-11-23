import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { WaOutboundRecord, WaThreadRecord } from './contract';

export type WaEntryStoreSnapshot = {
  threads: Record<string, WaThreadRecord>;
  seenMessageIds: string[];
  outbound: WaOutboundRecord[];
};

export interface WaEntryStore {
  getThread(fromDigits: string): WaThreadRecord | null;
  saveThread(thread: WaThreadRecord): void;
  hasSeenMessage(messageId: string): boolean;
  markSeenMessage(messageId: string): void;
  /** Atomic claim: returns true only the first time this messageId is seen. */
  tryClaimMessage(messageId: string): boolean;
  appendOutbound(record: WaOutboundRecord): void;
  listOutbound(): WaOutboundRecord[];
  snapshot(): WaEntryStoreSnapshot;
  clear(): void;
}

function emptySnapshot(): WaEntryStoreSnapshot {
  return { threads: {}, seenMessageIds: [], outbound: [] };
}

/** In-memory store for unit tests. */
export function createMemoryWaEntryStore(
  initial?: Partial<WaEntryStoreSnapshot>,
): WaEntryStore {
  const state: WaEntryStoreSnapshot = {
    threads: { ...(initial?.threads || {}) },
    seenMessageIds: [...(initial?.seenMessageIds || [])],
    outbound: [...(initial?.outbound || [])],
  };
  const seen = new Set(state.seenMessageIds);

  return {
    getThread(fromDigits) {
      return state.threads[fromDigits] ? { ...state.threads[fromDigits] } : null;
    },
    saveThread(thread) {
      state.threads[thread.fromDigits] = { ...thread };
    },
    hasSeenMessage(messageId) {
      return seen.has(messageId);
    },
    markSeenMessage(messageId) {
      if (seen.has(messageId)) return;
      seen.add(messageId);
      state.seenMessageIds.push(messageId);
      trimSeen(state, seen);
    },
    tryClaimMessage(messageId) {
      if (seen.has(messageId)) return false;
      seen.add(messageId);
      state.seenMessageIds.push(messageId);
      trimSeen(state, seen);
      return true;
    },
    appendOutbound(record) {
      state.outbound.push(record);
    },
    listOutbound() {
      return [...state.outbound];
    },
    snapshot() {
      return {
        threads: { ...state.threads },
        seenMessageIds: [...state.seenMessageIds],
        outbound: [...state.outbound],
      };
    },
    clear() {
      state.threads = {};
      state.seenMessageIds = [];
      state.outbound = [];
      seen.clear();
    },
  };
}

function trimSeen(state: WaEntryStoreSnapshot, seen: Set<string>) {
  if (state.seenMessageIds.length <= 5000) return;
  const drop = state.seenMessageIds.splice(0, state.seenMessageIds.length - 4000);
  for (const id of drop) seen.delete(id);
}

/**
 * Atomic JSON file store for local simulator (survives process restart).
 * Never points at Supabase.
 */
export function createFileWaEntryStore(dataDir: string): WaEntryStore {
  const dir = path.resolve(dataDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'state.json');

  const load = (): WaEntryStoreSnapshot => {
    if (!existsSync(filePath)) return emptySnapshot();
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as WaEntryStoreSnapshot;
      return {
        threads: parsed.threads || {},
        seenMessageIds: parsed.seenMessageIds || [],
        outbound: parsed.outbound || [],
      };
    } catch {
      return emptySnapshot();
    }
  };

  let state = load();
  const seen = new Set(state.seenMessageIds);

  const persist = () => {
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    renameSync(tmp, filePath);
  };

  return {
    getThread(fromDigits) {
      return state.threads[fromDigits] ? { ...state.threads[fromDigits] } : null;
    },
    saveThread(thread) {
      state.threads[thread.fromDigits] = { ...thread };
      persist();
    },
    hasSeenMessage(messageId) {
      return seen.has(messageId);
    },
    markSeenMessage(messageId) {
      if (seen.has(messageId)) return;
      seen.add(messageId);
      state.seenMessageIds.push(messageId);
      trimSeen(state, seen);
      persist();
    },
    tryClaimMessage(messageId) {
      if (seen.has(messageId)) return false;
      seen.add(messageId);
      state.seenMessageIds.push(messageId);
      trimSeen(state, seen);
      persist();
      return true;
    },
    appendOutbound(record) {
      state.outbound.push(record);
      persist();
    },
    listOutbound() {
      return [...state.outbound];
    },
    snapshot() {
      return {
        threads: { ...state.threads },
        seenMessageIds: [...state.seenMessageIds],
        outbound: [...state.outbound],
      };
    },
    clear() {
      state = emptySnapshot();
      seen.clear();
      persist();
    },
  };
}

export function hashDedupeKey(parts: string[]): string {
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32);
}
