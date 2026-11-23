import type { WaEntryConfig } from './config';
import {
  normalizeWaInboundPayload,
  type WaNormalizedEvent,
  type WaOutboundRecord,
  type WaRouteResult,
  type WaThreadState,
} from './contract';
import { routeWaEntryEvent } from './router';
import type { WaEntrySender } from './sender';
import type { WaEntryStore } from './store';

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
  store: WaEntryStore;
  sender: WaEntrySender;
  rawBody: string;
  /** Pre-parsed JSON (tests). If omitted, rawBody is parsed. */
  payload?: unknown;
  nowMs?: number;
  forceSendFail?: boolean;
};

function safeParseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}

/**
 * Full inbound pipeline. Returns quickly with a decision; outbound is simulated locally.
 * Never touches production WaSender queue / Supabase service_role.
 */
export async function processWaEntryEvent(
  params: ProcessWaEntryParams,
): Promise<WaEntryProcessResult> {
  const nowMs = params.nowMs ?? Date.now();
  const { config, store, sender } = params;
  let storeOps = 0;

  if (!config.inboundEnabled || !config.routerEnabled) {
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
    if (!parsed.ok) {
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

  // Atomic dedupe — first claim wins
  const claimed = store.tryClaimMessage(event.messageId);
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

  const threadBefore = store.getThread(event.fromDigits);
  storeOps += 1;

  const seenForRouter = new Set<string>(); // already claimed above; router duplicate check is secondary
  const { result, thread } = routeWaEntryEvent({
    event,
    thread: threadBefore,
    config,
    nowMs,
    seenMessageIds: seenForRouter,
  });

  store.saveThread(thread);
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

  const replies: WaEntryProcessResult['replies'] = [];
  for (const text of result.replies) {
    const outbound = await sendWithBoundedRetry({
      sender,
      to: event.fromDigits,
      text,
      eventId: event.messageId,
      dedupeKey: result.dedupeKey,
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
        state: result.nextState,
        replies,
        metrics: { receivedAtMs: nowMs, repliedAtMs: null, storeOps },
      };
    }
    if (!outbound.alreadySent) {
      replies.push({ text, outboundId: outbound.record.id });
    }
  }

  return {
    accepted: true,
    action: replies.length ? 'replied' : 'ignored',
    reason: 'ok',
    eventId: event.messageId,
    chatId: event.fromDigits,
    state: result.nextState,
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

  // One bounded retry with a distinct key (avoids false "already sent")
  const retry = await params.sender.send({
    to: params.to,
    text: params.text,
    eventId: params.eventId,
    dedupeKey: `${params.dedupeKey}:retry1`,
    forceFail: false,
  });
  return retry;
}

/** Exported for tests that need to assert route shapes. */
export type { WaNormalizedEvent, WaRouteResult };
