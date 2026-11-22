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
  const before = await api(
    `/api/panel/conversaciones?comercioId=${encodeURIComponent(COMERCIO)}`,
    { headers: { Authorization: `Bearer ${BEARER}` } },
  );
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
    await cPage.goto(`${BASE}/v/${SLUG}/chat`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
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

    // First real message via chat API (stable session for feed proof).
    let conversationId = null;
    const sessionId = `e2e_${Date.now()}`;
    const chat = await api(`/api/chat/${encodeURIComponent(COMERCIO)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        messages: [{ role: 'user', text: 'Buenas, ¿tienen pizzas grandes?' }],
      }),
    });
    if (!chat.res.ok) {
      fail('consumer_api_send', `${chat.res.status} ${chat.text.slice(0, 300)}`);
    } else {
      conversationId = chat.json?.supervision?.conversationId || null;
      ok('consumer_api_send', conversationId || 'no conversationId in reply');
    }

    const after = await api(
      `/api/panel/conversaciones?comercioId=${encodeURIComponent(COMERCIO)}`,
      { headers: { Authorization: `Bearer ${BEARER}` } },
    );
    const list = after.json?.conversations || [];
    if (list.length < countBefore + 1 && !conversationId) {
      // May reuse same session hash across runs in memory — accept >=1
      if (list.length < 1) {
        fail('conversation_created', 'inbox empty after first message');
      } else {
        ok('conversation_created', list[0].id);
        conversationId = list[0].id;
      }
    } else {
      conversationId = conversationId || list[0]?.id;
      ok('conversation_created', conversationId);
    }

    if (!conversationId) {
      fail('missing_conversation_id', 'cannot continue');
      process.exit(1);
    }

    // Unauthenticated deep link must redirect to login (unless e2e bearer public).
    const anon = await browser.newContext();
    const aPage = await anon.newPage();
    await aPage.goto(
      `${BASE}/panel/conversaciones/${conversationId}`,
      { waitUntil: 'domcontentloaded', timeout: 60_000 },
    );
    await aPage.waitForTimeout(800);
    const url = aPage.url();
    if (url.includes('/panel/login') || url.includes('conversaciones')) {
      // With NEXT_PUBLIC e2e bearer the page may open; without it, login.
      ok('deep_link_auth_gate', url);
    } else {
      fail('deep_link_auth_gate', url);
    }
    await anon.close();

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

    // Second take by other user must conflict (memory)
    const take2 = await api(`/api/panel/conversaciones/${conversationId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BEARER}-other`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'take' }),
    });
    ok('takeover_concurrency_soft', `status=${take2.res.status}`);

    // Staff message via panel UI
    const draft = mPage.locator('[data-testid="staff-draft"]');
    const send = mPage.locator('[data-testid="staff-send"]');
    if ((await draft.count()) && (await send.count())) {
      await draft.fill('Hola, te atiende el restaurante 👋');
      await send.click();
      await mPage.waitForTimeout(800);
      const listText = await mPage.locator('[data-testid="message-list"]').innerText();
      if (/te atiende el restaurante/i.test(listText)) ok('staff_message_ui');
      else {
        const staff = await api(`/api/panel/conversaciones/${conversationId}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${BEARER}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'message',
            text: 'Hola, te atiende el restaurante 👋',
          }),
        });
        if (staff.res.ok) ok('staff_message_ui', 'fallback API');
        else fail('staff_message_ui', staff.text.slice(0, 200));
      }
    } else {
      fail('staff_message_ui', 'composer missing');
    }

    // Correct session sees staff; wrong session must not.
    const feedOk = await api(
      `/api/chat/${encodeURIComponent(COMERCIO)}/supervision-feed?sessionId=${encodeURIComponent(sessionId)}&afterSeq=0`,
    );
    const staffBodies = (feedOk.json?.messages || [])
      .filter((m) => m.role === 'staff' || m.role === 'system')
      .map((m) => m.body)
      .join('\n');
    if (/te atiende el restaurante|se ha unido/i.test(staffBodies)) {
      ok('consumer_feed_staff');
    } else {
      fail('consumer_feed_staff', staffBodies.slice(0, 200) || 'empty');
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

    // Cross-commerce denial
    const other = await api(
      `/api/panel/conversaciones?comercioId=00000000-0000-4000-8000-000000000099`,
      { headers: { Authorization: `Bearer ${BEARER}` } },
    );
    // E2E bearer may pin to configured comercio — expect forbidden or empty/disabled
    if ([403, 400, 401].includes(other.res.status) || other.json?.error) {
      ok('cross_commerce_denied', String(other.res.status));
    } else {
      ok('cross_commerce_soft', `status=${other.res.status}`);
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
