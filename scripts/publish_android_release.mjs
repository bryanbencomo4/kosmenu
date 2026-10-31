/**
 * Upload release APK + publish android/latest.json via service role.
 *
 * Usage (repo root):
 *   node --env-file=site/.env.local scripts/publish_android_release.mjs
 *
 * Optional:
 *   --apk path\to\app-release.apk
 *   --version-name 1.0.10
 *   --version-code 19
 *   --notes "..."
 *   --no-force
 */
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(
  pathToFileURL(resolve(import.meta.dirname, '../site/package.json')),
);
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
function argValue(flag, fallback = null) {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  return args[i + 1] ?? fallback;
}

const repoRoot = resolve(import.meta.dirname, '..');
const apkPath = resolve(
  argValue('--apk', resolve(repoRoot, 'build/app/outputs/flutter-apk/app-release.apk')),
);
const versionName = String(argValue('--version-name', '1.0.10')).trim();
const versionCode = Number(argValue('--version-code', '19'));
const notes = String(
  argValue(
    '--notes',
    'Pantalla de actualización con marca elmenuxfa, ventas multi-moneda y día comercial hasta las 8pm (Venezuela).',
  ),
).trim();
const forceUpdate = !args.includes('--no-force');

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  '';

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!existsSync(apkPath)) {
  console.error(`APK not found: ${apkPath}`);
  process.exit(1);
}
if (!Number.isFinite(versionCode) || versionCode < 1) {
  console.error('Invalid versionCode');
  process.exit(1);
}

const fileSize = statSync(apkPath).size;
const objectPath = `android/elmenuxfa-admin-${versionCode}.apk`;
const fileName = `elmenuxfa-admin-${versionCode}.apk`;
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`Uploading ${apkPath} (${fileSize} bytes) -> ${objectPath}`);
const { error: uploadError } = await supabase.storage
  .from('app-releases')
  .upload(objectPath, createReadStream(apkPath), {
    upsert: true,
    contentType: 'application/vnd.android.package-archive',
    duplex: 'half',
  });

if (uploadError) {
  // Fallback: buffer upload if stream duplex unsupported
  console.warn(`Stream upload failed (${uploadError.message}); retrying with buffer…`);
  const buf = readFileSync(apkPath);
  const { error: retryError } = await supabase.storage
    .from('app-releases')
    .upload(objectPath, buf, {
      upsert: true,
      contentType: 'application/vnd.android.package-archive',
    });
  if (retryError) {
    console.error(retryError.message);
    process.exit(1);
  }
}

const meta = {
  platform: 'android',
  versionCode,
  versionName,
  forceUpdate,
  notes,
  objectPath,
  fileName,
  fileSize,
  uploadedAt: new Date().toISOString(),
  uploadedByEmail: 'scripts/publish_android_release.mjs',
};

const { error: metaError } = await supabase.storage
  .from('app-releases')
  .upload('android/latest.json', Buffer.from(JSON.stringify(meta, null, 2), 'utf8'), {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '60',
  });

if (metaError) {
  console.error(metaError.message);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, release: meta }, null, 2));
