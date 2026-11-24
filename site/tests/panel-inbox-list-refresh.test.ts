import { describe, expect, it } from 'vitest';

import {
  isInboxListRelevantConversationChange,
  shouldReloadInboxFromBroadcast,
} from '../app/panel/_lib/inbox-list-refresh';

describe('panel inbox list refresh gates', () => {
  it('ignores typing/presence-only conversation updates', () => {
    expect(
      isInboxListRelevantConversationChange(
        'UPDATE',
        {
          status: 'ai_handling',
          last_message_at: '2026-11-24T11:00:00Z',
          last_message_preview: 'hola',
          unread_merchant_count: 0,
          consumer_label: 'Bryan',
          assigned_user_id: null,
          consumer_typing_until: '2026-11-24T11:00:03Z',
          updated_at: '2026-11-24T11:00:03Z',
        },
        {
          status: 'ai_handling',
          last_message_at: '2026-11-24T11:00:00Z',
          last_message_preview: 'hola',
          unread_merchant_count: 0,
          consumer_label: 'Bryan',
          assigned_user_id: null,
          consumer_typing_until: null,
          updated_at: '2026-11-24T11:00:00Z',
        },
      ),
    ).toBe(false);
  });

  it('reloads when last message / unread / status changes', () => {
    expect(
      isInboxListRelevantConversationChange(
        'UPDATE',
        {
          status: 'needs_attention',
          last_message_at: '2026-11-24T11:01:00Z',
          last_message_preview: 'nuevo',
          unread_merchant_count: 1,
          consumer_label: 'Bryan',
          assigned_user_id: null,
        },
        {
          status: 'ai_handling',
          last_message_at: '2026-11-24T11:00:00Z',
          last_message_preview: 'hola',
          unread_merchant_count: 0,
          consumer_label: 'Bryan',
          assigned_user_id: null,
        },
      ),
    ).toBe(true);
  });

  it('always reloads on insert/delete', () => {
    expect(
      isInboxListRelevantConversationChange('INSERT', { id: 'a' }, null),
    ).toBe(true);
    expect(
      isInboxListRelevantConversationChange('DELETE', null, { id: 'a' }),
    ).toBe(true);
  });

  it('ignores presence broadcasts for the list', () => {
    expect(shouldReloadInboxFromBroadcast({ type: 'presence' })).toBe(false);
    expect(shouldReloadInboxFromBroadcast({ type: 'message' })).toBe(true);
    expect(shouldReloadInboxFromBroadcast({})).toBe(true);
  });
});
