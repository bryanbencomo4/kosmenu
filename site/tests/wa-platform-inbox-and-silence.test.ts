import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isPlatformWaAutoReplyAllowed,
  loadPlatformWaAutoReplyAllowlist,
  PLATFORM_WA_AUTO_REPLY_ONLY_DIGITS_DEFAULT,
} from '../app/api/wa-entry/_lib/auto-reply-policy';
import { loadWaEntryConfig } from '../app/api/wa-entry/_lib/config';
import {
  __resetInboxStoreForTests,
  appendInboxMessage,
  inboxReturnConversation,
  inboxTakeConversation,
  listInboxConversations,
  listInboxMessages,
  upsertInboxConversationOnInbound,
} from '../app/api/wa-entry/_lib/inbox-store';
import {
  resetOperatorControlMemoryForTests,
} from '../app/api/wa-entry/_lib/operator-control';
import { processWaEntryEvent } from '../app/api/wa-entry/_lib/process';
import { createSimWaEntrySender } from '../app/api/wa-entry/_lib/sender';
import { createMemoryWaEntryStore } from '../app/api/wa-entry/_lib/store';

const PILOT = '584140821633';
const OTHER = '584199900099';

function env(partial: Record<string, string> = {}) {
  return { ...process.env, ...partial } as NodeJS.ProcessEnv;
}

function inbound(fromDigits: string, text: string, id: string) {
  return {
    event: 'messages.upsert',
    data: {
      messages: [
        {
          key: {
            id,
            fromMe: false,
            remoteJid: `${fromDigits}@s.whatsapp.net`,
            cleanedSenderPn: fromDigits,
          },
          messageTimestamp: Math.floor(Date.now() / 1000),
          message: { conversation: text },
          messageBody: text,
        },
      ],
    },
    sessionId: 'ELMENUXFA1',
  };
}

describe('auto-reply policy (fail-closed)', () => {
  it('defaults to only the authorized pilot number', () => {
    const list = loadPlatformWaAutoReplyAllowlist({} as NodeJS.ProcessEnv);
    expect(list).toEqual([PLATFORM_WA_AUTO_REPLY_ONLY_DIGITS_DEFAULT]);
    expect(isPlatformWaAutoReplyAllowed(PILOT, {} as NodeJS.ProcessEnv)).toBe(true);
    expect(isPlatformWaAutoReplyAllowed(OTHER, {} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('empty explicit list means nobody', () => {
    expect(
      isPlatformWaAutoReplyAllowed(PILOT, {
        PLATFORM_WA_AUTO_REPLY_DIGITS: '   ',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true); // blank falls back to default
    expect(
      isPlatformWaAutoReplyAllowed(PILOT, {
        PLATFORM_WA_AUTO_REPLY_DIGITS: 'none',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe('platform inbox + absolute silence', () => {
  beforeEach(() => {
    __resetInboxStoreForTests();
    resetOperatorControlMemoryForTests();
    vi.stubEnv('PLATFORM_WA_AUTO_REPLY_DIGITS', PILOT);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetInboxStoreForTests();
    resetOperatorControlMemoryForTests();
  });

  it('pilot number receives classic reply; other number is silent but inbox-recorded', async () => {
    const store = createMemoryWaEntryStore();
    const sender = createSimWaEntrySender(store);
    const config = loadWaEntryConfig(
      env({
        PLATFORM_WA_INBOUND: '1',
        PLATFORM_WA_ROUTER: '1',
        PLATFORM_WA_ADAPTER: 'sim',
        PLATFORM_WA_STORE: 'memory',
        PLATFORM_WA_MASTER: '0',
        PLATFORM_WA_ENFORCE_ALLOWLIST: '0',
        PLATFORM_WA_AUTO_REPLY_DIGITS: PILOT,
      }),
    );

    const pilot = await processWaEntryEvent({
      config,
      store,
      sender,
      rawBody: '{}',
      payload: inbound(PILOT, 'Hola', `m-pilot-${Date.now()}`),
    });
    expect(pilot.action).toBe('replied');
    expect(pilot.replies.length).toBeGreaterThan(0);

    const other = await processWaEntryEvent({
      config,
      store,
      sender,
      rawBody: '{}',
      payload: inbound(OTHER, 'Hola desde otro', `m-other-${Date.now()}`),
    });
    expect(other.action).toBe('ignored');
    expect(other.reason).toBe('auto_reply_not_allowed');
    expect(other.replies).toEqual([]);

    const convs = await listInboxConversations({ filter: 'all' });
    expect(convs.some((c) => c.fromDigits === OTHER)).toBe(true);
    expect(convs.some((c) => c.fromDigits === PILOT)).toBe(true);
    const otherMsgs = await listInboxMessages({ fromDigits: OTHER });
    expect(otherMsgs.some((m) => m.role === 'contact')).toBe(true);
    expect(otherMsgs.some((m) => m.role === 'assistant')).toBe(false);
  });

  it('PLATFORM_WA_MASTER=0 does not let classic router reply to non-allowlisted', async () => {
    const store = createMemoryWaEntryStore();
    const sender = createSimWaEntrySender(store);
    const config = loadWaEntryConfig(
      env({
        PLATFORM_WA_INBOUND: '1',
        PLATFORM_WA_ROUTER: '1',
        PLATFORM_WA_ADAPTER: 'sim',
        PLATFORM_WA_STORE: 'memory',
        PLATFORM_WA_MASTER: '0',
        PLATFORM_WA_ENFORCE_ALLOWLIST: '0',
        PLATFORM_WA_AUTO_REPLY_DIGITS: PILOT,
      }),
    );
    const r = await processWaEntryEvent({
      config,
      store,
      sender,
      rawBody: '{}',
      payload: inbound(OTHER, '1', `m-classic-${Date.now()}`),
    });
    expect(r.reason).toBe('auto_reply_not_allowed');
    expect(r.replies).toEqual([]);
  });

  it('take → silence; return on non-allowlisted stays without AI', async () => {
    await upsertInboxConversationOnInbound({
      fromDigits: OTHER,
      text: 'ayuda',
    });
    await appendInboxMessage({ fromDigits: OTHER, role: 'contact', text: 'ayuda' });

    const taken = await inboxTakeConversation({
      fromDigits: OTHER,
      operatorId: 'admin:test@elmenuxfa.com',
      operatorLabel: 'test@elmenuxfa.com',
    });
    expect(taken.ok).toBe(true);
    if (!taken.ok) return;
    expect(taken.conversation.humanActive).toBe(true);

    const returned = await inboxReturnConversation({
      fromDigits: OTHER,
      operatorId: 'admin:test@elmenuxfa.com',
    });
    expect(returned.ok).toBe(true);
    if (!returned.ok) return;
    expect(returned.aiResumed).toBe(false);
    expect(returned.conversation.aiActive).toBe(false);
    expect(returned.conversation.status).toBe('pending');

    const store = createMemoryWaEntryStore();
    const sender = createSimWaEntrySender(store);
    const config = loadWaEntryConfig(
      env({
        PLATFORM_WA_INBOUND: '1',
        PLATFORM_WA_ROUTER: '1',
        PLATFORM_WA_ADAPTER: 'sim',
        PLATFORM_WA_STORE: 'memory',
        PLATFORM_WA_MASTER: '0',
        PLATFORM_WA_ENFORCE_ALLOWLIST: '0',
        PLATFORM_WA_AUTO_REPLY_DIGITS: PILOT,
      }),
    );
    const again = await processWaEntryEvent({
      config,
      store,
      sender,
      rawBody: '{}',
      payload: inbound(OTHER, 'otra vez', `m-ret-${Date.now()}`),
    });
    expect(again.reason).toBe('auto_reply_not_allowed');
  });

  it('return on allowlisted resumes AI flag', async () => {
    await upsertInboxConversationOnInbound({ fromDigits: PILOT, text: 'hola' });
    await inboxTakeConversation({
      fromDigits: PILOT,
      operatorId: 'admin:op',
      operatorLabel: 'op',
    });
    const returned = await inboxReturnConversation({
      fromDigits: PILOT,
      operatorId: 'admin:op',
    });
    expect(returned.ok).toBe(true);
    if (!returned.ok) return;
    expect(returned.aiResumed).toBe(true);
    expect(returned.conversation.status).toBe('ai_handling');
  });
});
