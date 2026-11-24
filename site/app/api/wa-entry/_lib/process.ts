import { isAllowlisted, type WaEntryConfig } from './config';
import {
  normalizeWaInboundPayload,
  type WaNormalizedEvent,
  type WaOutboundRecord,
  type WaRouteResult,
  type WaThreadState,
} from './contract';
import { routeWaEntryEvent } from './router';
import type { WaEntrySender } from './sender';
import type { WaEntryAsyncStore } from './store-async';
import { asAsyncStore } from './store-async';
import type { WaEntryStore } from './store';
import {
  createMemoryWaMasterStore,
  loadOrCreateMemory,
  loadWaMasterConfig,
  resolveWaMasterIdentity,
  runWaMasterOrchestrator,
  type WaMasterAuthGate,
  type WaMasterIdentityCatalogRow,
  type WaMasterMemoryStore,
  type WaMasterOrchestratorDeps,
  type WaMasterQuotaStore,
} from '../../wa-master/_lib';
import type { WaMasterDiscoveryCtx, WaMasterDiscoveryExecute } from '../../wa-master/_lib/discovery-bridge';
import type { AdminMenuLoader } from '../../wa-master/_lib/specialists/admin';

export type WaEntryProcessResult = {
  accepted: boolean;
  action: 'replied' | 'ignored' | 'rejected' | 'error';
  reason: string;
  eventId?: string;
  chatId?: string;
  state?: WaThreadState;
  replies: Array<{ text: string; outboundId: string }>;
  metrics: {
    receivedAtMs: number;
    repliedAtMs: number | null;
    storeOps: number;
  };
};

export type ProcessWaEntryParams = {
  config: WaEntryConfig;
  store: WaEntryStore | WaEntryAsyncStore;
  sender: WaEntrySender;
  rawBody: string;
  /** Pre-parsed JSON (tests). If omitted, rawBody is parsed. */
  payload?: unknown;
  nowMs?: number;
  forceSendFail?: boolean;
  /** Optional Master Assistant identity catalog (tests / future service-role snapshot). */
  masterIdentityCatalog?: WaMasterIdentityCatalogRow[];
  masterMemoryStore?: WaMasterMemoryStore;
  masterAuthGate?: WaMasterAuthGate;
  masterQuota?: WaMasterQuotaStore;
  masterDiscoveryCtx?: WaMasterDiscoveryCtx;
  masterDiscoveryExecute?: WaMasterDiscoveryExecute;
  masterLoadMenu?: AdminMenuLoader;
  masterOrchestratorDeps?: WaMasterOrchestratorDeps;
};

function safeParseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}

function resolveAsyncStore(store: WaEntryStore | WaEntryAsyncStore): WaEntryAsyncStore {
  // Sync memory/file stores expose hasSeenMessage; Preview async store does not.
  if ('hasSeenMessage' in store) {
    return asAsyncStore(store as WaEntryStore);
  }
  return store as WaEntryAsyncStore;
}

/**
 * Full inbound pipeline. Returns quickly with a decision.
 * Sim adapter never touches production WaSender queue / Supabase service_role.
 */
export async function processWaEntryEvent(
  params: ProcessWaEntryParams,
): Promise<WaEntryProcessResult> {
  const nowMs = params.nowMs ?? Date.now();
  const { config, sender } = params;
  const store = resolveAsyncStore(params.store);
  let storeOps = 0;

  // Inbound kill-switch: no claim, no side effects.
  if (!config.inboundEnabled) {
    return {
      accepted: true,
      action: 'ignored',
      reason: 'kill_switch',
      replies: [],
      metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
    };
  }

  let payload: unknown = params.payload;
  if (payload === undefined) {
    const parsed = safeParseJson(params.rawBody);
    if (parsed.ok === false) {
      return {
        accepted: false,
        action: 'rejected',
        reason: parsed.error,
        replies: [],
        metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
      };
    }
    payload = parsed.value;
  }

  const event = normalizeWaInboundPayload(payload);
  if (!event) {
    return {
      accepted: false,
      action: 'rejected',
      reason: 'malformed',
      replies: [],
      metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
    };
  }

  const claimed = await store.tryClaimMessage(event.messageId, event.sessionId);
  storeOps += 1;
  if (!claimed) {
    return {
      accepted: true,
      action: 'ignored',
      reason: 'duplicate',
      eventId: event.messageId,
      chatId: event.fromDigits,
      replies: [],
      metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
    };
  }

  // Bot echo vs human operator (fromMe)
  if (event.fromMe) {
    const isEcho = await store.matchBotEcho({
      toDigits: event.fromDigits,
      text: event.text,
      nowMs,
      windowMs: config.echoWindowMs,
    });
    storeOps += 1;
    if (isEcho) {
      return {
        accepted: true,
        action: 'ignored',
        reason: 'bot_echo',
        eventId: event.messageId,
        chatId: event.fromDigits,
        replies: [],
        metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
      };
    }
  }

  // Passive reception: durable claim + classify without auto-replies.
  if (!config.routerEnabled) {
    if (event.isGroup) {
      return {
        accepted: true,
        action: 'ignored',
        reason: 'group',
        eventId: event.messageId,
        chatId: event.fromDigits,
        replies: [],
        metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
      };
    }
    if (event.isStatus) {
      return {
        accepted: true,
        action: 'ignored',
        reason: 'status',
        eventId: event.messageId,
        chatId: event.fromDigits,
        replies: [],
        metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
      };
    }
    if (event.fromMe) {
      const thread = (await store.getThread(event.fromDigits)) || {
        fromDigits: event.fromDigits,
        state: 'human_handling' as const,
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + config.threadTtlMs,
        humanPausedUntilMs: nowMs + config.humanPauseMs,
        repliesLastHour: [] as number[],
        lastOutboundDedupeKey: null as string | null,
      };
      const paused = {
        ...thread,
        state: 'human_handling' as const,
        humanPausedUntilMs: nowMs + config.humanPauseMs,
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + config.threadTtlMs,
      };
      await store.saveThread(paused);
      storeOps += 2;
      return {
        accepted: true,
        action: 'ignored',
        reason: 'from_me',
        eventId: event.messageId,
        chatId: event.fromDigits,
        state: 'human_handling',
        replies: [],
        metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
      };
    }
    return {
      accepted: true,
      action: 'ignored',
      reason: 'router_off',
      eventId: event.messageId,
      chatId: event.fromDigits,
      replies: [],
      metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
    };
  }

  if (!isAllowlisted(config, event.fromDigits) && !event.fromMe) {
    return {
      accepted: true,
      action: 'ignored',
      reason: 'not_allowlisted',
      eventId: event.messageId,
      chatId: event.fromDigits,
      replies: [],
      metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
    };
  }

  const threadBefore = await store.getThread(event.fromDigits);
  storeOps += 1;

  // Master Assistant (flag OFF by default). Reuses claim/allowlist/human gates above.
  if (config.masterAssistantEnabled) {
    return processMasterAssistantBranch({
      config,
      store,
      sender,
      event,
      threadBefore,
      nowMs,
      storeOps,
      forceSendFail: params.forceSendFail,
      masterIdentityCatalog: params.masterIdentityCatalog,
      masterMemoryStore: params.masterMemoryStore,
      masterAuthGate: params.masterAuthGate,
      masterQuota: params.masterQuota,
      masterDiscoveryCtx: params.masterDiscoveryCtx,
      masterDiscoveryExecute: params.masterDiscoveryExecute,
      masterLoadMenu: params.masterLoadMenu,
      masterOrchestratorDeps: params.masterOrchestratorDeps,
    });
  }

  const { result, thread } = routeWaEntryEvent({
    event,
    thread: threadBefore,
    config,
    nowMs,
    seenMessageIds: new Set<string>(),
  });

  await store.saveThread(thread);
  storeOps += 1;

  if (result.action === 'drop') {
    return {
      accepted: true,
      action: 'ignored',
      reason: result.reason,
      eventId: event.messageId,
      chatId: event.fromDigits,
      state: result.nextState ?? thread.state,
      replies: [],
      metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
    };
  }

  return dispatchReplies({
    sender,
    store,
    event,
    nextState: result.nextState,
    repliesText: result.replies,
    dedupeKey: result.dedupeKey,
    nowMs,
    storeOps,
    forceSendFail: params.forceSendFail,
  });
}

async function processMasterAssistantBranch(params: {
  config: WaEntryConfig;
  store: WaEntryAsyncStore;
  sender: WaEntrySender;
  event: WaNormalizedEvent;
  threadBefore: Awaited<ReturnType<WaEntryAsyncStore['getThread']>>;
  nowMs: number;
  storeOps: number;
  forceSendFail?: boolean;
  masterIdentityCatalog?: WaMasterIdentityCatalogRow[];
  masterMemoryStore?: WaMasterMemoryStore;
  masterAuthGate?: WaMasterAuthGate;
  masterQuota?: WaMasterQuotaStore;
  masterDiscoveryCtx?: WaMasterDiscoveryCtx;
  masterDiscoveryExecute?: WaMasterDiscoveryExecute;
  masterLoadMenu?: AdminMenuLoader;
  masterOrchestratorDeps?: WaMasterOrchestratorDeps;
}): Promise<WaEntryProcessResult> {
  const { config, store, sender, event, nowMs } = params;
  let storeOps = params.storeOps;

  // Preserve human pause semantics from existing thread state.
  if (
    params.threadBefore?.humanPausedUntilMs != null &&
    params.threadBefore.humanPausedUntilMs > nowMs
  ) {
    return {
      accepted: true,
      action: 'ignored',
      reason: 'human_handling',
      eventId: event.messageId,
      chatId: event.fromDigits,
      state: 'human_handling',
      replies: [],
      metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
    };
  }

  if (event.fromMe) {
    const paused = {
      fromDigits: event.fromDigits,
      state: 'human_handling' as const,
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + config.threadTtlMs,
      humanPausedUntilMs: nowMs + config.humanPauseMs,
      repliesLastHour: params.threadBefore?.repliesLastHour ?? [],
      lastOutboundDedupeKey: params.threadBefore?.lastOutboundDedupeKey ?? null,
    };
    await store.saveThread(paused);
    storeOps += 1;
    return {
      accepted: true,
      action: 'ignored',
      reason: 'from_me',
      eventId: event.messageId,
      chatId: event.fromDigits,
      state: 'human_handling',
      replies: [],
      metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
    };
  }

  if (event.isGroup) {
    return {
      accepted: true,
      action: 'ignored',
      reason: 'group',
      eventId: event.messageId,
      chatId: event.fromDigits,
      replies: [],
      metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
    };
  }

  const masterConfig = loadWaMasterConfig({
    PLATFORM_WA_MASTER: config.masterAssistantEnabled ? '1' : '0',
    PLATFORM_WA_MASTER_SHADOW: config.masterAssistantShadow ? '1' : '0',
    PLATFORM_WA_CONSUMER_URL: config.consumerAssistantUrl,
    PLATFORM_WA_BUSINESS_LANDING_URL: config.businessLandingUrl,
    PLATFORM_WA_BUSINESS_REGISTER_URL: config.businessRegisterUrl,
    PLATFORM_WA_BUSINESS_MANAGE_URL: config.businessManageUrl,
  } as unknown as NodeJS.ProcessEnv);

  const memStore = params.masterMemoryStore ?? createMemoryWaMasterStore();
  const memory = await loadOrCreateMemory(
    memStore,
    event.fromDigits,
    nowMs,
    masterConfig.profileTtlMs,
  );
  const identity = resolveWaMasterIdentity({
    fromDigits: event.fromDigits,
    catalog: params.masterIdentityCatalog ?? [],
  });

  const orch = await runWaMasterOrchestrator(
    {
      fromDigits: event.fromDigits,
      text: event.text,
      messageId: event.messageId,
      nowMs,
      identity,
      memory,
      forceDeterministic: false,
    },
    masterConfig,
    {
      ...(params.masterOrchestratorDeps || {}),
      authGate: params.masterAuthGate ?? params.masterOrchestratorDeps?.authGate,
      quota: params.masterQuota ?? params.masterOrchestratorDeps?.quota,
      discoveryCtx: params.masterDiscoveryCtx ?? params.masterOrchestratorDeps?.discoveryCtx,
      executeDiscovery:
        params.masterDiscoveryExecute ?? params.masterOrchestratorDeps?.executeDiscovery,
      loadMenu: params.masterLoadMenu ?? params.masterOrchestratorDeps?.loadMenu,
      forceSimulateAgent: masterConfig.simulateAgent || !masterConfig.allowGemini,
    },
  );

  await memStore.save(event.fromDigits, orch.memory);
  storeOps += 1;

  const nextState: WaThreadState = orch.escalateHuman ? 'human_handling' : 'awaiting_audience';
  await store.saveThread({
    fromDigits: event.fromDigits,
    state: nextState,
    updatedAtMs: nowMs,
    expiresAtMs: nowMs + config.threadTtlMs,
    humanPausedUntilMs: orch.escalateHuman ? nowMs + config.humanPauseMs : null,
    repliesLastHour: params.threadBefore?.repliesLastHour ?? [],
    lastOutboundDedupeKey: orch.dedupeKey,
  });
  storeOps += 1;

  if (config.masterAssistantShadow || masterConfig.shadowMode) {
    return {
      accepted: true,
      action: 'ignored',
      reason: 'master_shadow',
      eventId: event.messageId,
      chatId: event.fromDigits,
      state: nextState,
      replies: [],
      metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
    };
  }

  return dispatchReplies({
    sender,
    store,
    event,
    nextState,
    repliesText: orch.replies,
    dedupeKey: orch.dedupeKey,
    nowMs,
    storeOps,
    forceSendFail: params.forceSendFail,
  });
}

async function dispatchReplies(params: {
  sender: WaEntrySender;
  store: WaEntryAsyncStore;
  event: WaNormalizedEvent;
  nextState: WaThreadState;
  repliesText: string[];
  dedupeKey: string;
  nowMs: number;
  storeOps: number;
  forceSendFail?: boolean;
}): Promise<WaEntryProcessResult> {
  const { sender, store, event, nowMs } = params;
  let storeOps = params.storeOps;

  const locked = await store.tryAcquireSendLock(event.fromDigits, nowMs, 15_000);
  storeOps += 1;
  if (!locked) {
    return {
      accepted: true,
      action: 'ignored',
      reason: 'rate_limited',
      eventId: event.messageId,
      chatId: event.fromDigits,
      state: params.nextState,
      replies: [],
      metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
    };
  }

  const replies: WaEntryProcessResult['replies'] = [];
  try {
    for (const text of params.repliesText) {
      const outbound = await sendWithBoundedRetry({
        sender,
        to: event.fromDigits,
        text,
        eventId: event.messageId,
        dedupeKey: params.dedupeKey,
        forceFail: params.forceSendFail,
      });
      storeOps += 1;
      if (!outbound.ok) {
        return {
          accepted: true,
          action: 'error',
          reason: 'send_failed_after_retry',
          eventId: event.messageId,
          chatId: event.fromDigits,
          state: params.nextState,
          replies,
          metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
        };
      }
      if (!outbound.alreadySent) {
        replies.push({ text, outboundId: outbound.record.id });
      }
    }
  } finally {
    await store.releaseSendLock(event.fromDigits);
    storeOps += 1;
  }

  return {
    accepted: true,
    action: replies.length ? 'replied' : 'ignored',
    reason: 'ok',
    eventId: event.messageId,
    chatId: event.fromDigits,
    state: params.nextState,
    replies,
    metrics: {
      receivedAtMs: nowMs,
      repliedAtMs: replies.length ? Date.now() : null,
      storeOps,
    },
  };
}

async function sendWithBoundedRetry(params: {
  sender: WaEntrySender;
  to: string;
  text: string;
  eventId: string;
  dedupeKey: string;
  forceFail?: boolean;
}): Promise<{ ok: boolean; alreadySent: boolean; record: WaOutboundRecord }> {
  const first = await params.sender.send({
    to: params.to,
    text: params.text,
    eventId: params.eventId,
    dedupeKey: params.dedupeKey,
    forceFail: params.forceFail,
  });
  if (first.ok) return first;

  const retry = await params.sender.send({
    to: params.to,
    text: params.text,
    eventId: params.eventId,
    dedupeKey: `${params.dedupeKey}:retry1`,
    forceFail: false,
  });
  return retry;
}

export type { WaNormalizedEvent, WaRouteResult };
