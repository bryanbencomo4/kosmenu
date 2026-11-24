import { isAllowlisted, isMasterPilotAllowlisted, type WaEntryConfig } from './config';
import { loadWaMasterIdentity } from '../../wa-master/_lib/identity-loader';
import type { WaMasterIdentitySource } from '../../wa-master/_lib/identity-loader';
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
import { isPlatformWaAutoReplyAllowed } from './auto-reply-policy';
import {
  appendInboxMessage,
  upsertInboxConversationOnInbound,
} from './inbox-store';
import {
  describeConversationControl,
  readGlobalBotMute,
  shouldDiscardInFlightBotReply,
  shouldSuppressBotReply,
  stampAttentionVersion,
  takeConversation,
} from './operator-control';
import {
  HUMAN_SUPPORT_FAILURE_REPLY,
  HUMAN_SUPPORT_SUCCESS_REPLY,
  registerHumanSupportRequest,
} from './register-human-support';

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
  masterIdentitySource?: WaMasterIdentitySource | null;
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

  // Bot echo vs human operator (fromMe). Bot echoes never trigger human take.
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
    // Human outbound from official session → take conversation indefinitely.
    await takeConversation({
      store,
      fromDigits: event.fromDigits,
      controllerId: 'wasender:fromMe',
      nowMs,
      threadTtlMs: config.threadTtlMs,
    });
    storeOps += 2;
    try {
      await appendInboxMessage({
        fromDigits: event.fromDigits,
        role: 'operator',
        text: event.text,
        atMs: nowMs,
        clientMessageId: event.messageId,
        operatorId: 'wasender:fromMe',
        operatorLabel: 'WhatsApp Business',
      });
    } catch {
      /* inbox best-effort */
    }
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

  // Always register 1:1 inbound in the platform inbox (even when bot stays silent).
  try {
    await upsertInboxConversationOnInbound({
      fromDigits: event.fromDigits,
      displayName: null,
      text: event.text,
      atMs: nowMs,
    });
    await appendInboxMessage({
      fromDigits: event.fromDigits,
      role: 'contact',
      text: event.text,
      atMs: nowMs,
      clientMessageId: event.messageId,
      waKey: event.waKey || null,
    });
  } catch {
    /* inbox best-effort — never block reception */
  }

  // Passive reception: durable claim + classify without auto-replies.
  if (!config.routerEnabled) {
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

  // Global bot mute (orders / Wasender session stay up).
  {
    const globalMute = await readGlobalBotMute(store, nowMs);
    storeOps += 1;
    if (globalMute.effective) {
      return {
        accepted: true,
        action: 'ignored',
        reason: 'global_bot_mute',
        eventId: event.messageId,
        chatId: event.fromDigits,
        replies: [],
        metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
      };
    }
  }

  // Absolute auto-reply silence outside the single authorized allowlist.
  // Applies to Master, receptionist, classic 1/2, welcome, fallback, Gemini.
  if (!isPlatformWaAutoReplyAllowed(event.fromDigits)) {
    return {
      accepted: true,
      action: 'ignored',
      reason: 'auto_reply_not_allowed',
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

  // Master Assistant pilot gate (fail-closed allowlist). Non-pilot → classic router.
  if (config.masterAssistantEnabled && isMasterPilotAllowlisted(config, event.fromDigits)) {
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
      masterIdentitySource: params.masterIdentitySource,
    });
  }

  const attentionBefore = describeConversationControl(
    event.fromDigits,
    threadBefore,
    nowMs,
  ).attentionVersion;

  const { result, thread } = routeWaEntryEvent({
    event,
    thread: threadBefore,
    config,
    nowMs,
    seenMessageIds: new Set<string>(),
  });

  // Preserve durable attention version across router saves (multi-instance safe).
  const threadToSave = {
    ...thread,
    lastOutboundDedupeKey: stampAttentionVersion(
      attentionBefore,
      result.action === 'reply' ? result.dedupeKey : thread.lastOutboundDedupeKey,
    ),
  };
  await store.saveThread(threadToSave);
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
    expectedAttentionVersion: attentionBefore,
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
  masterIdentitySource?: WaMasterIdentitySource | null;
}): Promise<WaEntryProcessResult> {
  const { config, store, sender, event, nowMs } = params;
  let storeOps = params.storeOps;

  // Human / closed / timed pause — bot stays silent until authorized return.
  {
    const control = describeConversationControl(event.fromDigits, params.threadBefore, nowMs);
    const gate = shouldSuppressBotReply(control, { effective: false }, nowMs);
    if (gate.suppress) {
      return {
        accepted: true,
        action: 'ignored',
        reason: gate.reason || 'human_handling',
        eventId: event.messageId,
        chatId: event.fromDigits,
        state: control.closed ? 'closed' : 'human_handling',
        replies: [],
        metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
      };
    }
  }

  // fromMe already handled upstream; keep defensive no-op.

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

  // Gemini / simulate flags come from process env (Vercel), not WaEntryConfig alone.
  const masterConfig = loadWaMasterConfig({
    ...process.env,
    PLATFORM_WA_MASTER: config.masterAssistantEnabled ? '1' : '0',
    PLATFORM_WA_MASTER_SHADOW: config.masterAssistantShadow ? '1' : '0',
    PLATFORM_WA_CONSUMER_URL: config.consumerAssistantUrl,
    PLATFORM_WA_BUSINESS_LANDING_URL: config.businessLandingUrl,
    PLATFORM_WA_BUSINESS_REGISTER_URL: config.businessRegisterUrl,
    PLATFORM_WA_BUSINESS_MANAGE_URL: config.businessManageUrl,
  } as NodeJS.ProcessEnv);

  const memStore = params.masterMemoryStore ?? createMemoryWaMasterStore();
  const memory = await loadOrCreateMemory(
    memStore,
    event.fromDigits,
    nowMs,
    masterConfig.profileTtlMs,
  );
  const expectedAttentionVersion = describeConversationControl(
    event.fromDigits,
    params.threadBefore,
    nowMs,
  ).attentionVersion;

  // Privacy erase request — wipe L1/L2/L3 for this contact when asked.
  if (/\b(borrar mis datos|eliminar mi informacion|eliminar mis datos)\b/i.test(event.text)) {
    await memStore.delete(event.fromDigits);
  }

  // Production identity: live catalog only (no contract fixtures). Tests may inject catalog.
  const hasLiveIdentity = Boolean(params.masterIdentitySource || params.masterIdentityCatalog?.length);
  const identity =
    params.masterIdentityCatalog && params.masterIdentityCatalog.length
      ? resolveWaMasterIdentity({
          fromDigits: event.fromDigits,
          catalog: params.masterIdentityCatalog,
        })
      : await loadWaMasterIdentity({
          fromDigits: event.fromDigits,
          source: params.masterIdentitySource ?? null,
          includeFixtures: !hasLiveIdentity,
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
      maxMonthlyGeminiRequests: masterConfig.maxMonthlyGeminiRequests,
      forceSimulateAgent:
        params.masterOrchestratorDeps?.forceSimulateAgent ??
        (masterConfig.simulateAgent || !masterConfig.allowGemini),
    },
  );

  await memStore.save(event.fromDigits, orch.memory);
  storeOps += 1;

  // Register support BEFORE claiming success; take after send (attention version).
  const attentionForSend = expectedAttentionVersion;
  let escalateReplies = orch.replies;
  let escalateRegistered = false;
  if (orch.escalateHuman) {
    const registered = await registerHumanSupportRequest({
      fromDigits: event.fromDigits,
      text: event.text,
      context: [
        orch.intents?.join(',') || '',
        orch.specialist || '',
        (orch.replies || []).join('\n'),
      ]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 500),
      nowMs,
    });
    escalateRegistered = registered.ok;
    escalateReplies = [
      registered.ok ? HUMAN_SUPPORT_SUCCESS_REPLY : HUMAN_SUPPORT_FAILURE_REPLY,
    ];
  }
  if (!orch.escalateHuman) {
    await store.saveThread({
      fromDigits: event.fromDigits,
      state: 'awaiting_audience',
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + config.threadTtlMs,
      humanPausedUntilMs: null,
      repliesLastHour: params.threadBefore?.repliesLastHour ?? [],
      lastOutboundDedupeKey: stampAttentionVersion(expectedAttentionVersion, orch.dedupeKey),
    });
    storeOps += 1;
  }

  const nextState: WaThreadState =
    orch.escalateHuman && escalateRegistered ? 'human_handling' : 'awaiting_audience';

  if (config.masterAssistantShadow || masterConfig.shadowMode) {
    if (orch.escalateHuman && escalateRegistered) {
      await takeConversation({
        store,
        fromDigits: event.fromDigits,
        controllerId: 'master:escalate',
        nowMs,
        threadTtlMs: config.threadTtlMs,
      });
      storeOps += 1;
    }
    return {
      accepted: true,
      action: 'ignored',
      reason: 'master_shadow',
      eventId: event.messageId,
      chatId: event.fromDigits,
      state: orch.escalateHuman && escalateRegistered ? 'human_handling' : nextState,
      replies: [],
      metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
    };
  }

  const dispatched = await dispatchReplies({
    sender,
    store,
    event,
    nextState:
      orch.escalateHuman && escalateRegistered ? 'awaiting_audience' : nextState,
    repliesText: escalateReplies,
    dedupeKey: orch.dedupeKey,
    nowMs,
    storeOps,
    forceSendFail: params.forceSendFail,
    expectedAttentionVersion: attentionForSend,
  });
  storeOps = dispatched.metrics.storeOps;

  if (orch.escalateHuman && escalateRegistered) {
    await takeConversation({
      store,
      fromDigits: event.fromDigits,
      controllerId: 'master:escalate',
      nowMs,
      threadTtlMs: config.threadTtlMs,
    });
    storeOps += 1;
    return { ...dispatched, state: 'human_handling', metrics: { ...dispatched.metrics, storeOps } };
  }

  return dispatched;
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
  expectedAttentionVersion?: number;
}): Promise<WaEntryProcessResult> {
  const { sender, store, event, nowMs } = params;
  let storeOps = params.storeOps;

  // Absolute allowlist again (post-Gemini / post-router) — fail-closed.
  if (!isPlatformWaAutoReplyAllowed(event.fromDigits)) {
    return {
      accepted: true,
      action: 'ignored',
      reason: 'auto_reply_not_allowed',
      eventId: event.messageId,
      chatId: event.fromDigits,
      state: params.nextState,
      replies: [],
      metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
    };
  }

  // Race: operator take / global mute while Gemini (or router) prepared a reply.
  {
    const race = await shouldDiscardInFlightBotReply({
      store,
      fromDigits: event.fromDigits,
      expectedAttentionVersion: params.expectedAttentionVersion ?? 0,
      nowMs,
    });
    storeOps += 1;
    if (race.discard) {
      return {
        accepted: true,
        action: 'ignored',
        reason: `discarded_${race.reason || 'takeover'}`,
        eventId: event.messageId,
        chatId: event.fromDigits,
        state: race.control.closed ? 'closed' : 'human_handling',
        replies: [],
        metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
      };
    }
  }

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
    // Re-check immediately before first send (takeover during lock wait).
    const race2 = await shouldDiscardInFlightBotReply({
      store,
      fromDigits: event.fromDigits,
      expectedAttentionVersion: params.expectedAttentionVersion ?? 0,
      nowMs,
    });
    storeOps += 1;
    if (race2.discard) {
      return {
        accepted: true,
        action: 'ignored',
        reason: `discarded_${race2.reason || 'takeover'}`,
        eventId: event.messageId,
        chatId: event.fromDigits,
        state: race2.control.closed ? 'closed' : 'human_handling',
        replies: [],
        metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
      };
    }

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
        try {
          await appendInboxMessage({
            fromDigits: event.fromDigits,
            role: 'assistant',
            text,
            atMs: Date.now(),
            outboundId: outbound.record.id,
          });
        } catch {
          /* inbox best-effort */
        }
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
