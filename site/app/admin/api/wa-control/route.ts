import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdminAnyPermission } from '../../_lib/admin-auth';
import { digitsOnly } from '../../../api/wa-entry/_lib/contract';
import { resolveWaEntryControlStore } from '../../../api/wa-entry/_lib/control-store';
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
    'pause_all',
    'resume_all',
    'list_tickets',
    'list_conversations',
  ]),
  fromDigits: z.string().optional(),
});

/**
 * Authenticated platform operator controls for WA bot mute / conversation take.
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
  const store = resolveWaEntryControlStore();
  const { action } = parsed.data;

  if (action === 'list_tickets') {
    return NextResponse.json({
      ok: true,
      tickets: listPendingSupportTickets(40),
      note: 'Tickets in-memory until durable store authorized',
    });
  }

  if (action === 'list_conversations') {
    const out = await store.listOutbound(80);
    const byChat = new Map<string, { fromDigits: string; lastAtMs: number; lastText: string }>();
    for (const row of out) {
      if (row.to === '__wa_bot_global__') continue;
      const prev = byChat.get(row.to);
      if (!prev || row.atMs > prev.lastAtMs) {
        byChat.set(row.to, {
          fromDigits: row.to,
          lastAtMs: row.atMs,
          lastText: (row.text || '').slice(0, 120),
        });
      }
    }
    const conversations = [];
    for (const item of byChat.values()) {
      const thread = await store.getThread(item.fromDigits);
      const control = describeConversationControl(item.fromDigits, thread, nowMs);
      conversations.push({
        ...item,
        mode: control.mode,
        aiActive: control.aiActive,
        humanHandling: control.humanHandling,
        controllerId: control.controllerId,
        changedAtMs: control.changedAtMs,
        attentionVersion: control.attentionVersion,
      });
    }
    conversations.sort((a, b) => b.lastAtMs - a.lastAtMs);
    return NextResponse.json({ ok: true, conversations: conversations.slice(0, 40) });
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
    if (digits) {
      const thread = await store.getThread(digits);
      conversation = describeConversationControl(digits, thread, nowMs);
    }
    return NextResponse.json({
      ok: true,
      global,
      conversation,
      ticketsPending: listPendingSupportTickets(10).length,
      controllerActor: controllerId,
    });
  }

  const digits = digitsOnly(parsed.data.fromDigits || '');
  if (!digits || digits.length < 10) {
    return NextResponse.json({ ok: false, error: 'fromDigits_required' }, { status: 400 });
  }

  if (action === 'take') {
    const started = Date.now();
    const control = await takeConversation({
      store,
      fromDigits: digits,
      controllerId,
      nowMs,
    });
    return NextResponse.json({ ok: true, control, elapsedMs: Date.now() - started });
  }

  if (action === 'return') {
    const started = Date.now();
    const control = await returnConversationToAssistant({
      store,
      fromDigits: digits,
      controllerId,
      nowMs,
    });
    return NextResponse.json({ ok: true, control, elapsedMs: Date.now() - started });
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
      'pause_all',
      'resume_all',
      'list_tickets',
      'list_conversations',
    ],
    note: 'Use POST with admin session. Global mute does not stop order notifications.',
  });
}
