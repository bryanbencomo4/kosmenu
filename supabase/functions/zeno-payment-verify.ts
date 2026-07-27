/**
 * Preview payment verification harness — no secret logging, no full IDs.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PREVIEW_REF = 'gsfxqzvmyzjjgpigrste';
const BASE = `https://${PREVIEW_REF}.supabase.co`;

const mask = (s: unknown, n = 8) => {
  const v = String(s ?? '');
  return v.length <= n ? `${v.slice(0, 4)}…` : `${v.slice(0, n)}…`;
};

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

function adminClient() {
  return createClient(BASE, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

async function snapshot(label: string) {
  const admin = adminClient();
  const ownerA = Deno.env.get('PREVIEW_OWNER_A_UID')!;
  const { data: comercios } = await admin
    .from('comercios')
    .select('id, en_linea, billing_exempt, owner_id')
    .order('created_at', { ascending: true });

  console.log(`=== ${label}: comercios ===`);
  for (const c of comercios ?? []) {
    console.log(
      JSON.stringify({
        id: mask(c.id),
        owner: c.owner_id === ownerA ? 'A' : 'other',
        en_linea: c.en_linea,
        billing_exempt: c.billing_exempt,
      }),
    );
  }

  const commerceA = (comercios ?? []).find((c) => c.owner_id === ownerA);
  if (!commerceA) throw new Error('commerce A missing');

  const { data: pays } = await admin
    .from('payments')
    .select(
      'status, amount, currency, order_id, provider_checkout_id, checkout_url, expires_at, paid_at, period_start, period_end',
    )
    .eq('business_id', commerceA.id)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`=== ${label}: payments ===`);
  for (const p of pays ?? []) {
    let host: string | null = null;
    try {
      host = new URL(String(p.checkout_url)).host;
    } catch {
      host = null;
    }
    console.log(
      JSON.stringify({
        status: p.status,
        amount: p.amount,
        currency: p.currency,
        order: mask(p.order_id, 10),
        checkout: mask(p.provider_checkout_id, 8),
        host,
        expires_at: p.expires_at,
        paid_at: p.paid_at,
      }),
    );
  }

  const { data: sub } = await admin
    .from('subscriptions')
    .select('status, current_period_start, current_period_end')
    .eq('business_id', commerceA.id)
    .maybeSingle();
  console.log(`=== ${label}: subscription ===`);
  console.log(JSON.stringify(sub));

  const { data: events } = await admin
    .from('payment_events')
    .select('provider_event_id, event_type, processed, processed_at, created_at')
    .eq('provider', 'zeno')
    .order('created_at', { ascending: false })
    .limit(8);
  console.log(`=== ${label}: payment_events ===`);
  for (const e of events ?? []) {
    console.log(
      JSON.stringify({
        svix: mask(e.provider_event_id, 12),
        type: e.event_type,
        processed: e.processed,
        processed_at: e.processed_at,
      }),
    );
  }

  return { commerceA, pays: pays ?? [], sub, events: events ?? [], comercios: comercios ?? [] };
}

async function ensureOpenCheckout(): Promise<string> {
  const snap = await snapshot('pre');
  const open = snap.pays.find(
    (p) =>
      p.status === 'open' &&
      p.checkout_url &&
      (!p.expires_at || new Date(String(p.expires_at)).getTime() > Date.now()),
  );
  if (open?.checkout_url) {
    await Deno.writeTextFile('tmp-checkout-url.txt', String(open.checkout_url));
    console.log('OPEN_CHECKOUT=existing');
    console.log('OPEN_HOST=' + new URL(String(open.checkout_url)).host);
    return String(open.checkout_url);
  }

  // Create via authenticated edge function
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(BASE, anon, { auth: { persistSession: false } });
  const { data: auth, error } = await userClient.auth.signInWithPassword({
    email: Deno.env.get('PREVIEW_OWNER_A_EMAIL')!,
    password: Deno.env.get('PREVIEW_OWNER_A_PASSWORD')!,
  });
  if (error || !auth.session) throw new Error(`auth failed: ${error?.message}`);

  const res = await fetch(`${BASE}/functions/v1/create-zeno-checkout`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${auth.session.access_token}`,
      'Content-Type': 'application/json',
      'x-comercio-id': snap.commerceA.id,
    },
    body: JSON.stringify({ comercio_id: snap.commerceA.id }),
  });
  const json = await res.json();
  console.log('CREATE_CHECKOUT', {
    http: res.status,
    reused: json.reused,
    hostOk: String(json.checkoutUrl ?? '').startsWith('https://pay.zenobank.io/'),
    checkout: mask(json.checkoutId, 8),
    order: mask(json.orderId, 10),
  });
  if (res.status !== 200 || !json.checkoutUrl) {
    throw new Error(`create checkout failed: ${json.error ?? res.status}`);
  }
  await Deno.writeTextFile('tmp-checkout-url.txt', String(json.checkoutUrl));
  console.log('OPEN_CHECKOUT=created');
  return String(json.checkoutUrl);
}

async function waitForCompletion(timeoutMs = 15 * 60_000) {
  const admin = adminClient();
  const ownerA = Deno.env.get('PREVIEW_OWNER_A_UID')!;
  const started = Date.now();
  let lastStatus = '';

  while (Date.now() - started < timeoutMs) {
    const { data: commerceA } = await admin
      .from('comercios')
      .select('id')
      .eq('owner_id', ownerA)
      .limit(1)
      .maybeSingle();

    const { data: pay } = await admin
      .from('payments')
      .select('status, order_id, paid_at')
      .eq('business_id', commerceA!.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: sub } = await admin
      .from('subscriptions')
      .select('status')
      .eq('business_id', commerceA!.id)
      .maybeSingle();

    const { data: ev } = await admin
      .from('payment_events')
      .select('event_type, processed, provider_event_id, created_at')
      .eq('provider', 'zeno')
      .eq('event_type', 'checkout.completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const status = `${pay?.status}|${sub?.status}|${ev?.processed ?? false}`;
    if (status !== lastStatus) {
      console.log('POLL', {
        elapsed_s: Math.round((Date.now() - started) / 1000),
        payment: pay?.status,
        subscription: sub?.status,
        latest_completed_event: ev
          ? { processed: ev.processed, svix: mask(ev.provider_event_id, 12) }
          : null,
      });
      lastStatus = status;
    }

    if (pay?.status === 'completed' && sub?.status === 'active' && ev?.processed === true) {
      return true;
    }

    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

async function verifyFinal() {
  const beforePath = 'tmp-preview-en-linea-before.json';
  let before: Array<{ id: string; en_linea: boolean }> = [];
  try {
    before = JSON.parse(await Deno.readTextFile(beforePath));
  } catch {
    before = [];
  }

  const snap = await snapshot('post_payment');
  const ownerA = Deno.env.get('PREVIEW_OWNER_A_UID')!;
  const payer = snap.comercios.find((c) => c.owner_id === ownerA)!;
  const others = snap.comercios.filter((c) => c.owner_id !== ownerA);

  const completedPay = snap.pays.find((p) => p.status === 'completed');
  const completedEvents = snap.events.filter(
    (e) => e.event_type === 'checkout.completed' && e.processed === true,
  );

  const legacyAllExempt = snap.comercios.every((c) => c.billing_exempt === true);
  const legacyAllOnline = snap.comercios.every((c) => c.en_linea === true);

  // Compare en_linea vs earliest before snapshot if available
  const beforeMap = Object.fromEntries(before.map((b) => [b.id, b.en_linea]));
  const enLineaChanges = snap.comercios
    .filter((c) => beforeMap[c.id] !== undefined && beforeMap[c.id] !== c.en_linea)
    .map((c) => ({
      id: mask(c.id),
      owner: c.owner_id === ownerA ? 'A' : 'other',
      from: beforeMap[c.id],
      to: c.en_linea,
    }));

  const result = {
    payment_completed: completedPay?.status === 'completed',
    payment_amount_usd_10:
      Number(completedPay?.amount) === 10 &&
      String(completedPay?.currency).toUpperCase() === 'USD',
    subscription_active: snap.sub?.status === 'active',
    period_start: snap.sub?.current_period_start ?? null,
    period_end: snap.sub?.current_period_end ?? null,
    period_ok: Boolean(snap.sub?.current_period_start && snap.sub?.current_period_end),
    payer_en_linea: payer.en_linea === true,
    other_comercios_unchanged_vs_before: enLineaChanges.filter((c) => c.owner === 'other')
      .length === 0,
    en_linea_changes: enLineaChanges,
    completed_events_count: completedEvents.length,
    latest_svix: completedEvents[0] ? mask(completedEvents[0].provider_event_id, 12) : null,
    legacy_all_exempt: legacyAllExempt,
    legacy_all_online: legacyAllOnline,
    comercios_total: snap.comercios.length,
  };

  console.log('VERIFY', JSON.stringify(result, null, 2));
  return { result, snap, completedEvents };
}

const cmd = Deno.args[0] ?? 'status';

await loadDotEnv('.env.preview.keys');
await loadDotEnv('.env.preview.auth.local');
await loadDotEnv('.env.preview.local');

if (cmd === 'prepare') {
  const url = await ensureOpenCheckout();
  console.log('CHECKOUT_FILE=tmp-checkout-url.txt');
  console.log('CHECKOUT_HOST=' + new URL(url).host);
} else if (cmd === 'wait') {
  const ok = await waitForCompletion();
  console.log(ok ? 'WAIT_RESULT=completed' : 'WAIT_RESULT=timeout');
  Deno.exit(ok ? 0 : 1);
} else if (cmd === 'verify') {
  await verifyFinal();
} else if (cmd === 'status') {
  await snapshot('status');
} else {
  console.error('Usage: prepare | wait | verify | status');
  Deno.exit(2);
}
