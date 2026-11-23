/**
 * Lightweight MEMORY-mode latency/throughput bench (local only).
 * Does NOT hit production WaSender or remote Postgres.
 *
 * Requires Next with CHAT_SUPERVISION_MEMORY=1 + flags (same as dual E2E).
 *
 *   BASE_URL=http://127.0.0.1:3010 node site/scripts/chat-supervision-memory-bench.mjs
 */
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3010').replace(/\/$/, '');
const COMERCIO =
  process.env.CHAT_SUPERVISION_COMMERCE_IDS?.split(',')[0]?.trim() ||
  '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const BEARER =
  process.env.CHAT_SUPERVISION_E2E_BEARER || 'e2e-supervision-token';
const N = Math.max(1, Number(process.env.CHAT_SUPERVISION_BENCH_N || 20) || 20);
const CONCURRENCY = Math.max(
  1,
  Number(process.env.CHAT_SUPERVISION_BENCH_CONCURRENCY || 4) || 4,
);

function pct(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

async function oneTurn(i) {
  const sessionId = `bench_${Date.now()}_${i}`;
  const t0 = Date.now();
  const chatRes = await fetch(`${BASE}/api/chat/${encodeURIComponent(COMERCIO)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      messages: [{ role: 'user', text: `Bench ${i}: ¿tienen pizza grande?` }],
    }),
  });
  const chat = await chatRes.json().catch(() => ({}));
  const conversationId = chat?.supervision?.conversationId;
  const feedToken = chat?.supervision?.feedToken;
  if (!chatRes.ok || !conversationId) {
    return { ok: false, ms: Date.now() - t0, error: 'chat_failed' };
  }
  const takeRes = await fetch(
    `${BASE}/api/panel/conversaciones/${conversationId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BEARER}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'take' }),
    },
  );
  if (!takeRes.ok) {
    return { ok: false, ms: Date.now() - t0, error: 'take_failed' };
  }
  const staffText = `Bench staff ${i}`;
  const staffRes = await fetch(
    `${BASE}/api/panel/conversaciones/${conversationId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BEARER}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'message', text: staffText }),
    },
  );
  if (!staffRes.ok) {
    return { ok: false, ms: Date.now() - t0, error: 'staff_failed' };
  }
  const sentAt = Date.now();
  let deliveredMs = null;
  for (let a = 0; a < 15; a++) {
    const feedRes = await fetch(
      `${BASE}/api/chat/${encodeURIComponent(COMERCIO)}/supervision-feed?afterSeq=0`,
      {
        headers: feedToken
          ? { 'X-Chat-Supervision-Feed-Token': feedToken }
          : undefined,
      },
    );
    const feed = await feedRes.json().catch(() => ({}));
    const bodies = (feed.messages || [])
      .filter((m) => m.role === 'staff' || m.role === 'system')
      .map((m) => m.body)
      .join('\n');
    if (bodies.includes(staffText)) {
      deliveredMs = Date.now() - sentAt;
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return {
    ok: deliveredMs != null,
    ms: Date.now() - t0,
    deliveredMs,
    error: deliveredMs == null ? 'feed_timeout' : undefined,
  };
}

async function runPool(total, concurrency, worker) {
  const results = [];
  let next = 0;
  async function run() {
    while (next < total) {
      const i = next++;
      results.push(await worker(i));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => run()),
  );
  return results;
}

console.log(
  `MEMORY bench BASE=${BASE} N=${N} concurrency=${CONCURRENCY} comercio=${COMERCIO}`,
);
const auth = await fetch(
  `${BASE}/api/panel/conversaciones?comercioId=${encodeURIComponent(COMERCIO)}`,
  { headers: { Authorization: `Bearer ${BEARER}` } },
);
if (auth.status === 401) {
  console.error('E2E bearer rejected — start Next with CHAT_SUPERVISION_MEMORY=1');
  process.exit(1);
}

const results = await runPool(N, CONCURRENCY, oneTurn);
const ok = results.filter((r) => r.ok);
const fail = results.filter((r) => !r.ok);
const delivered = ok
  .map((r) => r.deliveredMs)
  .filter((n) => Number.isFinite(n))
  .sort((a, b) => a - b);
const totalMs = ok.map((r) => r.ms).sort((a, b) => a - b);

console.log(
  JSON.stringify(
    {
      passed: ok.length,
      failed: fail.length,
      delivery_p50_ms: pct(delivered, 50),
      delivery_p95_ms: pct(delivered, 95),
      delivery_max_ms: delivered[delivered.length - 1] ?? null,
      turn_p50_ms: pct(totalMs, 50),
      turn_p95_ms: pct(totalMs, 95),
      sample_errors: fail.slice(0, 5).map((f) => f.error),
    },
    null,
    2,
  ),
);

const p95 = pct(delivered, 95);
if (fail.length || (p95 != null && p95 > 5000)) {
  process.exit(1);
}
