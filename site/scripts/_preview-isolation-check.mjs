/**
 * Read-only isolation check for Preview Gemini test.
 * Prints hosts/status only — no secrets.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const PROD = 'qqhberaayhohxlbbhdyi';

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
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const env = {
  ...loadEnv(join(root, '.env.preview.local')),
  ...loadEnv(join(root, '.env.preview.keys')),
};
const url = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').trim();
const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const anonKey = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '').trim();

const report = {
  previewHost: url ? new URL(url).host : null,
  isPreviewRef: Boolean(url && url.includes(PREVIEW)),
  isProdRef: Boolean(url && url.includes(PROD)),
  hasServiceRole: Boolean(serviceKey),
  hasAnon: Boolean(anonKey),
  rpcReserve: null,
  rpcIncrement: null,
  restaurants: [],
  restaurantCount: 0,
  pizzaHits: [],
  burgerHits: [],
  napoles: null,
  errors: [],
};

if (!url || !serviceKey) {
  report.errors.push('missing_preview_url_or_service_role');
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}
if (!url.includes(PREVIEW) || url.includes(PROD)) {
  report.errors.push('refused_not_preview_or_prod_credentials');
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: procs, error: procErr } = await sb
  .from('ai_discovery_usage')
  .select('period_month,requests,tokens_input,tokens_output')
  .limit(5);
if (procErr) report.errors.push(`usage_read:${procErr.message}`);

// Probe RPCs exist via a dry call with impossible session (expect validation error, not 404)
{
  const { error } = await sb.rpc('reserve_ai_discovery_quota', {
    p_session_id: 'x',
    p_max_session_requests: 1,
    p_period_month: '2099-01',
    p_max_monthly_requests: 1,
    p_max_monthly_tokens: 1,
    p_model: null,
  });
  report.rpcReserve = error ? error.message : 'ok_unexpected';
}
{
  const { error } = await sb.rpc('increment_ai_discovery_tokens', {
    p_period_month: '2099-01',
    p_tokens_input: 0,
    p_tokens_output: 0,
    p_model: null,
    p_estimated_cost: null,
  });
  report.rpcIncrement = error ? error.message : 'ok';
}

const { data: comercios, error: cErr } = await sb
  .from('comercios')
  .select('id,nombre,slug,en_linea,categoria')
  .eq('en_linea', true)
  .order('nombre')
  .limit(80);
if (cErr) {
  report.errors.push(`comercios:${cErr.message}`);
} else {
  report.restaurants = (comercios || []).map((c) => ({
    slug: c.slug,
    nombre: c.nombre,
    categoria: c.categoria,
  }));
  report.restaurantCount = report.restaurants.length;
  report.pizzaHits = report.restaurants.filter((r) =>
    /pizza|napoles|napoles/i.test(`${r.nombre} ${r.slug} ${r.categoria || ''}`),
  );
  report.burgerHits = report.restaurants.filter((r) =>
    /hambur|burger|burguer/i.test(`${r.nombre} ${r.slug} ${r.categoria || ''}`),
  );
  report.napoles =
    report.restaurants.find((r) => /napoles|nápoles/i.test(`${r.nombre} ${r.slug}`)) ||
    null;
}

report.ok = report.errors.length === 0 && report.isPreviewRef && !report.isProdRef;
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
