/**
 * Purge supervised chat data older than retention (default 30 days).
 * Only touches CLOSED conversations — never wipes active / human_handling threads.
 * Gated — does not run against prod without explicit authorization.
 *
 *   CHAT_SUPERVISION_PURGE_CONFIRM=I_AUTHORIZE_CHAT_SUPERVISION_PURGE
 *   CHAT_SUPERVISION_PURGE_TARGET=prod|preview
 *   CHAT_SUPERVISION_RETENTION_DAYS=30   (optional)
 *   CHAT_SUPERVISION_PURGE_DRY_RUN=1     (default if unset — count only)
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const CONFIRM = 'I_AUTHORIZE_CHAT_SUPERVISION_PURGE';
const TARGETS = {
  prod: 'qqhberaayhohxlbbhdyi',
  preview: 'gsfxqzvmyzjjgpigrste',
};
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

const confirm = (process.env.CHAT_SUPERVISION_PURGE_CONFIRM || '').trim();
const targetKey = (process.env.CHAT_SUPERVISION_PURGE_TARGET || '')
  .trim()
  .toLowerCase();
const dryRunRaw = (process.env.CHAT_SUPERVISION_PURGE_DRY_RUN || '').trim();
// Default dry-run; only write when explicitly set to 0/false/no.
const forceWrite = dryRunRaw === '0' || /^false|no$/i.test(dryRunRaw);
const days = Math.max(
  1,
  Number(process.env.CHAT_SUPERVISION_RETENTION_DAYS || 30) || 30,
);
const projectRef = TARGETS[targetKey];

if (confirm !== CONFIRM) {
  console.error(
    `Refusing: set CHAT_SUPERVISION_PURGE_CONFIRM=${CONFIRM} after explicit authorization.`,
  );
  process.exit(2);
}

if (!projectRef) {
  console.error(
    `Refusing: set CHAT_SUPERVISION_PURGE_TARGET=prod|preview (got "${targetKey || ''}").`,
  );
  process.exit(2);
}

const cutoffExpr = `now() - interval '${days} days'`;
const eligible = `
  select id from public.chat_conversations
  where status = 'closed'
    and coalesce(closed_at, updated_at) < ${cutoffExpr}
`;

const countSql = `
select
  (select count(*) from public.chat_messages m
     where m.conversation_id in (${eligible})) as messages,
  (select count(*) from public.chat_supervision_events e
     where e.conversation_id in (${eligible})) as events,
  (select count(*) from (${eligible}) c) as closed_conversations;
`;

const purgeSql = `
with eligible as (${eligible}),
del_msg as (
  delete from public.chat_messages
  where conversation_id in (select id from eligible)
  returning 1
),
del_evt as (
  delete from public.chat_supervision_events
  where conversation_id in (select id from eligible)
  returning 1
),
del_conv as (
  delete from public.chat_conversations
  where id in (select id from eligible)
  returning 1
)
select
  (select count(*) from del_msg) as deleted_messages,
  (select count(*) from del_evt) as deleted_events,
  (select count(*) from del_conv) as deleted_conversations;
`;

function runQueryFile(sqlText, label) {
  const dir = mkdtempSync(join(tmpdir(), 'chat-sup-purge-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, sqlText, 'utf8');
  try {
    const r = spawnSync(
      'npx',
      [
        'supabase',
        'db',
        'query',
        `--remote=${projectRef}`,
        '-o',
        'json',
        '-f',
        file,
      ],
      { cwd: root, encoding: 'utf8', shell: true },
    );
    if (r.status !== 0) {
      console.error(label, 'failed');
      console.error(r.stdout || '');
      console.error(r.stderr || '');
      process.exit(r.status || 1);
    }
    console.log(label, r.stdout || 'ok');
    return r.stdout;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

const mode = forceWrite ? 'WRITE' : 'DRY-RUN';
console.log(
  `Retention purge (${mode}) → ${targetKey} / ${days}d — closed conversations only`,
);
runQueryFile(countSql, 'count_closed_older_than_retention');
if (forceWrite) {
  runQueryFile(purgeSql, 'purge');
} else {
  console.log('Dry-run only. Set CHAT_SUPERVISION_PURGE_DRY_RUN=0 to delete.');
}
