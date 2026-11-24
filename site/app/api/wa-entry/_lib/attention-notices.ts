/**
 * User-visible italic notices when a human takes / returns a WA conversation.
 * Must be recorded in outbound so fromMe webhook echoes do not re-take as human.
 */

import { createHash } from 'node:crypto';

import {
  assistantReturnNotice,
  humanTakeNotice,
} from '../../wa-master/_lib/menus/copy';
import { sendWasenderDirect } from './wasender-direct';
import type { WaEntryAsyncStore } from './store-async';
import { appendInboxMessage } from './inbox-store';

export async function notifyHumanTakeToContact(params: {
  store: WaEntryAsyncStore;
  fromDigits: string;
  operatorLabel?: string | null;
  nowMs?: number;
}): Promise<{ sent: boolean; error?: string }> {
  const nowMs = params.nowMs ?? Date.now();
  const text = humanTakeNotice(params.operatorLabel);
  try {
    const sent = await sendWasenderDirect({
      toDigits: params.fromDigits,
      text,
    });
    if (!sent.ok) return { sent: false, error: sent.error };
    const id = `notice_take_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;
    const textHash = createHash('sha256').update(text).digest('hex').slice(0, 24);
    await params.store.appendOutbound({
      id,
      to: params.fromDigits,
      text,
      eventId: id,
      dedupeKey: `attention-notice:take:${params.fromDigits}:${nowMs}`,
      result: 'queued',
      atMs: nowMs,
      attempt: 1,
      origin: 'external',
      textHash,
    });
    await appendInboxMessage({
      fromDigits: params.fromDigits,
      role: 'system',
      text,
      atMs: nowMs,
      clientMessageId: id,
    });
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function notifyAssistantReturnToContact(params: {
  store: WaEntryAsyncStore;
  fromDigits: string;
  nowMs?: number;
}): Promise<{ sent: boolean; error?: string }> {
  const nowMs = params.nowMs ?? Date.now();
  const text = assistantReturnNotice();
  try {
    const sent = await sendWasenderDirect({
      toDigits: params.fromDigits,
      text,
    });
    if (!sent.ok) return { sent: false, error: sent.error };
    const id = `notice_return_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;
    const textHash = createHash('sha256').update(text).digest('hex').slice(0, 24);
    await params.store.appendOutbound({
      id,
      to: params.fromDigits,
      text,
      eventId: id,
      dedupeKey: `attention-notice:return:${params.fromDigits}:${nowMs}`,
      result: 'queued',
      atMs: nowMs,
      attempt: 1,
      origin: 'wa_entry_bot',
      textHash,
    });
    await appendInboxMessage({
      fromDigits: params.fromDigits,
      role: 'system',
      text,
      atMs: nowMs,
      clientMessageId: id,
    });
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
