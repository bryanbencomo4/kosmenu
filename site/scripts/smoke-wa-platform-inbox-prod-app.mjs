#!/usr/bin/env node
/**
 * App-level durable register + inbox hydrate + silence on production.
 * Requires CONFIRM_WA_PLATFORM_INBOX_PROD_SMOKE=1 and prod supabase env.
 * Uses a disposable smoke digits row; cleans up.
 */
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD = 'qqhberaayhohxlbbhdyi';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

const fileEnv = {
  ...loadEnvFile(path.join(root, 'site/.env.local')),
  ...loadEnvFile(path.join(root, 'site/.env.staging.local')),
};
const url = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  fileEnv.NEXT_PUBLIC_SUPABASE_URL ||
  ''
).trim();
const key = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim();
const anonKey = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
).trim();

if (!url.includes(PROD) || !key.startsWith('eyJ')) {
  console.error('Refused: prod credentials missing');
  process.exit(1);
}

const runner = path.join(root, 'site/scripts/_tmp_prod_inbox_app_smoke.ts');
writeFileSync(
  runner,
  `
import { createClient } from '@supabase/supabase-js';
import { registerHumanSupportRequest } from '../app/api/wa-entry/_lib/register-human-support';
import {
  listPendingSupportTicketsDurable,
  resetSupportTicketsForTests,
} from '../app/api/wa-entry/_lib/support-tickets';
import {
  __resetInboxStoreForTests,
  listInboxConversations,
  listInboxMessages,
} from '../app/api/wa-entry/_lib/inbox-store';
import {
  takeConversation,
  describeConversationControl,
} from '../app/api/wa-entry/_lib/operator-control';
import { createSupabaseWaEntryStore } from '../app/api/wa-entry/_lib/store-supabase';

const digits = '580000000077';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function cleanup() {
  await client.from('wa_platform_inbox_messages').delete().eq('from_digits', digits);
  await client.from('wa_platform_support_tickets').delete().eq('from_digits', digits);
  await client.from('wa_platform_inbox_conversations').delete().eq('from_digits', digits);
  await client
    .from('wa_entry_threads')
    .delete()
    .eq('from_digits', digits)
    .eq('last_outbound_dedupe_key', 'av:1:prod_app_smoke');
}

async function main() {
  await cleanup();
  const reg = await registerHumanSupportRequest({
    fromDigits: digits,
    text: '9',
    context: 'prod_app_wire',
    nowMs: Date.now(),
  });
  if (!reg.ok) throw new Error('register_failed:' + reg.error);

  resetSupportTicketsForTests();
  __resetInboxStoreForTests();

  const tickets = await listPendingSupportTicketsDurable(20);
  if (!tickets.some((t) => t.id === reg.ticket.id)) throw new Error('ticket_lost');

  const convs = await listInboxConversations({ q: digits, limit: 20 });
  if (!convs.some((c) => c.fromDigits === digits && c.status === 'needs_attention')) {
    throw new Error('inbox_lost');
  }

  const msgs = await listInboxMessages({ fromDigits: digits, limit: 50 });
  if (!msgs.some((m) => m.text.includes(reg.ticket.id))) throw new Error('msg_lost');

  const store = createSupabaseWaEntryStore(client);
  const nowMs = Date.now();
  await takeConversation({
    store,
    fromDigits: digits,
    controllerId: 'prod:app_smoke',
    nowMs,
  });
  await client
    .from('wa_entry_threads')
    .update({ last_outbound_dedupe_key: 'av:1:prod_app_smoke' })
    .eq('from_digits', digits);

  const thread = await store.getThread(digits);
  const control = describeConversationControl(digits, thread, Date.now());
  if (!control.humanHandling || control.aiActive) throw new Error('not_silenced');

  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: leaked } = await anonClient
    .from('wa_platform_support_tickets')
    .select('id')
    .eq('id', reg.ticket.id);
  if (leaked?.length) throw new Error('anon_leak');

  await cleanup();
  console.log(
    JSON.stringify({
      ok: true,
      ticketId: reg.ticket.id,
      silenced: true,
      anonBlocked: true,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
`,
  'utf8',
);

const r = spawnSync('npx', ['tsx', runner], {
  cwd: path.join(root, 'site'),
  encoding: 'utf8',
  shell: true,
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: key,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    PLATFORM_WA_INBOX_SUPABASE: '1',
  },
});
try {
  unlinkSync(runner);
} catch {
  /* ignore */
}
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status || 0);
