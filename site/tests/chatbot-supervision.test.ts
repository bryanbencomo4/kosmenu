import { beforeEach, describe, expect, it } from 'vitest';
import {
  detectNeedsHuman,
  didEscalateToNeedsAttention,
  hashConsumerSession,
  merchantConversationHref,
  mintSupervisionFeedToken,
  newConversationNotifyDedupeKey,
  nextConversationStatusAfterConsumerMessage,
  nextSupervisionRetryAt,
  pickSupervisionNotifyPhone,
  PLATFORM_SUPPORT_WHATSAPP_DIGITS,
  resolveSupervisionNotifyDestination,
  shouldDiscardInFlightAssistant,
  shouldRetrySupervisionNotify,
  SUPERVISION_NOTIFY_MAX_ATTEMPTS,
  verifySupervisionFeedToken,
} from '../app/api/chat/_lib/supervision-shared';
import {
  getChatSupervisionConfig,
  isSupervisionEnabledForCommerce,
} from '../app/api/chat/_lib/supervision-config';
import {
  memoryAddMessage,
  memoryGetBySession,
  memoryInsertEvent,
  memoryListEvents,
  memoryListMessages,
  memoryReset,
  memoryReturnToAssistant,
  memoryTakeConversation,
  memoryUpdateConversation,
  memoryUpsertConversation,
} from '../app/api/chat/_lib/supervision-memory';
import { buildChatbotWelcomeMessage } from '../app/_lib/chatbot-preview';
import { canSendStaffMessage } from '../app/api/panel/conversaciones/_lib/staff-authz';
import { resolveE2ePanelBearer } from '../app/panel/_lib/e2e-panel-bearer';
import { safePanelNext } from '../app/panel/_lib/safe-panel-next';
import { commerceChatChannelName } from '../app/_lib/chat-supervision-realtime';

const COMERCIO = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';

describe('chat supervision helpers', () => {
  it('detects human escalation phrases', () => {
    expect(detectNeedsHuman('Quiero hablar con un humano')).toBe(true);
    expect(detectNeedsHuman('Tengo un reclamo')).toBe(true);
    expect(detectNeedsHuman('¿Tienen pizza grande?')).toBe(false);
    expect(
      didEscalateToNeedsAttention('ai_handling', 'needs_attention', 'Tengo un reclamo'),
    ).toBe(true);
    expect(
      didEscalateToNeedsAttention('needs_attention', 'needs_attention', 'reclamo otra vez'),
    ).toBe(false);
    expect(
      didEscalateToNeedsAttention('human_handling', 'needs_attention', 'hablar con encargado'),
    ).toBe(false);
  });

  it('never demotes human_handling when consumer escalates', () => {
    expect(
      nextConversationStatusAfterConsumerMessage({
        previousStatus: 'human_handling',
        consumerText: 'Quiero hablar con el encargado, tengo un reclamo',
        wasClosed: false,
      }),
    ).toBe('human_handling');
    expect(
      nextConversationStatusAfterConsumerMessage({
        previousStatus: 'ai_handling',
        consumerText: 'Quiero hablar con un humano',
        wasClosed: false,
      }),
    ).toBe('needs_attention');
    expect(
      nextConversationStatusAfterConsumerMessage({
        previousStatus: 'closed',
        consumerText: 'Hola de nuevo',
        wasClosed: true,
      }),
    ).toBe('ai_handling');
  });

  it('hashes consumer sessions stably per commerce', () => {
    const a = hashConsumerSession('c1', 's_abc');
    const b = hashConsumerSession('c1', 's_abc');
    const c = hashConsumerSession('c2', 's_abc');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('builds authenticated panel deep link without secrets', () => {
    const href = merchantConversationHref('11111111-1111-4111-8111-111111111111');
    expect(href).toContain('/panel/conversaciones/11111111-1111-4111-8111-111111111111');
    // WaSender uses the Next public host (ships with chat APIs), not the Flutter app host.
    expect(href).toMatch(/elmenuxfa\.com|localhost|127\.0\.0\.1/);
    expect(href).not.toMatch(/^https:\/\/app\.elmenuxfa\.com\//);
    expect(href).not.toMatch(/service_role|apikey|Bearer/i);
    const withCommerce = merchantConversationHref(
      '11111111-1111-4111-8111-111111111111',
      COMERCIO,
    );
    expect(withCommerce).toContain(`comercioId=${encodeURIComponent(COMERCIO)}`);
    expect(withCommerce).not.toMatch(/service_role|apikey|Bearer/i);
  });

  it('sanitizes panel login next redirects', () => {
    expect(
      safePanelNext(
        '/panel/conversaciones/11111111-1111-4111-8111-111111111111?comercioId=x',
      ),
    ).toContain('/panel/conversaciones/');
    expect(safePanelNext('https://evil.example/phish')).toBe(
      '/panel/conversaciones',
    );
    expect(safePanelNext('//evil.example')).toBe('/panel/conversaciones');
    expect(safePanelNext('/panel/../admin')).toBe('/panel/conversaciones');
    expect(commerceChatChannelName(COMERCIO)).toBe(`commerce:${COMERCIO}:chat`);
  });

  it('feature flags default off and fail-closed in production allowlist', () => {
    const cfg = getChatSupervisionConfig({
      CHAT_SUPERVISION_ENABLED: '',
      NODE_ENV: 'test',
    });
    expect(cfg.enabled).toBe(false);
    expect(cfg.humanTakeover).toBe(false);
    expect(cfg.wasenderNotify).toBe(false);
    expect(
      isSupervisionEnabledForCommerce('0aa8c53b-07f1-446e-8b88-66c2b7ae89ea', {
        CHAT_SUPERVISION_ENABLED: '1',
        CHAT_SUPERVISION_COMMERCE_IDS: '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea',
        NODE_ENV: 'production',
      }),
    ).toBe(true);
    expect(
      isSupervisionEnabledForCommerce('00000000-0000-4000-8000-000000000099', {
        CHAT_SUPERVISION_ENABLED: '1',
        CHAT_SUPERVISION_COMMERCE_IDS: '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea',
        NODE_ENV: 'production',
      }),
    ).toBe(false);
  });

  it('does not inherit CHATBOT_ALLOWED_COMMERCE_IDS for supervision pilot', () => {
    const trueno = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
    expect(
      isSupervisionEnabledForCommerce(trueno, {
        CHAT_SUPERVISION_ENABLED: '1',
        CHATBOT_ALLOWED_COMMERCE_IDS: trueno,
        CHAT_SUPERVISION_COMMERCE_IDS: '',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      getChatSupervisionConfig({
        CHAT_SUPERVISION_ENABLED: '1',
        CHATBOT_ALLOWED_COMMERCE_IDS: trueno,
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv).allowedCommerceIds.size,
    ).toBe(0);
  });

  it('mints and verifies commerce-bound feed tokens', () => {
    const env = {
      NODE_ENV: 'test',
      CHAT_SUPERVISION_SESSION_PEPPER: 'test-pepper-feed-token',
    } as unknown as NodeJS.ProcessEnv;
    const token = mintSupervisionFeedToken(COMERCIO, 'sess_abc', env, 1_000);
    const ok = verifySupervisionFeedToken(token, COMERCIO, env, 1_500);
    expect(ok).toEqual({ ok: true, sessionId: 'sess_abc' });
    expect(
      verifySupervisionFeedToken(token, '00000000-0000-4000-8000-000000000099', env, 1_500)
        .ok,
    ).toBe(false);
    expect(
      verifySupervisionFeedToken(token, COMERCIO, env, 1_000 + 13 * 60 * 60 * 1000)
        .ok,
    ).toBe(false);
  });

  it('keeps human takeover as an independent kill switch', () => {
    expect(
      getChatSupervisionConfig({
        NODE_ENV: 'test',
        CHAT_SUPERVISION_ENABLED: '1',
        CHAT_SUPERVISION_HUMAN_TAKEOVER: '',
      } as NodeJS.ProcessEnv).humanTakeover,
    ).toBe(false);
    expect(
      getChatSupervisionConfig({
        NODE_ENV: 'test',
        CHAT_SUPERVISION_ENABLED: '1',
        CHAT_SUPERVISION_HUMAN_TAKEOVER: '1',
      } as NodeJS.ProcessEnv).humanTakeover,
    ).toBe(true);
  });

  it('discards in-flight assistant replies after takeover', () => {
    expect(
      shouldDiscardInFlightAssistant({
        humanTakeoverEnabled: true,
        status: 'human_handling',
        attentionVersionAtStart: 1,
        attentionVersionNow: 2,
      }),
    ).toBe(true);
    expect(
      shouldDiscardInFlightAssistant({
        humanTakeoverEnabled: true,
        status: 'ai_handling',
        attentionVersionAtStart: 1,
        attentionVersionNow: 1,
      }),
    ).toBe(false);
    expect(
      shouldDiscardInFlightAssistant({
        humanTakeoverEnabled: false,
        status: 'human_handling',
        attentionVersionAtStart: 1,
        attentionVersionNow: 2,
      }),
    ).toBe(false);
  });

  it('limits staff replies to assignee (admins may assist)', () => {
    expect(
      canSendStaffMessage({
        assignedUserId: 'user-a',
        actorUserId: 'user-a',
        role: 'caja',
      }),
    ).toBe(true);
    expect(
      canSendStaffMessage({
        assignedUserId: 'user-a',
        actorUserId: 'user-b',
        role: 'caja',
      }),
    ).toBe(false);
    expect(
      canSendStaffMessage({
        assignedUserId: 'user-a',
        actorUserId: 'user-b',
        role: 'administrador',
      }),
    ).toBe(true);
  });

  it('keeps welcome short with the restaurant name (privacy lives in onboarding)', () => {
    const w = buildChatbotWelcomeMessage('Pizzas El Trueno');
    expect(w).toContain('Pizzas El Trueno');
    expect(w).toMatch(/bienvenido/i);
  });

  it('versions new-conversation notify dedupe keys for reopen', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(newConversationNotifyDedupeKey(id, 1)).toBe(
      `chat_supervision:new:${id}:v1`,
    );
    expect(newConversationNotifyDedupeKey(id, 2)).toBe(
      `chat_supervision:new:${id}:v2`,
    );
    expect(newConversationNotifyDedupeKey(id, 1)).not.toBe(
      newConversationNotifyDedupeKey(id, 2),
    );
  });

  it('blocks E2E panel bearer on production hosts', () => {
    expect(resolveE2ePanelBearer('e2e-token', '127.0.0.1')).toBe('e2e-token');
    expect(resolveE2ePanelBearer('e2e-token', 'localhost')).toBe('e2e-token');
    expect(resolveE2ePanelBearer('e2e-token', 'elmenuxfa.com')).toBeNull();
    expect(resolveE2ePanelBearer('e2e-token', 'www.elmenuxfa.com')).toBeNull();
    expect(resolveE2ePanelBearer('e2e-token', 'preview.elmenuxfa.com')).toBeNull();
    expect(resolveE2ePanelBearer('', '127.0.0.1')).toBeNull();
  });

  it('resolves supervision notify phone per commerce with registered WhatsApp fallback', () => {
    expect(
      pickSupervisionNotifyPhone({
        supervision_whatsapp: '+584141111111',
        notify_whatsapp: '+584142222222',
      }),
    ).toBe('+584141111111');
    expect(
      pickSupervisionNotifyPhone({ notify_whatsapp: '+584142222222' }),
    ).toBe('+584142222222');
    expect(pickSupervisionNotifyPhone({})).toBeNull();
    expect(pickSupervisionNotifyPhone(null)).toBeNull();
    expect(
      pickSupervisionNotifyPhone({
        supervision_whatsapp: `+${PLATFORM_SUPPORT_WHATSAPP_DIGITS}`,
      }),
    ).toBeNull();
    // Trueno-style: no dedicated config → registered comercios.whatsapp
    expect(
      resolveSupervisionNotifyDestination({
        configNegocio: {},
        registeredWhatsapp: '+584140821633',
      }),
    ).toEqual({ phone: '+584140821633', source: 'comercios.whatsapp' });
    // Never deliver staff alerts to platform / El Menú XFA support number
    expect(
      resolveSupervisionNotifyDestination({
        configNegocio: {},
        registeredWhatsapp: `+${PLATFORM_SUPPORT_WHATSAPP_DIGITS}`,
      }),
    ).toBeNull();
    expect(
      resolveSupervisionNotifyDestination({
        configNegocio: {
          supervision_whatsapp: `+${PLATFORM_SUPPORT_WHATSAPP_DIGITS}`,
        },
        registeredWhatsapp: '+584140821633',
      }),
    ).toEqual({ phone: '+584140821633', source: 'comercios.whatsapp' });
  });

  it('limits WaSender notify retries with backoff', () => {
    const t0 = Date.parse('2026-11-22T12:00:00.000Z');
    expect(nextSupervisionRetryAt(1, t0)).toBe('2026-11-22T12:01:00.000Z');
    expect(nextSupervisionRetryAt(2, t0)).toBe('2026-11-22T12:05:00.000Z');
    expect(nextSupervisionRetryAt(SUPERVISION_NOTIFY_MAX_ATTEMPTS, t0)).toBeNull();
    expect(
      shouldRetrySupervisionNotify(
        { attempts: 1, next_retry_at: '2026-11-22T11:59:00.000Z' },
        t0,
      ),
    ).toBe(true);
    expect(
      shouldRetrySupervisionNotify(
        { attempts: 1, next_retry_at: '2026-11-22T12:05:00.000Z' },
        t0,
      ),
    ).toBe(false);
    expect(shouldRetrySupervisionNotify({ attempts: 3 }, t0)).toBe(false);
  });
});

describe('chat supervision memory store', () => {
  beforeEach(() => {
    memoryReset();
  });

  it('creates conversation, messages, and idempotent notify events', () => {
    const hash = hashConsumerSession(COMERCIO, 'sess_1');
    const conv = memoryUpsertConversation({
      comercio_id: COMERCIO,
      consumer_session_id: 'sess_1',
      consumer_session_hash: hash,
      status: 'ai_handling',
      last_message_preview: 'Hola',
      unread_merchant_count: 1,
    });
    expect(memoryGetBySession(COMERCIO, 'sess_1')?.id).toBe(conv.id);
    memoryAddMessage({
      conversation_id: conv.id,
      comercio_id: COMERCIO,
      role: 'consumer',
      body: 'Buenas, ¿tienen pizzas grandes?',
      client_message_id: 'c1',
    });
    memoryAddMessage({
      conversation_id: conv.id,
      comercio_id: COMERCIO,
      role: 'consumer',
      body: 'Buenas, ¿tienen pizzas grandes?',
      client_message_id: 'c1',
    });
    expect(memoryListMessages(conv.id)).toHaveLength(1);

    const e1 = memoryInsertEvent({
      conversation_id: conv.id,
      comercio_id: COMERCIO,
      event_type: 'new_conversation',
      dedupe_key: newConversationNotifyDedupeKey(conv.id, 1),
    });
    const e2 = memoryInsertEvent({
      conversation_id: conv.id,
      comercio_id: COMERCIO,
      event_type: 'new_conversation',
      dedupe_key: newConversationNotifyDedupeKey(conv.id, 1),
    });
    expect(e1.ok).toBe(true);
    expect(e2.ok).toBe(false);
    expect(memoryListEvents()).toHaveLength(1);
    const e3 = memoryInsertEvent({
      conversation_id: conv.id,
      comercio_id: COMERCIO,
      event_type: 'new_conversation',
      dedupe_key: newConversationNotifyDedupeKey(conv.id, 2),
    });
    expect(e3.ok).toBe(true);
    expect(memoryListEvents()).toHaveLength(2);
  });

  it('atomic takeover and return; discards AI after version bump', () => {
    const hash = hashConsumerSession(COMERCIO, 'sess_2');
    const conv = memoryUpsertConversation({
      comercio_id: COMERCIO,
      consumer_session_id: 'sess_2',
      consumer_session_hash: hash,
      status: 'ai_handling',
      attention_version: 1,
    });
    const taken = memoryTakeConversation(conv.id, 'user-a');
    expect(taken?.status).toBe('human_handling');
    expect(taken?.assigned_user_id).toBe('user-a');
    expect(taken?.attention_version).toBe(2);

    const conflict = memoryTakeConversation(conv.id, 'user-b');
    expect(conflict).toBeNull();

    const same = memoryTakeConversation(conv.id, 'user-a');
    expect(same?.assigned_user_id).toBe('user-a');

    // Consumer escalates while staff owns the thread — status must hold.
    const afterEscalation = memoryUpdateConversation(conv.id, {
      status: nextConversationStatusAfterConsumerMessage({
        previousStatus: 'human_handling',
        consumerText: 'Tengo un reclamo, quiero hablar con el encargado',
        wasClosed: false,
      }),
      last_message_preview: 'Tengo un reclamo…',
      unread_merchant_count: (taken?.unread_merchant_count || 0) + 1,
    });
    expect(afterEscalation?.status).toBe('human_handling');
    expect(afterEscalation?.assigned_user_id).toBe('user-a');

    memoryAddMessage({
      conversation_id: conv.id,
      comercio_id: COMERCIO,
      role: 'staff',
      body: 'Hola, te atiendo',
      client_message_id: 's1',
    });

    const returned = memoryReturnToAssistant(conv.id);
    expect(returned?.status).toBe('ai_handling');
    expect(returned?.assigned_user_id).toBeNull();
    expect(returned?.attention_version).toBeGreaterThan(2);

    memoryUpdateConversation(conv.id, { status: 'closed' });
    expect(memoryReturnToAssistant(conv.id)).toBeNull();
  });

  it('isolates sessions — other consumer hash cannot see messages', () => {
    const a = memoryUpsertConversation({
      comercio_id: COMERCIO,
      consumer_session_id: 'alice',
      consumer_session_hash: hashConsumerSession(COMERCIO, 'alice'),
    });
    memoryAddMessage({
      conversation_id: a.id,
      comercio_id: COMERCIO,
      role: 'staff',
      body: 'secreto',
    });
    expect(memoryGetBySession(COMERCIO, 'bob')).toBeNull();
  });

  it('documents service-role takeover contract (p_user_id, not auth.uid)', () => {
    // Panel APIs call RPCs with the service role. Membership must be checked
    // via chat_user_can_supervise(comercio_id, p_user_id) — see migration.
    const hash = hashConsumerSession(COMERCIO, 'svc');
    const conv = memoryUpsertConversation({
      comercio_id: COMERCIO,
      consumer_session_id: 'svc',
      consumer_session_hash: hash,
      status: 'ai_handling',
    });
    const taken = memoryTakeConversation(conv.id, 'merchant-user-uuid');
    expect(taken?.assigned_user_id).toBe('merchant-user-uuid');
    expect(taken?.status).toBe('human_handling');
  });
});
