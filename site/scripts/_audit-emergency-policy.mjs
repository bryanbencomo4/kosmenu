/**
 * READ-ONLY audit of pedidos_emergency_anon_insert on the configured Supabase.
 * Never ALTER/DROP.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function load(path) {
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

const env = { ...load(join(root, '.env.local')), ...process.env };
const url = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const outDir = join(root, '.data', 'staging-live');
mkdirSync(outDir, { recursive: true });

const report = {
  host: url ? new URL(url).host : null,
  policyPresent: null,
  policies: [],
  grants: [],
  error: null,
  mutated: false,
};

if (!url || !key) {
  report.error = 'missing_url_or_key';
  writeFileSync(join(outDir, 'rls-audit.json'), JSON.stringify(report, null, 2));
  process.exit(2);
}

const sql = `
select policyname, permissive, roles::text, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'pedidos'
order by policyname;
`;

// Use PostgREST rpc if available; else information_schema via REST is limited.
// Fallback: query via supabase postgres? We only have REST. Use rpc exec if exists — avoid.
// Instead hit pg_policies through a known safe pattern: not available via REST without RPC.
// Document attempt via SQL editor style is not possible; try storage of policies from
// supabase management — use fetch to /rest/v1/rpc if none, mark as needs_sql_editor.

const res = await fetch(`${url}/rest/v1/rpc/chatbot_readonly_noop`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});

// Prefer: select from a view if exists. Try raw SQL via supabase isn't available.
// Use PostgREST openapi? We'll query `pg_policies` is not exposed.
// Practical approach: use service role with supabase-js from dynamic import if installed.

try {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // No direct SQL. Attempt known table.
  const { data, error } = await sb
    .from('pedidos')
    .select('id')
    .limit(0);
  report.pedidosSelectProbe = {
    ok: !error,
    error: error?.message || null,
  };
  report.note =
    'pg_policies is not exposed via PostgREST. Ran safe SELECT probe only. Run supabase/sql/read-only-audit-pedidos-emergency-anon-insert.sql in SQL editor for full policy listing. This script did NOT mutate.';
  report.rpcProbeStatus = res.status;
} catch (e) {
  report.error = String(e).slice(0, 200);
}

writeFileSync(join(outDir, 'rls-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
