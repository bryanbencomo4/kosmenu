/**
 * Single preflight checklist for chat supervision activation.
 * Read-only: never migrates, never sets flags, never sends WhatsApp.
 *
 * Usage (repo root):
 *   node site/scripts/chat-supervision-preflight.mjs
 *   BASE_URL=https://elmenuxfa.com node site/scripts/chat-supervision-preflight.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const TRUENO = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';

const checks = [];
function record(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
}

console.log('Chat supervision preflight (read-only)\n');

const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
});
const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
});
record(
  'git_branch',
  (branch.stdout || '').trim() === 'feature/chat-supervision-human',
  `${(branch.stdout || '').trim()} @ ${(head.stdout || '').trim()}`,
);

const ready = spawnSync(
  process.execPath,
  [join(root, 'site/scripts/chat-supervision-remote-readiness.mjs')],
  { cwd: root, encoding: 'utf8' },
);
const readyOut = `${ready.stdout || ''}${ready.stderr || ''}`;
const schemaReady = /Verdict:\s*SCHEMA_READY/.test(readyOut);
const notifyMissing = /staff-alert WhatsApp:\s*MISSING/.test(readyOut);
record(
  'prod_schema',
  schemaReady,
  schemaReady ? 'SCHEMA_READY' : 'SCHEMA_NOT_READY (needs I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION)',
);
record(
  'trueno_supervision_whatsapp',
  !notifyMissing,
  notifyMissing
    ? 'MISSING (needs I_AUTHORIZE_TRUENO_SUPERVISION_WHATSAPP + E.164)'
    : 'configured',
);

const isProdBase = /elmenuxfa\.com/i.test(BASE);
if (BASE) {
  try {
    const res = await fetch(
      `${BASE}/api/panel/conversaciones?comercioId=${encodeURIComponent(TRUENO)}`,
    );
    const exists = res.status !== 404;
    if (isProdBase) {
      record(
        'panel_api_deployed',
        exists,
        `${BASE} → HTTP ${res.status}${exists ? '' : ' (merge/deploy still required)'}`,
      );
    } else {
      record(
        'panel_api_local_probe',
        exists,
        `${BASE} → HTTP ${res.status} (local/preview only; prod deploy still required)`,
      );
    }
  } catch (err) {
    record(
      isProdBase ? 'panel_api_deployed' : 'panel_api_local_probe',
      false,
      String(err?.message || err),
    );
  }
} else {
  record(
    'panel_api_deployed',
    false,
    'skipped — set BASE_URL=https://elmenuxfa.com to probe prod deploy',
  );
}

console.log(`
Authorization phrases (exact):
  1. I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION
  2. I_AUTHORIZE_CHAT_SUPERVISION_TRUENO_ACTIVATE   (optional one-shot)
  3. I_AUTHORIZE_TRUENO_SUPERVISION_WHATSAPP        (+ CHAT_SUPERVISION_WHATSAPP_E164)
  4. I_AUTHORIZE_CHAT_SUPERVISION_SMOKE             (post-deploy API smoke)
  + explicit authorize for merge/deploy of feature/chat-supervision-human

App env (Trueno only, after schema + deploy):
  CHAT_SUPERVISION_ENABLED=1
  CHAT_SUPERVISION_WASENDER=1
  CHAT_SUPERVISION_HUMAN_TAKEOVER=1
  CHAT_SUPERVISION_COMMERCE_IDS=${TRUENO}
  CHAT_SUPERVISION_SESSION_PEPPER=<secret>
  CHAT_SUPERVISION_MEMORY unset
`);

const failed = checks.filter((c) => !c.ok);
const verdict =
  failed.length === 0
    ? 'PREFLIGHT_OK — proceed to smoke'
    : 'NO-GO — blockers remain (see ✗ above)';
console.log(`Verdict: ${verdict}`);
process.exit(failed.length ? 3 : 0);
