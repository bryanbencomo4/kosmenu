import type { WaOutboundRecord, WaThreadRecord } from './contract';
import type { WaEntryStore } from './store';

/** Unified async store used by the process pipeline (memory/file/Preview). */
export type WaEntryAsyncStore = {
  getThread(fromDigits: string): Promise<WaThreadRecord | null>;
  saveThread(thread: WaThreadRecord): Promise<void>;
  tryClaimMessage(messageId: string, sessionId?: string): Promise<boolean>;
  appendOutbound(record: WaOutboundRecord): Promise<void>;
  listOutbound(limit?: number): Promise<WaOutboundRecord[]>;
  matchBotEcho(params: {
    toDigits: string;
    text: string;
    nowMs: number;
    windowMs: number;
  }): Promise<boolean>;
  tryAcquireSendLock(chatDigits: string, nowMs: number, ttlMs: number): Promise<boolean>;
  releaseSendLock(chatDigits: string): Promise<void>;
  clear?(): Promise<void>;
};

export function asAsyncStore(store: WaEntryStore): WaEntryAsyncStore {
  return {
    async getThread(fromDigits) {
      return store.getThread(fromDigits);
    },
    async saveThread(thread) {
      store.saveThread(thread);
    },
    async tryClaimMessage(messageId) {
      return store.tryClaimMessage(messageId);
    },
    async appendOutbound(record) {
      store.appendOutbound(record);
    },
    async listOutbound(limit = 50) {
      return store.listOutbound().slice(-limit);
    },
    async matchBotEcho(params) {
      return store.matchBotEcho(params);
    },
    async tryAcquireSendLock(chatDigits, nowMs, ttlMs) {
      return store.tryAcquireSendLock(chatDigits, nowMs, ttlMs);
    },
    async releaseSendLock(chatDigits) {
      store.releaseSendLock(chatDigits);
    },
    async clear() {
      store.clear();
    },
  };
}
