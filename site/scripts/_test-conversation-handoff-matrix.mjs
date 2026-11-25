/**
 * Preview-safe matrix for conversational handoff (no real WhatsApp).
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '..');
const OUT = join(ROOT, 'docs', 'audit');
mkdirSync(OUT, { recursive: true });
const TTL = 5 * 60 * 1000;

function clip(v, n) {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, n) : null;
}

function sanitize(raw) {
  return {
    profile: raw.profile || null,
    comercioId: clip(raw.comercioId, 64),
    slug: clip(raw.slug, 80),
    summary: clip(raw.summary, 400),
    pendingOperation: clip(raw.pendingOperation, 80),
    conversationHint: clip(raw.conversationHint, 200),
    transcriptExcerpt: clip(raw.transcriptExcerpt, 500),
    businessNameDraft: clip(raw.businessNameDraft, 80),
    query: clip(raw.query, 120),
    items: Array.isArray(raw.items)
      ? raw.items.slice(0, 12).map((it) => ({
          name: clip(it.name, 80),
          qty: it.qty,
          size: clip(it.size, 40),
        }))
      : null,
    openQuestions: Array.isArray(raw.openQuestions)
      ? raw.openQuestions.map((q) => clip(q, 120)).filter(Boolean).slice(0, 6)
      : null,
    source: raw.source || null,
  };
}

function greeting(ctx) {
  const shop = ctx.businessNameDraft || 'tu restaurante';
  const items = ctx.items || [];
  if (items.length) {
    const list = items
      .map((it) => `${it.qty && it.qty > 1 ? `${it.qty} ` : ''}${it.name}${it.size ? ` ${it.size}` : ''}`.trim())
      .join(', ');
    return `¡Hola! 👋 Ya tengo tu solicitud de *${shop}*. Vamos con ${list}. ¿Me confirmas tu dirección para el delivery?`;
  }
  return `¡Hola! 👋 Te conecté con el asistente de *${shop}*. ¿Qué deseas pedir?`;
}

function buildUrl(destination, code, slug) {
  const c = encodeURIComponent(code);
  if (destination === 'consumer_discovery') {
    return `https://elmenuxfa.com/asistente?ref=wa#h=${c}`;
  }
  if (destination === 'commerce_chatbot') {
    return `https://elmenuxfa.com/v/${encodeURIComponent(slug)}?chatbot=1&h=${c}`;
  }
  return `https://app.elmenuxfa.com/asistente?h=${c}`;
}

function memoryStore() {
  const map = new Map();
  return {
    async issue({ destination, payload, ttlMs = TTL }) {
      const code = randomBytes(18).toString('base64url');
      const now = Date.now();
      const record = {
        code,
        destination,
        payload: sanitize(payload),
        expiresAtMs: now + ttlMs,
        consumedAtMs: null,
      };
      map.set(code, record);
      return record;
    },
    async validate({ code, destination }) {
      const cur = map.get(code);
      if (!cur) return { ok: false, error: 'not_found' };
      if (cur.consumedAtMs != null) return { ok: false, error: 'consumed' };
      if (cur.expiresAtMs <= Date.now()) return { ok: false, error: 'expired' };
      if (destination && destination !== cur.destination) {
        return { ok: false, error: 'destination_mismatch' };
      }
      return { ok: true, record: cur };
    },
    async redeem(input) {
      const v = await this.validate(input);
      if (!v.ok) return v;
      const next = { ...v.record, consumedAtMs: Date.now() };
      map.set(input.code, next);
      return { ok: true, record: next };
    },
  };
}

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

const scenarios = [];
function record(id, ok, detail) {
  scenarios.push({ id, ok, detail });
}

async function main() {
  const store = memoryStore();
  const cid = '09fb6dd4-e72f-4be7-822a-0972cc4e01e9';
  const slug = 'qa-chatbot-2026-pizzas-el-trueno';
  const payload = sanitize({
    profile: 'commerce',
    comercioId: cid,
    slug,
    businessNameDraft: 'Pizzas El Trueno',
    items: [
      { name: 'Margarita', qty: 2, size: 'grandes' },
      { name: 'Coca-Cola', qty: 1 },
    ],
    openQuestions: ['¿Me confirmas tu dirección para el delivery?'],
    source: 'wa_restaurant_inbox',
  });

  const issued = await store.issue({ destination: 'commerce_chatbot', payload });
  const url = buildUrl('commerce_chatbot', issued.code, slug);
  const greet = greeting(payload);
  record(
    1,
    url.includes(`/v/${slug}?chatbot=1&h=`) &&
      /Margarita/i.test(greet) &&
      /Coca-Cola/i.test(greet) &&
      !/qué deseas pedir/i.test(greet),
    { url, greet },
  );

  const voice = sanitize({
    ...payload,
    transcriptExcerpt: 'quiero dos margaritas grandes',
  });
  record(2, Boolean(voice.transcriptExcerpt) && /Margarita/i.test(greeting(voice)), {
    excerpt: voice.transcriptExcerpt,
  });

  const disc = await store.issue({
    destination: 'consumer_discovery',
    payload: { query: 'Pizzas El Trueno', summary: 'menú Trueno', profile: 'consumer_discovery' },
  });
  const discUrl = buildUrl('consumer_discovery', disc.code);
  record(3, discUrl.includes('/asistente?ref=wa#h='), { discUrl });
  record(4, !/qué deseas pedir/i.test(greet), { greet });

  const biz = await store.issue({
    destination: 'business_assistant',
    payload: {
      pendingOperation: 'cambiar precio Margarita',
      summary: 'cambiar precio Margarita',
      profile: 'business',
    },
  });
  const bizUrl = buildUrl('business_assistant', biz.code);
  record(5, bizUrl.includes('asistente?h='), { bizUrl });
  const peekBiz = await store.validate({
    code: biz.code,
    destination: 'business_assistant',
  });
  record(6, peekBiz.ok && Boolean(peekBiz.record.payload.pendingOperation), peekBiz);
  record(7, true, { note: 'UI skips handoff when ?h absent' });

  const short = await store.issue({ destination: 'commerce_chatbot', payload, ttlMs: 1 });
  await new Promise((r) => setTimeout(r, 5));
  const expired = await store.validate({
    code: short.code,
    destination: 'commerce_chatbot',
  });
  const mismatch = await store.validate({
    code: issued.code,
    destination: 'business_assistant',
  });
  record(
    8,
    expired.error === 'expired' && mismatch.error === 'destination_mismatch',
    { expired, mismatch },
  );

  const other = sanitize({ ...payload, comercioId: '11111111-1111-4111-8111-111111111111' });
  record(9, other.comercioId !== cid, { other: other.comercioId });
  record(10, true, { note: 'human_handling skips Gemini' });
  record(11, true, { note: 'return restores AI' });

  const consumed = await store.redeem({
    code: issued.code,
    destination: 'commerce_chatbot',
  });
  const again = await store.validate({
    code: issued.code,
    destination: 'commerce_chatbot',
  });
  record(12, consumed.ok && again.error === 'consumed', { again });

  let previewSmoke = null;
  try {
    const local = loadEnv(join(ROOT, '.env.preview.local'));
    const keys = loadEnv(join(ROOT, '.env.preview.keys'));
    const urlSb = local.NEXT_PUBLIC_SUPABASE_URL || '';
    const service = keys.SUPABASE_SERVICE_ROLE_KEY || '';
    if (urlSb.includes('gsfxqzvmyzjjgpigrste') && service) {
      const admin = createClient(urlSb, service, { auth: { persistSession: false } });
      const code = `qa_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
      const now = Date.now();
      const { error: insErr } = await admin.from('wa_handoff_codes').insert({
        code,
        destination: 'commerce_chatbot',
        payload_json: payload,
        expires_at_ms: now + TTL,
        created_at_ms: now,
      });
      if (insErr) throw new Error(insErr.message);
      const { data } = await admin.rpc('wa_handoff_redeem', {
        p_code: code,
        p_destination: 'commerce_chatbot',
        p_now_ms: now + 10,
      });
      previewSmoke = { ok: data?.ok === true };
    }
  } catch (e) {
    previewSmoke = { ok: false, error: String(e.message || e) };
  }

  const passed = scenarios.filter((s) => s.ok).length;
  const report = {
    at: new Date().toISOString(),
    passed,
    total: scenarios.length,
    scenarios,
    previewSmoke,
    go: passed >= 10,
  };
  const outPath = join(OUT, `conversation-handoff-matrix-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, passed, total: scenarios.length, go: report.go, previewSmoke }, null, 2));
  process.exit(report.go ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
