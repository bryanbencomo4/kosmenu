/**
 * Master → web handoff helpers (receptionist mode).
 */

import {
  buildWaHandoffUrl,
  createMemoryWaHandoffStore,
  type WaHandoffDestination,
  type WaHandoffPayload,
  type WaHandoffStore,
} from '../../_lib/wa-handoff';
import type { WaMasterConfig } from './config';

let memoryFallback: WaHandoffStore | null = null;

export function getDefaultWaHandoffStore(): WaHandoffStore {
  if (!memoryFallback) memoryFallback = createMemoryWaHandoffStore();
  return memoryFallback;
}

export async function issueMasterHandoff(params: {
  store?: WaHandoffStore;
  config: WaMasterConfig;
  destination: WaHandoffDestination;
  payload: WaHandoffPayload;
  fromDigits: string;
  nowMs?: number;
}): Promise<{ url: string; code: string; expiresAtMs: number } | null> {
  if (!params.config.receptionistMode) return null;
  const store = params.store ?? getDefaultWaHandoffStore();
  try {
    const record = await store.issue({
      destination: params.destination,
      payload: params.payload,
      fromDigits: params.fromDigits,
      nowMs: params.nowMs,
    });
    const url = buildWaHandoffUrl({
      destination: params.destination,
      code: record.code,
      consumerBaseUrl: params.config.consumerAssistantUrl,
      businessAssistantBaseUrl: params.config.businessAssistantUrl,
    });
    return { url, code: record.code, expiresAtMs: record.expiresAtMs };
  } catch {
    return null;
  }
}
