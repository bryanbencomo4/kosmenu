#!/usr/bin/env node
/**
 * Preview-only smoke: durable option-9 ticket + inbox + bot silence via wa_entry_threads.
 * Refuses production. Requires CONFIRM_WA_PLATFORM_INBOX_PREVIEW=1.
 *
 *   $env:CONFIRM_WA_PLATFORM_INBOX_PREVIEW='1'
 *   node site/scripts/smoke-wa-platform-inbox-preview.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const PROD = 'qqhberaayhohxlbbhdyi';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const envPath = path.join(root, 'site/.wa-entry-preview-deploy/vercel-preview.env');

if (process.env.CONFIRM_WA_PLATFORM_INBOX_PREVIEW !== '1') {
  console.error('Refused: set CONFIRM_WA_PLATFORM_INBOX_PREVIEW=1');
  process.exit(1);
}

function loadEnvFile(p) {
  const out = {};
  try {
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
  } catch {
    /* ignore */
  }
  return out;
}

const fileEnv = loadEnvFile(envPath);
const url = (
  process.env.PLATFORM_WA_PREVIEW_SUPABASE_URL ||
  fileEnv.PLATFORM_WA_PREVIEW_SUPABASE_URL ||
  ''
).trim();
const key = (
  process.env.PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY ||
  fileEnv.PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY ||
  ''
).trim();

if (!url.includes(PREVIEW) || url.includes(PROD) || !key.startsWith('eyJ')) {
  console.error('Refused: preview credentials missing or point at prod');
  process.exit(1);
}

const digits = '584140821633';
const nowMs = Date.now();
const ticketId = `sup_preview_${nowMs.toString(36)}`;
const msgId = `waim_preview_${nowMs.toString(36)}`;
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function cleanup() {
  await client.from('wa_platform_inbox_messages').delete().eq('from_digits', digits);
  await client.from('wa_platform_support_tickets').delete().eq('from_digits', digits);
  await client.from('wa_platform_inbox_conversations').delete().eq('from_digits', digits);
  // Smoke only: remove pilot thread row written by this script (Preview).
  await client
    .from('wa_entry_threads')
    .delete()
    .eq('from_digits', digits)
    .eq('last_outbound_dedupe_key', 'av:1:preview_inbox_smoke');
}

try {
  await cleanup();

  // 1) Persist ticket + inbox conversation + system note (same shape as app writers).
  const { error: ticketErr } = await client.from('wa_platform_support_tickets').upsert({
    id: ticketId,
    from_digits: digits,
    text: '9',
    context: 'preview_smoke_option9',
    status: 'pending',
    created_at_ms: nowMs,
    notified: true,
    notify_error: null,
    updated_at_ms: nowMs,
  });
  if (ticketErr) throw new Error(`ticket:${ticketErr.message}`);

  const note = `Solicitud humana · ${ticketId} · 9`;
  const { error: convErr } = await client.from('wa_platform_inbox_conversations').upsert(
    {
      from_digits: digits,
      display_name: null,
      status: 'needs_attention',
      assigned_operator_id: null,
      assigned_operator_label: null,
      last_message_text: note.slice(0, 240),
      last_message_at_ms: nowMs,
      unread_count: 1,
      attention_version: 0,
      context_role: 'support_human',
      context_note: note,
      updated_at_ms: nowMs,
      closed_at_ms: null,
    },
    { onConflict: 'from_digits' },
  );
  if (convErr) throw new Error(`conversation:${convErr.message}`);

  const { error: msgErr } = await client.from('wa_platform_inbox_messages').upsert({
    id: msgId,
    from_digits: digits,
    role: 'system',
    text: `Pendiente de asesor · ${ticketId}`,
    at_ms: nowMs,
    client_message_id: `sys_${ticketId}`,
    operator_id: null,
    outbound_id: null,
  });
  if (msgErr) throw new Error(`message:${msgErr.message}`);
  console.log('persist_ok', ticketId);

  // 2) Survive "restart": fresh queries (no process memory).
  const { data: tickets, error: tReadErr } = await client
    .from('wa_platform_support_tickets')
    .select('id, status, from_digits, text')
    .eq('id', ticketId)
    .eq('status', 'pending');
  if (tReadErr || !tickets?.length) throw new Error('ticket_missing_after_restart');
  console.log('ticket_survived_restart', tickets[0]);

  const { data: convs, error: cReadErr } = await client
    .from('wa_platform_inbox_conversations')
    .select('from_digits, status, context_role, last_message_text')
    .eq('from_digits', digits);
  if (cReadErr || !convs?.length) throw new Error('conversation_missing_after_restart');
  if (convs[0].status !== 'needs_attention' || convs[0].context_role !== 'support_human') {
    throw new Error(`conversation_unexpected:${JSON.stringify(convs[0])}`);
  }
  console.log('inbox_survived_restart', convs[0]);

  const { data: msgs, error: mReadErr } = await client
    .from('wa_platform_inbox_messages')
    .select('id, text, client_message_id')
    .eq('from_digits', digits);
  if (mReadErr || !msgs?.some((m) => String(m.text).includes(ticketId))) {
    throw new Error('system_message_missing');
  }
  console.log('inbox_message_ok', msgs.length);

  // 3) Dedup: same contact+text while pending must collide on unique index.
  const { error: dupErr } = await client.from('wa_platform_support_tickets').insert({
    id: `${ticketId}_dup`,
    from_digits: digits,
    text: '9',
    context: 'dup',
    status: 'pending',
    created_at_ms: nowMs + 1,
    notified: false,
    notify_error: null,
    updated_at_ms: nowMs + 1,
  });
  if (!dupErr) throw new Error('dedupe_index_did_not_fire');
  console.log('dedupe_ok', dupErr.code || dupErr.message);

  // 4) Bot silence via existing wa_entry_threads (same columns as takeConversation).
  const expiresAtMs = nowMs + 30 * 24 * 60 * 60 * 1000;
  const humanPausedUntilMs = 4_102_444_800_000; // WA_HUMAN_INDEFINITE_MS
  const { error: thrErr } = await client.from('wa_entry_threads').upsert(
    {
      from_digits: digits,
      state: 'human_handling',
      updated_at_ms: nowMs,
      expires_at_ms: expiresAtMs,
      human_paused_until_ms: humanPausedUntilMs,
      replies_last_hour: [],
      last_outbound_dedupe_key: 'av:1:preview_inbox_smoke',
    },
    { onConflict: 'from_digits' },
  );
  if (thrErr) throw new Error(`thread_silence:${thrErr.message}`);

  const { data: thread, error: thrReadErr } = await client
    .from('wa_entry_threads')
    .select('from_digits, state, human_paused_until_ms, last_outbound_dedupe_key')
    .eq('from_digits', digits)
    .maybeSingle();
  if (thrReadErr || !thread) throw new Error('thread_missing');
  if (
    thread.state !== 'human_handling' ||
    !(Number(thread.human_paused_until_ms) > Date.now())
  ) {
    throw new Error(`bot_not_silenced:${JSON.stringify(thread)}`);
  }
  console.log('bot_silenced_via_wa_entry_threads', thread);

  // 5) RLS: anon must not see tickets (service_role path already used above).
  const anonKey = (
    process.env.PLATFORM_WA_PREVIEW_ANON_KEY ||
    fileEnv.PLATFORM_WA_PREVIEW_ANON_KEY ||
    ''
  ).trim();
  if (anonKey.startsWith('eyJ')) {
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: leaked, error: leakErr } = await anon
      .from('wa_platform_support_tickets')
      .select('id')
      .eq('id', ticketId);
    if (leaked?.length) throw new Error('rls_leak_anon_can_read');
    console.log('rls_anon_blocked', leakErr?.code || 'empty');
  } else {
    console.log('rls_anon_skip', 'no_preview_anon_key');
  }

  // 6) Unrelated tables untouched (presence only).
  const { count: pedidosCount, error: pedidosErr } = await client
    .from('pedidos')
    .select('id', { count: 'exact', head: true });
  if (pedidosErr) throw new Error(`pedidos_probe:${pedidosErr.message}`);
  console.log('pedidos_untouched_probe_ok', { count: pedidosCount });

  await cleanup();
  console.log('OK: Preview durable ticket+inbox+silence smoke passed. Production untouched.');
  console.log('md5_text_check', createHash('md5').update('9').digest('hex'));
} catch (e) {
  console.error('smoke_error', e);
  try {
    await cleanup();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
