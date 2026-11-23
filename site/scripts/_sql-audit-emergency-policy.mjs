/**
 * READ-ONLY: list pedidos policies via Postgres if DATABASE_URL present,
 * else attempt Supabase SQL using service role through pg REST is impossible —
 * fall back to documenting + using `supabase db` if linked.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..');
const outDir = join(root, '.data', 'staging-closure');
mkdirSync(outDir, { recursive: true });

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

const env = {
  ...load(join(repo, '.env.preview.local')),
  ...load(join(root, '.env.local')),
  ...process.env,
};

const report = {
  mutated: false,
  method: null,
  host: null,
  policy: null,
  allPedidosPolicies: [],
  analysis: null,
  error: null,
};

const dbUrl = (env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || '').trim();
const sql = `
select policyname, permissive, roles::text as roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'pedidos'
order by policyname;
`;

async function tryPg() {
  if (!dbUrl) return false;
  report.method = 'DATABASE_URL';
  try {
    report.host = new URL(dbUrl).host;
  } catch {
    report.host = '(parsed-fail)';
  }
  // dynamic pg if available
  try {
    const pg = await import('pg');
    const client = new pg.default.Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    const res = await client.query(sql);
    report.allPedidosPolicies = res.rows;
    report.policy =
      res.rows.find((r) => r.policyname === 'pedidos_emergency_anon_insert') ||
      null;
    await client.end();
    return true;
  } catch (e) {
    report.error = `pg:${String(e).slice(0, 300)}`;
    return false;
  }
}

function analyze(policy, all) {
  if (!policy) {
    return {
      exists: false,
      active: false,
      risk:
        'Policy not found in listing — either already removed or query incomplete. Confirm in SQL editor before publish.',
      fixBeforePublish: 'If present, DROP POLICY after verifying no legitimate anon insert path remains.',
    };
  }
  const roles = String(policy.roles || '');
  const cmd = String(policy.cmd || '');
  const withCheck = String(policy.with_check || '');
  const isAnon = /anon/i.test(roles) || /public/i.test(roles);
  const isInsert = /insert/i.test(cmd);
  return {
    exists: true,
    active: true,
    roles,
    cmd,
    withCheck: withCheck.slice(0, 500),
    qual: String(policy.qual || '').slice(0, 500),
    risk: isAnon && isInsert
      ? 'CRITICAL/HIGH: anon (or public) may INSERT into pedidos if with_check is permissive — bypasses authenticated order pipeline; enables spam/fake orders.'
      : 'Policy present; review with_check carefully before publish.',
    fixBeforePublish:
      'DROP POLICY IF EXISTS pedidos_emergency_anon_insert ON public.pedidos; ensure only service_role/authenticated order RPCs can insert; re-run audit.',
    siblings: all.map((p) => p.policyname),
  };
}

const ok = await tryPg();
if (!ok) {
  // Try npx supabase sql with linked project — may fail offline
  const sqlFile = join(repo, 'supabase', 'sql', 'read-only-audit-pedidos-emergency-anon-insert.sql');
  report.method = report.method || 'manual_sql_required';
  report.sqlFile = sqlFile;
  report.note =
    'Could not run live SQL automatically (no usable DATABASE_URL/pg). Owner must run the read-only SQL file against production in SQL editor. This script made NO mutations.';
}

report.analysis = analyze(report.policy, report.allPedidosPolicies);
writeFileSync(join(outDir, 'rls-emergency-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
