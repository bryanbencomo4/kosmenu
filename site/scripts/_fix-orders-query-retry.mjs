/**
 * Re-test order query by client name + verify confirmado state.
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
    email: 'qa-chatbot-2026-trueno@elmenuxfa.test',
    password: 'QaChatbot2026!Safe',
  });
  if (error) throw error;
  const token = auth.session.access_token;
  const cid = STATE.comercioId;

  const { data: order } = await admin
    .from('pedidos')
    .select('id,estado,cliente_nombre')
    .eq('comercio_id', cid)
    .eq('id', '01974fdd-1e5d-4abd-94c6-8027e80f7f76')
    .maybeSingle();

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

  await turn('usar negocio QA_CHATBOT_2026 pizzas el trueno');
  await sleep(1500);
  const q1 = await turn('pedidos pendientes o en preparación');
  await sleep(2000);
  const q2 = await turn(
    `estado del pedido de ${order?.cliente_nombre || 'QA_CHATBOT_2026 Cliente 125'}`,
  );

  const report = {
    at: new Date().toISOString(),
    order,
    list: { status: q1.status, text: String(q1.json.text || '').slice(0, 500) },
    byName: {
      status: q2.status,
      text: String(q2.json.text || '').slice(0, 500),
    },
    updateAlreadyDone: order?.estado === 'confirmado',
    ok:
      order?.estado === 'confirmado' &&
      (q1.status === 200 || q2.status === 200) &&
      !/no pude/i.test(String(q2.json.text || '')),
  };
  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, `qa-acceptance-orders-query-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, report }, null, 2));
  process.exit(report.ok || report.updateAlreadyDone ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
