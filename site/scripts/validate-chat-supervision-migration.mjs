/**
 * Static validation of the chat supervision migration file.
 * Does NOT apply anything to remote databases.
 *
 * Usage: node site/scripts/validate-chat-supervision-migration.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  '..',
  '..',
  'supabase',
  'migrations',
  '20261123090000_chat_supervision_conversations.sql',
);

if (!existsSync(migrationPath)) {
  console.error('Missing migration:', migrationPath);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');
const required = [
  ['table chat_conversations', /create table if not exists public\.chat_conversations/i],
  ['table chat_messages', /create table if not exists public\.chat_messages/i],
  ['table chat_supervision_events', /create table if not exists public\.chat_supervision_events/i],
  ['RLS conversations', /enable row level security[\s\S]*chat_conversations/i],
  ['RLS messages', /enable row level security[\s\S]*chat_messages/i],
  ['policy member select conversations', /chat_conversations_member_select/i],
  ['policy member select messages', /chat_messages_member_select/i],
  ['fn chat_user_can_supervise', /create or replace function public\.chat_user_can_supervise/i],
  ['fn chat_take_conversation', /create or replace function public\.chat_take_conversation/i],
  ['fn chat_return_to_assistant', /create or replace function public\.chat_return_to_assistant/i],
  ['take uses p_user_id supervise', /chat_user_can_supervise\(c\.comercio_id,\s*p_user_id\)/i],
  ['return uses p_user_id supervise', /chat_user_can_supervise\(c\.comercio_id,\s*p_user_id\)/i],
  ['unique session hash', /unique\s*\(\s*comercio_id\s*,\s*consumer_session_hash\s*\)/i],
  ['unique dedupe_key', /unique\s*\(\s*dedupe_key\s*\)/i],
  ['DOWN comments', /DOWN \(manual rollback/i],
];

let failed = 0;
for (const [name, re] of required) {
  if (!re.test(sql)) {
    console.error(`✗ ${name}`);
    failed += 1;
  } else {
    console.log(`✓ ${name}`);
  }
}

if (failed) {
  console.error(`\nMigration validation failed (${failed}).`);
  process.exit(1);
}
console.log(`\nMigration static checks passed (${required.length}).`);
