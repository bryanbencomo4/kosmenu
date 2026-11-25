/**
 * Acceptance E2E against the REAL assistant UI surfaces on Preview.
 *
 * 1) Next `/asistente-negocio` (DOM) — full op matrix with confirm/cancel
 * 2) Persistence verify via Preview service role (Flutter-readable shapes)
 * 3) Safety: ambiguous ask, cancel without write, decoy isolation
 *
 * Flutter web at :5000 is driven separately via browser tooling (canvas).
 * Never writes production / Trueno real.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  assertAuditWriteTargetAllowed,
  isProductionSupabaseUrl,
} from './_lib/audit-prod-write-gate.mjs';

const BASE = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3024';
const ROOT = join(process.cwd(), '..');
const STATE_PATH = join(ROOT, 'docs', 'audit', 'qa-isolated-state.json');
const OUT_DIR = join(ROOT, 'docs', 'audit');
const QA_EMAIL = 'qa-chatbot-2026-trueno@elmenuxfa.test';
const QA_PASSWORD = 'QaChatbot2026!Safe';
const TRUENO = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';

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
    )
      v = v.slice(1, -1);
    into[t.slice(0, i).trim()] = v;
  }
  return into;
}

function preview() {
  const local = loadEnv(join(ROOT, '.env.preview.local'));
  const keys = loadEnv(join(ROOT, '.env.preview.keys'));
  const url = local.NEXT_PUBLIC_SUPABASE_URL || '';
  const anon =
    keys.SUPABASE_ANON_KEY || keys.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const service = keys.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !service || !anon) throw new Error('missing_preview');
  if (isProductionSupabaseUrl(url)) throw new Error('prod_blocked');
  assertAuditWriteTargetAllowed(url);
  return {
    url,
    admin: createClient(url, service, { auth: { persistSession: false } }),
    anonClient: createClient(url, anon, { auth: { persistSession: false } }),
  };
}

async function mint(anonClient) {
  const { data, error } = await anonClient.auth.signInWithPassword({
    email: QA_EMAIL,
    password: QA_PASSWORD,
  });
  if (error) throw new Error(error.message);
  return data.session.access_token;
}

async function uiPost(token, body) {
  // Same contract the Flutter BusinessAssistantScreen / Next view use.
  const res = await fetch(`${BASE}/api/asistente-negocio`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:5000',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function turn(token, history, text, comercioId) {
  const next = [...history, { role: 'user', text }];
  const { status, json } = await uiPost(token, {
    messages: next.map((m) => ({ role: m.role, text: m.text })),
    comercioId,
  });
  return {
    status,
    user: text,
    assistant: String(json.text || ''),
    proposal: json.proposal || null,
    ok: status < 500,
  };
}

async function confirm(token, proposal, action, comercioId) {
  const { status, json } = await uiPost(token, {
    confirmToken: proposal.confirmToken,
    confirmAction: action,
    comercioId,
  });
  return { status, text: String(json.text || ''), ok: status < 500 };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  if (state.comercioId === TRUENO) throw new Error('refused_trueno');
  const { admin, anonClient, url } = preview();
  await admin.from('comercios').update({ en_linea: false }).eq('id', state.comercioId);

  // Health: Next UI page + API
  const page = await fetch(`${BASE}/asistente-negocio`).catch(() => null);
  const flutter = await fetch('http://127.0.0.1:5000/asistente').catch(() => null);

  const token = await mint(anonClient);
  let history = [];
  const evidence = {
    at: new Date().toISOString(),
    previewHost: new URL(url).host,
    comercioId: state.comercioId,
    surfaces: {
      nextAssistantPage: page?.status || null,
      flutterWeb: flutter?.status || null,
      flutterUrl: 'http://127.0.0.1:5000/asistente',
      nextUrl: `${BASE}/asistente-negocio`,
    },
    ops: [],
    safety: {},
    flutterReadable: {},
  };

  const { data: products } = await admin
    .from('productos')
    .select('id,nombre,precio,disponible,opciones_menu,imagen_url')
    .eq('comercio_id', state.comercioId)
    .order('nombre')
    .limit(30);
  const target =
    (products || []).find((p) => /campesina|hamburguesa/i.test(p.nombre)) ||
    products?.[0];
  if (!target) throw new Error('no_product');

  async function runOp(name, userText, verify) {
    await sleep(400); // soften rate limit
    const t = await turn(token, history, userText, state.comercioId);
    history.push({ role: 'user', text: t.user }, { role: 'assistant', text: t.assistant });
    const row = {
      name,
      userText,
      proposed: Boolean(t.proposal?.confirmToken),
      assistant: t.assistant.slice(0, 220),
    };
    if (!t.proposal?.confirmToken) {
      row.result = 'no_proposal';
      evidence.ops.push(row);
      return row;
    }
    const applied = await confirm(token, t.proposal, 'apply', state.comercioId);
    row.applyText = applied.text.slice(0, 220);
    row.db = await verify();
    row.approved = row.db?.persisted === true;
    // Never mark approved if assistant claimed save but DB false
    if (/guardado|actualiz|cread|sincroniz|activ|invitaci/i.test(applied.text) && !row.approved) {
      row.falseConfirm = true;
    }
    evidence.ops.push(row);
    return row;
  }

  // --- SAFETY: cancel must not persist ---
  {
    const priceProbe = Math.round((Number(target.precio) + 7.77) * 100) / 100;
    const t = await turn(
      token,
      history,
      `Cambia el precio de ${target.nombre} a ${priceProbe}`,
      state.comercioId,
    );
    history.push({ role: 'user', text: t.user }, { role: 'assistant', text: t.assistant });
    if (t.proposal?.confirmToken) {
      await confirm(token, t.proposal, 'cancel', state.comercioId);
      const { data: after } = await admin
        .from('productos')
        .select('precio')
        .eq('id', target.id)
        .maybeSingle();
      evidence.safety.cancelNoWrite = {
        proposed: true,
        cancelled: true,
        precioUnchanged: Number(after?.precio) === Number(target.precio),
        persistedFalsely: Number(after?.precio) === priceProbe,
      };
    } else {
      evidence.safety.cancelNoWrite = { proposed: false, assistant: t.assistant.slice(0, 160) };
    }
  }

  // --- SAFETY: ambiguous ---
  {
    const t = await turn(token, history, 'Cámbiale el precio', state.comercioId);
    history.push({ role: 'user', text: t.user }, { role: 'assistant', text: t.assistant });
    evidence.safety.ambiguousClarifies = {
      proposed: Boolean(t.proposal?.confirmToken),
      asksClarification:
        !t.proposal?.confirmToken &&
        /(cuál|cual|dime|especifica|producto|exacto|\?)/i.test(t.assistant),
      assistant: t.assistant.slice(0, 200),
    };
  }

  // --- OPS MATRIX ---
  await runOp('set_price', `Cambia el precio de ${target.nombre} a ${Number(target.precio) + 1}`, async () => {
    const { data } = await admin.from('productos').select('precio').eq('id', target.id).maybeSingle();
    return { persisted: Number(data?.precio) === Number(target.precio) + 1, precio: data?.precio };
  });

  await runOp('set_availability_off', `Marca como agotada ${target.nombre}`, async () => {
    const { data } = await admin.from('productos').select('disponible').eq('id', target.id).maybeSingle();
    return { persisted: data?.disponible === false };
  });

  await runOp('set_availability_on', `Activa ${target.nombre}`, async () => {
    const { data } = await admin.from('productos').select('disponible').eq('id', target.id).maybeSingle();
    return { persisted: data?.disponible === true };
  });

  await runOp(
    'set_product_options',
    `Configura tamaños: Personal 8, Familiar 15 en ${target.nombre}`,
    async () => {
      const { data } = await admin
        .from('productos')
        .select('opciones_menu')
        .eq('id', target.id)
        .maybeSingle();
      const tams = data?.opciones_menu?.tamanos;
      return {
        persisted: Array.isArray(tams) && tams.length >= 2,
        flutterShape: Boolean(tams?.[0]?.id && tams?.[0]?.label != null),
      };
    },
  );

  const catName = `QA Cat ${randomBytes(2).toString('hex')}`;
  await runOp('create_category', `Crea categoría ${catName}`, async () => {
    const { data } = await admin
      .from('categorias')
      .select('id,nombre')
      .eq('comercio_id', state.comercioId)
      .ilike('nombre', catName)
      .maybeSingle();
    return { persisted: Boolean(data?.id), id: data?.id };
  });

  await runOp('create_product', `Crea producto QA Plato ${randomBytes(2).toString('hex')} a 4.5`, async () => {
    const { data } = await admin
      .from('productos')
      .select('id,nombre,precio')
      .eq('comercio_id', state.comercioId)
      .ilike('nombre', 'QA Plato%')
      .order('nombre')
      .limit(1);
    return { persisted: Boolean(data?.[0]?.id), product: data?.[0] || null };
  });

  await runOp('set_hours', 'Cambia el horario a Lun-Vie 10:00-20:00', async () => {
    const { data } = await admin.from('comercios').select('horarios').eq('id', state.comercioId).maybeSingle();
    const mon = data?.horarios?.days?.monday;
    return {
      persisted:
        mon?.open === true &&
        mon?.ranges?.[0]?.start === '10:00' &&
        mon?.ranges?.[0]?.end === '20:00',
      flutterDays: Boolean(data?.horarios?.days),
    };
  });

  await runOp('set_en_linea_on', 'Abre el negocio', async () => {
    const { data } = await admin.from('comercios').select('en_linea').eq('id', state.comercioId).maybeSingle();
    return { persisted: data?.en_linea === true };
  });

  await runOp('set_en_linea_off', 'Cierra el negocio', async () => {
    const { data } = await admin.from('comercios').select('en_linea').eq('id', state.comercioId).maybeSingle();
    return { persisted: data?.en_linea === false };
  });

  await runOp('set_delivery_zones', 'Activa delivery con zonas tarifa 2.5', async () => {
    const { data } = await admin
      .from('comercios')
      .select('permite_delivery,branding_ia')
      .eq('id', state.comercioId)
      .maybeSingle();
    const cfg = data?.branding_ia?.config_negocio?.delivery_config;
    return {
      persisted: data?.permite_delivery === true && cfg?.pricing_type === 'zones' && (cfg?.zones?.length || 0) >= 1,
      pricing_type: cfg?.pricing_type,
      zones: cfg?.zones?.length || 0,
    };
  });

  await runOp('set_delivery_polygons', 'Configura polígonos de delivery tarifa 3', async () => {
    const { data } = await admin.from('comercios').select('branding_ia').eq('id', state.comercioId).maybeSingle();
    const cfg = data?.branding_ia?.config_negocio?.delivery_config;
    return {
      persisted:
        cfg?.pricing_type === 'area_zones' &&
        Array.isArray(cfg?.area_zones) &&
        (cfg.area_zones[0]?.polygon?.length || 0) >= 3,
      areas: cfg?.area_zones?.length || 0,
    };
  });

  await runOp('sync_payment', 'Agrega zelle pagos-qa@elmenuxfa.test', async () => {
    const { data } = await admin
      .from('metodos_pago')
      .select('id,nombre,tipo,detalles')
      .eq('comercio_id', state.comercioId);
    const hit = (data || []).find(
      (m) => /zelle/i.test(String(m.nombre)) || /zelle/i.test(String(m.detalles || '')),
    );
    return {
      persisted: Boolean(hit),
      flutterTipo: /^transferencia__[a-z]+__\d+$/i.test(String(hit?.tipo || '')),
      tipo: hit?.tipo || null,
    };
  });

  await runOp('set_tasa', 'Pon la tasa de cambio en 42.5', async () => {
    const { data } = await admin
      .from('comercios')
      .select('exchange_rate_value,tasa_cambio_pesos,exchange_rate_mode')
      .eq('id', state.comercioId)
      .maybeSingle();
    const v = Number(data?.exchange_rate_value ?? data?.tasa_cambio_pesos);
    return { persisted: v === 42.5 || v === 42.5, value: v, mode: data?.exchange_rate_mode };
  });

  const promoName = `QA Acc ${randomBytes(2).toString('hex')}`;
  await runOp('create_promo', `Crea promoción ${promoName}`, async () => {
    const { data } = await admin
      .from('upsell_rules')
      .select('id,name,enabled')
      .eq('comercio_id', state.comercioId)
      .ilike('name', `%${promoName}%`)
      .limit(1);
    return { persisted: Boolean(data?.[0]?.id), rule: data?.[0] || null };
  });

  const staffEmail = `qa-acc-${randomBytes(2).toString('hex')}@elmenuxfa.test`;
  await runOp('invite_staff', `Invita ${staffEmail} como caja`, async () => {
    const { data } = await admin
      .from('comercio_member_invites')
      .select('id,email,status,role')
      .eq('comercio_id', state.comercioId)
      .ilike('email', staffEmail)
      .maybeSingle();
    return { persisted: data?.status === 'pending', invite: data || null };
  });

  await runOp('revoke_staff', `Revoca acceso de ${staffEmail}`, async () => {
    const { data } = await admin
      .from('comercio_member_invites')
      .select('id,status')
      .eq('comercio_id', state.comercioId)
      .ilike('email', staffEmail)
      .maybeSingle();
    return { persisted: data?.status === 'revoked', status: data?.status };
  });

  // Isolation decoy
  if (state.decoyId && state.decoyProdId) {
    const { data: before } = await admin
      .from('productos')
      .select('precio')
      .eq('id', state.decoyProdId)
      .maybeSingle();
    const t = await turn(
      token,
      history,
      'Cambia el precio de Decoy a 1',
      state.comercioId,
    );
    history.push({ role: 'user', text: t.user }, { role: 'assistant', text: t.assistant });
    if (t.proposal?.confirmToken) {
      await confirm(token, t.proposal, 'cancel', state.comercioId);
    }
    const { data: after } = await admin
      .from('productos')
      .select('precio')
      .eq('id', state.decoyProdId)
      .maybeSingle();
    evidence.safety.isolation = {
      decoyUnchanged: String(before?.precio) === String(after?.precio),
      proposalOnDecoy: Boolean(t.proposal?.confirmToken),
      assistant: t.assistant.slice(0, 180),
      safe: !t.proposal?.confirmToken && String(before?.precio) === String(after?.precio),
    };
  }

  // Flutter-readable aggregate
  const live = await admin
    .from('comercios')
    .select('horarios,branding_ia,permite_delivery,exchange_rate_value,en_linea')
    .eq('id', state.comercioId)
    .maybeSingle();
  const { data: prodLive } = await admin
    .from('productos')
    .select('opciones_menu,precio,disponible')
    .eq('id', target.id)
    .maybeSingle();
  evidence.flutterReadable = {
    horariosDays: Boolean(live.data?.horarios?.days),
    deliveryConfig: Boolean(live.data?.branding_ia?.config_negocio?.delivery_config),
    opcionesMenu: Boolean(prodLive?.opciones_menu?.tamanos?.length),
    en_linea: live.data?.en_linea,
  };

  const approved = evidence.ops.filter((o) => o.approved === true).map((o) => o.name);
  const failed = evidence.ops.filter((o) => o.approved !== true).map((o) => ({
    name: o.name,
    reason: o.result || o.db || o.assistant?.slice(0, 120),
    falseConfirm: o.falseConfirm || false,
  }));

  evidence.summary = {
    approvedCount: approved.length,
    failedCount: failed.length,
    approved,
    failed,
    cancelSafe: evidence.safety.cancelNoWrite?.precioUnchanged === true,
    ambiguousOk: evidence.safety.ambiguousClarifies?.asksClarification === true,
    isolationOk: evidence.safety.isolation?.safe !== false,
    falseConfirms: evidence.ops.filter((o) => o.falseConfirm).length,
  };

  // GO if core matrix mostly green, no false confirms, cancel/isolation safe
  const coreNeed = [
    'set_price',
    'set_availability_off',
    'set_availability_on',
    'set_hours',
    'set_en_linea_off',
    'sync_payment',
    'create_promo',
    'invite_staff',
    'revoke_staff',
    'set_product_options',
    'set_delivery_zones',
  ];
  const coreOk = coreNeed.every((n) => approved.includes(n));
  evidence.verdict = {
    go:
      coreOk &&
      evidence.summary.cancelSafe &&
      evidence.summary.falseConfirms === 0 &&
      evidence.summary.isolationOk,
    note: coreOk
      ? 'Core ops persisted on Preview with Flutter-readable shapes'
      : 'Core ops incomplete — see failed list',
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(
    OUT_DIR,
    `qa-acceptance-ui-e2e-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        out,
        surfaces: evidence.surfaces,
        summary: evidence.summary,
        verdict: evidence.verdict,
      },
      null,
      2,
    ),
  );
  if (!evidence.verdict.go) process.exitCode = 2;
}

main().catch((e) => {
  console.error('FAIL', e instanceof Error ? e.message : e);
  process.exit(1);
});
