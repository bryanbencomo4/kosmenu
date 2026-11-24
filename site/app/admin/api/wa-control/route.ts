import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdminAnyPermission } from '../../_lib/admin-auth';
import { digitsOnly } from '../../../api/wa-entry/_lib/contract';
import { canResumeAutoReplyForContact } from '../../../api/wa-entry/_lib/auto-reply-policy';
import { resolveWaEntryControlStore } from '../../../api/wa-entry/_lib/control-store';
import {
  appendInboxMessage,
  getInboxConversation,
  inboxCloseConversation,
  inboxReturnConversation,
  inboxTakeConversation,
  listInboxConversations,
  listInboxMessages,
  markInboxRead,
  upsertInboxConversationOnInbound,
} from '../../../api/wa-entry/_lib/inbox-store';
import {
  describeConversationControl,
  readGlobalBotMute,
  returnConversationToAssistant,
  setGlobalBotMute,
  takeConversation,
} from '../../../api/wa-entry/_lib/operator-control';
import { listPendingSupportTickets } from '../../../api/wa-entry/_lib/support-tickets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  action: z.enum([
    'status',
    'take',
    'return',
    'close',
    'pause_all',
    'resume_all',
    'list_tickets',
    'list_conversations',
    'get_messages',
    'send_message',
    'mark_read',
    'poll',
  ]),
  fromDigits: z.string().optional(),
  text: z.string().optional(),
  filter: z.string().optional(),
  q: z.string().optional(),
  afterMs: z.number().optional(),
  clientMessageId: z.string().optional(),
});

/**
 * Authenticated platform operator inbox + mute / take controls.
 * Does not touch order notification queue. Uses durable Supabase control store.
 */
export async function POST(request: Request) {
  const admin = await requireAdminAnyPermission([
    'orders.write',
    'businesses.write',
    'security.write',
  ]);
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const nowMs = Date.now();
  const controllerId = `admin:${admin.email || admin.authUserId}`;
  const operatorLabel = admin.email || admin.authUserId;
  const store = resolveWaEntryControlStore();
  const { action } = parsed.data;

  if (action === 'list_tickets') {
    return NextResponse.json({
      ok: true,
      tickets: listPendingSupportTickets(40),
      note: 'Tickets in-memory until durable store authorized',
    });
  }

  if (action === 'list_conversations' || action === 'poll') {
    const conversations = await listInboxConversations({
      filter: parsed.data.filter || 'all',
      q: parsed.data.q || '',
      limit: 80,
    });
    const global = await readGlobalBotMute(store, nowMs);
    const digits = digitsOnly(parsed.data.fromDigits || '');
    let messages: Awaited<ReturnType<typeof listInboxMessages>> = [];
    let conversation = null;
    if (digits) {
      conversation = await getInboxConversation(digits);
      messages = await listInboxMessages({
        fromDigits: digits,
        afterMs: parsed.data.afterMs,
        limit: 120,
      });
    }
    return NextResponse.json({
      ok: true,
      conversations,
      conversation,
      messages,
      global,
      serverNowMs: nowMs,
      autoReplyDefault: '584140821633',
    });
  }

  if (action === 'get_messages') {
    const digits = digitsOnly(parsed.data.fromDigits || '');
    if (!digits) {
      return NextResponse.json({ ok: false, error: 'fromDigits_required' }, { status: 400 });
    }
    await markInboxRead(digits);
    const conversation = await getInboxConversation(digits);
    const messages = await listInboxMessages({
      fromDigits: digits,
      afterMs: parsed.data.afterMs,
      limit: 120,
    });
    return NextResponse.json({ ok: true, conversation, messages, serverNowMs: nowMs });
  }

  if (action === 'mark_read') {
    const digits = digitsOnly(parsed.data.fromDigits || '');
    if (!digits) {
      return NextResponse.json({ ok: false, error: 'fromDigits_required' }, { status: 400 });
    }
    await markInboxRead(digits);
    return NextResponse.json({ ok: true });
  }

  if (action === 'pause_all') {
    const started = Date.now();
    const mute = await setGlobalBotMute({
      store,
      muted: true,
      controllerId,
      nowMs,
      reason: 'admin_pause_all',
    });
    return NextResponse.json({ ok: true, mute, elapsedMs: Date.now() - started });
  }

  if (action === 'resume_all') {
    const started = Date.now();
    const mute = await setGlobalBotMute({
      store,
      muted: false,
      controllerId,
      nowMs,
      reason: 'admin_resume_all',
    });
    return NextResponse.json({ ok: true, mute, elapsedMs: Date.now() - started });
  }

  if (action === 'status') {
    const global = await readGlobalBotMute(store, nowMs);
    const digits = digitsOnly(parsed.data.fromDigits || '');
    let conversation = null;
    let control = null;
    if (digits) {
      conversation = await getInboxConversation(digits);
      const thread = await store.getThread(digits);
      control = describeConversationControl(digits, thread, nowMs);
    }
    return NextResponse.json({
      ok: true,
      global,
      conversation,
      control,
      ticketsPending: listPendingSupportTickets(10).length,
      controllerActor: controllerId,
      canResumeAi: digits ? canResumeAutoReplyForContact(digits) : false,
    });
  }

  const digits = digitsOnly(parsed.data.fromDigits || '');
  if (!digits || digits.length < 10) {
    return NextResponse.json({ ok: false, error: 'fromDigits_required' }, { status: 400 });
  }

  if (action === 'take') {
    const started = Date.now();
    // Ensure conversation exists in inbox map.
    await upsertInboxConversationOnInbound({
      fromDigits: digits,
      text: '(toma de atención)',
      atMs: nowMs,
    });
    const taken = await inboxTakeConversation({
      fromDigits: digits,
      operatorId: controllerId,
      operatorLabel,
    });
    if (!taken.ok) {
      // Fallback to durable thread take
      const control = await takeConversation({
        store,
        fromDigits: digits,
        controllerId,
        nowMs,
      });
      return NextResponse.json({ ok: true, control, elapsedMs: Date.now() - started });
    }
    return NextResponse.json({
      ok: true,
      conversation: taken.conversation,
      elapsedMs: Date.now() - started,
    });
  }

  if (action === 'return') {
    const started = Date.now();
    const returned = await inboxReturnConversation({
      fromDigits: digits,
      operatorId: controllerId,
    });
    if (!returned.ok) {
      const control = await returnConversationToAssistant({
        store,
        fromDigits: digits,
        controllerId,
        nowMs,
      });
      return NextResponse.json({
        ok: true,
        control,
        aiResumed: canResumeAutoReplyForContact(digits),
        elapsedMs: Date.now() - started,
      });
    }
    return NextResponse.json({
      ok: true,
      conversation: returned.conversation,
      aiResumed: returned.aiResumed,
      elapsedMs: Date.now() - started,
    });
  }

  if (action === 'close') {
    const conversation = await inboxCloseConversation(digits);
    return NextResponse.json({ ok: true, conversation });
  }

  if (action === 'send_message') {
    const text = String(parsed.data.text || '').trim();
    if (!text || text.length > 3500) {
      return NextResponse.json({ ok: false, error: 'text_required' }, { status: 400 });
    }
    const started = Date.now();
    // Take conversation so bot cannot race the human reply.
    await takeConversation({
      store,
      fromDigits: digits,
      controllerId,
      nowMs,
    });
    await inboxTakeConversation({
      fromDigits: digits,
      operatorId: controllerId,
      operatorLabel,
    });

    const clientMessageId =
      parsed.data.clientMessageId ||
      `op_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const { sendWhatsappText } = await import('../../../api/_lib/send-order-whatsapp');
      await sendWhatsappText(digits, text, {
        source: 'platform-wa-inbox-human',
        dedupeKey: `wa-inbox-human:${clientMessageId}`,
      });
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: 'send_failed',
          detail: e instanceof Error ? e.message : String(e),
        },
        { status: 502 },
      );
    }

    const msg = await appendInboxMessage({
      fromDigits: digits,
      role: 'operator',
      text,
      atMs: Date.now(),
      clientMessageId,
      operatorId: controllerId,
      operatorLabel,
    });
    const conversation = await getInboxConversation(digits);
    return NextResponse.json({
      ok: true,
      message: msg,
      conversation,
      elapsedMs: Date.now() - started,
    });
  }

  return NextResponse.json({ ok: false, error: 'unknown_action' }, { status: 400 });
}

export async function GET() {
  await requireAdminAnyPermission(['orders.read', 'businesses.read', 'security.read']);
  return NextResponse.json({
    ok: true,
    actions: [
      'status',
      'take',
      'return',
      'close',
      'pause_all',
      'resume_all',
      'list_tickets',
      'list_conversations',
      'get_messages',
      'send_message',
      'mark_read',
      'poll',
    ],
    note: 'Use POST with admin session. Global mute does not stop order notifications. Human sends use source platform-wa-inbox-human (not gated by auto-reply allowlist).',
  });
}
