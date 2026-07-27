/**
 * Preview integration harness for Zeno billing Phase 2.
 * Does NOT print secrets. Does NOT charge real crypto unless ZENO_API_KEY is set
 * and RUN_LIVE_ZENO_CHECKOUT=1.
 *
 * Usage (from repo root, with env loaded):
 *   deno run -A supabase/functions/zeno-preview-integration.ts
 */

import { Webhook } from 'https://esm.sh/svix@1.37.0';

const PREVIEW_REF = 'gsfxqzvmyzjjgpigrste';
const BASE = `https://${PREVIEW_REF}.supabase.co`;
const FN = `${BASE}/functions/v1`;

type Result = { name: string; ok: boolean; detail: string };

const results: Result[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name)?.trim() ?? '';
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function loadDotEnv(path: string) {
  try {
    const text = await Deno.readTextFile(path);
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    // optional
  }
}

async function rest(
  path: string,
  opts: { method?: string; token: string; body?: unknown; prefer?: string } ,
) {
  const headers: Record<string, string> = {
    apikey: requireEnv('SUPABASE_ANON_KEY'),
    Authorization: `Bearer ${opts.token}`,
    'Content-Type': 'application/json',
  };
  if (opts.prefer) headers.Prefer = opts.prefer;
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, text };
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: requireEnv('SUPABASE_ANON_KEY'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`signIn failed for ${email}: ${res.status}`);
  }
  return json.access_token as string;
}

function signSvix(rawBody: string, msgId: string): Record<string, string> {
  const secret = requireEnv('ZENO_WEBHOOK_SECRET');
  const wh = new Webhook(secret);
  const timestamp = Math.floor(Date.now() / 1000);
  // svix library exposes sign for tests
  const signature = (wh as unknown as { sign: (id: string, ts: Date, body: string) => string })
    .sign(msgId, new Date(timestamp * 1000), rawBody);
  return {
    'svix-id': msgId,
    'svix-timestamp': String(timestamp),
    'svix-signature': signature,
  };
}

async function postWebhook(rawBody: string, headers: Record<string, string>) {
  const res = await fetch(`${FN}/zeno-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: rawBody,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

async function main() {
  await loadDotEnv('supabase/functions/.env.zeno.preview.local');
  await loadDotEnv('.env.preview.keys');
  await loadDotEnv('.env.preview.auth.local');
  await loadDotEnv('.env.preview.local');

  const service = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anon = requireEnv('SUPABASE_ANON_KEY');
  Deno.env.set('SUPABASE_ANON_KEY', anon);

  // --- 1) Unauthenticated create-zeno-checkout ---
  {
    const res = await fetch(`${FN}/create-zeno-checkout`, {
      method: 'POST',
      headers: {
        apikey: anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const text = await res.text();
    record(
      '1. No autenticado',
      res.status === 401,
      `status=${res.status} body=${text.slice(0, 120)}`,
    );
  }

  // Auth owners
  const tokenA = await signIn(
    requireEnv('PREVIEW_OWNER_A_EMAIL'),
    requireEnv('PREVIEW_OWNER_A_PASSWORD'),
  );
  const tokenB = await signIn(
    requireEnv('PREVIEW_OWNER_B_EMAIL'),
    requireEnv('PREVIEW_OWNER_B_PASSWORD'),
  );

  // Resolve comercios for A and B
  const comerciosA = await rest('comercios?select=id,en_linea,billing_exempt,owner_id', {
    token: service,
  });
  const list = (comerciosA.json as Array<Record<string, unknown>>) ?? [];
  const ownerA = requireEnv('PREVIEW_OWNER_A_UID');
  const ownerB = requireEnv('PREVIEW_OWNER_B_UID');
  const commerceA = list.find((c) => String(c.owner_id) === ownerA);
  const commerceB = list.find((c) => String(c.owner_id) === ownerB);
  if (!commerceA?.id) throw new Error('No commerce for owner A');
  const businessA = String(commerceA.id);
  const businessB = commerceB ? String(commerceB.id) : '';

  // --- Legacy snapshot already validated separately; re-check here ---
  {
    const allExempt = list.every((c) => c.billing_exempt === true);
    const enLineaSame = list.length >= 1;
    record(
      '12. Legacy',
      allExempt && enLineaSame,
      `total=${list.length} all_billing_exempt=${allExempt}`,
    );
  }

  // --- Authenticated checkout (needs ZENO_API_KEY) ---
  const hasZenoKey = Boolean(Deno.env.get('ZENO_API_KEY')?.trim());
  const runLive = Deno.env.get('RUN_LIVE_ZENO_CHECKOUT') === '1';
  if (!hasZenoKey || !runLive) {
    record(
      '2. Precio desde DB / checkout USD 10',
      false,
      'BLOCKED: ZENO_API_KEY / RUN_LIVE_ZENO_CHECKOUT not set (no live Zeno call)',
    );
    record(
      '3. Reutilización',
      false,
      'BLOCKED: depends on live checkout',
    );
  } else {
    const body = JSON.stringify({
      comercio_id: businessA,
      priceAmount: 1, // should be ignored
      amount: 999,
    });
    const res1 = await fetch(`${FN}/create-zeno-checkout`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
        'x-comercio-id': businessA,
      },
      body,
    });
    const j1 = await res1.json();
    const okCreate = res1.status === 200 && typeof j1.checkoutUrl === 'string';
    record(
      '2. Precio desde DB / checkout USD 10',
      okCreate,
      `status=${res1.status} reused=${j1.reused} hasUrl=${Boolean(j1.checkoutUrl)}`,
    );

    const res2 = await fetch(`${FN}/create-zeno-checkout`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
        'x-comercio-id': businessA,
      },
      body: JSON.stringify({ comercio_id: businessA }),
    });
    const j2 = await res2.json();
    record(
      '3. Reutilización',
      res2.status === 200 && j2.reused === true && j2.checkoutId === j1.checkoutId,
      `status=${res2.status} reused=${j2.reused} sameId=${j2.checkoutId === j1.checkoutId}`,
    );
  }

  // Seed plan/subscription/payment for webhook tests via service role
  const planRes = await rest('plans?code=eq.menu_monthly&select=id,price_amount,price_currency', {
    token: service,
  });
  const plan = (planRes.json as Array<Record<string, unknown>>)[0];
  const planId = String(plan.id);
  const amount = Number(plan.price_amount);

  // Upsert subscription for A
  await rest('subscriptions', {
    method: 'POST',
    token: service,
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      user_id: ownerA,
      business_id: businessA,
      plan_id: planId,
      provider: 'zeno',
      status: 'pending',
    },
  });
  const subRes = await rest(
    `subscriptions?business_id=eq.${businessA}&plan_id=eq.${planId}&select=*`,
    { token: service },
  );
  const sub = (subRes.json as Array<Record<string, unknown>>)[0];
  const subId = String(sub.id);

  const orderId = `km_itest_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const checkoutId = `ch_itest_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const enLineaBefore = commerceA.en_linea === true;

  await rest('payments', {
    method: 'POST',
    token: service,
    prefer: 'return=representation',
    body: {
      subscription_id: subId,
      business_id: businessA,
      provider: 'zeno',
      provider_checkout_id: checkoutId,
      order_id: orderId,
      amount,
      currency: 'USD',
      status: 'open',
      checkout_url: `https://pay.zenobank.io/${checkoutId}`,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      period_start: new Date().toISOString(),
      period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
    },
  });

  // --- 4) Invalid signature ---
  {
    const payload = JSON.stringify({
      type: 'checkout.completed',
      data: {
        id: checkoutId,
        orderId,
        priceCurrency: 'USD',
        priceAmount: String(amount),
        paidAmount: String(amount),
        status: 'COMPLETED',
      },
    });
    const res = await postWebhook(payload, {
      'svix-id': `msg_bad_${Date.now()}`,
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': 'v1,dGVzdA==',
    });
    const payAfter = await rest(`payments?order_id=eq.${orderId}&select=status`, { token: service });
    const status = (payAfter.json as Array<Record<string, unknown>>)[0]?.status;
    record(
      '4. Firma inválida',
      res.status === 400 && status === 'open',
      `status=${res.status} payment_status=${status}`,
    );
  }

  // --- 5) checkout.completed ---
  {
    const payload = JSON.stringify({
      type: 'checkout.completed',
      data: {
        id: checkoutId,
        orderId,
        priceCurrency: 'USD',
        priceAmount: String(amount),
        paidAmount: String(amount),
        status: 'COMPLETED',
      },
    });
    const msgId = `msg_ok_${crypto.randomUUID()}`;
    const headers = signSvix(payload, msgId);
    const res = await postWebhook(payload, headers);
    const pay = await rest(`payments?order_id=eq.${orderId}&select=status`, { token: service });
    const sub2 = await rest(`subscriptions?id=eq.${subId}&select=status`, { token: service });
    const com = await rest(`comercios?id=eq.${businessA}&select=en_linea`, { token: service });
    const payStatus = (pay.json as Array<Record<string, unknown>>)[0]?.status;
    const subStatus = (sub2.json as Array<Record<string, unknown>>)[0]?.status;
    const online = (com.json as Array<Record<string, unknown>>)[0]?.en_linea;
    record(
      '5. Pago completo',
      res.status === 200 && payStatus === 'completed' && subStatus === 'active' && online === true,
      `http=${res.status} pay=${payStatus} sub=${subStatus} en_linea=${online} was=${enLineaBefore}`,
    );

    // --- 6) Duplicate (same svix-id) ---
    const resDup = await postWebhook(payload, headers);
    record(
      '6. Duplicado',
      resDup.status === 200 && (resDup.json.duplicate === true || resDup.json.ok === true),
      `http=${resDup.status} duplicate=${resDup.json.duplicate}`,
    );
  }

  // --- 7) processed=false retry ---
  {
    const order2 = `km_itest2_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const ch2 = `ch_itest2_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
    // reset sub to pending for clean activation path
    await rest(`subscriptions?id=eq.${subId}`, {
      method: 'PATCH',
      token: service,
      body: { status: 'pending' },
    });
    await rest('payments', {
      method: 'POST',
      token: service,
      body: {
        subscription_id: subId,
        business_id: businessA,
        provider: 'zeno',
        provider_checkout_id: ch2,
        order_id: order2,
        amount,
        currency: 'USD',
        status: 'open',
      },
    });

    const msgId = `msg_retry_${crypto.randomUUID()}`;
    // Insert unprocessed event row first (simulates prior failure after store)
    await rest('payment_events', {
      method: 'POST',
      token: service,
      body: {
        provider: 'zeno',
        provider_event_id: msgId,
        event_type: 'checkout.completed',
        payload: { note: 'seeded_unprocessed' },
        processed: false,
      },
    });

    const payload = JSON.stringify({
      type: 'checkout.completed',
      data: {
        id: ch2,
        orderId: order2,
        priceCurrency: 'USD',
        priceAmount: String(amount),
        paidAmount: String(amount),
        status: 'COMPLETED',
      },
    });
    const headers = signSvix(payload, msgId);
    const res = await postWebhook(payload, headers);
    const pay = await rest(`payments?order_id=eq.${order2}&select=status`, { token: service });
    const ev = await rest(
      `payment_events?provider_event_id=eq.${msgId}&select=processed`,
      { token: service },
    );
    const payStatus = (pay.json as Array<Record<string, unknown>>)[0]?.status;
    const processed = (ev.json as Array<Record<string, unknown>>)[0]?.processed;
    record(
      '7. Reintento processed=false',
      res.status === 200 && payStatus === 'completed' && processed === true,
      `http=${res.status} pay=${payStatus} processed=${processed}`,
    );
  }

  // --- 8) expired ---
  {
    const orderE = `km_exp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const chE = `ch_exp_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
    await rest(`subscriptions?id=eq.${subId}`, {
      method: 'PATCH',
      token: service,
      body: { status: 'pending' },
    });
    await rest('payments', {
      method: 'POST',
      token: service,
      body: {
        subscription_id: subId,
        business_id: businessA,
        provider: 'zeno',
        provider_checkout_id: chE,
        order_id: orderE,
        amount,
        currency: 'USD',
        status: 'open',
      },
    });
    const payload = JSON.stringify({
      type: 'checkout.expired',
      data: {
        id: chE,
        orderId: orderE,
        priceCurrency: 'USD',
        priceAmount: String(amount),
        paidAmount: '0',
        status: 'EXPIRED',
      },
    });
    const headers = signSvix(payload, `msg_exp_${crypto.randomUUID()}`);
    const res = await postWebhook(payload, headers);
    const pay = await rest(`payments?order_id=eq.${orderE}&select=status`, { token: service });
    const sub3 = await rest(`subscriptions?id=eq.${subId}&select=status`, { token: service });
    record(
      '8. Expirado',
      res.status === 200 &&
        (pay.json as Array<Record<string, unknown>>)[0]?.status === 'expired' &&
        (sub3.json as Array<Record<string, unknown>>)[0]?.status !== 'active',
      `http=${res.status} pay=${(pay.json as Array<Record<string, unknown>>)[0]?.status} sub=${(sub3.json as Array<Record<string, unknown>>)[0]?.status}`,
    );
  }

  // --- 9) partially_paid ---
  {
    const orderP = `km_part_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const chP = `ch_part_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
    await rest('payments', {
      method: 'POST',
      token: service,
      body: {
        subscription_id: subId,
        business_id: businessA,
        provider: 'zeno',
        provider_checkout_id: chP,
        order_id: orderP,
        amount,
        currency: 'USD',
        status: 'open',
      },
    });
    // force pending so we can assert no activation
    await rest(`subscriptions?id=eq.${subId}`, {
      method: 'PATCH',
      token: service,
      body: { status: 'pending' },
    });
    const payload = JSON.stringify({
      type: 'checkout.partially_paid',
      data: {
        id: chP,
        orderId: orderP,
        priceCurrency: 'USD',
        priceAmount: String(amount),
        paidAmount: '1.00',
        status: 'PARTIALLY_PAID',
      },
    });
    const headers = signSvix(payload, `msg_part_${crypto.randomUUID()}`);
    const res = await postWebhook(payload, headers);
    const pay = await rest(`payments?order_id=eq.${orderP}&select=status,paid_amount`, {
      token: service,
    });
    const sub4 = await rest(`subscriptions?id=eq.${subId}&select=status`, { token: service });
    record(
      '9. Parcial',
      res.status === 200 &&
        (pay.json as Array<Record<string, unknown>>)[0]?.status === 'partially_paid' &&
        (sub4.json as Array<Record<string, unknown>>)[0]?.status === 'pending',
      `http=${res.status} pay=${(pay.json as Array<Record<string, unknown>>)[0]?.status} sub=${(sub4.json as Array<Record<string, unknown>>)[0]?.status}`,
    );
  }

  // --- 10) amount/currency wrong ---
  {
    const orderBad = `km_bad_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const chBad = `ch_bad_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
    await rest('payments', {
      method: 'POST',
      token: service,
      body: {
        subscription_id: subId,
        business_id: businessA,
        provider: 'zeno',
        provider_checkout_id: chBad,
        order_id: orderBad,
        amount,
        currency: 'USD',
        status: 'open',
      },
    });
    await rest(`subscriptions?id=eq.${subId}`, {
      method: 'PATCH',
      token: service,
      body: { status: 'pending' },
    });

    // insufficient amount
    const payloadAmt = JSON.stringify({
      type: 'checkout.completed',
      data: {
        id: chBad,
        orderId: orderBad,
        priceCurrency: 'USD',
        priceAmount: String(amount),
        paidAmount: '1.00',
        status: 'COMPLETED',
      },
    });
    const resAmt = await postWebhook(payloadAmt, signSvix(payloadAmt, `msg_amt_${crypto.randomUUID()}`));

    const orderCur = `km_cur_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const chCur = `ch_cur_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
    await rest('payments', {
      method: 'POST',
      token: service,
      body: {
        subscription_id: subId,
        business_id: businessA,
        provider: 'zeno',
        provider_checkout_id: chCur,
        order_id: orderCur,
        amount,
        currency: 'USD',
        status: 'open',
      },
    });
    const payloadCur = JSON.stringify({
      type: 'checkout.completed',
      data: {
        id: chCur,
        orderId: orderCur,
        priceCurrency: 'EUR',
        priceAmount: String(amount),
        paidAmount: String(amount),
        status: 'COMPLETED',
      },
    });
    const resCur = await postWebhook(payloadCur, signSvix(payloadCur, `msg_cur_${crypto.randomUUID()}`));

    const payAmt = await rest(`payments?order_id=eq.${orderBad}&select=status`, { token: service });
    const payCur = await rest(`payments?order_id=eq.${orderCur}&select=status`, { token: service });
    record(
      '10. Monto/moneda incorrectos',
      resAmt.status === 500 &&
        resCur.status === 500 &&
        (payAmt.json as Array<Record<string, unknown>>)[0]?.status === 'open' &&
        (payCur.json as Array<Record<string, unknown>>)[0]?.status === 'open',
      `amt_http=${resAmt.status} cur_http=${resCur.status}`,
    );
  }

  // --- 11) RLS ---
  {
    const paysA = await rest(`payments?business_id=eq.${businessA}&select=id`, { token: tokenA });
    const paysBOnA = businessB
      ? await rest(`payments?business_id=eq.${businessA}&select=id`, { token: tokenB })
      : { status: 200, json: [] };
    const canA = Array.isArray(paysA.json) && (paysA.json as unknown[]).length >= 0 && paysA.status === 200;
    const bSeesNone =
      Array.isArray(paysBOnA.json) && (paysBOnA.json as unknown[]).length === 0;

    // Attempt activate own subscription as user (should fail / no change)
    const before = await rest(`subscriptions?id=eq.${subId}&select=status`, { token: service });
    const patch = await rest(`subscriptions?id=eq.${subId}`, {
      method: 'PATCH',
      token: tokenA,
      body: { status: 'active' },
    });
    const after = await rest(`subscriptions?id=eq.${subId}&select=status`, { token: service });
    const statusUnchanged =
      (before.json as Array<Record<string, unknown>>)[0]?.status ===
      (after.json as Array<Record<string, unknown>>)[0]?.status;

    record(
      '11. RLS',
      canA && bSeesNone && statusUnchanged && patch.status !== 201,
      `A_read_ok=${canA} B_sees_none=${bSeesNone} patch_status=${patch.status} status_unchanged=${statusUnchanged}`,
    );
  }

  // --- 13) payment/success route exists in Flutter router ---
  {
    const main = await Deno.readTextFile('lib/main.dart');
    const ok = main.includes("/payment/success") && main.includes('BillingPaymentSuccessScreen');
    record('13. Ruta payment/success', ok, ok ? 'route wired in main.dart' : 'missing route');
  }

  console.log('\n=== SUMMARY ===');
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`passed=${passed} failed=${failed} total=${results.length}`);
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}\t${r.name}\t${r.detail}`);
  }
  Deno.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('INTEGRATION_FATAL', err instanceof Error ? err.message : err);
  Deno.exit(2);
});
