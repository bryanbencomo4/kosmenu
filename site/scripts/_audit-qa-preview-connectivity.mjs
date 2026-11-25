/**
 * Check Preview Supabase connectivity for isolated QA writes.
 * Never prints secrets. Aborts if URL resolves to production.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const PROD_REF = 'qqhberaayhohxlbbhdyi';
const PREVIEW_REF = 'gsfxqzvmyzjjgpigrste';

function loadEnv(p) {
  const into = {};
  if (!existsSync(p)) return into;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    into[k] = v;
  }
  return into;
}

function refFromUrl(u) {
  try {
    const m = new URL(u).host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const previewLocal = loadEnv(join(process.cwd(), '..', '.env.preview.local'));
const previewKeys = loadEnv(join(process.cwd(), '..', '.env.preview.keys'));
const siteLocal = loadEnv(join(process.cwd(), '.env.local'));

const url =
  previewLocal.NEXT_PUBLIC_SUPABASE_URL ||
  previewLocal.PLATFORM_WA_PREVIEW_SUPABASE_URL ||
  '';
const refDeclared = (previewLocal.SUPABASE_PREVIEW_PROJECT_REF || '').trim();
const refFromUrlHost = refFromUrl(url);
const serviceKey =
  previewKeys.SUPABASE_SERVICE_ROLE_KEY ||
  previewLocal.SUPABASE_SERVICE_ROLE_KEY ||
  '';
const anon =
  previewKeys.SUPABASE_ANON_KEY ||
  previewKeys.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

const report = {
  at: new Date().toISOString(),
  preview: {
    urlPresent: Boolean(url),
    refDeclared: refDeclared || null,
    refFromUrl: refFromUrlHost,
    matchesExpectedPreview: refFromUrlHost === PREVIEW_REF || refDeclared === PREVIEW_REF,
    isProductionUrl: refFromUrlHost === PROD_REF,
    hasServiceKey: Boolean(serviceKey),
    hasAnonKey: Boolean(anon),
  },
  prodDotLocalRef: refFromUrl(siteLocal.NEXT_PUBLIC_SUPABASE_URL || ''),
  tables: {},
  verdict: 'unknown',
};

if (!url || !serviceKey) {
  report.verdict = 'BLOCKED_missing_preview_url_or_service_key';
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

if (refFromUrlHost === PROD_REF) {
  report.verdict = 'BLOCKED_preview_url_is_production';
  console.log(JSON.stringify(report, null, 2));
  process.exit(3);
}

if (refFromUrlHost && refFromUrlHost !== PREVIEW_REF && refDeclared !== PREVIEW_REF) {
  report.verdict = 'BLOCKED_unexpected_supabase_ref';
  console.log(JSON.stringify(report, null, 2));
  process.exit(4);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function probeTable(name) {
  const { count, error } = await sb
    .from(name)
    .select('id', { count: 'exact', head: true });
  return {
    ok: !error,
    count: count ?? null,
    error: error?.message || null,
  };
}

for (const t of [
  'comercios',
  'productos',
  'categorias',
  'pedidos',
  'comercio_members',
  'subscriptions',
  'plans',
]) {
  report.tables[t] = await probeTable(t);
}

const trueno = await sb
  .from('comercios')
  .select('id,nombre,en_linea,slug')
  .eq('id', '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea')
  .maybeSingle();
report.truenoInPreview = {
  found: Boolean(trueno.data),
  error: trueno.error?.message || null,
  en_linea: trueno.data?.en_linea ?? null,
  nombre: trueno.data?.nombre ?? null,
};

const schemaReady = Object.values(report.tables).every((t) => t.ok);
report.verdict = schemaReady
  ? 'READY_isolated_preview_for_qa_clone'
  : 'BLOCKED_preview_schema_incomplete';

mkdirSync(join(process.cwd(), '..', 'docs', 'audit'), { recursive: true });
writeFileSync(
  join(process.cwd(), '..', 'docs', 'audit', 'qa-preview-connectivity.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
process.exit(schemaReady ? 0 : 5);
