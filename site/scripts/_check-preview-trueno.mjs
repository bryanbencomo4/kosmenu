/**
 * Read-only: does Preview Supabase contain Pizzas El Trueno?
 * Prints hosts/status only — no secrets.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

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
const key = (
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SERVICE_ROLE_KEY ||
  ''
).trim();

const report = {
  previewHost: url ? new URL(url).host : null,
  hasServiceRole: Boolean(key),
  truenoFound: false,
  status: null,
  rowCount: 0,
  error: null,
};

if (!url || !key) {
  report.error = 'missing_preview_url_or_service_role';
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

const filter =
  'or=(slug.eq.pizzas-el-trueno,id.eq.0aa8c53b-07f1-446e-8b88-66c2b7ae89ea)';
const res = await fetch(
  `${url}/rest/v1/comercios?${filter}&select=id,nombre,slug,en_linea`,
  {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  },
);
report.status = res.status;
const body = await res.text();
try {
  const rows = JSON.parse(body);
  report.rowCount = Array.isArray(rows) ? rows.length : 0;
  report.truenoFound = report.rowCount > 0;
  if (Array.isArray(rows) && rows[0]) {
    report.sample = {
      id: rows[0].id,
      slug: rows[0].slug,
      en_linea: rows[0].en_linea,
      nombre: String(rows[0].nombre || '').slice(0, 40),
    };
  }
} catch {
  report.error = body.slice(0, 200);
}
console.log(JSON.stringify(report, null, 2));
process.exit(report.truenoFound ? 0 : 3);
