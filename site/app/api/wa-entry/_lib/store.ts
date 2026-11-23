import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { hashOutboundText, type WaOutboundRecord, type WaThreadRecord } from './contract';

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
  /**
   * True when a recent bot outbound to this chat matches the text
   * (used to classify fromMe as bot echo vs human operator).
   */
  matchBotEcho(params: {
    toDigits: string;
    text: string;
    nowMs: number;
    windowMs: number;
  }): boolean;
  /** Soft lock for concurrent send attempts (best-effort in memory/file). */
  tryAcquireSendLock(chatDigits: string, nowMs: number, ttlMs: number): boolean;
  releaseSendLock(chatDigits: string): void;
  snapshot(): WaEntryStoreSnapshot;
  clear(): void;
}

function emptySnapshot(): WaEntryStoreSnapshot {
  return { threads: {}, seenMessageIds: [], outbound: [] };
}

function matchEchoInList(
  outbound: WaOutboundRecord[],
  params: { toDigits: string; text: string; nowMs: number; windowMs: number },
): boolean {
  const textHash = hashOutboundText(params.text);
  const cutoff = params.nowMs - params.windowMs;
  return outbound.some(
    (o) =>
      o.origin === 'wa_entry_bot' &&
      o.to === params.toDigits &&
      o.atMs >= cutoff &&
      (o.textHash === textHash || o.text === params.text),
  );
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
  const sendLocks = new Map<string, number>();

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
    matchBotEcho(params) {
      return matchEchoInList(state.outbound, params);
    },
    tryAcquireSendLock(chatDigits, nowMs, ttlMs) {
      const until = sendLocks.get(chatDigits) || 0;
      if (until > nowMs) return false;
      sendLocks.set(chatDigits, nowMs + ttlMs);
      return true;
    },
    releaseSendLock(chatDigits) {
      sendLocks.delete(chatDigits);
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
      sendLocks.clear();
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
  const locksPath = path.join(dir, 'send-locks.json');

  const load = (): WaEntryStoreSnapshot => {
    if (!existsSync(filePath)) return emptySnapshot();
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as WaEntryStoreSnapshot;
      return {
        threads: parsed.threads || {},
        seenMessageIds: parsed.seenMessageIds || [],
        outbound: (parsed.outbound || []).map(normalizeOutbound),
      };
    } catch {
      return emptySnapshot();
    }
  };

  let state = load();
  const seen = new Set(state.seenMessageIds);
  let sendLocks: Record<string, number> = {};
  try {
    if (existsSync(locksPath)) {
      sendLocks = JSON.parse(readFileSync(locksPath, 'utf8')) as Record<string, number>;
    }
  } catch {
    sendLocks = {};
  }

  const persist = () => {
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    renameSync(tmp, filePath);
  };

  const persistLocks = () => {
    const tmp = `${locksPath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(sendLocks), 'utf8');
    renameSync(tmp, locksPath);
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
    matchBotEcho(params) {
      return matchEchoInList(state.outbound, params);
    },
    tryAcquireSendLock(chatDigits, nowMs, ttlMs) {
      const until = sendLocks[chatDigits] || 0;
      if (until > nowMs) return false;
      sendLocks[chatDigits] = nowMs + ttlMs;
      persistLocks();
      return true;
    },
    releaseSendLock(chatDigits) {
      delete sendLocks[chatDigits];
      persistLocks();
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
      sendLocks = {};
      persist();
      persistLocks();
    },
  };
}

function normalizeOutbound(raw: WaOutboundRecord): WaOutboundRecord {
  return {
    ...raw,
    origin: raw.origin || 'wa_entry_bot',
    textHash: raw.textHash || hashOutboundText(raw.text || ''),
  };
}

export function hashDedupeKey(parts: string[]): string {
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32);
}
