/**
 * Seed QA order + query/update status via assistant API (Preview only).
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
const STATE = JSON.parse(
  readFileSync(join(OUT, 'qa-isolated-state.json'), 'utf8'),
);
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (STATE.comercioId === TRUENO) throw new Error('trueno');
  const local = loadEnv(join(ROOT, '.env.preview.local'));
  const keys = loadEnv(join(ROOT, '.env.preview.keys'));
  const url = local.NEXT_PUBLIC_SUPABASE_URL || '';
  if (isProductionSupabaseUrl(url)) throw new Error('prod');
  assertAuditWriteTargetAllowed(url);
  const admin = createClient(url, keys.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const anon = createClient(
    url,
    keys.SUPABASE_ANON_KEY || keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  const { data: auth, error } = await anon.auth.signInWithPassword({
    email: QA_EMAIL,
    password: QA_PASSWORD,
  });
  if (error) throw error;
  const token = auth.session.access_token;
  const cid = STATE.comercioId;

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
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }

  // Prefer existing order for this commerce; else seed pendiente
  let { data: order } = await admin
    .from('pedidos')
    .select('id,estado,cliente_nombre,total,comercio_id')
    .eq('comercio_id', cid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let seed = { existing: !!order };
  if (!order) {
    const ins = await admin
      .from('pedidos')
      .insert({
        comercio_id: cid,
        estado: 'pendiente',
        total: 6.31,
        cliente_nombre: 'QA_CHATBOT_2026 pedido',
        detalles: [{ nombre: 'Campesina', cantidad: 1, precio: 6.31 }],
        creado_por_ia: false,
      })
      .select('id,estado,cliente_nombre,total,comercio_id')
      .maybeSingle();
    seed = { insertError: ins.error?.message || null, data: ins.data };
    order = ins.data;
  }
  if (!order?.id) {
    console.log(JSON.stringify({ seed, fail: true }, null, 2));
    process.exit(2);
  }

  // Reset to pendiente for deterministic update test
  await admin.from('pedidos').update({ estado: 'pendiente' }).eq('id', order.id);
  order.estado = 'pendiente';

  let history = [];
  const turn = async (text) => {
    history.push({ role: 'user', text });
    const r = await post({
      messages: history.map((m) => ({ role: m.role, text: m.text })),
      comercioId: cid,
    });
    history.push({ role: 'assistant', text: String(r.json.text || '') });
    return r;
  };
  const apply = (proposal) =>
    post({
      confirmToken: proposal.confirmToken,
      confirmAction: 'apply',
      comercioId: cid,
    });

  await turn('usar negocio QA_CHATBOT_2026 pizzas el trueno');
  await sleep(1500);
  const query = await turn(
    `¿cuál es el estado del pedido ${order.id}?`,
  );
  await sleep(2500);
  let update = await turn(
    `cambia el estado del pedido ${order.id} a preparando`,
  );
  if (/vas muy rápido/i.test(String(update.json.text || ''))) {
    await sleep(9000);
    update = await turn(`pasa a preparando el pedido ${order.id}`);
  }
  let confirm = null;
  if (update.json.proposal?.confirmToken) {
    confirm = await apply(update.json.proposal);
  }

  const { data: after } = await admin
    .from('pedidos')
    .select('id,estado,cliente_nombre,total')
    .eq('id', order.id)
    .maybeSingle();

  const report = {
    at: new Date().toISOString(),
    seed,
    orderId: order.id,
    query: {
      status: query.status,
      text: String(query.json.text || '').slice(0, 400),
    },
    update: {
      status: update.status,
      text: String(update.json.text || '').slice(0, 400),
      hasProposal: !!update.json.proposal,
      confirm,
    },
    after,
    ok: after?.estado === 'preparando',
  };
  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, `qa-acceptance-orders-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, report }, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
