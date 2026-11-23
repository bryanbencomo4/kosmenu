import type { WaEntryConfig } from './config';
import type {
  WaNormalizedEvent,
  WaRouteResult,
  WaThreadRecord,
  WaThreadState,
} from './contract';
import {
  alreadyHelpedMessage,
  businessManageMessage,
  businessMenuMessage,
  businessRegisterMessage,
  consumerLinkMessage,
  unexpectedAudienceMessage,
  unexpectedBusinessMessage,
  welcomeMessage,
} from './messages';

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isMenuReset(text: string): boolean {
  const t = fold(text);
  return t === 'menu' || t === 'menú' || t === 'inicio' || t === 'hola menu';
}

function isGreeting(text: string): boolean {
  const t = fold(text);
  return (
    t === 'hola' ||
    t === 'buenas' ||
    t === 'buenos dias' ||
    t === 'buenas tardes' ||
    t === 'buenas noches' ||
    t === 'hey' ||
    t === 'hi' ||
    t === 'hello' ||
    t.startsWith('hola ')
  );
}

function isConsumerIntent(text: string): boolean {
  const t = fold(text);
  if (t === '1' || t === '1️⃣') return true;
  return (
    /\b(consumidor|cliente|pedir comida|quiero pedir|buscar restaurante|tengo hambre|antojo|comida)\b/.test(
      t,
    ) || t === 'pedir'
  );
}

function isBusinessIntent(text: string): boolean {
  const t = fold(text);
  if (t === '2' || t === '2️⃣') return true;
  return /\b(tengo un negocio|soy restaurante|registrar mi restaurante|administrar menu|negocio|restaurante|comercio)\b/.test(
    t,
  );
}

function isBusinessRegisterIntent(text: string): boolean {
  const t = fold(text);
  if (t === '1' || t === '1️⃣') return true;
  return /\b(registrar|registro|crear menu|nuevo menu|abrir cuenta)\b/.test(t);
}

function isBusinessManageIntent(text: string): boolean {
  const t = fold(text);
  if (t === '2' || t === '2️⃣') return true;
  return /\b(gestionar|administrar|panel|iniciar sesion|login|mi menu)\b/.test(t);
}

function pruneHour(window: number[], nowMs: number): number[] {
  const cutoff = nowMs - 60 * 60 * 1000;
  return window.filter((t) => t >= cutoff);
}

export function createInitialThread(
  fromDigits: string,
  config: WaEntryConfig,
  nowMs = Date.now(),
): WaThreadRecord {
  return {
    fromDigits,
    state: 'initial',
    updatedAtMs: nowMs,
    expiresAtMs: nowMs + config.threadTtlMs,
    humanPausedUntilMs: null,
    repliesLastHour: [],
    lastOutboundDedupeKey: null,
  };
}

export function routeWaEntryEvent(params: {
  event: WaNormalizedEvent;
  thread: WaThreadRecord | null;
  config: WaEntryConfig;
  nowMs?: number;
  seenMessageIds: Set<string>;
}): { result: WaRouteResult; thread: WaThreadRecord } {
  const nowMs = params.nowMs ?? Date.now();
  const { event, config, seenMessageIds } = params;
  let thread =
    params.thread && params.thread.expiresAtMs > nowMs
      ? { ...params.thread }
      : createInitialThread(event.fromDigits, config, nowMs);

  if (!config.inboundEnabled || !config.routerEnabled) {
    return { result: { action: 'drop', reason: 'kill_switch' }, thread };
  }

  if (event.fromMe) {
    thread = {
      ...thread,
      state: 'human_handling',
      humanPausedUntilMs: nowMs + config.humanPauseMs,
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + config.threadTtlMs,
    };
    return {
      result: { action: 'drop', reason: 'from_me', nextState: 'human_handling' },
      thread,
    };
  }

  if (event.isGroup) {
    return { result: { action: 'drop', reason: 'group' }, thread };
  }
  if (event.isStatus) {
    return { result: { action: 'drop', reason: 'status' }, thread };
  }

  if (seenMessageIds.has(event.messageId)) {
    return { result: { action: 'drop', reason: 'duplicate' }, thread };
  }

  if (
    thread.humanPausedUntilMs != null &&
    thread.humanPausedUntilMs > nowMs
  ) {
    return {
      result: { action: 'drop', reason: 'human_handling', nextState: 'human_handling' },
      thread,
    };
  }

  const repliesWindow = pruneHour(thread.repliesLastHour, nowMs);
  if (repliesWindow.length >= config.maxRepliesPerHour) {
    return { result: { action: 'drop', reason: 'rate_limited' }, thread };
  }

  const text = (event.text || '').trim();
  if (!text) {
    return { result: { action: 'drop', reason: 'empty_text' }, thread };
  }

  // Reset anytime
  if (isMenuReset(text)) {
    return finishReply({
      thread,
      nowMs,
      config,
      nextState: 'awaiting_audience',
      replies: [welcomeMessage()],
      dedupeKey: `welcome:${event.fromDigits}:${event.messageId}`,
      repliesWindow,
    });
  }

  // Fresh conversation / greeting
  if (
    thread.state === 'initial' ||
    thread.state === 'closed' ||
    (thread.state === 'awaiting_audience' && isGreeting(text) && !isConsumerIntent(text) && !isBusinessIntent(text))
  ) {
    if (isGreeting(text) || thread.state === 'initial' || thread.state === 'closed') {
      // If they greet AND pick in same message rare; prefer greeting first once.
      if (!isConsumerIntent(text) && !isBusinessIntent(text)) {
        return finishReply({
          thread,
          nowMs,
          config,
          nextState: 'awaiting_audience',
          replies: [welcomeMessage()],
          dedupeKey: `welcome:${event.fromDigits}:${event.messageId}`,
          repliesWindow,
        });
      }
    }
  }

  if (thread.state === 'initial' || thread.state === 'closed') {
    // Non-greeting first message: still welcome once, then wait.
    return finishReply({
      thread,
      nowMs,
      config,
      nextState: 'awaiting_audience',
      replies: [welcomeMessage()],
      dedupeKey: `welcome:${event.fromDigits}:${event.messageId}`,
      repliesWindow,
    });
  }

  if (thread.state === 'awaiting_audience') {
    if (isConsumerIntent(text)) {
      return finishReply({
        thread,
        nowMs,
        config,
        nextState: 'consumer_link_sent',
        replies: [consumerLinkMessage(config)],
        dedupeKey: `consumer:${event.fromDigits}:${event.messageId}`,
        repliesWindow,
      });
    }
    if (isBusinessIntent(text)) {
      return finishReply({
        thread,
        nowMs,
        config,
        nextState: 'awaiting_business_action',
        replies: [businessMenuMessage()],
        dedupeKey: `bizmenu:${event.fromDigits}:${event.messageId}`,
        repliesWindow,
      });
    }
    return finishReply({
      thread,
      nowMs,
      config,
      nextState: 'awaiting_audience',
      replies: [unexpectedAudienceMessage()],
      dedupeKey: `help-audience:${event.fromDigits}:${event.messageId}`,
      repliesWindow,
    });
  }

  if (thread.state === 'awaiting_business_action') {
    if (isBusinessRegisterIntent(text) && !isBusinessManageIntent(text)) {
      return finishReply({
        thread,
        nowMs,
        config,
        nextState: 'business_link_sent',
        replies: [businessRegisterMessage(config)],
        dedupeKey: `bizreg:${event.fromDigits}:${event.messageId}`,
        repliesWindow,
      });
    }
    // Prefer manage when both could match "2"
    if (isBusinessManageIntent(text)) {
      return finishReply({
        thread,
        nowMs,
        config,
        nextState: 'business_link_sent',
        replies: [businessManageMessage(config)],
        dedupeKey: `bizmgr:${event.fromDigits}:${event.messageId}`,
        repliesWindow,
      });
    }
    if (isBusinessRegisterIntent(text)) {
      return finishReply({
        thread,
        nowMs,
        config,
        nextState: 'business_link_sent',
        replies: [businessRegisterMessage(config)],
        dedupeKey: `bizreg:${event.fromDigits}:${event.messageId}`,
        repliesWindow,
      });
    }
    return finishReply({
      thread,
      nowMs,
      config,
      nextState: 'awaiting_business_action',
      replies: [unexpectedBusinessMessage()],
      dedupeKey: `help-biz:${event.fromDigits}:${event.messageId}`,
      repliesWindow,
    });
  }

  if (thread.state === 'consumer_link_sent' || thread.state === 'business_link_sent') {
    if (isConsumerIntent(text) && thread.state === 'consumer_link_sent') {
      return finishReply({
        thread,
        nowMs,
        config,
        nextState: 'consumer_link_sent',
        replies: [alreadyHelpedMessage()],
        dedupeKey: `already:${event.fromDigits}:${event.messageId}`,
        repliesWindow,
      });
    }
    return finishReply({
      thread,
      nowMs,
      config,
      nextState: thread.state,
      replies: [alreadyHelpedMessage()],
      dedupeKey: `already:${event.fromDigits}:${event.messageId}`,
      repliesWindow,
    });
  }

  // human_handling with expired pause falls through to restart
  return finishReply({
    thread,
    nowMs,
    config,
    nextState: 'awaiting_audience',
    replies: [welcomeMessage()],
    dedupeKey: `welcome:${event.fromDigits}:${event.messageId}`,
    repliesWindow,
  });
}

function finishReply(params: {
  thread: WaThreadRecord;
  nowMs: number;
  config: WaEntryConfig;
  nextState: WaThreadState;
  replies: string[];
  dedupeKey: string;
  repliesWindow: number[];
}): { result: WaRouteResult; thread: WaThreadRecord } {
  const nextReplies = [...params.repliesWindow, params.nowMs];
  const thread: WaThreadRecord = {
    ...params.thread,
    state: params.nextState,
    updatedAtMs: params.nowMs,
    expiresAtMs: params.nowMs + params.config.threadTtlMs,
    humanPausedUntilMs: null,
    repliesLastHour: nextReplies,
    lastOutboundDedupeKey: params.dedupeKey,
  };
  return {
    result: {
      action: 'reply',
      replies: params.replies,
      nextState: params.nextState,
      dedupeKey: params.dedupeKey,
    },
    thread,
  };
}
