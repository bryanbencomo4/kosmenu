/**
 * Read-only readiness probe for chat supervision (prod by default).
 * Does NOT apply migrations or flip flags.
 *
 * Usage (repo root):
 *   node site/scripts/chat-supervision-remote-readiness.mjs
 *   CHAT_SUPERVISION_READINESS_TARGET=prod node site/scripts/chat-supervision-remote-readiness.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TRUENO = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const TARGETS = {
  prod: 'qqhberaayhohxlbbhdyi',
  preview: 'gsfxqzvmyzjjgpigrste',
};
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const targetKey = (process.env.CHAT_SUPERVISION_READINESS_TARGET || 'prod')
  .trim()
  .toLowerCase();
const projectRef = TARGETS[targetKey];

if (!projectRef) {
  console.error('CHAT_SUPERVISION_READINESS_TARGET must be prod|preview');
  process.exit(2);
}

function query(sql, label) {
  const dir = mkdtempSync(join(tmpdir(), 'chat-sup-ready-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, sql, 'utf8');
  try {
    const r = spawnSync(
      'npx',
      [
        'supabase',
        'db',
        'query',
        `--remote=${projectRef}`,
        '--read-only',
        '-o',
        'json',
        '-f',
        file,
      ],
      { cwd: root, encoding: 'utf8', shell: true },
    );
    if (r.status !== 0) {
      console.error(`✗ ${label}`);
      console.error(r.stderr || r.stdout || '');
      return null;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(r.stdout || '{}');
    } catch {
      parsed = { raw: r.stdout };
    }
    console.log(`✓ ${label}`);
    console.log(JSON.stringify(parsed?.rows ?? parsed, null, 2));
    return parsed;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

console.log(`Chat supervision readiness (${targetKey} / ${projectRef}) — read-only\n`);

const tables = query(
  `select to_regclass('public.chat_conversations') as chat_conversations,
          to_regclass('public.chat_messages') as chat_messages,
          to_regclass('public.chat_supervision_events') as events,
          to_regclass('public.comercio_members') as comercio_members,
          exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='enqueue_wasender_message') as wasender_rpc,
          exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='chat_take_conversation') as take_rpc;`,
  'schema',
);

query(
  `select id::text, nombre, whatsapp,
          branding_ia->'config_negocio'->>'supervision_whatsapp' as supervision_whatsapp,
          branding_ia->'config_negocio'->>'notify_whatsapp' as notify_whatsapp
   from public.comercios where id = '${TRUENO}';`,
  'trueno_notify_target',
);

const row = tables?.rows?.[0] || {};
const ready =
  Boolean(row.chat_conversations) &&
  Boolean(row.chat_messages) &&
  Boolean(row.events) &&
  Boolean(row.comercio_members) &&
  row.wasender_rpc === true &&
  row.take_rpc === true;

console.log(`
Expected before GO:
  - chat_* tables present
  - chat_take_conversation RPC present
  - comercio_members + enqueue_wasender_message present
  - config_negocio.supervision_whatsapp (preferred) or notify_whatsapp / whatsapp_avisos
    (public comercios.whatsapp is NOT used for staff alerts)
  - CHAT_SUPERVISION_* flags on for Trueno only (app env)
  - CHAT_SUPERVISION_MEMORY unset
  - Next deploy includes /api/panel/conversaciones

Verdict: ${ready ? 'SCHEMA_READY (still need flags + deploy + smoke)' : 'SCHEMA_NOT_READY — authorize migration'}
`);

process.exit(ready ? 0 : 3);
