/**
 * Sets branding_ia.config_negocio.supervision_whatsapp for Trueno.
 * AUTHORIZATION GATED — does not run without the confirm phrase.
 *
 *   CHAT_SUPERVISION_WHATSAPP_CONFIRM=I_AUTHORIZE_TRUENO_SUPERVISION_WHATSAPP
 *   CHAT_SUPERVISION_WHATSAPP_E164=+58XXXXXXXXXX
 *   CHAT_SUPERVISION_WHATSAPP_DRY_RUN=1  (optional: print SQL, do not write)
 *
 * Usage:
 *   node site/scripts/set-trueno-supervision-whatsapp.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_TRUENO_SUPERVISION_WHATSAPP';
const TRUENO = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const PROD = 'qqhberaayhohxlbbhdyi';

const confirm = (process.env.CHAT_SUPERVISION_WHATSAPP_CONFIRM || '').trim();
const phone = (process.env.CHAT_SUPERVISION_WHATSAPP_E164 || '').trim();
const dryRun = /^(1|true|yes)$/i.test(
  (process.env.CHAT_SUPERVISION_WHATSAPP_DRY_RUN || '').trim(),
);

if (confirm !== CONFIRM) {
  console.error(
    `Refusing: set CHAT_SUPERVISION_WHATSAPP_CONFIRM=${CONFIRM} after explicit authorization.`,
  );
  process.exit(2);
}
if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
  console.error(
    'Refusing: set CHAT_SUPERVISION_WHATSAPP_E164 to E.164 like +58414xxxxxxx',
  );
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const escaped = phone.replace(/'/g, "''");
const sql = `
update public.comercios
set branding_ia = jsonb_set(
  coalesce(branding_ia, '{}'::jsonb),
  '{config_negocio,supervision_whatsapp}',
  to_jsonb('${escaped}'::text),
  true
)
where id = '${TRUENO}'
returning id, nombre, branding_ia->'config_negocio'->>'supervision_whatsapp' as supervision_whatsapp;
`;

if (dryRun) {
  console.log('DRY RUN — would execute against prod:');
  console.log(sql.trim());
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'chat-sup-wa-'));
const file = join(dir, 'q.sql');
writeFileSync(file, sql, 'utf8');
try {
  const r = spawnSync(
    'npx',
    [
      'supabase',
      'db',
      'query',
      `--remote=${PROD}`,
      '-o',
      'json',
      '-f',
      file,
    ],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  process.exit(r.status || 0);
} finally {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
