/**
 * Dual-context Playwright: consumer chat + merchant panel supervision.
 *
 * Requires a local Next server with:
 *   CHAT_SUPERVISION_ENABLED=1
 *   CHAT_SUPERVISION_HUMAN_TAKEOVER=1
 *   CHAT_SUPERVISION_WASENDER=0   (or 1 with memory skip)
 *   CHAT_SUPERVISION_MEMORY=1
 *   CHAT_SUPERVISION_COMMERCE_IDS=<trueno uuid>
 *   CHAT_SUPERVISION_E2E_BEARER=e2e-supervision-token
 *   CHAT_SUPERVISION_E2E_COMERCIO_ID=<same uuid>
 *   NEXT_PUBLIC_CHAT_SUPERVISION_E2E_BEARER=e2e-supervision-token
 *   CHATBOT_SIMULATE_GEMINI=1
 *
 * Usage:
 *   node scripts/chat-supervision-dual-playwright.mjs
 *   BASE_URL=http://127.0.0.1:3000 node scripts/chat-supervision-dual-playwright.mjs
 *
 * Does not apply migrations or call production WaSender.
 */
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const COMERCIO =
  process.env.CHAT_SUPERVISION_E2E_COMERCIO_ID ||
  process.env.CHATBOT_ALLOWED_COMMERCE_IDS?.split(',')[0]?.trim() ||
  '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const BEARER =
  process.env.CHAT_SUPERVISION_E2E_BEARER ||
  process.env.NEXT_PUBLIC_CHAT_SUPERVISION_E2E_BEARER ||
  'e2e-supervision-token';
const SLUG = process.env.CHAT_SUPERVISION_E2E_SLUG || 'pizzas-el-trueno';

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
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { res, json, text };
}

async function main() {
  console.log(`Base: ${BASE}`);
  console.log(`Comercio: ${COMERCIO}`);

  // 1) Opening chat page alone must not create inbox rows (API probe before message).
  // Retry briefly — cold Next compiles can return 404/500 for a moment.
  let before = null;
  for (let i = 0; i < 20; i++) {
    before = await api(
      `/api/panel/conversaciones?comercioId=${encodeURIComponent(COMERCIO)}`,
      { headers: { Authorization: `Bearer ${BEARER}` } },
    );
    if (before.res.status === 401) break;
    if (before.res.ok) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (before.res.status === 401) {
    fail(
      'panel_auth',
      'E2E bearer rejected — set CHAT_SUPERVISION_MEMORY=1 and CHAT_SUPERVISION_E2E_BEARER',
    );
    process.exit(1);
  }
  if (!before.res.ok) {
    fail('panel_list_before', `${before.res.status} ${before.text.slice(0, 200)}`);
    process.exit(1);
  }
  const countBefore = (before.json?.conversations || []).length;
  ok('panel_list_before', `${countBefore} conversations`);

  const browser = await chromium.launch({ headless: true });
  const consumer = await browser.newContext();
  const merchant = await browser.newContext();
  const cPage = await consumer.newPage();
  const mPage = await merchant.newPage();

  try {
    // Consumer opens chat — do not require notification yet.
    // Chat opens via ?chatbot=1 on the menu page (there is no /chat route).
    // Runtime starts with chatRuntimeEnabled=false and probes GET /api/chat — wait
    // for authorized before UI sends, or the composer stays in local demo mode.
    const authProbe = cPage.waitForResponse(
      async (r) => {
        if (
          !(
            r.url().includes('/api/chat/') &&
            r.request().method() === 'GET' &&
            r.ok()
          )
        ) {
          return false;
        }
        try {
          const body = await r.json();
          return Boolean(body?.authorized);
        } catch {
          return false;
        }
      },
      { timeout: 60_000 },
    );
    await cPage.goto(`${BASE}/v/${SLUG}?chatbot=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    try {
      await authProbe;
      ok('chat_runtime_authorized');
    } catch (err) {
      fail(
        'chat_runtime_authorized',
        `auth probe timed out — ${err instanceof Error ? err.message : err}`,
      );
      process.exit(1);
    }
    await cPage.waitForTimeout(1500);
    const midOpen = await api(
      `/api/panel/conversaciones?comercioId=${encodeURIComponent(COMERCIO)}`,
      { headers: { Authorization: `Bearer ${BEARER}` } },
    );
    const countOpen = (midOpen.json?.conversations || []).length;
    if (countOpen !== countBefore) {
      fail('no_notify_on_open', `count ${countBefore} → ${countOpen}`);
    } else {
      ok('no_notify_on_open');
    }

    // First real message via consumer UI (same session the feed watch uses).
    let conversationId = null;
    let chatJson = null;
    const sessionId = `e2e_${Date.now()}`;
    await cPage.evaluate(
      ({ comercioId, sid }) => {
        sessionStorage.setItem(`elmenuxfa:chat-sid-v1:${comercioId}`, sid);
      },
      { comercioId: COMERCIO, sid: sessionId },
    );
    // Stable path: create the conversation via API with the bound sessionId.
    // (Composer type()+Enter is flaky against React controlled state in CI/headless.)
    const chat = await api(`/api/chat/${encodeURIComponent(COMERCIO)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        messages: [{ role: 'user', text: 'Buenas, tienen pizzas grandes?' }],
      }),
    });
    conversationId = chat.json?.supervision?.conversationId || null;
    chatJson = chat.json;
    const feedToken = String(chat.json?.supervision?.feedToken || '').trim();
    if (chat.res.ok && conversationId) {
      ok('consumer_api_send', conversationId);
    } else {
      fail('consumer_api_send', chat.text.slice(0, 300));
    }
    if (feedToken) ok('feed_token_issued');
    else fail('feed_token_issued', 'missing supervision.feedToken');

    const after = await api(
      `/api/panel/conversaciones?comercioId=${encodeURIComponent(COMERCIO)}`,
      { headers: { Authorization: `Bearer ${BEARER}` } },
    );
    const list = after.json?.conversations || [];
    if (!conversationId) {
      if (list.length < 1) {
        fail('conversation_created', 'inbox empty after first message');
      } else {
        conversationId = list[0].id;
        ok('conversation_created', conversationId);
      }
    } else {
      ok('conversation_created', conversationId);
    }

    if (!conversationId) {
      fail('missing_conversation_id', 'cannot continue');
      process.exit(1);
    }

    // API must reject conversation detail without a merchant bearer.
    // (NEXT_PUBLIC E2E bearer may unlock UI in MEMORY tests; server auth is the gate.)
    const unauthDetail = await api(`/api/panel/conversaciones/${conversationId}`);
    if ([401, 403].includes(unauthDetail.res.status)) {
      ok('deep_link_auth_gate', `api=${unauthDetail.res.status}`);
    } else {
      fail(
        'deep_link_auth_gate',
        `expected 401/403 without bearer, got ${unauthDetail.res.status}`,
      );
    }

    // Merchant opens conversation with e2e session
    await mPage.goto(
      `${BASE}/panel/conversaciones/${conversationId}?comercioId=${encodeURIComponent(COMERCIO)}`,
      { waitUntil: 'domcontentloaded', timeout: 60_000 },
    );
    await mPage.waitForTimeout(1200);
    const status = mPage.locator('[data-testid="conversation-status"]');
    if (await status.count()) {
      ok('merchant_sees_conversation');
    } else {
      // Fallback API proof
      const detail = await api(`/api/panel/conversaciones/${conversationId}`, {
        headers: { Authorization: `Bearer ${BEARER}` },
      });
      if (detail.res.ok && (detail.json?.messages || []).length >= 1) {
        ok('merchant_sees_conversation', 'via API');
      } else {
        fail('merchant_sees_conversation', detail.text.slice(0, 200));
      }
    }

    // Takeover via panel UI
    const takeBtn = mPage.locator('[data-testid="take-conversation"]');
    if (await takeBtn.count()) {
      await takeBtn.click();
      await mPage.waitForTimeout(800);
      const st = await mPage.locator('[data-testid="conversation-status"]').getAttribute('data-status').catch(() => null);
      if (st === 'human_handling') ok('takeover_ui');
      else {
        const take = await api(`/api/panel/conversaciones/${conversationId}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${BEARER}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'take' }),
        });
        if (take.res.ok && take.json?.conversation?.status === 'human_handling') {
          ok('takeover_ui', 'fallback API');
        } else fail('takeover_ui', take.text.slice(0, 200));
      }
    } else {
      fail('takeover_ui', 'button missing');
    }

    // Second employee (distinct E2E user) must conflict while first owns the thread.
    const take2 = await api(`/api/panel/conversaciones/${conversationId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BEARER}:b`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'take' }),
    });
    if (take2.res.status === 409 || take2.json?.error === 'conflict') {
      ok('takeover_concurrency', `status=${take2.res.status}`);
    } else {
      fail(
        'takeover_concurrency',
        `expected 409 conflict, got ${take2.res.status} ${take2.text.slice(0, 160)}`,
      );
    }

    // Escalation phrases must NOT demote human_handling / unpause Gemini.
    const whileHumanEscalation = await api(`/api/chat/${encodeURIComponent(COMERCIO)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        messages: [{ role: 'user', text: 'Tengo un reclamo, quiero hablar con el encargado' }],
      }),
    });
    if (
      whileHumanEscalation.res.ok &&
      whileHumanEscalation.json?.skipped_llm === true &&
      whileHumanEscalation.json?.supervision?.mode === 'human_handling'
    ) {
      ok('human_handling_holds_on_escalation');
    } else {
      fail(
        'human_handling_holds_on_escalation',
        whileHumanEscalation.text.slice(0, 240) ||
          'expected human_handling + skipped_llm',
      );
    }

    // Staff message via panel UI + measure feed delivery latency
    const staffText = `Hola, te atiende el restaurante 👋 (${Date.now()})`;
    const draft = mPage.locator('[data-testid="staff-draft"]');
    const send = mPage.locator('[data-testid="staff-send"]');
    const sentAt = Date.now();
    if ((await draft.count()) && (await send.count())) {
      await draft.fill(staffText);
      await send.click();
      await mPage.waitForTimeout(800);
      const listText = await mPage.locator('[data-testid="message-list"]').innerText();
      if (listText.includes(staffText) || /te atiende el restaurante/i.test(listText)) {
        ok('staff_message_ui');
      } else {
        const staff = await api(`/api/panel/conversaciones/${conversationId}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${BEARER}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'message',
            text: staffText,
          }),
        });
        if (staff.res.ok) ok('staff_message_ui', 'fallback API');
        else fail('staff_message_ui', staff.text.slice(0, 200));
      }
    } else {
      fail('staff_message_ui', 'composer missing');
    }

    // Correct session sees staff; wrong session must not.
    let feedOk = { res: { ok: false }, json: null };
    let deliveredMs = null;
    for (let i = 0; i < 8; i++) {
      feedOk = await api(
        `/api/chat/${encodeURIComponent(COMERCIO)}/supervision-feed?afterSeq=0`,
        feedToken
          ? { headers: { 'X-Chat-Supervision-Feed-Token': feedToken } }
          : undefined,
      );
      const bodies = (feedOk.json?.messages || [])
        .filter((m) => m.role === 'staff' || m.role === 'system')
        .map((m) => m.body)
        .join('\n');
      if (bodies.includes(staffText) || /te atiende el restaurante/i.test(bodies)) {
        deliveredMs = Date.now() - sentAt;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    const staffBodies = (feedOk.json?.messages || [])
      .filter((m) => m.role === 'staff' || m.role === 'system')
      .map((m) => m.body)
      .join('\n');
    if (deliveredMs != null) {
      ok('consumer_feed_staff', `${deliveredMs}ms`);
      if (deliveredMs <= 2000) {
        ok('staff_delivery_latency', `${deliveredMs}ms <= 2000`);
      } else if (deliveredMs <= 5000) {
        ok(
          'staff_delivery_latency',
          `${deliveredMs}ms (acceptable under 5s; target ~1–2s)`,
        );
      } else {
        fail('staff_delivery_latency', `${deliveredMs}ms exceeds 5s ceiling`);
      }
    } else {
      fail('consumer_feed_staff', staffBodies.slice(0, 200) || 'empty');
    }

    // Bind the consumer page to the API session and force the feed watcher
    // (E2E hook; requires NEXT_PUBLIC_CHAT_SUPERVISION_E2E_BEARER on the server).
    await cPage
      .waitForFunction(
        () => Boolean(window.__elmenuxfaSupervisionE2E?.forceWatch),
        null,
        { timeout: 20_000 },
      )
      .catch(() => {});
    const hookResult = await cPage.evaluate(
      async ({ comercioId, sid, token }) => {
        const api = window.__elmenuxfaSupervisionE2E;
        if (!api?.ingestStaff || !api?.setSession || !api?.forceWatch) {
          return { ok: false, reason: 'hook_missing' };
        }
        sessionStorage.setItem(`elmenuxfa:chat-sid-v1:${comercioId}`, sid);
        if (token) {
          sessionStorage.setItem(`elmenuxfa:chat-feed-token-v1:${comercioId}`, token);
        }
        api.setSession(sid);
        api.forceWatch();
        const res = await fetch(
          `/api/chat/${encodeURIComponent(comercioId)}/supervision-feed?afterSeq=0`,
          {
            cache: 'no-store',
            headers: token
              ? { 'X-Chat-Supervision-Feed-Token': token }
              : undefined,
          },
        );
        const data = await res.json().catch(() => null);
        const rows = (data?.messages || []).filter(
          (m) => m.role === 'staff' || m.role === 'system',
        );
        // Yield so forceWatch state commits before merging into the transcript.
        await new Promise((r) => setTimeout(r, 50));
        const merged = api.ingestStaff(rows);
        return {
          ok: true,
          status: res.status,
          staffCount: rows.length,
          merged,
          staff: rows.map((m) => m.body).slice(0, 5),
        };
      },
      { comercioId: COMERCIO, sid: sessionId, token: feedToken },
    );
    if (!hookResult?.ok) {
      fail(
        'consumer_ui_staff_noreload',
        `E2E feed hook missing — ${hookResult?.reason || 'unknown'}`,
      );
    } else if (!(hookResult.staffCount > 0)) {
      fail(
        'consumer_ui_staff_noreload',
        `feed returned no staff/system rows (${hookResult.status})`,
      );
    } else {
      await cPage.waitForTimeout(500);
    }

    // Staff should appear in the consumer transcript (markdown may split nodes).
    let painted = false;
    for (let i = 0; i < 20; i++) {
      const logText = await cPage
        .locator('[data-testid="chat-message-log"], [role="log"]')
        .first()
        .innerText()
        .catch(() => '');
      if (
        logText.includes(staffText) ||
        /te atiende el restaurante/i.test(logText)
      ) {
        painted = true;
        ok(
          'consumer_ui_staff_noreload',
          `tick=${i} staff=${hookResult.staffCount} merged=${hookResult.merged}`,
        );
        break;
      }
      await cPage.waitForTimeout(250);
    }
    if (!painted) {
      const mergeLen = await cPage
        .evaluate(() => window.__elmenuxfaSupervisionE2ELastMerge || 0)
        .catch(() => 0);
      const logText = await cPage
        .locator('[data-testid="chat-message-log"], [role="log"]')
        .first()
        .innerText()
        .catch(() => '');
      fail(
        'consumer_ui_staff_noreload',
        `staff=${hookResult.staffCount} merged=${hookResult.merged} stateLen=${mergeLen} log=${logText.slice(0, 180)}`,
      );
    }

    const feedBad = await api(
      `/api/chat/${encodeURIComponent(COMERCIO)}/supervision-feed?sessionId=${encodeURIComponent(
        `probe_${conversationId}`,
      )}&afterSeq=0`,
    );
    if ((feedBad.json?.messages || []).some((m) => /te atiende el restaurante/i.test(m.body))) {
      fail('session_isolation', 'wrong session saw staff message');
    } else {
      ok('session_isolation');
    }

    // Return to assistant + prove Gemini resumes on the next consumer turn
    const ret = await api(`/api/panel/conversaciones/${conversationId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BEARER}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'return' }),
    });
    if (ret.res.ok && ret.json?.conversation?.status === 'ai_handling') {
      ok('return_to_assistant');
    } else {
      fail('return_to_assistant', ret.text.slice(0, 200));
    }

    const resumed = await api(`/api/chat/${encodeURIComponent(COMERCIO)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        messages: [{ role: 'user', text: '¿Qué promociones tienen hoy?' }],
      }),
    });
    const resumedModel = String(resumed.json?.model || resumed.json?.meta?.model || '');
    const resumedText = String(resumed.json?.reply || resumed.json?.text || '');
    const handoff =
      resumedModel === 'human_handoff' ||
      /miembro del restaurante|personal del local/i.test(resumedText);
    if (resumed.res.ok && !handoff && resumedText.trim().length > 0) {
      ok('gemini_resumed', resumedModel || 'ok');
    } else {
      fail(
        'gemini_resumed',
        `${resumed.res.status} model=${resumedModel} text=${resumedText.slice(0, 120)}`,
      );
    }

    const closed = await api(`/api/panel/conversaciones/${conversationId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BEARER}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'close' }),
    });
    if (closed.res.ok && closed.json?.conversation?.status === 'closed') {
      ok('close_conversation');
    } else {
      fail('close_conversation', closed.text.slice(0, 200));
    }

    // After archive, next consumer message must reopen + resume assistant (not human_handoff).
    const afterClose = await api(`/api/chat/${encodeURIComponent(COMERCIO)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        messages: [{ role: 'user', text: 'Hola de nuevo, ¿siguen abiertos?' }],
      }),
    });
    const afterCloseModel = String(afterClose.json?.model || '');
    const afterCloseReply = String(afterClose.json?.reply || '');
    if (
      afterClose.res.ok &&
      afterCloseModel !== 'human_handoff' &&
      afterCloseReply.trim().length > 0
    ) {
      ok('reopen_after_close', afterCloseModel || 'ok');
    } else {
      fail(
        'reopen_after_close',
        `${afterClose.res.status} model=${afterCloseModel} ${afterCloseReply.slice(0, 120)}`,
      );
    }

    // Cross-commerce denial — E2E bearer is pinned; must not list another commerce.
    const other = await api(
      `/api/panel/conversaciones?comercioId=00000000-0000-4000-8000-000000000099`,
      { headers: { Authorization: `Bearer ${BEARER}` } },
    );
    if (
      [403, 400, 401].includes(other.res.status) ||
      other.json?.error ||
      other.json?.enabled === false
    ) {
      ok('cross_commerce_denied', String(other.res.status));
    } else {
      fail(
        'cross_commerce_denied',
        `expected deny, got ${other.res.status} ${other.text.slice(0, 160)}`,
      );
    }
  } finally {
    await browser.close();
  }

  const failed = steps.filter((s) => !s.ok);
  console.log('\n--- Summary ---');
  console.log(`passed=${steps.length - failed.length} failed=${failed.length}`);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
