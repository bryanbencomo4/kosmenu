#!/usr/bin/env node
/**
 * Production R/W smoke for wa_platform_* after migration.
 * Does NOT send WhatsApp. Cleans up smoke rows.
 *
 *   CONFIRM_WA_PLATFORM_INBOX_PROD_SMOKE=1 node site/scripts/smoke-wa-platform-inbox-prod-rw.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD = 'qqhberaayhohxlbbhdyi';
const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const SMOKE_DIGITS = '580000000088';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prodEnv = path.join(root, 'site/.wa-entry-prod-deploy/vercel-production.env');

if (process.env.CONFIRM_WA_PLATFORM_INBOX_PROD_SMOKE !== '1') {
  console.error('Refused: set CONFIRM_WA_PLATFORM_INBOX_PROD_SMOKE=1');
  process.exit(1);
}

function loadEnvFile(p) {
  const out = {};
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const fileEnv = loadEnvFile(prodEnv);
const url = (
  process.env.PLATFORM_WA_PROD_SUPABASE_URL ||
  fileEnv.PLATFORM_WA_PROD_SUPABASE_URL ||
  fileEnv.NEXT_PUBLIC_SUPABASE_URL ||
  ''
).trim();
const key = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim();

if (!url.includes(PROD) || url.includes(PREVIEW) || !key.startsWith('eyJ')) {
  console.error('Refused: prod service credentials missing or wrong project');
  process.exit(1);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const nowMs = Date.now();
const ticketId = `sup_prod_rw_${nowMs.toString(36)}`;
const msgId = `waim_prod_rw_${nowMs.toString(36)}`;

async function cleanup() {
  await client.from('wa_platform_inbox_messages').delete().eq('from_digits', SMOKE_DIGITS);
  await client.from('wa_platform_support_tickets').delete().eq('from_digits', SMOKE_DIGITS);
  await client.from('wa_platform_inbox_conversations').delete().eq('from_digits', SMOKE_DIGITS);
}

try {
  await cleanup();
  const note = `Solicitud humana · ${ticketId} · 9`;
  const { error: tErr } = await client.from('wa_platform_support_tickets').insert({
    id: ticketId,
    from_digits: SMOKE_DIGITS,
    text: '9',
    context: 'prod_rw_smoke',
    status: 'pending',
    created_at_ms: nowMs,
    notified: true,
    notify_error: null,
    updated_at_ms: nowMs,
  });
  if (tErr) throw new Error(tErr.message);

  const { error: cErr } = await client.from('wa_platform_inbox_conversations').upsert({
    from_digits: SMOKE_DIGITS,
    status: 'needs_attention',
    last_message_text: note.slice(0, 240),
    last_message_at_ms: nowMs,
    unread_count: 1,
    attention_version: 0,
    context_role: 'support_human',
    context_note: note,
    updated_at_ms: nowMs,
  });
  if (cErr) throw new Error(cErr.message);

  const { error: mErr } = await client.from('wa_platform_inbox_messages').insert({
    id: msgId,
    from_digits: SMOKE_DIGITS,
    role: 'system',
    text: `Pendiente de asesor · ${ticketId}`,
    at_ms: nowMs,
    client_message_id: `sys_${ticketId}`,
  });
  if (mErr) throw new Error(mErr.message);

  const { data: tickets } = await client
    .from('wa_platform_support_tickets')
    .select('id,status')
    .eq('id', ticketId);
  if (!tickets?.length) throw new Error('ticket_read_failed');

  const { error: dupErr } = await client.from('wa_platform_support_tickets').insert({
    id: `${ticketId}_dup`,
    from_digits: SMOKE_DIGITS,
    text: '9',
    context: 'dup',
    status: 'pending',
    created_at_ms: nowMs + 1,
    notified: false,
    notify_error: null,
    updated_at_ms: nowMs + 1,
  });
  if (!dupErr) throw new Error('dedupe_missing');

  // Silence path uses existing wa_entry_threads (read-only probe here).
  const { count: pedidosCount, error: pErr } = await client
    .from('pedidos')
    .select('id', { count: 'exact', head: true });
  if (pErr) throw new Error(pErr.message);

  await cleanup();
  console.log(
    JSON.stringify({
      ok: true,
      ticketId,
      dedupe: dupErr.code || dupErr.message,
      pedidosCount,
      project: PROD,
    }),
  );
} catch (e) {
  try {
    await cleanup();
  } catch {
    /* ignore */
  }
  console.error('prod_rw_smoke_failed', e);
  process.exit(1);
}
