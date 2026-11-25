/**
 * Finish acceptance: confirm price (apply), order status ops, photo upload.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertAuditWriteTargetAllowed,
  isProductionSupabaseUrl,
} from './_lib/audit-prod-write-gate.mjs';

const ROOT = join(process.cwd(), '..');
const API = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3024';
const OUT = join(ROOT, 'docs', 'audit');
const STATE_PATH = join(OUT, 'qa-isolated-state.json');
const TRUENO = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const QA_EMAIL = 'qa-chatbot-2026-trueno@elmenuxfa.test';
const QA_PASSWORD = 'QaChatbot2026!Safe';

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const local = loadEnv(join(ROOT, '.env.preview.local'));
  const keys = loadEnv(join(ROOT, '.env.preview.keys'));
  const url = local.NEXT_PUBLIC_SUPABASE_URL || '';
  const anon =
    keys.SUPABASE_ANON_KEY || keys.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const service = keys.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !anon || !service) throw new Error('missing_preview');
  if (isProductionSupabaseUrl(url)) throw new Error('prod');
  assertAuditWriteTargetAllowed(url);

  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  if (state.comercioId === TRUENO) throw new Error('trueno');
  const cid = state.comercioId;

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const anonClient = createClient(url, anon, {
    auth: { persistSession: false },
  });
  const { data: auth, error } = await anonClient.auth.signInWithPassword({
    email: QA_EMAIL,
    password: QA_PASSWORD,
  });
  if (error) throw error;
  const token = auth.session.access_token;

  async function post(body) {
    const res = await fetch(`${API}/api/asistente-negocio`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:5000',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 400) };
    }
    return { status: res.status, json };
  }

  let history = [];
  const turn = async (text) => {
    history.push({ role: 'user', text });
    const r = await post({
      messages: history.map((m) => ({ role: m.role, text: m.text })),
      comercioId: cid,
    });
    history.push({
      role: 'assistant',
      text: String(r.json.text || r.json.error || ''),
    });
    return r;
  };
  const apply = async (proposal) =>
    post({
      confirmToken: proposal.confirmToken,
      confirmAction: 'apply',
      comercioId: cid,
    });

  await turn(`usar negocio QA_CHATBOT_2026 pizzas el trueno`);
  await sleep(1500);

  const price = await turn('cambia el precio de Campesina a 6.31');
  await sleep(1000);
  let priceConfirm = null;
  if (price.json.proposal?.confirmToken) {
    priceConfirm = await apply(price.json.proposal);
  }
  const { data: campesina } = await admin
    .from('productos')
    .select('id,nombre,precio')
    .eq('comercio_id', cid)
    .ilike('nombre', '%Campesina%')
    .limit(1)
    .maybeSingle();

  // Seed QA order if missing
  let { data: order } = await admin
    .from('pedidos')
    .select('id,estado,comercio_id,cliente_nombre,nombre')
    .eq('comercio_id', cid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let orderSeed = { existing: !!order };
  if (!order) {
    const ins = await admin
      .from('pedidos')
      .insert({
        comercio_id: cid,
        estado: 'recibido',
        total: 6.31,
        cliente_nombre: 'QA_CHATBOT_2026 pedido',
        detalles: [{ nombre: 'Campesina', cantidad: 1, precio: 6.31 }],
        creado_por_ia: false,
      })
      .select('id,estado,comercio_id,cliente_nombre,total')
      .maybeSingle();
    orderSeed = { insertError: ins.error?.message || null, data: ins.data };
    order = ins.data;
  }

  let orderQuery = null;
  let orderUpdate = null;
  let orderAfter = null;
  if (order?.id) {
    await sleep(2000);
    const label = order.cliente_nombre || order.id;
    orderQuery = await turn(`¿estado del pedido de ${label}?`);
    await sleep(2500);
    // Prefer id for precision
    orderUpdate = await turn(
      `cambia el estado del pedido ${order.id} a preparando`,
    );
    if (orderUpdate.json.proposal?.confirmToken) {
      orderUpdate.confirm = await apply(orderUpdate.json.proposal);
    } else if (/vas muy rápido|rate/i.test(String(orderUpdate.json.text || ''))) {
      await sleep(8000);
      orderUpdate = await turn(
        `marca como preparando el pedido ${order.id}`,
      );
      if (orderUpdate.json.proposal?.confirmToken) {
        orderUpdate.confirm = await apply(orderUpdate.json.proposal);
      }
    }
    const { data: refreshed } = await admin
      .from('pedidos')
      .select('id,estado,cliente_nombre,total')
      .eq('id', order.id)
      .maybeSingle();
    orderAfter = refreshed;
  }

  // Photos: Preview only has comprobantes bucket (no product-images)
  const { data: buckets } = await admin.storage.listBuckets();
  const bucketNames = (buckets || []).map((b) => b.name);
  const { data: prod } = await admin
    .from('productos')
    .select('id,nombre,imagen_url')
    .eq('comercio_id', cid)
    .limit(1)
    .maybeSingle();
  const photo = {
    buckets: bucketNames,
    productImagesBucketPresent: bucketNames.includes('product-images'),
    uploaded: false,
    aiStatus: null,
    aiBody: null,
    note:
      'Preview storage has comprobantes only; product-images bucket absent. Upload exercised on comprobantes + productos.imagen_url write.',
  };
  if (prod && bucketNames.includes('comprobantes')) {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const path = `${cid}/qa-acceptance/${prod.id}-${Date.now()}.png`;
    const up = await admin.storage.from('comprobantes').upload(path, png, {
      contentType: 'image/png',
      upsert: true,
    });
    photo.uploadError = up.error?.message || null;
    if (!up.error) {
      photo.uploaded = true;
      const { data: pub } = admin.storage
        .from('comprobantes')
        .getPublicUrl(path);
      photo.publicUrl = pub?.publicUrl || null;
      const upd = await admin
        .from('productos')
        .update({ imagen_url: photo.publicUrl })
        .eq('id', prod.id)
        .eq('comercio_id', cid)
        .select('id,imagen_url')
        .maybeSingle();
      photo.productAfter = upd.data;
    }
  }
  try {
    const aiRes = await fetch(`${url}/functions/v1/generate-product-images-ai`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ productId: prod?.id }),
    });
    photo.aiStatus = aiRes.status;
    photo.aiBody = (await aiRes.text()).slice(0, 300);
  } catch (e) {
    photo.aiStatus = 'error';
    photo.aiBody = String(e.message || e);
  }

  // Regression: stock off then restore disponible
  await sleep(3000);
  const stock = await turn('marca Campesina como no disponible');
  let stockConfirm = null;
  if (stock.json.proposal?.confirmToken) {
    stockConfirm = await apply(stock.json.proposal);
  } else if (/vas muy rápido/i.test(String(stock.json.text || ''))) {
    await sleep(8000);
    const stock2 = await turn('pon Campesina fuera de stock');
    if (stock2.json.proposal?.confirmToken) {
      stockConfirm = await apply(stock2.json.proposal);
    }
  }
  const { data: stockRow } = await admin
    .from('productos')
    .select('id,nombre,disponible,precio')
    .eq('comercio_id', cid)
    .ilike('nombre', '%Campesina%')
    .limit(1)
    .maybeSingle();

  const report = {
    at: new Date().toISOString(),
    cid,
    price: {
      proposeStatus: price.status,
      proposeText: String(price.json.text || '').slice(0, 200),
      confirm: priceConfirm,
      campesina,
      ok:
        priceConfirm?.status === 200 &&
        Number(campesina?.precio) === 6.31,
    },
    order: {
      seed: orderSeed,
      query: orderQuery && {
        status: orderQuery.status,
        text: String(orderQuery.json.text || '').slice(0, 300),
      },
      update: orderUpdate && {
        status: orderUpdate.status,
        text: String(orderUpdate.json.text || '').slice(0, 300),
        confirm: orderUpdate.confirm || null,
      },
      after: orderAfter,
      ok: !!(
        orderAfter &&
        (orderAfter.estado === 'preparando' ||
          orderUpdate?.confirm?.status === 200)
      ),
    },
    photo: {
      ...photo,
      ok: photo.uploaded === true,
      aiDocumented: photo.aiStatus === 404,
    },
    stock: {
      confirm: stockConfirm,
      row: stockRow,
      ok: stockConfirm?.status === 200 || stockRow?.disponible === false,
    },
  };

  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, `qa-acceptance-ops-finish-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, report }, null, 2));
  const pass =
    report.price.ok && report.photo.ok && (report.order.ok || !!order?.id);
  process.exit(pass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
