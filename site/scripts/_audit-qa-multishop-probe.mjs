/**
 * Multi-shop selection probe (Preview only).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertAuditWriteTargetAllowed } from './_lib/audit-prod-write-gate.mjs';

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

const keys = loadEnv(join(process.cwd(), '..', '.env.preview.keys'));
const local = loadEnv(join(process.cwd(), '..', '.env.preview.local'));
const url = local.NEXT_PUBLIC_SUPABASE_URL || '';
assertAuditWriteTargetAllowed(url);
const anonKey = keys.SUPABASE_ANON_KEY || keys.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const state = JSON.parse(
  readFileSync(join(process.cwd(), '..', 'docs', 'audit', 'qa-isolated-state.json'), 'utf8'),
);
const BASE = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3024';

const { data: sign, error } = await anon.auth.signInWithPassword({
  email: state.qaEmail,
  password: 'QaChatbot2026!Safe',
});
if (error) throw error;
const token = sign.session.access_token;

async function post(body) {
  const res = await fetch(`${BASE}/api/asistente-negocio`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

// Boot without comercioId → multi shop chips with ids
const boot = await post({ messages: undefined });
const shopChips = (boot.json.chips || []).filter((c) => String(c.id || '').startsWith('shop:'));

// Select primary by name only (no comercioId)
const byName = await post({
  messages: [{ role: 'user', text: 'QA_CHATBOT_2026 pizzas el trueno' }],
});

// Select via chip text + comercioId
const byChip = await post({
  messages: [{ role: 'user', text: `usar negocio QA_CHATBOT_2026 pizzas el trueno` }],
  comercioId: state.comercioId,
});

// Price command with persisted comercioId
const price = await post({
  messages: [
    { role: 'user', text: 'usar negocio QA_CHATBOT_2026 pizzas el trueno' },
    { role: 'assistant', text: byChip.json.text || 'ok' },
    { role: 'user', text: 'Cambia el precio de Margarita a 6.25' },
  ],
  comercioId: state.comercioId,
});

const out = {
  bootNeedsSelect: Boolean(boot.json.needsComercioSelect),
  shopChipCount: shopChips.length,
  shopChipsHaveComercioId: shopChips.every((c) => c.comercioId || String(c.id).startsWith('shop:')),
  byNameSelected: byName.json.selectedComercioId === state.comercioId,
  byNameText: String(byName.json.text || '').slice(0, 160),
  byChipSelected: byChip.json.selectedComercioId === state.comercioId,
  priceHadProposal: Boolean(price.json.proposal?.confirmToken),
  priceText: String(price.json.text || '').slice(0, 160),
};

writeFileSync(
  join(process.cwd(), '..', 'docs', 'audit', 'qa-isolated-multishop-probe.json'),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
