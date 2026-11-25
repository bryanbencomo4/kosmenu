/**
 * QA Final Acceptance — snapshot + Flutter-contract persistence checks.
 * Preview only. Never touches production / Trueno real.
 *
 * Modes:
 *   snapshot  — dump QA commerce rows to docs/audit/qa-acceptance-snapshot.json
 *   restore   — restore from snapshot
 *   verify    — read current QA state for evidence after UI E2E
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertAuditWriteTargetAllowed,
  isProductionSupabaseUrl,
} from './_lib/audit-prod-write-gate.mjs';

const ROOT = join(process.cwd(), '..');
const STATE_PATH = join(ROOT, 'docs', 'audit', 'qa-isolated-state.json');
const SNAP_PATH = join(ROOT, 'docs', 'audit', 'qa-acceptance-snapshot.json');
const OUT_DIR = join(ROOT, 'docs', 'audit');
const PROD_REF = 'qqhberaayhohxlbbhdyi';
const TRUENO_ID = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';

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

function previewAdmin() {
  const local = loadEnv(join(ROOT, '.env.preview.local'));
  const keys = loadEnv(join(ROOT, '.env.preview.keys'));
  const url = local.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = keys.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) throw new Error('missing_preview_credentials');
  if (isProductionSupabaseUrl(url) || url.includes(PROD_REF)) {
    throw new Error('refused_production');
  }
  assertAuditWriteTargetAllowed(url);
  return {
    url,
    admin: createClient(url, serviceKey, { auth: { persistSession: false } }),
  };
}

function loadState() {
  if (!existsSync(STATE_PATH)) throw new Error('missing_qa_state_run_setup');
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}

async function dumpCommerce(admin, comercioId) {
  if (comercioId === TRUENO_ID) throw new Error('refused_trueno_real');
  const tables = {
    comercios: await admin
      .from('comercios')
      .select(
        'id,nombre,slug,en_linea,horarios,branding_ia,permite_delivery,exchange_rate_value,exchange_rate_mode,tasa_cambio_pesos,owner_id,moneda',
      )
      .eq('id', comercioId)
      .maybeSingle(),
    productos: await admin
      .from('productos')
      .select(
        'id,nombre,precio,disponible,categoria_id,descripcion,opciones_menu,imagen_url,upsell_badge,orden',
      )
      .eq('comercio_id', comercioId),
    categorias: await admin
      .from('categorias')
      .select('id,nombre,orden')
      .eq('comercio_id', comercioId),
    metodos_pago: await admin
      .from('metodos_pago')
      .select('id,nombre,tipo,descripcion,detalles')
      .eq('comercio_id', comercioId),
    upsell_rules: await admin
      .from('upsell_rules')
      .select('id,name,enabled,trigger_type,surface,priority')
      .eq('comercio_id', comercioId),
    upsell_settings: await admin
      .from('upsell_settings')
      .select('*')
      .eq('comercio_id', comercioId)
      .maybeSingle(),
    invites: await admin
      .from('comercio_member_invites')
      .select('id,email,role,status,token,invited_by')
      .eq('comercio_id', comercioId),
    members: await admin
      .from('comercio_members')
      .select('id,user_id,role,status')
      .eq('comercio_id', comercioId),
  };
  for (const [k, v] of Object.entries(tables)) {
    if (v.error) throw new Error(`${k}:${v.error.message}`);
  }
  return {
    at: new Date().toISOString(),
    comercioId,
    comercios: tables.comercios.data,
    productos: tables.productos.data || [],
    categorias: tables.categorias.data || [],
    metodos_pago: tables.metodos_pago.data || [],
    upsell_rules: tables.upsell_rules.data || [],
    upsell_settings: tables.upsell_settings.data,
    invites: tables.invites.data || [],
    members: tables.members.data || [],
  };
}

async function snapshot() {
  const state = loadState();
  const { admin, url } = previewAdmin();
  if (!String(state.comercioId || '').startsWith('') || !state.comercioId) {
    throw new Error('bad_state');
  }
  if (state.comercioId === TRUENO_ID) throw new Error('refused_trueno');
  const snap = await dumpCommerce(admin, state.comercioId);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(SNAP_PATH, JSON.stringify(snap, null, 2));
  console.log(
    JSON.stringify({
      ok: true,
      mode: 'snapshot',
      path: SNAP_PATH,
      previewHost: new URL(url).host,
      products: snap.productos.length,
      categories: snap.categorias.length,
      payments: snap.metodos_pago.length,
      promos: snap.upsell_rules.length,
      invites: snap.invites.length,
    }),
  );
}

async function restore() {
  if (!existsSync(SNAP_PATH)) throw new Error('missing_snapshot');
  const snap = JSON.parse(readFileSync(SNAP_PATH, 'utf8'));
  const { admin, url } = previewAdmin();
  const cid = snap.comercioId;
  if (cid === TRUENO_ID) throw new Error('refused_trueno');
  assertAuditWriteTargetAllowed(url);

  // Restore commerce row
  if (snap.comercios) {
    const { id, ...rest } = snap.comercios;
    await admin.from('comercios').update(rest).eq('id', cid);
  }

  // Replace products by id upsert + delete extras created during QA
  const snapProdIds = new Set((snap.productos || []).map((p) => p.id));
  const { data: liveProds } = await admin
    .from('productos')
    .select('id')
    .eq('comercio_id', cid);
  for (const p of liveProds || []) {
    if (!snapProdIds.has(p.id)) {
      await admin.from('productos').delete().eq('id', p.id).eq('comercio_id', cid);
    }
  }
  for (const p of snap.productos || []) {
    await admin.from('productos').upsert({ ...p, comercio_id: cid });
  }

  const snapCatIds = new Set((snap.categorias || []).map((c) => c.id));
  const { data: liveCats } = await admin
    .from('categorias')
    .select('id')
    .eq('comercio_id', cid);
  for (const c of liveCats || []) {
    if (!snapCatIds.has(c.id)) {
      await admin.from('categorias').delete().eq('id', c.id).eq('comercio_id', cid);
    }
  }
  for (const c of snap.categorias || []) {
    await admin.from('categorias').upsert({ ...c, comercio_id: cid });
  }

  // Payments: wipe managed then restore
  await admin.from('metodos_pago').delete().eq('comercio_id', cid);
  if ((snap.metodos_pago || []).length) {
    await admin
      .from('metodos_pago')
      .insert(snap.metodos_pago.map((m) => ({ ...m, comercio_id: cid })));
  }

  // Promos
  await admin.from('upsell_rules').delete().eq('comercio_id', cid);
  if ((snap.upsell_rules || []).length) {
    await admin
      .from('upsell_rules')
      .insert(snap.upsell_rules.map((r) => ({ ...r, comercio_id: cid })));
  }
  if (snap.upsell_settings) {
    await admin.from('upsell_settings').upsert(snap.upsell_settings);
  }

  // Invites
  await admin.from('comercio_member_invites').delete().eq('comercio_id', cid);
  if ((snap.invites || []).length) {
    await admin.from('comercio_member_invites').insert(
      snap.invites.map((i) => ({
        ...i,
        comercio_id: cid,
      })),
    );
  }

  await admin.from('comercios').update({ en_linea: false }).eq('id', cid);

  console.log(
    JSON.stringify({
      ok: true,
      mode: 'restore',
      comercioId: cid,
      previewHost: new URL(url).host,
    }),
  );
}

async function verify() {
  const state = loadState();
  const { admin, url } = previewAdmin();
  const live = await dumpCommerce(admin, state.comercioId);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = join(OUT_DIR, `qa-acceptance-verify-${stamp}.json`);
  writeFileSync(out, JSON.stringify({ urlHost: new URL(url).host, live }, null, 2));
  console.log(
    JSON.stringify({
      ok: true,
      mode: 'verify',
      out,
      en_linea: live.comercios?.en_linea,
      products: live.productos.length,
      payments: live.metodos_pago.length,
      promos: live.upsell_rules.length,
      invites: live.invites.filter((i) => i.status === 'pending').length,
      hasDeliveryConfig: Boolean(
        live.comercios?.branding_ia?.config_negocio?.delivery_config,
      ),
      hasHorariosDays: Boolean(live.comercios?.horarios?.days),
      sampleOpciones: live.productos.find((p) => p.opciones_menu)?.nombre || null,
    }),
  );
}

const mode = process.argv[2] || 'verify';
const run = { snapshot, restore, verify }[mode];
if (!run) {
  console.error('usage: snapshot|restore|verify');
  process.exit(1);
}
run().catch((e) => {
  console.error('FAIL', e instanceof Error ? e.message : e);
  process.exit(1);
});
