/**
 * Follow-up probes: availability-on phrasing + assistant cross-commerce isolation.
 * Preview Supabase only. Uses same request shape as write suite (`messages`).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertAuditWriteTargetAllowed,
  isProductionSupabaseUrl,
} from './_lib/audit-prod-write-gate.mjs';

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

const keys = loadEnv(join(process.cwd(), '..', '.env.preview.keys'));
const local = loadEnv(join(process.cwd(), '..', '.env.preview.local'));
const url = local.NEXT_PUBLIC_SUPABASE_URL || '';
if (!url || isProductionSupabaseUrl(url)) throw new Error('bad_preview_url');
assertAuditWriteTargetAllowed(url);

const anonKey = keys.SUPABASE_ANON_KEY || keys.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const admin = createClient(url, keys.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const state = JSON.parse(
  readFileSync(
    join(process.cwd(), '..', 'docs', 'audit', 'qa-isolated-state.json'),
    'utf8',
  ),
);
const BASE = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3024';
const QA_PASSWORD = 'QaChatbot2026!Safe';
const QA_EMAIL = state.qaEmail;

const { data: sign, error } = await anon.auth.signInWithPassword({
  email: QA_EMAIL,
  password: QA_PASSWORD,
});
if (error) throw error;
const token = sign.session.access_token;

async function apiPost(body) {
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

async function turn(history, text) {
  const next = [...history, { role: 'user', text }];
  const { status, json } = await apiPost({
    messages: next.map((m) => ({ role: m.role, text: m.text })),
    comercioId: state.comercioId,
  });
  return {
    status,
    user: text,
    assistant: String(json.text || ''),
    proposal: json.proposal || null,
  };
}

async function confirm(proposal, action) {
  const { status, json } = await apiPost({
    confirmToken: proposal.confirmToken,
    confirmAction: action,
    comercioId: state.comercioId,
  });
  return { status, text: String(json.text || ''), ok: status < 500 };
}

// Restore decoy after earlier direct RLS probe
await admin
  .from('productos')
  .update({ precio: 99 })
  .eq('id', state.decoyProdId);

const prompts = [
  'Activa Campesina',
  'Marca Campesina como disponible',
  'Pon disponible la Campesina',
  'reactiva Campesina',
  'Marca como disponible Campesina',
];
const results = [];
let history = [];
for (const p of prompts) {
  const t = await turn(history, p);
  history.push({ role: 'user', text: p }, { role: 'assistant', text: t.assistant });
  const row = {
    prompt: p,
    hadProposal: Boolean(t.proposal?.confirmToken),
    assistant: t.assistant.slice(0, 400),
    proposalOp: t.proposal?.op || null,
  };
  if (t.proposal?.confirmToken) {
    const applied = await confirm(t.proposal, 'apply');
    const { data: after } = await admin
      .from('productos')
      .select('disponible,precio,nombre')
      .eq('comercio_id', state.comercioId)
      .ilike('nombre', '%Campesina%')
      .maybeSingle();
    row.apply = applied;
    row.db = after;
    results.push(row);
    break;
  }
  results.push(row);
}

// Cross-commerce via assistant (scoped to primary)
const { data: decoyBefore } = await admin
  .from('productos')
  .select('precio')
  .eq('id', state.decoyProdId)
  .maybeSingle();
const iso = await turn(
  history,
  'Cambia el precio de QA_CHATBOT_2026 Decoy Pizza a 2.22',
);
if (iso.proposal?.confirmToken) {
  await confirm(iso.proposal, 'apply');
}
const { data: decoyAfter } = await admin
  .from('productos')
  .select('precio,nombre,comercio_id')
  .eq('id', state.decoyProdId)
  .maybeSingle();
const { data: hamburgAfter } = await admin
  .from('productos')
  .select('precio,nombre')
  .eq('id', state.qaProdId)
  .maybeSingle();

// Direct RLS: owner JWT can mutate own decoy commerce (same owner_id)
const userClient = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: rlUpd, error: rlErr } = await userClient
  .from('productos')
  .update({ precio: 98.5 })
  .eq('id', state.decoyProdId)
  .select('id,precio');
const { data: rlAfter } = await admin
  .from('productos')
  .select('precio')
  .eq('id', state.decoyProdId)
  .maybeSingle();
// restore
await admin.from('productos').update({ precio: 99 }).eq('id', state.decoyProdId);

const out = {
  at: new Date().toISOString(),
  availabilityOnProbes: results,
  assistantCrossCommerce: {
    decoyBefore: decoyBefore?.precio,
    hadProposal: Boolean(iso.proposal?.confirmToken),
    assistant: iso.assistant.slice(0, 300),
    decoyAfter: decoyAfter?.precio,
    decoyUntouched: Number(decoyAfter?.precio) === Number(decoyBefore?.precio),
    hamburguesaPrice: hamburgAfter?.precio,
  },
  rlsSameOwnerDirectUpdate: {
    updateRows: rlUpd,
    error: rlErr?.message || null,
    afterProbe: rlAfter?.precio,
    note: 'Owner JWT can write products in any owned commerce; chat isolation is comercioId-scoped.',
  },
};

const dest = join(process.cwd(), '..', 'docs', 'audit', 'qa-isolated-followup.json');
writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
