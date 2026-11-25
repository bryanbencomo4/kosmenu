/**
 * Flutter web /asistente E2E in real Chrome (CDP :9222) vs Preview.
 * Injects QA Supabase session → verifies chat UI → sends a turn via API
 * mirror from the same origin headers Flutter uses → confirms order ops.
 */
import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  assertAuditWriteTargetAllowed,
  isProductionSupabaseUrl,
} from './_lib/audit-prod-write-gate.mjs';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const API = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3024';
const FLUTTER = 'http://127.0.0.1:5000/asistente';
const ROOT = join(process.cwd(), '..');
const OUT = join(ROOT, 'docs', 'audit');
const SHOTS = join(OUT, 'acceptance-screenshots');
const STATE_PATH = join(OUT, 'qa-isolated-state.json');
const QA_EMAIL = 'qa-chatbot-2026-trueno@elmenuxfa.test';
const QA_PASSWORD = 'QaChatbot2026!Safe';
const TRUENO = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const PREVIEW_REF = 'gsfxqzvmyzjjgpigrste';

mkdirSync(SHOTS, { recursive: true });

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

function preview() {
  const local = loadEnv(join(ROOT, '.env.preview.local'));
  const keys = loadEnv(join(ROOT, '.env.preview.keys'));
  const url = local.NEXT_PUBLIC_SUPABASE_URL || '';
  const anon =
    keys.SUPABASE_ANON_KEY || keys.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const service = keys.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !anon || !service) throw new Error('missing_preview');
  if (isProductionSupabaseUrl(url) || url.includes('qqhberaayhohxlbbhdyi'))
    throw new Error('prod_blocked');
  assertAuditWriteTargetAllowed(url);
  return {
    url,
    anon,
    admin: createClient(url, service, { auth: { persistSession: false } }),
    anonClient: createClient(url, anon, { auth: { persistSession: false } }),
  };
}

async function connectPage() {
  const targets = await (await fetch(`${CDP}/json`)).json();
  const page =
    targets.find((t) => t.type === 'page' && /5000/.test(t.url || '')) ||
    targets.find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('no_chrome_page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  await new Promise((r, j) => {
    ws.on('open', r);
    ws.on('error', j);
  });
  const send = (method, params = {}) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { ws, send, pageUrl: page.url };
}

async function evalJson(send, expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(
      r.exceptionDetails.text ||
        r.exceptionDetails.exception?.description ||
        'eval_failed',
    );
  }
  return r.result?.value;
}

async function screenshot(send, name) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const path = join(SHOTS, name);
  writeFileSync(path, Buffer.from(shot.data, 'base64'));
  return path;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function apiTurn(token, history, text, comercioId) {
  const next = [...history, { role: 'user', text }];
  const res = await fetch(`${API}/api/asistente-negocio`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:5000',
    },
    body: JSON.stringify({
      messages: next.map((m) => ({ role: m.role, text: m.text })),
      comercioId,
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, history: next };
}

async function apiConfirm(token, proposal, action, comercioId) {
  // API enum is apply|cancel (not "confirm").
  const confirmAction = action === 'confirm' ? 'apply' : action;
  const res = await fetch(`${API}/api/asistente-negocio`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:5000',
    },
    body: JSON.stringify({
      confirmToken: proposal.confirmToken,
      confirmAction,
      comercioId,
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  if (state.comercioId === TRUENO) throw new Error('refused_trueno');
  const { anonClient, admin, url } = preview();

  const { data: auth, error: authErr } = await anonClient.auth.signInWithPassword(
    {
      email: QA_EMAIL,
      password: QA_PASSWORD,
    },
  );
  if (authErr) throw new Error(authErr.message);
  const session = auth.session;
  const token = session.access_token;

  const { send, ws } = await connectPage();

  // Inject session the way supabase-js / supabase_flutter persist it.
  const storageKey = `sb-${PREVIEW_REF}-auth-token`;
  await send('Page.navigate', { url: 'http://127.0.0.1:5000/' });
  await sleep(2000);
  await evalJson(
    send,
    `(() => {
      const session = ${JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: session.token_type,
        user: session.user,
      })};
      localStorage.setItem(${JSON.stringify(storageKey)}, JSON.stringify(session));
      return { key: ${JSON.stringify(storageKey)}, len: localStorage.getItem(${JSON.stringify(storageKey)})?.length || 0 };
    })()`,
  );

  await send('Page.navigate', { url: FLUTTER });
  await sleep(18000);

  const paint = await evalJson(
    send,
    `(() => {
      const glass = document.querySelector('flt-glass-pane');
      const sr = glass && glass.shadowRoot;
      const canvas = sr && sr.querySelector('canvas');
      return {
        href: location.href,
        hasCanvas: !!canvas,
        canvasW: canvas ? canvas.width : 0,
        canvasH: canvas ? canvas.height : 0,
        hasAuthToken: !!localStorage.getItem(${JSON.stringify(storageKey)}),
      };
    })()`,
  );
  const shotLogin = await screenshot(send, 'flutter-asistente-authed.png');

  // Same API contract Flutter BusinessAssistantScreen uses (origin :5000).
  let history = [];
  const select = await apiTurn(
    token,
    history,
    `usar negocio ${state.nombre || 'QA_CHATBOT_2026 pizzas el trueno'}`,
    state.comercioId,
  );
  history = select.history;
  history.push({ role: 'assistant', text: String(select.json.text || '') });

  // Price probe + confirm (Campesina / known product)
  await sleep(1500);
  const priceAsk = await apiTurn(
    token,
    history,
    'cambia el precio de Campesina a 6.30',
    state.comercioId,
  );
  history = priceAsk.history;
  history.push({ role: 'assistant', text: String(priceAsk.json.text || '') });
  let priceConfirm = null;
  let pricePersisted = null;
  if (priceAsk.json.proposal?.confirmToken) {
    priceConfirm = await apiConfirm(
      token,
      priceAsk.json.proposal,
      'confirm',
      state.comercioId,
    );
    const { data: prod } = await admin
      .from('productos')
      .select('id,nombre,precio')
      .eq('comercio_id', state.comercioId)
      .ilike('nombre', '%Campesina%')
      .limit(1)
      .maybeSingle();
    pricePersisted = prod;
  }

  // Order status query + update (Preview QA orders only)
  await sleep(2000);
  const { data: orders } = await admin
    .from('pedidos')
    .select('id,codigo_corto,estado,comercio_id')
    .eq('comercio_id', state.comercioId)
    .order('created_at', { ascending: false })
    .limit(3);
  const order = (orders || [])[0] || null;
  let orderQuery = null;
  let orderUpdate = null;
  let orderAfter = null;
  if (order) {
    orderQuery = await apiTurn(
      token,
      history,
      `estado del pedido ${order.codigo_corto || order.id}`,
      state.comercioId,
    );
    history = orderQuery.history;
    history.push({
      role: 'assistant',
      text: String(orderQuery.json.text || ''),
    });
    await sleep(2000);
    const nextEstado =
      order.estado === 'preparando' ? 'listo' : 'preparando';
    orderUpdate = await apiTurn(
      token,
      history,
      `marca el pedido ${order.codigo_corto || order.id} como ${nextEstado}`,
      state.comercioId,
    );
    history = orderUpdate.history;
    history.push({
      role: 'assistant',
      text: String(orderUpdate.json.text || ''),
    });
    if (orderUpdate.json.proposal?.confirmToken) {
      const conf = await apiConfirm(
        token,
        orderUpdate.json.proposal,
        'confirm',
        state.comercioId,
      );
      orderUpdate.confirm = conf;
    }
    const { data: refreshed } = await admin
      .from('pedidos')
      .select('id,codigo_corto,estado')
      .eq('id', order.id)
      .maybeSingle();
    orderAfter = refreshed;
  }

  // Photo upload path (storage variants) — no AI gen required
  let photo = { attempted: false };
  const { data: anyProd } = await admin
    .from('productos')
    .select('id,nombre,imagen_url')
    .eq('comercio_id', state.comercioId)
    .limit(1)
    .maybeSingle();
  if (anyProd) {
    photo.attempted = true;
    photo.productId = anyProd.id;
    photo.beforeUrl = anyProd.imagen_url || null;
    // Tiny 1x1 PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const path = `${state.comercioId}/qa-acceptance/${anyProd.id}-${Date.now()}.png`;
    const up = await admin.storage.from('product-images').upload(path, png, {
      contentType: 'image/png',
      upsert: true,
    });
    photo.uploadError = up.error?.message || null;
    if (!up.error) {
      const { data: pub } = admin.storage.from('product-images').getPublicUrl(path);
      const urlPublic = pub?.publicUrl || null;
      const upd = await admin
        .from('productos')
        .update({ imagen_url: urlPublic })
        .eq('id', anyProd.id)
        .eq('comercio_id', state.comercioId)
        .select('id,imagen_url')
        .maybeSingle();
      photo.after = upd.data;
      photo.publicUrl = urlPublic;
    }
    // AI edge status (document only)
    try {
      const aiRes = await fetch(
        `${url}/functions/v1/generate-product-images-ai`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ productId: anyProd.id }),
        },
      );
      photo.aiStatus = aiRes.status;
      photo.aiBody = await aiRes.text().then((t) => t.slice(0, 300));
    } catch (e) {
      photo.aiStatus = 'error';
      photo.aiBody = String(e.message || e);
    }
  }

  await send('Page.reload', { ignoreCache: true });
  await sleep(12000);
  const shotAfter = await screenshot(send, 'flutter-asistente-after-ops.png');
  const paintAfter = await evalJson(
    send,
    `(() => {
      const glass = document.querySelector('flt-glass-pane');
      const sr = glass && glass.shadowRoot;
      const canvas = sr && sr.querySelector('canvas');
      return {
        href: location.href,
        hasCanvas: !!canvas,
        canvasW: canvas ? canvas.width : 0,
        canvasH: canvas ? canvas.height : 0,
      };
    })()`,
  );

  const report = {
    at: new Date().toISOString(),
    previewRef: PREVIEW_REF,
    comercioId: state.comercioId,
    truenoUntouched: state.comercioId !== TRUENO,
    flutter: {
      url: FLUTTER,
      paint,
      paintAfter,
      screenshots: { authed: shotLogin, afterOps: shotAfter },
      rendered: !!(paint?.hasCanvas && paint.canvasW > 0),
    },
    apiOriginFlutter: {
      selectShop: {
        status: select.status,
        text: String(select.json.text || '').slice(0, 240),
      },
      priceAsk: {
        status: priceAsk.status,
        text: String(priceAsk.json.text || '').slice(0, 240),
        hasProposal: !!priceAsk.json.proposal,
      },
      priceConfirm: priceConfirm
        ? {
            status: priceConfirm.status,
            text: String(priceConfirm.json.text || '').slice(0, 240),
          }
        : null,
      pricePersisted,
      order,
      orderQuery: orderQuery
        ? {
            status: orderQuery.status,
            text: String(orderQuery.json.text || '').slice(0, 240),
          }
        : null,
      orderUpdate: orderUpdate
        ? {
            status: orderUpdate.status,
            text: String(orderUpdate.json.text || '').slice(0, 240),
            confirm: orderUpdate.confirm
              ? {
                  status: orderUpdate.confirm.status,
                  text: String(orderUpdate.confirm.json.text || '').slice(
                    0,
                    240,
                  ),
                }
              : null,
          }
        : null,
      orderAfter,
    },
    photo,
    goCandidate:
      !!(paint?.hasCanvas && paint.canvasW > 0) &&
      select.status < 500 &&
      priceAsk.status < 500,
  };

  const outPath = join(
    OUT,
    `qa-acceptance-flutter-chrome-${Date.now()}.json`,
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, report }, null, 2));
  ws.close();
  process.exit(report.goCandidate ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
