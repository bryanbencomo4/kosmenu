/**
 * Isolated QA write suite for business admin assistant.
 *
 * Modes:
 *   setup   — clone Trueno → QA commerce on Preview Supabase (never prod)
 *   test    — exercise 4 AllowedOps via /api/asistente-negocio + DB verify
 *   cleanup — delete only QA_CHATBOT_2026 artifacts
 *   all     — setup → test → cleanup
 *
 * Hard-blocks production Supabase writes via audit-prod-write-gate.
 */
import { createClient } from '@supabase/supabase-js';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import {
  assertAuditWriteTargetAllowed,
  AUDIT_PREVIEW_SUPABASE_REF,
  isProductionSupabaseUrl,
} from './_lib/audit-prod-write-gate.mjs';

const SOURCE_TRUENO_ID = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const QA_PREFIX = 'QA_CHATBOT_2026';
const QA_SLUG = 'qa-chatbot-2026-trueno';
const QA_EMAIL = 'qa-chatbot-2026-trueno@elmenuxfa.test';
const QA_PASSWORD = 'QaChatbot2026!Safe';
const BASE = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3024';
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

function previewClients() {
  const previewLocal = loadEnv(join(process.cwd(), '..', '.env.preview.local'));
  const previewKeys = loadEnv(join(process.cwd(), '..', '.env.preview.keys'));
  const url = previewLocal.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = previewKeys.SUPABASE_SERVICE_ROLE_KEY || '';
  const anon =
    previewKeys.SUPABASE_ANON_KEY ||
    previewKeys.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  if (!url || !serviceKey) throw new Error('missing_preview_credentials');
  if (isProductionSupabaseUrl(url)) throw new Error('preview_url_is_production');
  const ref = assertAuditWriteTargetAllowed(url);
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = anon
    ? createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
  return { url, ref, admin, anonClient, anon };
}

/** Read-only client against production — NEVER used for writes. */
function prodReadOnlyClient() {
  const siteLocal = loadEnv(join(process.cwd(), '.env.local'));
  const url = siteLocal.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = siteLocal.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) throw new Error('missing_prod_readonly_credentials');
  if (!isProductionSupabaseUrl(url)) {
    throw new Error('expected_production_url_for_readonly_source');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function writeQaEnv({ url, anon, serviceKey }) {
  const siteLocal = loadEnv(join(process.cwd(), '.env.local'));
  const lines = [];
  // Carry non-supabase flags from local, but FORCE preview DB + safety caps.
  for (const [k, v] of Object.entries(siteLocal)) {
    if (/SUPABASE|WASENDER|RESEND|CHATBOT_ALLOWED|VERCEL_ENV/i.test(k)) continue;
    lines.push(`${k}=${v}`);
  }
  lines.push(`NEXT_PUBLIC_SUPABASE_URL=${url}`);
  lines.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`);
  lines.push(`SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`);
  lines.push('BUSINESS_ASSISTANT_ENABLED=1');
  lines.push('NEXT_PUBLIC_BUSINESS_ASSISTANT=1');
  lines.push('BUSINESS_ASSISTANT_GEMINI=0');
  lines.push('CHATBOT_SIMULATE_GEMINI=1');
  lines.push('CHATBOT_STAGING_MODE=0'); // we NEED writes for admin assistant QA
  lines.push('CHATBOT_BLOCK_ORDERS=1');
  lines.push('CHATBOT_LIVE_HARD_CAPS=1');
  lines.push('CHATBOT_LIVE_MAX_GEMINI_CALLS=0');
  lines.push('CHATBOT_LIVE_MAX_COST_USD=0');
  lines.push(`CHATBOT_ALLOWED_COMMERCE_IDS=`); // empty ok for business assistant
  lines.push('VERCEL_ENV=');
  lines.push('# QA isolated — Preview Supabase only');
  const dest = join(process.cwd(), '.env.qa-isolated.local');
  writeFileSync(dest, lines.join('\n') + '\n', 'utf8');
  return dest;
}

function saveState(state) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function loadState() {
  if (!existsSync(STATE_PATH)) return null;
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}

async function ensureQaUser(admin) {
  // Try list users by email via generateLink / createUser
  const { data: created, error } = await admin.auth.admin.createUser({
    email: QA_EMAIL,
    password: QA_PASSWORD,
    email_confirm: true,
    user_metadata: { qa: QA_PREFIX, purpose: 'business_assistant_audit' },
  });
  if (!error && created?.user?.id) return created.user.id;
  if (error && !/already|registered|exists/i.test(error.message)) {
    throw new Error(`createUser:${error.message}`);
  }
  // Lookup via magic link generate (works even if exists)
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: QA_EMAIL,
  });
  if (linkErr) throw new Error(`lookupUser:${linkErr.message}`);
  const uid = link?.user?.id;
  if (!uid) throw new Error('qa_user_id_missing');
  // Ensure password works for password grant
  await admin.auth.admin.updateUserById(uid, {
    password: QA_PASSWORD,
    email_confirm: true,
  });
  return uid;
}

async function setup() {
  const { url, ref, admin, anon } = previewClients();
  const envPath = writeQaEnv({
    url,
    anon,
    serviceKey: loadEnv(join(process.cwd(), '..', '.env.preview.keys'))
      .SUPABASE_SERVICE_ROLE_KEY,
  });

  const ownerId = await ensureQaUser(admin);

  // Remove prior QA commerce with same slug if leftover
  const { data: existing } = await admin
    .from('comercios')
    .select('id')
    .eq('slug', QA_SLUG)
    .maybeSingle();
  if (existing?.id) {
    await wipeCommerce(admin, existing.id);
  }

  // Source catalog: production READ-ONLY. Destination writes: Preview only.
  const prodRo = prodReadOnlyClient();
  const { data: src, error: srcErr } = await prodRo
    .from('comercios')
    .select('nombre,moneda,tasa_cambio_pesos,horarios,whatsapp,telefonos')
    .eq('id', SOURCE_TRUENO_ID)
    .maybeSingle();
  if (srcErr) throw new Error(`src_commerce:${srcErr.message}`);

  const comercioId = randomUUID();
  const horarios = {
    note: `${QA_PREFIX} Lun-Vie 10:00-22:00`,
    timezone: 'America/Caracas',
    updatedVia: 'qa_isolated_audit',
    updatedAt: new Date().toISOString(),
  };

  const insertRow = {
    id: comercioId,
    nombre: `${QA_PREFIX} pizzas el trueno`,
    slug: QA_SLUG,
    owner_id: ownerId,
    en_linea: false,
    moneda: src?.moneda || 'USD',
    tasa_cambio_pesos: src?.tasa_cambio_pesos ?? null,
    horarios,
    whatsapp: null,
    telefonos: null,
    billing_exempt: true,
  };

  const { error: insErr } = await admin.from('comercios').insert(insertRow);
  if (insErr) throw new Error(`insert_comercio:${insErr.message}`);

  const { data: cats } = await prodRo
    .from('categorias')
    .select('id,nombre,orden')
    .eq('comercio_id', SOURCE_TRUENO_ID)
    .order('orden', { ascending: true })
    .limit(40);
  const catMap = new Map();
  for (const c of cats || []) {
    const newId = randomUUID();
    catMap.set(String(c.id), newId);
    const row = {
      id: newId,
      comercio_id: comercioId,
      nombre: String(c.nombre || 'Categoria'),
    };
    // orden may be missing on preview schema
    if (c.orden != null) row.orden = c.orden;
    let { error } = await admin.from('categorias').insert(row);
    if (error && /orden/i.test(error.message)) {
      delete row.orden;
      ({ error } = await admin.from('categorias').insert(row));
    }
    if (error) throw new Error(`insert_cat:${error.message}`);
  }

  const { data: products } = await prodRo
    .from('productos')
    .select('nombre,descripcion,precio,disponible,categoria_id,imagen_url')
    .eq('comercio_id', SOURCE_TRUENO_ID)
    .order('nombre')
    .limit(40);
  const productIds = [];
  for (const p of products || []) {
    const id = randomUUID();
    productIds.push(id);
    const row = {
      id,
      comercio_id: comercioId,
      nombre: p.nombre,
      descripcion: p.descripcion ?? null,
      precio: p.precio,
      disponible: p.disponible !== false,
      categoria_id: p.categoria_id ? catMap.get(String(p.categoria_id)) || null : null,
    };
    if (p.imagen_url) row.imagen_url = p.imagen_url;
    let { error } = await admin.from('productos').insert(row);
    if (error && /imagen_url/i.test(error.message)) {
      delete row.imagen_url;
      ({ error } = await admin.from('productos').insert(row));
    }
    if (error) throw new Error(`insert_prod:${error.message}`);
  }

  // Synthetic marked product for create/delete probes (assistant cannot create yet — seed one)
  const qaProdId = randomUUID();
  await admin.from('productos').insert({
    id: qaProdId,
    comercio_id: comercioId,
    nombre: `${QA_PREFIX} Hamburguesa`,
    descripcion: 'Producto sintético de auditoría',
    precio: 8,
    disponible: true,
    categoria_id: [...catMap.values()][0] || null,
  });
  productIds.push(qaProdId);

  // Isolation decoy commerce (same owner) — assistant must not mutate it when scoped to primary
  const decoyId = randomUUID();
  await admin.from('comercios').insert({
    id: decoyId,
    nombre: `${QA_PREFIX} decoy isolation`,
    slug: `${QA_SLUG}-decoy`,
    owner_id: ownerId,
    en_linea: false,
    moneda: 'USD',
    billing_exempt: true,
  });
  const decoyProdId = randomUUID();
  await admin.from('productos').insert({
    id: decoyProdId,
    comercio_id: decoyId,
    nombre: `${QA_PREFIX} Decoy Pizza`,
    precio: 99,
    disponible: true,
  });

  const state = {
    at: new Date().toISOString(),
    supabaseRef: ref,
    urlHost: new URL(url).host,
    envPath,
    ownerId,
    qaEmail: QA_EMAIL,
    comercioId,
    decoyId,
    decoyProdId,
    qaProdId,
    productIds,
    categoryIds: [...catMap.values()],
    en_linea: false,
  };
  saveState(state);
  console.log(
    JSON.stringify(
      {
        setup: 'ok',
        ref,
        comercioId,
        products: productIds.length,
        categories: catMap.size,
        envPath,
        en_linea: false,
      },
      null,
      2,
    ),
  );
  return state;
}

async function wipeCommerce(admin, comercioId) {
  const previewUrl = loadEnv(
    join(process.cwd(), '..', '.env.preview.local'),
  ).NEXT_PUBLIC_SUPABASE_URL;
  assertAuditWriteTargetAllowed(previewUrl);
  await admin.from('productos').delete().eq('comercio_id', comercioId);
  await admin.from('categorias').delete().eq('comercio_id', comercioId);
  await admin.from('pedidos').delete().eq('comercio_id', comercioId);
  await admin.from('comercio_members').delete().eq('comercio_id', comercioId);
  await admin.from('subscriptions').delete().eq('business_id', comercioId);
  await admin.from('comercios').delete().eq('id', comercioId);
}

async function mintPasswordJwt(anonClient) {
  const { data, error } = await anonClient.auth.signInWithPassword({
    email: QA_EMAIL,
    password: QA_PASSWORD,
  });
  if (error) throw new Error(`signin:${error.message}`);
  const token = data.session?.access_token;
  if (!token) throw new Error('no_access_token');
  const path = join(tmpdir(), `qa_isolated_jwt.txt`);
  writeFileSync(path, token, 'utf8');
  return { token, path, userId: data.user?.id };
}

async function apiPost(token, body) {
  const res = await fetch(`${BASE}/api/asistente-negocio`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function turn(token, history, text, comercioId) {
  const next = [...history, { role: 'user', text }];
  const { status, json } = await apiPost(token, {
    messages: next.map((m) => ({ role: m.role, text: m.text })),
    comercioId,
  });
  return {
    status,
    user: text,
    assistant: String(json.text || ''),
    proposal: json.proposal || null,
    menuView: Boolean(json.menuView?.categories?.length),
    ok: status < 500 && json.ok !== false,
  };
}

async function confirm(token, proposal, action, comercioId) {
  const { status, json } = await apiPost(token, {
    confirmToken: proposal.confirmToken,
    confirmAction: action,
    comercioId,
  });
  return { status, action, text: String(json.text || ''), ok: status < 500 };
}

async function testWrites() {
  const state = loadState();
  if (!state?.comercioId) throw new Error('run_setup_first');
  const { admin, anonClient, ref, url } = previewClients();
  assertAuditWriteTargetAllowed(url);
  if (!anonClient) throw new Error('anon_client_missing');

  const evidence = {
    at: new Date().toISOString(),
    ref,
    base: BASE,
    comercioId: state.comercioId,
    decoyId: state.decoyId,
    ops: [],
    isolation: null,
    missingTools: [],
    scoreHints: {},
  };

  // Safety: force en_linea false before writes
  await admin
    .from('comercios')
    .update({ en_linea: false })
    .eq('id', state.comercioId);
  const { data: commerce } = await admin
    .from('comercios')
    .select('id,nombre,en_linea,horarios,slug')
    .eq('id', state.comercioId)
    .maybeSingle();
  if (commerce?.en_linea !== false) {
    throw new Error('qa_commerce_not_offline');
  }

  const { token } = await mintPasswordJwt(anonClient);
  let history = [];

  // Pick Campesina or first product
  const { data: products } = await admin
    .from('productos')
    .select('id,nombre,precio,disponible')
    .eq('comercio_id', state.comercioId)
    .order('nombre');
  const target =
    (products || []).find((p) => /campesina/i.test(p.nombre)) ||
    (products || []).find((p) => !String(p.nombre).startsWith(QA_PREFIX)) ||
    products?.[0];
  if (!target) throw new Error('no_products');

  const originalPrice = Number(target.precio);
  const newPrice = Math.round((originalPrice + 1) * 100) / 100;

  // 1) PRICE
  {
    const t = await turn(
      token,
      history,
      `Cambia el precio de ${target.nombre} a ${newPrice}`,
      state.comercioId,
    );
    history.push({ role: 'user', text: t.user }, { role: 'assistant', text: t.assistant });
    const op = {
      name: 'set_price',
      propose: {
        hadProposal: Boolean(t.proposal?.confirmToken),
        assistant: t.assistant.slice(0, 400),
      },
    };
    if (t.proposal?.confirmToken) {
      const applied = await confirm(token, t.proposal, 'apply', state.comercioId);
      const { data: after } = await admin
        .from('productos')
        .select('id,precio')
        .eq('id', target.id)
        .maybeSingle();
      op.apply = applied;
      op.db = {
        before: originalPrice,
        after: after?.precio ?? null,
        persisted: Number(after?.precio) === newPrice,
      };
    } else {
      op.blocked = 'no_proposal';
    }
    evidence.ops.push(op);
  }

  // 2) AVAILABILITY — agotar then restore
  {
    const t = await turn(
      token,
      history,
      `Marca como agotada ${target.nombre}`,
      state.comercioId,
    );
    history.push({ role: 'user', text: t.user }, { role: 'assistant', text: t.assistant });
    const op = {
      name: 'set_availability_off',
      propose: { hadProposal: Boolean(t.proposal?.confirmToken) },
    };
    if (t.proposal?.confirmToken) {
      const applied = await confirm(token, t.proposal, 'apply', state.comercioId);
      const { data: after } = await admin
        .from('productos')
        .select('id,disponible')
        .eq('id', target.id)
        .maybeSingle();
      op.apply = applied;
      op.db = { disponible: after?.disponible, persisted: after?.disponible === false };
    }
    evidence.ops.push(op);

    const t2 = await turn(
      token,
      history,
      `Activa ${target.nombre}`, // must work with short synonym
      state.comercioId,
    );
    history.push({ role: 'user', text: t2.user }, { role: 'assistant', text: t2.assistant });
    const op2 = {
      name: 'set_availability_on',
      propose: { hadProposal: Boolean(t2.proposal?.confirmToken) },
    };
    if (t2.proposal?.confirmToken) {
      const applied = await confirm(token, t2.proposal, 'apply', state.comercioId);
      const { data: after } = await admin
        .from('productos')
        .select('id,disponible')
        .eq('id', target.id)
        .maybeSingle();
      op2.apply = applied;
      op2.db = { disponible: after?.disponible, persisted: after?.disponible === true };
    }
    evidence.ops.push(op2);
  }

  // 3) HOURS — structured Flutter-compatible schedule
  {
    const t = await turn(
      token,
      history,
      'Cambia el horario a Lun-Vie 11:00-21:00',
      state.comercioId,
    );
    history.push({ role: 'user', text: t.user }, { role: 'assistant', text: t.assistant });
    const op = {
      name: 'set_hours',
      propose: { hadProposal: Boolean(t.proposal?.confirmToken), assistant: t.assistant.slice(0, 300) },
    };
    if (t.proposal?.confirmToken) {
      const applied = await confirm(token, t.proposal, 'apply', state.comercioId);
      const { data: after } = await admin
        .from('comercios')
        .select('horarios')
        .eq('id', state.comercioId)
        .maybeSingle();
      const days = after?.horarios?.days || null;
      const mon = days?.monday;
      op.apply = applied;
      op.db = {
        summary: t.assistant.slice(0, 160),
        mondayOpen: mon?.open === true,
        mondayRange: mon?.ranges?.[0] || null,
        persisted:
          mon?.open === true &&
          mon?.ranges?.[0]?.start === '11:00' &&
          mon?.ranges?.[0]?.end === '21:00' &&
          days?.saturday?.open === false,
        flutterCompatible: Boolean(after?.horarios?.timezone && days?.monday),
      };
    }
    evidence.ops.push(op);
  }

  // 4) EN_LINEA open then close back to false
  {
    const t = await turn(token, history, 'Abre el negocio', state.comercioId);
    history.push({ role: 'user', text: t.user }, { role: 'assistant', text: t.assistant });
    const op = {
      name: 'set_en_linea_true',
      propose: { hadProposal: Boolean(t.proposal?.confirmToken) },
    };
    if (t.proposal?.confirmToken) {
      const applied = await confirm(token, t.proposal, 'apply', state.comercioId);
      const { data: after } = await admin
        .from('comercios')
        .select('en_linea')
        .eq('id', state.comercioId)
        .maybeSingle();
      op.apply = applied;
      op.db = { en_linea: after?.en_linea, persisted: after?.en_linea === true };
    }
    evidence.ops.push(op);

    const t2 = await turn(token, history, 'Cierra el negocio', state.comercioId);
    history.push({ role: 'user', text: t2.user }, { role: 'assistant', text: t2.assistant });
    const op2 = {
      name: 'set_en_linea_false',
      propose: { hadProposal: Boolean(t2.proposal?.confirmToken) },
    };
    if (t2.proposal?.confirmToken) {
      const applied = await confirm(token, t2.proposal, 'apply', state.comercioId);
      const { data: after } = await admin
        .from('comercios')
        .select('en_linea')
        .eq('id', state.comercioId)
        .maybeSingle();
      op2.apply = applied;
      op2.db = { en_linea: after?.en_linea, persisted: after?.en_linea === false };
    }
    evidence.ops.push(op2);
  }

  // Expansion writes (must persist)
  async function applyNamed(name, prompt, verify) {
    const t = await turn(token, history, prompt, state.comercioId);
    history.push({ role: 'user', text: t.user }, { role: 'assistant', text: t.assistant });
    const op = {
      name,
      propose: { hadProposal: Boolean(t.proposal?.confirmToken), assistant: t.assistant.slice(0, 240) },
    };
    if (t.proposal?.confirmToken) {
      const applied = await confirm(token, t.proposal, 'apply', state.comercioId);
      op.apply = applied;
      op.db = await verify();
    } else {
      op.blocked = 'no_proposal';
    }
    evidence.ops.push(op);
  }

  await applyNamed('create_category', 'crea una categoría Postres QA', async () => {
    const { data } = await admin
      .from('categorias')
      .select('id,nombre')
      .eq('comercio_id', state.comercioId)
      .ilike('nombre', '%Postres QA%')
      .maybeSingle();
    return { id: data?.id, persisted: Boolean(data?.id) };
  });

  await applyNamed(
    'create_product',
    'Agrégame una pizza margarita QA a 8 dólares',
    async () => {
      const { data } = await admin
        .from('productos')
        .select('id,nombre,precio')
        .eq('comercio_id', state.comercioId)
        .ilike('nombre', '%margarita QA%')
        .maybeSingle();
      return {
        id: data?.id,
        precio: data?.precio,
        persisted: Number(data?.precio) === 8,
      };
    },
  );

  await applyNamed('set_tasa', 'Cambia la tasa a 42.5', async () => {
    const { data } = await admin
      .from('comercios')
      .select('exchange_rate_value,tasa_cambio_pesos,exchange_rate_mode')
      .eq('id', state.comercioId)
      .maybeSingle();
    const v = Number(data?.exchange_rate_value ?? data?.tasa_cambio_pesos);
    return {
      value: v,
      mode: data?.exchange_rate_mode,
      persisted: v === 42.5 && data?.exchange_rate_mode === 'manual',
    };
  });

  await applyNamed('upsert_payment_method', 'agrega un método de pago Zelle de prueba', async () => {
    const { data } = await admin
      .from('metodos_pago')
      .select('id,nombre,tipo')
      .eq('comercio_id', state.comercioId)
      .ilike('nombre', '%Zelle%')
      .maybeSingle();
    return { id: data?.id, persisted: Boolean(data?.id) };
  });

  await applyNamed('set_delivery_config', 'cierra el delivery por ahora', async () => {
    const { data } = await admin
      .from('comercios')
      .select('permite_delivery,branding_ia')
      .eq('id', state.comercioId)
      .maybeSingle();
    const enabled =
      data?.branding_ia &&
      typeof data.branding_ia === 'object' &&
      data.branding_ia.config_negocio &&
      typeof data.branding_ia.config_negocio === 'object'
        ? data.branding_ia.config_negocio.delivery_config?.enabled
        : undefined;
    return {
      permite_delivery: data?.permite_delivery,
      enabled,
      persisted: data?.permite_delivery === false || enabled === false,
    };
  });

  await applyNamed('create_promo', 'crea una promoción 2x1', async () => {
    const { data } = await admin
      .from('upsell_rules')
      .select('id,name,enabled')
      .eq('comercio_id', state.comercioId)
      .ilike('name', '%2x1%')
      .maybeSingle();
    return { id: data?.id, persisted: Boolean(data?.id) };
  });

  // Seed order for status transition (Preview schema: no codigo_orden)
  {
    const orderId = randomUUID();
    const { error: ordErr } = await admin.from('pedidos').insert({
      id: orderId,
      comercio_id: state.comercioId,
      estado: 'pendiente',
      total: 10,
      nombre_cliente: `${QA_PREFIX} Cliente 125`,
      cliente_nombre: `${QA_PREFIX} Cliente 125`,
      detalles: { order_id: 'QA125', source: 'qa_isolated_audit' },
    });
    if (!ordErr) {
      await applyNamed(
        'set_order_status',
        'Pon el pedido QA125 como confirmado',
        async () => {
          const { data } = await admin
            .from('pedidos')
            .select('id,estado')
            .eq('id', orderId)
            .maybeSingle();
          return { estado: data?.estado, persisted: data?.estado === 'confirmado' };
        },
      );
    } else {
      evidence.ops.push({
        name: 'set_order_status',
        blocked: `seed_failed:${ordErr.message}`,
      });
    }
  }

  // Variations still unsupported (honest)
  {
    const t = await turn(
      token,
      history,
      'crea una variación de tamaño para la margarita',
      state.comercioId,
    );
    evidence.missingTools = evidence.missingTools || [];
    evidence.missingTools.push({
      prompt: 'crea una variación de tamaño para la margarita',
      hadProposal: Boolean(t.proposal?.confirmToken),
      assistant: t.assistant.slice(0, 240),
    });
  }

  // Isolation: try to change decoy product while scoped to primary commerce
  {
    const { data: before } = await admin
      .from('productos')
      .select('precio')
      .eq('id', state.decoyProdId)
      .maybeSingle();
    const { data: hamburgBefore } = await admin
      .from('productos')
      .select('precio')
      .eq('id', state.qaProdId)
      .maybeSingle();
    const t = await turn(
      token,
      history,
      `Cambia el precio de ${QA_PREFIX} Decoy Pizza a 1.11`,
      state.comercioId,
    );
    if (t.proposal?.confirmToken) {
      await confirm(token, t.proposal, 'apply', state.comercioId);
    }
    const { data: after } = await admin
      .from('productos')
      .select('precio,comercio_id')
      .eq('id', state.decoyProdId)
      .maybeSingle();
    const { data: hamburgAfter } = await admin
      .from('productos')
      .select('precio')
      .eq('id', state.qaProdId)
      .maybeSingle();
    evidence.isolation = {
      decoyPriceBefore: before?.precio,
      decoyPriceAfter: after?.precio,
      unchanged: String(before?.precio) === String(after?.precio),
      proposalAppeared: Boolean(t.proposal?.confirmToken),
      hamburguesaUntouched: String(hamburgBefore?.precio) === String(hamburgAfter?.precio),
      assistant: t.assistant.slice(0, 240),
      safe: !t.proposal?.confirmToken && String(before?.precio) === String(after?.precio),
    };
  }

  // Ensure offline at end of test
  await admin
    .from('comercios')
    .update({ en_linea: false })
    .eq('id', state.comercioId);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = join(OUT_DIR, `qa-isolated-write-evidence-${stamp}.json`);
  writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ test: 'ok', out, ops: evidence.ops.map((o) => ({ name: o.name, persisted: o.db?.persisted ?? null })) }, null, 2));
  return evidence;
}

async function cleanup() {
  const state = loadState();
  if (!state?.comercioId) {
    console.log(JSON.stringify({ cleanup: 'noop_no_state' }));
    return;
  }
  const { admin, url } = previewClients();
  assertAuditWriteTargetAllowed(url);
  await wipeCommerce(admin, state.comercioId);
  if (state.decoyId) await wipeCommerce(admin, state.decoyId);
  // Keep QA auth user (harmless) but wipe password-accessible commerce gone
  saveState({ ...state, cleanedAt: new Date().toISOString(), cleaned: true });
  console.log(
    JSON.stringify({
      cleanup: 'ok',
      deletedComercios: [state.comercioId, state.decoyId].filter(Boolean),
    }),
  );
}

const mode = process.argv[2] || 'all';
const run = async () => {
  if (mode === 'setup') return setup();
  if (mode === 'test') return testWrites();
  if (mode === 'cleanup') return cleanup();
  if (mode === 'all') {
    await setup();
    console.log('NEXT: start Next with .env.qa-isolated.local on :3024 then re-run test');
    return;
  }
  throw new Error(`unknown_mode:${mode}`);
};

run().catch((e) => {
  console.error('FAIL', e instanceof Error ? e.message : e);
  process.exit(1);
});
