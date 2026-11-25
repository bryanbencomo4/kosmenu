/**
 * Flutter-contract E2E against Preview (no prod).
 * Validates the same JSON shapes Flutter panel/models consume after assistant writes.
 * Full Flutter app binary against Preview requires local dart-define — documented in output.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  assertAuditWriteTargetAllowed,
  isProductionSupabaseUrl,
} from './_lib/audit-prod-write-gate.mjs';

const STATE_PATH = join(process.cwd(), '..', 'docs', 'audit', 'qa-isolated-state.json');
const OUT_DIR = join(process.cwd(), '..', 'docs', 'audit');

function loadEnv(p) {
  const into = {};
  if (!existsSync(p)) return into;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    into[t.slice(0, i).trim()] = v;
  }
  return into;
}

function previewAdmin() {
  const previewLocal = loadEnv(join(process.cwd(), '..', '.env.preview.local'));
  const previewKeys = loadEnv(join(process.cwd(), '..', '.env.preview.keys'));
  const url = previewLocal.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = previewKeys.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) throw new Error('missing_preview');
  if (isProductionSupabaseUrl(url)) throw new Error('prod_blocked');
  assertAuditWriteTargetAllowed(url);
  return { url, admin: createClient(url, serviceKey, { auth: { persistSession: false } }) };
}

/** Mirrors Flutter DeliveryConfig.fromJson essentials. */
function flutterDeliveryOk(cfg) {
  if (!cfg || typeof cfg !== 'object') return { ok: false, reason: 'missing' };
  if (typeof cfg.enabled !== 'boolean') return { ok: false, reason: 'enabled' };
  if (!cfg.pricing_type) return { ok: false, reason: 'pricing_type' };
  if (cfg.pricing_type === 'zones') {
    if (!Array.isArray(cfg.zones) || !cfg.zones.length) return { ok: false, reason: 'zones' };
    for (const z of cfg.zones) {
      if (typeof z.min_distance !== 'number' || typeof z.max_distance !== 'number') {
        return { ok: false, reason: 'zone_range' };
      }
    }
  }
  if (cfg.pricing_type === 'area_zones') {
    if (!Array.isArray(cfg.area_zones) || !cfg.area_zones.length) {
      return { ok: false, reason: 'area_zones' };
    }
    for (const z of cfg.area_zones) {
      if (!Array.isArray(z.polygon) || z.polygon.length < 3) {
        return { ok: false, reason: 'polygon' };
      }
    }
  }
  return { ok: true };
}

/** Mirrors Flutter opciones_menu tamanos/ajustes/grupos. */
function flutterOpcionesOk(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'missing' };
  if (Array.isArray(raw.tamanos)) {
    for (const s of raw.tamanos) {
      if (!s.id || !s.label || typeof s.precio !== 'number') return { ok: false, reason: 'tamano' };
    }
  }
  if (Array.isArray(raw.ajustes)) {
    for (const a of raw.ajustes) {
      if (!a.id || !a.label) return { ok: false, reason: 'ajuste' };
    }
  }
  if (raw.activadas === true && Array.isArray(raw.grupos)) {
    for (const g of raw.grupos) {
      if (!g.id || !g.nombre || !Array.isArray(g.opciones)) return { ok: false, reason: 'grupo' };
    }
  }
  return { ok: true };
}

async function main() {
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  const { url, admin } = previewAdmin();
  const { data: c } = await admin
    .from('comercios')
    .select('id,nombre,horarios,branding_ia,permite_delivery')
    .eq('id', state.comercioId)
    .maybeSingle();
  const { data: products } = await admin
    .from('productos')
    .select('id,nombre,opciones_menu,precio,disponible')
    .eq('comercio_id', state.comercioId)
    .not('opciones_menu', 'is', null)
    .limit(5);
  const { data: pays } = await admin
    .from('metodos_pago')
    .select('id,nombre,tipo,detalles')
    .eq('comercio_id', state.comercioId);
  const { data: invites } = await admin
    .from('comercio_member_invites')
    .select('id,email,role,status')
    .eq('comercio_id', state.comercioId)
    .limit(5);
  const { data: rules } = await admin
    .from('upsell_rules')
    .select('id,name,enabled,trigger_type,surface')
    .eq('comercio_id', state.comercioId)
    .limit(5);

  const delivery = c?.branding_ia?.config_negocio?.delivery_config;
  const checks = {
    horariosFlutterDays: Boolean(c?.horarios?.days?.monday),
    delivery: flutterDeliveryOk(delivery),
    opciones: flutterOpcionesOk(products?.[0]?.opciones_menu),
    paymentTipo:
      (pays || []).length === 0 ||
      (pays || []).some((p) =>
        /^(efectivo|transferencia)__[a-z0-9_]+$/i.test(String(p.tipo || '')),
      ),
    invitesTable: Array.isArray(invites),
    upsellRulesTable: Array.isArray(rules),
  };

  const flutterBin = spawnSync('flutter', ['--version'], { encoding: 'utf8', shell: true });
  const dartBin = spawnSync('dart', ['--version'], { encoding: 'utf8', shell: true });

  const report = {
    at: new Date().toISOString(),
    previewUrl: url.replace(/https?:\/\//, '').split('.')[0],
    comercioId: state.comercioId,
    checks,
    flutterCli: {
      available: flutterBin.status === 0,
      version: (flutterBin.stdout || flutterBin.stderr || '').split('\n')[0] || null,
    },
    dartCli: {
      available: dartBin.status === 0,
      version: (dartBin.stdout || dartBin.stderr || '').split('\n')[0] || null,
    },
    note:
      'Compilación Flutter aislada: flutter run --dart-define=SUPABASE_URL=<preview> --dart-define=SUPABASE_ANON_KEY=<preview_anon> (no ejecutada contra prod). Contrato de columnas/JSON verificado aquí.',
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(
    OUT_DIR,
    `qa-flutter-preview-contract-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out, checks }, null, 2));
  const fail =
    !checks.horariosFlutterDays ||
    !checks.delivery.ok ||
    !checks.opciones.ok ||
    !checks.paymentTipo;
  if (fail) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
