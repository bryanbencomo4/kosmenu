/**
 * Purge supervised chat messages older than retention (default 30 days).
 * Gated — does not run against prod without explicit authorization.
 *
 *   CHAT_SUPERVISION_PURGE_CONFIRM=I_AUTHORIZE_CHAT_SUPERVISION_PURGE
 *   CHAT_SUPERVISION_PURGE_TARGET=prod|preview
 *   CHAT_SUPERVISION_RETENTION_DAYS=30   (optional)
 *   CHAT_SUPERVISION_PURGE_DRY_RUN=1     (optional — count only)
 */
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
const dryRun = (process.env.CHAT_SUPERVISION_PURGE_DRY_RUN || '').trim() === '1';
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
const countSql = `
select
  (select count(*) from public.chat_messages where created_at < ${cutoffExpr}) as messages,
  (select count(*) from public.chat_supervision_events where created_at < ${cutoffExpr}) as events,
  (select count(*) from public.chat_conversations
     where status = 'closed' and coalesce(closed_at, updated_at) < ${cutoffExpr}) as closed_conversations;
`;

const purgeSql = `
with del_msg as (
  delete from public.chat_messages
  where created_at < ${cutoffExpr}
  returning 1
),
del_evt as (
  delete from public.chat_supervision_events
  where created_at < ${cutoffExpr}
  returning 1
),
del_conv as (
  delete from public.chat_conversations
  where status = 'closed'
    and coalesce(closed_at, updated_at) < ${cutoffExpr}
  returning 1
)
select
  (select count(*) from del_msg) as deleted_messages,
  (select count(*) from del_evt) as deleted_events,
  (select count(*) from del_conv) as deleted_conversations;
`;

function runQuery(query, label) {
  const r = spawnSync(
    'npx',
    ['supabase', 'db', 'query', `--remote=${projectRef}`, '-o', 'json', query],
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
}

console.log(
  `Retention purge ${dryRun ? '(dry-run) ' : ''}→ ${targetKey} / ${days}d`,
);
runQuery(countSql, 'count_older_than_retention');
if (!dryRun) {
  runQuery(purgeSql, 'purge');
}
