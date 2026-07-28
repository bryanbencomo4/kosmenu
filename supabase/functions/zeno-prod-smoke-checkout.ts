/**
 * Production smoke: dedicated smoke commerce + Zeno checkout (NO payment).
 * Uses anon + user session only (no service_role). Legacy checks via SQL CLI.
 *
 * Usage (repo root, CLI linked to prod, .env.local with prod anon):
 *   deno run -A supabase/functions/zeno-prod-smoke-checkout.ts
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PROD_REF = 'qqhberaayhohxlbbhdyi';
const BASE = `https://${PROD_REF}.supabase.co`;
const SMOKE_NAME = 'SMOKE ZENO PROD 2026-07-27';

function maskId(value: string, keep = 8): string {
  const v = value.trim();
  if (v.length <= keep + 3) return `${v.slice(0, 4)}…`;
  return `${v.slice(0, keep)}…`;
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean)[0] ?? '';
    return `${u.host}/${maskId(seg, 6)}`;
  } catch {
    return '(invalid-url)';
  }
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

async function dbJson(sql: string): Promise<unknown> {
  const cmd = new Deno.Command('supabase', {
    args: ['db', 'query', '--linked', '--agent=no', '-o', 'json', sql],
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code, stdout, stderr } = await cmd.output();
  const out = new TextDecoder().decode(stdout).trim();
  const err = new TextDecoder().decode(stderr).trim();
  if (code !== 0) throw new Error(`db query failed: ${err.slice(0, 300)}`);
  return out ? JSON.parse(out) : null;
}

async function main() {
  await loadDotEnv('.env.local');
  const anon =
    Deno.env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')?.trim() ||
    Deno.env.get('SUPABASE_ANON_KEY')?.trim() ||
    '';
  if (!anon) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');

  const url = Deno.env.get('NEXT_PUBLIC_SUPABASE_URL')?.trim() || BASE;
  if (!url.includes(PROD_REF)) {
    throw new Error(`Refusing non-prod URL host (expected ${PROD_REF})`);
  }

  const client = createClient(url, anon, { auth: { persistSession: false } });

  // Legacy BEFORE (exclude smoke by name)
  const legacyBefore = (await dbJson(`
    select id::text, nombre, en_linea, billing_exempt
    from comercios
    where nombre <> '${SMOKE_NAME.replace(/'/g, "''")}'
    order by id
  `)) as Array<{ id: string; nombre: string; en_linea: boolean; billing_exempt: boolean }>;

  const legacyFp = legacyBefore
    .map((c) => `${c.id}:${c.en_linea}:${c.billing_exempt}`)
    .join('|');
  console.log('legacy_before', {
    count: legacyBefore.length,
    online: legacyBefore.filter((c) => c.en_linea === true).length,
    exempt: legacyBefore.filter((c) => c.billing_exempt === true).length,
  });

  // Existing smoke?
  const existing = (await dbJson(`
    select id::text, owner_id::text, en_linea, billing_exempt, slug
    from comercios
    where nombre = '${SMOKE_NAME.replace(/'/g, "''")}'
    limit 1
  `)) as Array<{
    id: string;
    owner_id: string | null;
    en_linea: boolean;
    billing_exempt: boolean;
    slug: string | null;
  }>;

  let businessId: string;
  let accessToken: string;
  let enLinea: boolean;
  let billingExempt: boolean;

  if (existing.length > 0 && existing[0].id) {
    throw new Error(
      `Smoke commerce already exists (${maskId(existing[0].id)}). ` +
        'Re-run needs stored password; create a new labeled smoke or delete via SQL first.',
    );
  }

  const stamp = Date.now();
  const email = `smoke.zeno.prod.${stamp}@elmenuxfa.invalid`;
  const password = `SmokeZeno_${stamp}_Aa1!`;

  const { data: signedUp, error: signUpErr } = await client.auth.signUp({
    email,
    password,
    options: { data: { smoke: true, label: SMOKE_NAME } },
  });
  if (signUpErr || !signedUp.user?.id) {
    throw new Error(`signUp: ${signUpErr?.message ?? 'no user'}`);
  }
  const ownerId = signedUp.user.id;

  // Prod requires email confirm — confirm via linked SQL (no service_role key).
  await dbJson(`
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = '${ownerId}'::uuid
    returning id::text as id
  `);

  let token = signedUp.session?.access_token ?? null;
  if (!token) {
    const { data: auth, error: authErr } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (authErr || !auth.session?.access_token) {
      throw new Error(
        `signIn after signup: ${authErr?.message ?? 'no session'}`,
      );
    }
    token = auth.session.access_token;
  }
  accessToken = token;
  console.log('smoke_user', { id: maskId(ownerId), email_domain: 'elmenuxfa.invalid' });

  const authed = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  const slug = `smoke-zeno-prod-${stamp}`;
  const { data: commerce, error: cErr } = await authed
    .from('comercios')
    .insert({
      nombre: SMOKE_NAME,
      slug,
      owner_id: ownerId,
      en_linea: false,
      billing_exempt: false,
      onboarding_completed: true,
      moneda: 'USD',
    })
    .select('id, nombre, en_linea, billing_exempt, owner_id')
    .single();
  if (cErr || !commerce) {
    throw new Error(`insert comercio: ${cErr?.message ?? 'failed'}`);
  }
  businessId = String(commerce.id);
  enLinea = commerce.en_linea === true;
  billingExempt = commerce.billing_exempt === true;

  const { data: catalog, error: catErr } = await authed
    .from('catalogos')
    .insert({ comercio_id: businessId, nombre: 'Menú', activo: true, orden: 0 })
    .select('id')
    .single();
  if (catErr || !catalog) throw new Error(`catalog: ${catErr?.message}`);

  const { data: category, error: categErr } = await authed
    .from('categorias')
    .insert({
      comercio_id: businessId,
      catalogo_id: catalog.id,
      nombre: 'Smoke',
      activo: true,
      orden: 0,
    })
    .select('id')
    .single();
  if (categErr || !category) throw new Error(`categoria: ${categErr?.message}`);

  const { error: prodErr } = await authed.from('productos').insert({
    comercio_id: businessId,
    categoria_id: category.id,
    nombre: 'Item smoke',
    precio: 1,
    disponible: true,
    orden: 0,
  });
  if (prodErr) throw new Error(`producto: ${prodErr.message}`);

  console.log('smoke_commerce', {
    id: maskId(businessId),
    nombre: SMOKE_NAME,
    en_linea: enLinea,
    billing_exempt: billingExempt,
    owner: maskId(ownerId),
  });

  const planRows = (await dbJson(
    `select code, price_amount::text, price_currency, is_active from plans where code='menu_monthly'`,
  )) as Array<Record<string, unknown>>;
  console.log('plan', planRows[0] ?? null);

  async function createCheckout(label: string) {
    const res = await fetch(`${BASE}/functions/v1/create-zeno-checkout`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-comercio-id': businessId,
      },
      body: JSON.stringify({
        comercio_id: businessId,
        priceAmount: 1,
        amount: 999,
      }),
    });
    const json = await res.json();
    console.log(label, {
      http: res.status,
      reused: json.reused ?? null,
      checkoutId: json.checkoutId ? maskId(String(json.checkoutId), 8) : null,
      orderId: json.orderId ? maskId(String(json.orderId), 10) : null,
      expiresAt: json.expiresAt ?? null,
      checkoutHost: json.checkoutUrl ? maskUrl(String(json.checkoutUrl)) : null,
      error: json.error ?? null,
      message: json.message ? String(json.message).slice(0, 160) : null,
    });
    return { res, json };
  }

  const first = await createCheckout('checkout_1');
  if (first.res.status !== 200) {
    throw new Error(`checkout_1 failed HTTP ${first.res.status}`);
  }

  const second = await createCheckout('checkout_2_reuse');
  if (second.res.status !== 200) {
    throw new Error(`checkout_2 failed HTTP ${second.res.status}`);
  }

  const payRows = (await dbJson(`
    select id::text, amount::text, currency, status, order_id, checkout_url, expires_at
    from payments
    where business_id = '${businessId}'::uuid and status = 'open'
    order by created_at desc
    limit 1
  `)) as Array<{
    id: string;
    amount: string;
    currency: string;
    status: string;
    order_id: string;
    checkout_url: string | null;
    expires_at: string | null;
  }>;

  const subRows = (await dbJson(`
    select id::text, status
    from subscriptions
    where business_id = '${businessId}'::uuid
    order by created_at desc
    limit 1
  `)) as Array<{ id: string; status: string }>;

  const openCountRows = (await dbJson(`
    select count(*)::int as n from payments
    where business_id = '${businessId}'::uuid and status = 'open'
  `)) as Array<{ n: number }>;

  const payment = payRows[0];
  const sub = subRows[0];
  const openCount = openCountRows[0]?.n ?? -1;

  console.log('db_payment', {
    id: payment?.id ? maskId(payment.id) : null,
    amount: payment?.amount ?? null,
    currency: payment?.currency ?? null,
    status: payment?.status ?? null,
    orderId: payment?.order_id ? maskId(payment.order_id, 10) : null,
    checkoutHost: payment?.checkout_url ? maskUrl(payment.checkout_url) : null,
    expiresAt: payment?.expires_at ?? null,
  });
  console.log('db_subscription', {
    id: sub?.id ? maskId(sub.id) : null,
    status: sub?.status ?? null,
  });
  console.log('open_payments_count', openCount);

  const legacyAfter = (await dbJson(`
    select id::text, en_linea, billing_exempt
    from comercios
    where nombre <> '${SMOKE_NAME.replace(/'/g, "''")}'
    order by id
  `)) as Array<{ id: string; en_linea: boolean; billing_exempt: boolean }>;
  const legacyFpAfter = legacyAfter
    .map((c) => `${c.id}:${c.en_linea}:${c.billing_exempt}`)
    .join('|');

  const smokeNow = (await dbJson(`
    select en_linea, billing_exempt from comercios where id = '${businessId}'::uuid
  `)) as Array<{ en_linea: boolean; billing_exempt: boolean }>;

  console.log('legacy_after', {
    count: legacyAfter.length,
    unchanged: legacyFp === legacyFpAfter,
    smoke_en_linea: smokeNow[0]?.en_linea ?? null,
  });

  const reuseOk =
    second.json.reused === true &&
    String(second.json.checkoutId) === String(first.json.checkoutId);
  const priceOk = Number(payment?.amount) === 10 &&
    String(payment?.currency ?? '').toUpperCase() === 'USD';
  const hostOk = String(payment?.checkout_url ?? first.json.checkoutUrl ?? '').includes(
    'pay.zenobank.io',
  );

  const checks = {
    http200: first.res.status === 200 && second.res.status === 200,
    reuse: reuseOk,
    price_10_usd: priceOk,
    host_zenobank: hostOk,
    payment_open: payment?.status === 'open',
    subscription_pending: sub?.status === 'pending',
    legacy_unchanged: legacyFp === legacyFpAfter,
    smoke_still_offline: smokeNow[0]?.en_linea === false,
    open_count_1: openCount === 1,
  };
  console.log('CHECKS', checks);
  console.log(
    'STOP',
    'Do not pay yet. Operator pays from wallet after reviewing masked checkout above.',
  );
  // Persist smoke ids for post-pay validation (no secrets)
  await Deno.writeTextFile(
    '.tmp-zeno-prod-smoke.json',
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        business_id: businessId,
        owner_id: ownerId,
        nombre: SMOKE_NAME,
        checkout_id_masked: first.json.checkoutId
          ? maskId(String(first.json.checkoutId), 8)
          : null,
        order_id_masked: first.json.orderId
          ? maskId(String(first.json.orderId), 10)
          : null,
        expires_at: first.json.expiresAt ?? payment?.expires_at ?? null,
      },
      null,
      2,
    ),
  );
  console.log('smoke_meta_written', '.tmp-zeno-prod-smoke.json');

  const failed = Object.entries(checks).filter(([, v]) => !v);
  if (failed.length) Deno.exit(1);
}

main().catch((e) => {
  console.error('FAIL', e instanceof Error ? e.message : String(e));
  Deno.exit(1);
});
