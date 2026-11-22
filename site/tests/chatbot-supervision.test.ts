import { beforeEach, describe, expect, it } from 'vitest';
import {
  detectNeedsHuman,
  hashConsumerSession,
  merchantConversationHref,
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

const COMERCIO = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';

describe('chat supervision helpers', () => {
  it('detects human escalation phrases', () => {
    expect(detectNeedsHuman('Quiero hablar con un humano')).toBe(true);
    expect(detectNeedsHuman('Tengo un reclamo')).toBe(true);
    expect(detectNeedsHuman('¿Tienen pizza grande?')).toBe(false);
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
    expect(href).toMatch(/app\.elmenuxfa\.com|localhost|127\.0\.0\.1/);
    expect(href).not.toMatch(/service_role|apikey|Bearer/i);
  });

  it('feature flags default off and fail-closed in production allowlist', () => {
    const cfg = getChatSupervisionConfig({
      CHAT_SUPERVISION_ENABLED: '',
      NODE_ENV: 'test',
    });
    expect(cfg.enabled).toBe(false);
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

  it('includes discreet privacy notice in welcome copy', () => {
    const w = buildChatbotWelcomeMessage('Pizzas El Trueno');
    expect(w).toMatch(/personal autorizado/i);
    expect(w).toMatch(/procesada por IA/i);
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
      dedupe_key: `chat_supervision:new:${conv.id}`,
    });
    const e2 = memoryInsertEvent({
      conversation_id: conv.id,
      comercio_id: COMERCIO,
      event_type: 'new_conversation',
      dedupe_key: `chat_supervision:new:${conv.id}`,
    });
    expect(e1.ok).toBe(true);
    expect(e2.ok).toBe(false);
    expect(memoryListEvents()).toHaveLength(1);
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
