/**
 * Enable chatbot_enabled for Pizzas El Trueno + post-RLS probes (anon denied).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.data', 'deploy-pilot');
mkdirSync(outDir, { recursive: true });
const BUSINESS_ID = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const env = { ...loadEnv(join(root, '.env.local')), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonClient = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const report = { at: new Date().toISOString(), checks: [] };
function check(name, ok, detail) {
  report.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`[probe] ${ok ? 'OK' : 'FAIL'} ${name} — ${detail}`);
}

const { data: before, error: be } = await admin
  .from('comercios')
  .select('id, slug, en_linea, chatbot_enabled')
  .eq('id', BUSINESS_ID)
  .maybeSingle();
if (be) throw be;

const { error: upErr } = await admin
  .from('comercios')
  .update({ chatbot_enabled: true, updated_at: new Date().toISOString() })
  .eq('id', BUSINESS_ID)
  .eq('slug', 'pizzas-el-trueno');
if (upErr) throw upErr;

const { data: after } = await admin
  .from('comercios')
  .select('id, slug, en_linea, chatbot_enabled')
  .eq('id', BUSINESS_ID)
  .maybeSingle();

check(
  'chatbot_enabled_trueno',
  after?.chatbot_enabled === true,
  JSON.stringify(after),
);
check('en_linea_unchanged_true', after?.en_linea === true, `en_linea=${after?.en_linea}`);

// Anon arbitrary insert must fail after DROP.
const { data: anonIns, error: anonErr } = await anonClient.from('pedidos').insert({
  comercio_id: BUSINESS_ID,
  total: 0.01,
  estado: 'pendiente',
}).select('id').maybeSingle();

check(
  'anon_insert_denied',
  Boolean(anonErr) && !anonIns,
  anonErr ? `${anonErr.code || ''} ${anonErr.message}` : 'UNEXPECTED SUCCESS',
);

// Ensure no other commerce got chatbot_enabled by mistake
const { data: others } = await admin
  .from('comercios')
  .select('slug')
  .eq('chatbot_enabled', true)
  .neq('id', BUSINESS_ID);
check(
  'only_trueno_enabled',
  !others || others.length === 0,
  `others=${(others || []).map((o) => o.slug).join(',') || 'none'}`,
);

report.before = before;
report.after = after;
report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(outDir, 'rls-enable-probe.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, out: 'rls-enable-probe.json' }));
process.exit(report.ok ? 0 : 1);
