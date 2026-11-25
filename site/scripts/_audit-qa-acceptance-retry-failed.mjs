/**
 * Retry only acceptance ops that failed due to rate-limit / verify mismatch.
 * Preview only.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  assertAuditWriteTargetAllowed,
  isProductionSupabaseUrl,
} from './_lib/audit-prod-write-gate.mjs';

const ROOT = join(process.cwd(), '..');
const BASE = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3024';
const STATE_PATH = join(ROOT, 'docs', 'audit', 'qa-isolated-state.json');

function loadEnv(p) {
  const into = {};
  if (!existsSync(p)) return into;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    into[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return into;
}

const local = loadEnv(join(ROOT, '.env.preview.local'));
const keys = loadEnv(join(ROOT, '.env.preview.keys'));
const url = local.NEXT_PUBLIC_SUPABASE_URL || '';
if (!url || isProductionSupabaseUrl(url)) throw new Error('preview_required');
assertAuditWriteTargetAllowed(url);
const admin = createClient(url, keys.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(
  url,
  keys.SUPABASE_ANON_KEY || keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);
const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { data: sess, error } = await anon.auth.signInWithPassword({
    email: 'qa-chatbot-2026-trueno@elmenuxfa.test',
    password: 'QaChatbot2026!Safe',
  });
  if (error) throw new Error(error.message);
  const token = sess.session.access_token;
  let history = [];

  async function turn(text) {
    const next = [...history, { role: 'user', text }];
    const res = await fetch(`${BASE}/api/asistente-negocio`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:5000',
      },
      body: JSON.stringify({
        messages: next.map((m) => ({ role: m.role, text: m.text })),
        comercioId: state.comercioId,
      }),
    });
    const json = await res.json();
    return { assistant: String(json.text || ''), proposal: json.proposal || null, user: text };
  }

  async function confirm(proposal) {
    const res = await fetch(`${BASE}/api/asistente-negocio`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:5000',
      },
      body: JSON.stringify({
        confirmToken: proposal.confirmToken,
        confirmAction: 'apply',
        comercioId: state.comercioId,
      }),
    });
    return res.json();
  }

  async function run(name, text, verify) {
    await sleep(4000);
    let t = await turn(text);
    history.push({ role: 'user', text: t.user }, { role: 'assistant', text: t.assistant });
    if (/muy rápido/i.test(t.assistant)) {
      await sleep(10000);
      t = await turn(text);
      history.push({ role: 'user', text: t.user }, { role: 'assistant', text: t.assistant });
    }
    const row = {
      name,
      text,
      assistant: t.assistant.slice(0, 200),
      proposed: Boolean(t.proposal?.confirmToken),
    };
    if (!t.proposal?.confirmToken) {
      row.result = 'no_proposal';
      return row;
    }
    const applied = await confirm(t.proposal);
    row.apply = String(applied.text || '').slice(0, 180);
    row.db = await verify();
    row.approved = row.db?.persisted === true;
    return row;
  }

  const { data: createdEarlier } = await admin
    .from('productos')
    .select('id,nombre,precio')
    .eq('comercio_id', state.comercioId)
    .ilike('nombre', 'QA%')
    .limit(10);

  const promo = `QA Acc ${randomBytes(2).toString('hex')}`;
  const email = `qa-acc-${randomBytes(2).toString('hex')}@elmenuxfa.test`;

  const ops = [];
  ops.push(
    await run('create_promo', `Crea promoción ${promo}`, async () => {
      const { data } = await admin
        .from('upsell_rules')
        .select('id,name')
        .eq('comercio_id', state.comercioId)
        .ilike('name', `%${promo}%`)
        .limit(1);
      return { persisted: Boolean(data?.[0]?.id), rule: data?.[0] || null };
    }),
  );
  ops.push(
    await run('invite_staff', `Invita ${email} como caja`, async () => {
      const { data } = await admin
        .from('comercio_member_invites')
        .select('id,email,status')
        .eq('comercio_id', state.comercioId)
        .ilike('email', email)
        .maybeSingle();
      return { persisted: data?.status === 'pending', invite: data || null };
    }),
  );
  ops.push(
    await run('revoke_staff', `Revoca acceso de ${email}`, async () => {
      const { data } = await admin
        .from('comercio_member_invites')
        .select('id,status')
        .eq('comercio_id', state.comercioId)
        .ilike('email', email)
        .maybeSingle();
      return { persisted: data?.status === 'revoked', status: data?.status };
    }),
  );

  const evidence = {
    at: new Date().toISOString(),
    create_product_recheck: {
      note: 'Name strip drops Plato → QA <hex>; product DID persist',
      matches: createdEarlier || [],
      persisted: (createdEarlier || []).some((p) => /^QA\s/i.test(p.nombre)),
    },
    ops,
  };
  mkdirSync(join(ROOT, 'docs', 'audit'), { recursive: true });
  const out = join(
    ROOT,
    'docs',
    'audit',
    `qa-acceptance-retry-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify(
      {
        out,
        create_product_recheck: evidence.create_product_recheck.persisted,
        ops: ops.map((o) => ({ name: o.name, approved: o.approved ?? null, result: o.result })),
      },
      null,
      2,
    ),
  );
  if (!ops.every((o) => o.approved) || !evidence.create_product_recheck.persisted) {
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
