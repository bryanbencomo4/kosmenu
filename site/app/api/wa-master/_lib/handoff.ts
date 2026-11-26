/**
 * Master → web handoff helpers (receptionist mode).
 */

import {
  buildWaHandoffUrl,
  WA_HANDOFF_COMMERCE_TTL_MS,
  type WaHandoffDestination,
  type WaHandoffPayload,
  type WaHandoffStore,
} from '../../_lib/wa-handoff';
import { resolveWaHandoffStore } from '../../_lib/wa-handoff-store';
import type { WaMasterConfig } from './config';

export function getDefaultWaHandoffStore(): WaHandoffStore {
  return resolveWaHandoffStore();
}

export async function issueMasterHandoff(params: {
  store?: WaHandoffStore;
  config: WaMasterConfig;
  destination: WaHandoffDestination;
  payload: WaHandoffPayload;
  fromDigits: string;
  nowMs?: number;
}): Promise<{ url: string; code: string; expiresAtMs: number } | null> {
  // Merchant specialist handoffs must work whenever Master is on.
  // Other destinations still require receptionist mode (pilot safety).
  if (
    !params.config.enabled ||
    (!params.config.receptionistMode && params.destination !== 'business_assistant')
  ) {
    return null;
  }
  const store = params.store ?? getDefaultWaHandoffStore();
  try {
    const record = await store.issue({
      destination: params.destination,
      payload: {
        ...params.payload,
        profile:
          params.payload.profile ||
          (params.destination === 'business_assistant'
            ? 'business'
            : params.destination === 'commerce_chatbot'
              ? 'commerce'
              : 'consumer_discovery'),
        source: params.payload.source || 'wa_platform',
      },
      fromDigits: params.fromDigits,
      nowMs: params.nowMs,
      ttlMs:
        params.destination === 'commerce_chatbot'
          ? WA_HANDOFF_COMMERCE_TTL_MS
          : undefined,
    });
    const url = buildWaHandoffUrl({
      destination: params.destination,
      code: record.code,
      consumerBaseUrl: params.config.consumerAssistantUrl,
      businessAssistantBaseUrl: params.config.businessAssistantUrl,
      publicSiteBaseUrl: params.config.publicSiteUrl,
      slug: params.payload.slug,
    });
    return { url, code: record.code, expiresAtMs: record.expiresAtMs };
  } catch {
    return null;
  }
}
