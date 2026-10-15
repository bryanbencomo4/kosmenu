/**
 * Publish a local release APK to Supabase app-releases + latest.json.
 * Usage (from site/): node scripts/publish_android_apk.mjs <apkPath> <versionName> <versionCode> [notes]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(__dirname, '..');
const BUCKET = 'app-releases';
const META_PATH = 'android/latest.json';

function readDotEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const apkPath = resolve(process.cwd(), process.argv[2] || '');
const versionName = String(process.argv[3] || '').trim();
const versionCode = Number(process.argv[4] || 0);
const notes = String(process.argv[5] || 'Imagen de categoría + editor sin emojis').trim();

if (!process.argv[2] || !versionName || !Number.isFinite(versionCode) || versionCode < 1) {
  console.error(
    'Usage: node scripts/publish_android_apk.mjs <apk> <versionName> <versionCode> [notes]',
  );
  process.exit(1);
}

const env = readDotEnv(resolve(siteRoot, '.env.local'));
const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in site/.env.local');
  process.exit(1);
}

const objectPath = `android/elmenuxfa-admin-${Math.trunc(versionCode)}.apk`;
const fileName = `elmenuxfa-admin-${Math.trunc(versionCode)}.apk`;
const fileSize = statSync(apkPath).size;
const bytes = readFileSync(apkPath);

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

console.log(`Uploading ${apkPath} (${fileSize} bytes) → ${objectPath}`);
const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, bytes, {
  upsert: true,
  contentType: 'application/vnd.android.package-archive',
  cacheControl: '60',
});
if (uploadError) {
  console.error('Upload failed:', uploadError.message);
  process.exit(1);
}

const meta = {
  platform: 'android',
  versionCode: Math.trunc(versionCode),
  versionName,
  forceUpdate: true,
  notes,
  objectPath,
  fileName,
  fileSize,
  uploadedAt: new Date().toISOString(),
  uploadedByEmail: 'local-publish-script',
};

const { error: metaError } = await supabase.storage.from(BUCKET).upload(
  META_PATH,
  new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }),
  {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '60',
  },
);
if (metaError) {
  console.error('Meta upload failed:', metaError.message);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, release: meta }, null, 2));
