/**
 * Smoke against REAL Supabase tables (no MEMORY). Authorization gated.
 *
 * Requires:
 *   CHAT_SUPERVISION_SMOKE_CONFIRM=I_AUTHORIZE_CHAT_SUPERVISION_SMOKE
 *   BASE_URL=https://… or http://127.0.0.1:3000  (app with flags ON, MEMORY unset)
 *   CHAT_SUPERVISION_E2E_BEARER only if testing with e2e token; prefer real merchant JWT:
 *   CHAT_SUPERVISION_SMOKE_BEARER=<merchant access_token>
 *
 * Default: CHAT_SUPERVISION_SMOKE_SEND_WASENDER unset → expects notify path to
 * enqueue/skip without requiring a live WhatsApp delivery assertion.
 *
 * Usage:
 *   node site/scripts/chat-supervision-post-migration-smoke.mjs
 */
const CONFIRM = 'I_AUTHORIZE_CHAT_SUPERVISION_SMOKE';
const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const COMERCIO =
  process.env.CHAT_SUPERVISION_COMMERCE_IDS?.split(',')[0]?.trim() ||
  '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const BEARER =
  (process.env.CHAT_SUPERVISION_SMOKE_BEARER || '').trim() ||
  (process.env.CHAT_SUPERVISION_E2E_BEARER || '').trim();

if ((process.env.CHAT_SUPERVISION_SMOKE_CONFIRM || '').trim() !== CONFIRM) {
  console.error(
    `Refusing: set CHAT_SUPERVISION_SMOKE_CONFIRM=${CONFIRM} after migration + flags are live.`,
  );
  process.exit(2);
}
if (!BASE) {
  console.error('Refusing: set BASE_URL to the app under test.');
  process.exit(2);
}
if (!BEARER) {
  console.error('Refusing: set CHAT_SUPERVISION_SMOKE_BEARER (merchant JWT).');
  process.exit(2);
}

const steps = [];
function ok(name, detail = '') {
  steps.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  steps.push({ name, ok: false, detail });
  console.error(`✗ ${name} — ${detail}`);
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { res, json, text };
}

const sessionId = `smoke_${Date.now()}`;

const before = await api(
  `/api/panel/conversaciones?comercioId=${encodeURIComponent(COMERCIO)}`,
  { headers: { Authorization: `Bearer ${BEARER}` } },
);
if (!before.res.ok) {
  fail('panel_auth', `${before.res.status} ${before.text.slice(0, 200)}`);
  process.exit(1);
}
ok('panel_auth');

const chat = await api(`/api/chat/${encodeURIComponent(COMERCIO)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId,
    messages: [{ role: 'user', text: 'Buenas, ¿tienen pizzas grandes?' }],
  }),
});
if (!chat.res.ok) {
  fail('consumer_message', `${chat.res.status} ${chat.text.slice(0, 300)}`);
  process.exit(1);
}
const conversationId = chat.json?.supervision?.conversationId;
if (!conversationId) {
  fail(
    'conversation_persisted',
    'missing supervision.conversationId — MEMORY off? tables applied? flags on?',
  );
  process.exit(1);
}
ok('conversation_persisted', conversationId);

const detail = await api(`/api/panel/conversaciones/${conversationId}`, {
  headers: { Authorization: `Bearer ${BEARER}` },
});
if (!detail.res.ok || !(detail.json?.messages || []).length) {
  fail('merchant_history', detail.text.slice(0, 200));
  process.exit(1);
}
ok('merchant_history', `${detail.json.messages.length} msgs`);

const take = await api(`/api/panel/conversaciones/${conversationId}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${BEARER}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'take' }),
});
if (!take.res.ok || take.json?.conversation?.status !== 'human_handling') {
  fail('takeover', take.text.slice(0, 200));
  process.exit(1);
}
ok('takeover');

const whileHuman = await api(`/api/chat/${encodeURIComponent(COMERCIO)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId,
    messages: [{ role: 'user', text: '¿Sigue alguien ahí?' }],
  }),
});
if (
  !whileHuman.res.ok ||
  whileHuman.json?.supervision?.mode !== 'human_handling' ||
  whileHuman.json?.skipped_llm !== true
) {
  fail(
    'gemini_paused_while_human',
    whileHuman.text.slice(0, 240) || 'expected human_handling + skipped_llm',
  );
  process.exit(1);
}
ok('gemini_paused_while_human');

const staff = await api(`/api/panel/conversaciones/${conversationId}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${BEARER}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'message', text: 'Hola, te atiende el restaurante' }),
});
if (!staff.res.ok) {
  fail('staff_message', staff.text.slice(0, 200));
  process.exit(1);
}
ok('staff_message');

const feed = await api(
  `/api/chat/${encodeURIComponent(COMERCIO)}/supervision-feed?sessionId=${encodeURIComponent(sessionId)}&afterSeq=0`,
);
const bodies = (feed.json?.messages || []).map((m) => m.body).join('\n');
if (!/te atiende el restaurante|se ha unido/i.test(bodies)) {
  fail('consumer_feed', bodies.slice(0, 200) || 'empty');
  process.exit(1);
}
ok('consumer_feed');

const ret = await api(`/api/panel/conversaciones/${conversationId}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${BEARER}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'return' }),
});
if (!ret.res.ok || ret.json?.conversation?.status !== 'ai_handling') {
  fail('return_assistant', ret.text.slice(0, 200));
  process.exit(1);
}
ok('return_assistant');

const afterReturn = await api(`/api/chat/${encodeURIComponent(COMERCIO)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId,
    messages: [{ role: 'user', text: 'Ok, gracias, ¿qué pizzas hay?' }],
  }),
});
if (
  !afterReturn.res.ok ||
  afterReturn.json?.skipped_llm === true ||
  afterReturn.json?.supervision?.mode === 'human_handling'
) {
  fail(
    'gemini_resumed',
    afterReturn.text.slice(0, 240) || 'expected Gemini to answer again',
  );
  process.exit(1);
}
ok('gemini_resumed', afterReturn.json?.model || 'ok');

const close = await api(`/api/panel/conversaciones/${conversationId}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${BEARER}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'close' }),
});
if (!close.res.ok || close.json?.conversation?.status !== 'closed') {
  fail('close_conversation', close.text.slice(0, 200));
  process.exit(1);
}
ok('close_conversation');

const failed = steps.filter((s) => !s.ok);
console.log(`\npassed=${steps.length - failed.length} failed=${failed.length}`);
process.exit(failed.length ? 1 : 0);
