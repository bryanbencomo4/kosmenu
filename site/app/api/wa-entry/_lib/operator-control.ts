/**
 * Platform WA operator control — fail-closed, no prod migration required.
 * Persists conversation control on wa_entry_threads (+ optional in-memory overlay).
 * Global bot mute uses a reserved thread key (orders/notifications untouched).
 */

import type { WaEntryAsyncStore } from './store-async';
import type { WaThreadRecord, WaThreadState } from './contract';

export const WA_BOT_GLOBAL_MUTE_KEY = '__wa_bot_global__';
/** Indefinite hold until explicit return (year 2099). */
export const WA_HUMAN_INDEFINITE_MS = 4_102_444_800_000;

export type WaControlMode = 'ai_active' | 'human_handling' | 'paused' | 'closed';

export type WaConversationControl = {
  fromDigits: string;
  mode: WaControlMode;
  aiActive: boolean;
  humanHandling: boolean;
  pausedUntilMs: number | null;
  closed: boolean;
  attentionVersion: number;
  controllerId: string | null;
  changedAtMs: number;
};

export type WaGlobalBotMute = {
  muted: boolean;
  controllerId: string | null;
  changedAtMs: number;
  reason: string | null;
};

type AttentionOverlay = {
  version: number;
  controllerId: string | null;
  changedAtMs: number;
};

const attentionByChat = new Map<string, AttentionOverlay>();
let globalMuteMemory: WaGlobalBotMute = {
  muted: false,
  controllerId: null,
  changedAtMs: 0,
  reason: null,
};

function envBotMute(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.PLATFORM_WA_BOT_MUTE || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function isOperatorControlEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.PLATFORM_WA_OPERATOR_CONTROL || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function parseAttentionVersion(dedupeKey: string | null | undefined): number {
  const m = String(dedupeKey || '').match(/^__av:(\d+)(?:\||$)/);
  return m ? Number(m[1]) || 0 : 0;
}

export function stampAttentionVersion(version: number, dedupeKey: string | null): string {
  const base = dedupeKey && !dedupeKey.startsWith('__av:') ? dedupeKey : 'ctrl';
  return `__av:${Math.max(0, version)}|${base}`;
}

function modeFromThread(thread: WaThreadRecord | null, nowMs: number): WaControlMode {
  if (!thread) return 'ai_active';
  if (thread.state === 'closed') return 'closed';
  if (
    thread.state === 'human_handling' &&
    thread.humanPausedUntilMs != null &&
    thread.humanPausedUntilMs >= WA_HUMAN_INDEFINITE_MS - 1_000
  ) {
    return 'human_handling';
  }
  if (thread.humanPausedUntilMs != null && thread.humanPausedUntilMs > nowMs) {
    return thread.state === 'human_handling' ? 'human_handling' : 'paused';
  }
  return 'ai_active';
}

export function describeConversationControl(
  fromDigits: string,
  thread: WaThreadRecord | null,
  nowMs: number,
): WaConversationControl {
  const overlay = attentionByChat.get(fromDigits);
  const persistedVersion = parseAttentionVersion(thread?.lastOutboundDedupeKey);
  // Durable thread wins across instances; memory overlay only if newer on this instance.
  const attentionVersion = Math.max(persistedVersion, overlay?.version ?? 0);
  const mode = modeFromThread(thread, nowMs);
  const pausedUntil =
    thread?.humanPausedUntilMs != null && thread.humanPausedUntilMs > nowMs
      ? thread.humanPausedUntilMs
      : null;
  return {
    fromDigits,
    mode,
    aiActive: mode === 'ai_active',
    humanHandling: mode === 'human_handling' || mode === 'paused',
    pausedUntilMs: pausedUntil,
    closed: mode === 'closed',
    attentionVersion,
    controllerId: overlay?.controllerId ?? null,
    changedAtMs: Math.max(overlay?.changedAtMs ?? 0, thread?.updatedAtMs ?? 0),
  };
}

export function bumpAttention(
  fromDigits: string,
  controllerId: string | null,
  nowMs: number,
  currentVersion: number,
): number {
  const next = currentVersion + 1;
  attentionByChat.set(fromDigits, {
    version: next,
    controllerId,
    changedAtMs: nowMs,
  });
  return next;
}

export async function readGlobalBotMute(
  store: WaEntryAsyncStore,
  nowMs: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WaGlobalBotMute & { effective: boolean; source: 'env' | 'store' | 'memory' | 'off' }> {
  if (envBotMute(env)) {
    return {
      muted: true,
      effective: true,
      source: 'env',
      controllerId: 'env:PLATFORM_WA_BOT_MUTE',
      changedAtMs: nowMs,
      reason: 'PLATFORM_WA_BOT_MUTE',
    };
  }
  if (globalMuteMemory.muted) {
    return { ...globalMuteMemory, effective: true, source: 'memory' };
  }
  const row = await store.getThread(WA_BOT_GLOBAL_MUTE_KEY);
  if (row?.state === 'closed') {
    return {
      muted: true,
      effective: true,
      source: 'store',
      controllerId: null,
      changedAtMs: row.updatedAtMs,
      reason: 'store_global_mute',
    };
  }
  return {
    muted: false,
    effective: false,
    source: 'off',
    controllerId: null,
    changedAtMs: 0,
    reason: null,
  };
}

export async function setGlobalBotMute(params: {
  store: WaEntryAsyncStore;
  muted: boolean;
  controllerId: string;
  nowMs: number;
  reason?: string;
  threadTtlMs?: number;
}): Promise<WaGlobalBotMute> {
  const { store, muted, controllerId, nowMs } = params;
  globalMuteMemory = {
    muted,
    controllerId,
    changedAtMs: nowMs,
    reason: params.reason || (muted ? 'operator_pause_all' : 'operator_resume_all'),
  };
  const ttl = params.threadTtlMs ?? 1000 * 60 * 60 * 24 * 365;
  await store.saveThread({
    fromDigits: WA_BOT_GLOBAL_MUTE_KEY,
    state: muted ? 'closed' : 'awaiting_audience',
    updatedAtMs: nowMs,
    expiresAtMs: nowMs + ttl,
    humanPausedUntilMs: muted ? WA_HUMAN_INDEFINITE_MS : null,
    repliesLastHour: [],
    lastOutboundDedupeKey: stampAttentionVersion(muted ? 1 : 0, 'global'),
  });
  return { ...globalMuteMemory };
}

export async function takeConversation(params: {
  store: WaEntryAsyncStore;
  fromDigits: string;
  controllerId: string;
  nowMs: number;
  threadTtlMs?: number;
  mode?: 'human_handling' | 'closed';
}): Promise<WaConversationControl> {
  const { store, fromDigits, controllerId, nowMs } = params;
  const prev = await store.getThread(fromDigits);
  const current = describeConversationControl(fromDigits, prev, nowMs);
  const version = bumpAttention(fromDigits, controllerId, nowMs, current.attentionVersion);
  const state: WaThreadState = params.mode === 'closed' ? 'closed' : 'human_handling';
  const thread: WaThreadRecord = {
    fromDigits,
    state,
    updatedAtMs: nowMs,
    expiresAtMs: nowMs + (params.threadTtlMs ?? 1000 * 60 * 60 * 24 * 30),
    humanPausedUntilMs: WA_HUMAN_INDEFINITE_MS,
    repliesLastHour: prev?.repliesLastHour ?? [],
    lastOutboundDedupeKey: stampAttentionVersion(version, prev?.lastOutboundDedupeKey || 'take'),
  };
  await store.saveThread(thread);
  return describeConversationControl(fromDigits, thread, nowMs);
}

export async function returnConversationToAssistant(params: {
  store: WaEntryAsyncStore;
  fromDigits: string;
  controllerId: string;
  nowMs: number;
  threadTtlMs?: number;
}): Promise<WaConversationControl> {
  const { store, fromDigits, controllerId, nowMs } = params;
  const prev = await store.getThread(fromDigits);
  const current = describeConversationControl(fromDigits, prev, nowMs);
  const version = bumpAttention(fromDigits, controllerId, nowMs, current.attentionVersion);
  const thread: WaThreadRecord = {
    fromDigits,
    state: 'awaiting_audience',
    updatedAtMs: nowMs,
    expiresAtMs: nowMs + (params.threadTtlMs ?? 1000 * 60 * 60 * 24 * 30),
    humanPausedUntilMs: null,
    repliesLastHour: prev?.repliesLastHour ?? [],
    lastOutboundDedupeKey: stampAttentionVersion(version, prev?.lastOutboundDedupeKey || 'return'),
  };
  await store.saveThread(thread);
  return describeConversationControl(fromDigits, thread, nowMs);
}

export async function pauseConversationTimed(params: {
  store: WaEntryAsyncStore;
  fromDigits: string;
  controllerId: string;
  nowMs: number;
  pauseMs: number;
  threadTtlMs?: number;
}): Promise<WaConversationControl> {
  const { store, fromDigits, controllerId, nowMs, pauseMs } = params;
  const prev = await store.getThread(fromDigits);
  const current = describeConversationControl(fromDigits, prev, nowMs);
  const version = bumpAttention(fromDigits, controllerId, nowMs, current.attentionVersion);
  const thread: WaThreadRecord = {
    fromDigits,
    state: 'human_handling',
    updatedAtMs: nowMs,
    expiresAtMs: nowMs + (params.threadTtlMs ?? 1000 * 60 * 60 * 24 * 30),
    humanPausedUntilMs: nowMs + Math.max(1_000, pauseMs),
    repliesLastHour: prev?.repliesLastHour ?? [],
    lastOutboundDedupeKey: stampAttentionVersion(version, prev?.lastOutboundDedupeKey || 'pause'),
  };
  await store.saveThread(thread);
  return describeConversationControl(fromDigits, thread, nowMs);
}

/** True when bot replies must not be sent for this chat. */
export function shouldSuppressBotReply(
  control: WaConversationControl,
  globalMute: { effective: boolean },
  nowMs: number,
): { suppress: boolean; reason: 'global_mute' | 'human_handling' | 'closed' | 'paused' | null } {
  if (globalMute.effective) return { suppress: true, reason: 'global_mute' };
  if (control.closed) return { suppress: true, reason: 'closed' };
  if (control.mode === 'human_handling') return { suppress: true, reason: 'human_handling' };
  if (control.pausedUntilMs != null && control.pausedUntilMs > nowMs) {
    return { suppress: true, reason: 'paused' };
  }
  return { suppress: false, reason: null };
}

/** Race check after LLM — drop if attention version moved or mute engaged. */
export async function shouldDiscardInFlightBotReply(params: {
  store: WaEntryAsyncStore;
  fromDigits: string;
  expectedAttentionVersion: number;
  nowMs: number;
  env?: NodeJS.ProcessEnv;
}): Promise<{ discard: boolean; reason: string | null; control: WaConversationControl }> {
  const global = await readGlobalBotMute(params.store, params.nowMs, params.env);
  const thread = await params.store.getThread(params.fromDigits);
  const control = describeConversationControl(params.fromDigits, thread, params.nowMs);
  if (global.effective) {
    return { discard: true, reason: 'global_mute', control };
  }
  if (control.attentionVersion !== params.expectedAttentionVersion) {
    return { discard: true, reason: 'attention_version_changed', control };
  }
  const gate = shouldSuppressBotReply(control, global, params.nowMs);
  if (gate.suppress) {
    return { discard: true, reason: gate.reason, control };
  }
  return { discard: false, reason: null, control };
}

/** Test helper */
export function resetOperatorControlMemoryForTests() {
  attentionByChat.clear();
  globalMuteMemory = { muted: false, controllerId: null, changedAtMs: 0, reason: null };
}
