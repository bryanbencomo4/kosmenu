/**
 * Probe which Supabase projects are available for QA isolation.
 * Prints ONLY project refs / presence flags — never keys or JWTs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROD_REF = 'qqhberaayhohxlbbhdyi';
const PREVIEW_REF = 'gsfxqzvmyzjjgpigrste';

function loadEnvFile(p, into = {}) {
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
    if (!(k in into)) into[k] = v;
  }
  return into;
}

function refFromUrl(u) {
  try {
    const host = new URL(u).host;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m ? m[1] : host;
  } catch {
    return null;
  }
}

const root = process.cwd();
const files = [
  join(root, '.env.local'),
  join(root, '.env.staging.local'),
  join(root, '.env.preview.check'),
  join(root, '..', '.env.preview.local'),
  join(root, '..', '.env.preview.keys'),
  join(root, '..', '.env.local'),
];

const present = {};
for (const f of files) {
  present[f.replace(root, 'site').replace(/\\/g, '/')] = existsSync(f);
}

const env = {};
for (const f of files) loadEnvFile(f, env);

const candidates = [
  ['NEXT_PUBLIC_SUPABASE_URL', env.NEXT_PUBLIC_SUPABASE_URL],
  ['PLATFORM_WA_PREVIEW_SUPABASE_URL', env.PLATFORM_WA_PREVIEW_SUPABASE_URL],
  ['SUPABASE_PREVIEW_URL', env.SUPABASE_PREVIEW_URL],
  ['PREVIEW_SUPABASE_URL', env.PREVIEW_SUPABASE_URL],
];

const out = {
  filesPresent: present,
  urls: {},
  keysPresent: {
    SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY: Boolean(
      env.PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY,
    ),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  },
  classification: {},
};

for (const [name, val] of candidates) {
  const ref = val ? refFromUrl(val) : null;
  out.urls[name] = ref
    ? {
        present: true,
        ref,
        isProd: ref === PROD_REF,
        isPreview: ref === PREVIEW_REF,
      }
    : { present: Boolean(val), ref: null };
}

const primary = out.urls.NEXT_PUBLIC_SUPABASE_URL;
const preview =
  out.urls.PLATFORM_WA_PREVIEW_SUPABASE_URL.ref ||
  out.urls.SUPABASE_PREVIEW_URL.ref ||
  out.urls.PREVIEW_SUPABASE_URL.ref;

out.classification = {
  primaryIsProduction: primary?.ref === PROD_REF,
  previewRefAvailable: preview === PREVIEW_REF,
  canIsolateWrites:
    preview === PREVIEW_REF &&
    Boolean(env.PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY),
  note:
    preview === PREVIEW_REF
      ? 'Preview project credentials present — can clone QA commerce there'
      : 'No isolated Preview URL with service key found — MUST NOT write to production',
};

console.log(JSON.stringify(out, null, 2));
