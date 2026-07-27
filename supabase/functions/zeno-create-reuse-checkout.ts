/**
 * Preview-only: create + reuse Zeno checkout. No payment. No secret logging.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PREVIEW_REF = 'gsfxqzvmyzjjgpigrste';
const BASE = `https://${PREVIEW_REF}.supabase.co`;

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

async function main() {
  await loadDotEnv('.env.preview.keys');
  await loadDotEnv('.env.preview.auth.local');
  await loadDotEnv('.env.preview.local');

  const anon = Deno.env.get('SUPABASE_ANON_KEY')?.trim() ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  const email = Deno.env.get('PREVIEW_OWNER_A_EMAIL')?.trim() ?? '';
  const password = Deno.env.get('PREVIEW_OWNER_A_PASSWORD')?.trim() ?? '';
  const ownerA = Deno.env.get('PREVIEW_OWNER_A_UID')?.trim() ?? '';

  if (!anon || !service || !email || !password || !ownerA) {
    throw new Error('Missing preview auth/key env');
  }

  const userClient = createClient(BASE, anon, { auth: { persistSession: false } });
  const admin = createClient(BASE, service, { auth: { persistSession: false } });

  const { data: auth, error: authErr } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (authErr || !auth.session?.access_token) {
    throw new Error(`Auth failed: ${authErr?.message ?? 'no session'}`);
  }
  const token = auth.session.access_token;

  const { data: commerce, error: cErr } = await admin
    .from('comercios')
    .select('id, en_linea, billing_exempt')
    .eq('owner_id', ownerA)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (cErr || !commerce?.id) throw new Error('Commerce for owner A not found');

  const businessId = String(commerce.id);
  console.log('commerce', {
    id: maskId(businessId),
    en_linea: commerce.en_linea,
    billing_exempt: commerce.billing_exempt,
  });

  const { data: plan } = await admin
    .from('plans')
    .select('code, price_amount, price_currency, is_active')
    .eq('code', 'menu_monthly')
    .maybeSingle();
  console.log('plan', plan);

  // Count open payments before
  const { count: openBefore } = await admin
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'open');

  async function createCheckout(label: string) {
    const res = await fetch(`${BASE}/functions/v1/create-zeno-checkout`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-comercio-id': businessId,
      },
      body: JSON.stringify({
        comercio_id: businessId,
        // intentional manipulation — server must ignore
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
      hostOk: typeof json.checkoutUrl === 'string' &&
        String(json.checkoutUrl).startsWith('https://pay.zenobank.io/'),
      error: json.error ?? null,
      message: json.message ?? null,
    });
    return { status: res.status, json };
  }

  const first = await createCheckout('checkout_1');
  if (first.status !== 200 || !first.json.checkoutUrl) {
    throw new Error(`Checkout 1 failed HTTP ${first.status}`);
  }

  const orderId = String(first.json.orderId ?? '');
  const checkoutId = String(first.json.checkoutId ?? '');

  const { data: payment } = await admin
    .from('payments')
    .select('status, amount, currency, provider_checkout_id, checkout_url, order_id')
    .eq('order_id', orderId)
    .maybeSingle();

  const { data: sub } = await admin
    .from('subscriptions')
    .select('status, plan_id')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log('payment_row', {
    status: payment?.status,
    amount: payment?.amount,
    currency: payment?.currency,
    checkoutId: payment?.provider_checkout_id
      ? maskId(String(payment.provider_checkout_id), 8)
      : null,
    hostOk: typeof payment?.checkout_url === 'string' &&
      String(payment.checkout_url).startsWith('https://pay.zenobank.io/'),
  });
  console.log('subscription_row', { status: sub?.status });

  // Reuse
  const second = await createCheckout('checkout_2_reuse');
  const { count: openAfter } = await admin
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'open');

  const sameCheckout =
    String(second.json.checkoutId ?? '') === checkoutId &&
    String(second.json.orderId ?? '') === orderId;
  console.log('reuse_check', {
    http: second.status,
    reused_flag: second.json.reused === true,
    same_checkout_id: sameCheckout,
    open_payments_before: openBefore,
    open_payments_after: openAfter,
    open_count_unchanged: openBefore === openAfter || (openAfter ?? 0) <= (openBefore ?? 0) + 1,
  });

  // Probe hosted page for available assets/networks (best-effort, no secrets)
  let assets: string[] = [];
  let networks: string[] = [];
  try {
    const pageRes = await fetch(String(first.json.checkoutUrl), {
      headers: { Accept: 'text/html,application/json' },
      redirect: 'follow',
    });
    const contentType = pageRes.headers.get('content-type') ?? '';
    const body = await pageRes.text();
    console.log('checkout_page', {
      http: pageRes.status,
      contentType: contentType.slice(0, 40),
      bytes: body.length,
    });

    // Common token/network labels that may appear in HTML/JSON hydration
    const tokenCandidates = [
      'USDT',
      'USDC',
      'BTC',
      'ETH',
      'SOL',
      'BNB',
      'TRX',
      'MATIC',
      'POL',
      'DAI',
    ];
    const networkCandidates = [
      'Ethereum',
      'Bitcoin',
      'Solana',
      'BNB',
      'BSC',
      'Tron',
      'Polygon',
      'Base',
      'Arbitrum',
      'Optimism',
      'Lightning',
      'Ton',
      'Avalanche',
    ];
    for (const t of tokenCandidates) {
      if (new RegExp(`\\b${t}\\b`, 'i').test(body)) assets.push(t);
    }
    for (const n of networkCandidates) {
      if (new RegExp(n, 'i').test(body)) networks.push(n);
    }

    // Try JSON blob in script tags
    const jsonMatches = body.match(/\{"[\s\S]{0,5000}?assets[\s\S]{0,5000}?\}/gi) ?? [];
    console.log('page_json_blobs', jsonMatches.length);
  } catch (err) {
    console.log('checkout_page_probe_failed', err instanceof Error ? err.message : 'error');
  }

  console.log('crypto_options_detected', {
    assets: assets.length ? assets : ['(not detectable from HTML — open hosted page)'],
    networks: networks.length ? networks : ['(not detectable from HTML — open hosted page)'],
    note:
      'Zeno hosted UI chooses token+network at pay.zenobank.io; store-side API does not return the list.',
  });

  // Legacy untouched check for this commerce
  const { data: afterCommerce } = await admin
    .from('comercios')
    .select('en_linea, billing_exempt')
    .eq('id', businessId)
    .maybeSingle();
  console.log('legacy_untouched', {
    en_linea_unchanged: afterCommerce?.en_linea === commerce.en_linea,
    billing_exempt_unchanged: afterCommerce?.billing_exempt === commerce.billing_exempt,
  });

  const ok =
    first.status === 200 &&
    payment?.status === 'open' &&
    Number(payment?.amount) === 10 &&
    String(payment?.currency).toUpperCase() === 'USD' &&
    sub?.status === 'pending' &&
    second.status === 200 &&
    (second.json.reused === true || sameCheckout) &&
    String(first.json.checkoutUrl).startsWith('https://pay.zenobank.io/');

  console.log('RESULT', ok ? 'PASS' : 'FAIL');
  Deno.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL', err instanceof Error ? err.message : err);
  Deno.exit(2);
});
