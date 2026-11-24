/**
 * Decide whether a chat_conversations Realtime change should refresh the
 * merchant inbox list. Presence/typing columns must NOT trigger reloads —
 * they fire often and were saturating /api/panel/conversaciones (rate_limited).
 */
export const INBOX_LIST_RELEVANT_KEYS = [
  'status',
  'last_message_at',
  'last_message_preview',
  'unread_merchant_count',
  'consumer_label',
  'assigned_user_id',
] as const;

export function isInboxListRelevantConversationChange(
  eventType: string,
  next: Record<string, unknown> | null | undefined,
  prev: Record<string, unknown> | null | undefined,
): boolean {
  const kind = String(eventType || '').toUpperCase();
  if (kind === 'INSERT' || kind === 'DELETE') return true;
  if (kind !== 'UPDATE') return true;
  return INBOX_LIST_RELEVANT_KEYS.some(
    (k) => String(next?.[k] ?? '') !== String(prev?.[k] ?? ''),
  );
}

export function shouldReloadInboxFromBroadcast(
  payload: Record<string, unknown> | null | undefined,
): boolean {
  const type = String(payload?.type || '').toLowerCase();
  // Presence/typing hints are for open threads, not the conversation list.
  if (type === 'presence') return false;
  return true;
}
