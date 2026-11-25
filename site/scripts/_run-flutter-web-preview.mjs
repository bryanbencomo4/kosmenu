/**
 * Build + serve Flutter web against Supabase Preview ONLY.
 * Uses FVM Flutter from .fvm/flutter_sdk.
 * Port 5000 (allowed by site CORS for /api/asistente-negocio).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertAuditWriteTargetAllowed,
  isProductionSupabaseUrl,
} from './_lib/audit-prod-write-gate.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '../..');
const PROD_REF = 'qqhberaayhohxlbbhdyi';
const PREVIEW_REF = 'gsfxqzvmyzjjgpigrste';
const WEB_PORT = Number(process.env.FLUTTER_WEB_PORT || 5000);
const API_BASE = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3024';

function loadEnv(p) {
  const into = {};
  if (!existsSync(p)) return into;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
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
    into[t.slice(0, i).trim()] = v;
  }
  return into;
}

const previewLocal = loadEnv(join(root, '.env.preview.local'));
const previewKeys = loadEnv(join(root, '.env.preview.keys'));
const supabaseUrl = previewLocal.NEXT_PUBLIC_SUPABASE_URL || '';
const anon =
  previewKeys.SUPABASE_ANON_KEY ||
  previewKeys.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

if (!supabaseUrl || !anon) {
  console.error('Missing Preview URL/anon key');
  process.exit(1);
}
if (isProductionSupabaseUrl(supabaseUrl) || supabaseUrl.includes(PROD_REF)) {
  console.error('Refused: production Supabase');
  process.exit(1);
}
const ref = assertAuditWriteTargetAllowed(supabaseUrl);
if (ref !== PREVIEW_REF) {
  console.error('Refused: unexpected preview ref', ref);
  process.exit(1);
}

const flutterBat = join(root, '.fvm', 'flutter_sdk', 'bin', 'flutter.bat');
if (!existsSync(flutterBat)) {
  console.error('Missing FVM flutter at', flutterBat);
  process.exit(1);
}

const defines = [
  `--dart-define=SUPABASE_URL=${supabaseUrl}`,
  `--dart-define=SUPABASE_ANON_KEY=${anon}`,
  `--dart-define=API_BASE_URL=${API_BASE}`,
  `--dart-define=PUBLIC_SITE_URL=http://127.0.0.1:${WEB_PORT}`,
  `--dart-define=MERCHANT_APP_URL=http://127.0.0.1:${WEB_PORT}`,
];

const mode = process.argv[2] || 'run';
const outDir = join(root, 'build', 'web-preview-qa');

console.log(
  JSON.stringify({
    mode,
    flutter: '3.41.6-fvm',
    previewRef: ref,
    apiBase: API_BASE,
    webPort: WEB_PORT,
    outDir: mode === 'build' ? outDir : undefined,
  }),
);

if (mode === 'build') {
  mkdirSync(outDir, { recursive: true });
  const r = spawnSync(
    flutterBat,
    [
      'build',
      'web',
      '--release',
      `--output=${outDir}`,
      '--web-renderer=canvaskit',
      ...defines,
    ],
    { cwd: root, encoding: 'utf8', shell: true, stdio: 'inherit' },
  );
  process.exit(r.status || 0);
}

if (mode === 'run') {
  // web-server on CORS-allowed port 5000 (Flutter 3.41+: no --web-renderer flag)
  const child = spawn(
    flutterBat,
    [
      'run',
      '-d',
      'web-server',
      `--web-hostname=127.0.0.1`,
      `--web-port=${WEB_PORT}`,
      ...defines,
    ],
    { cwd: root, shell: true, stdio: 'inherit' },
  );
  child.on('exit', (code) => process.exit(code || 0));
} else {
  console.error('usage: run|build');
  process.exit(1);
}
