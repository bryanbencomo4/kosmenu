/**
 * Capture idempotency baseline / after-snapshot for the real completed payment.
 * Args: baseline | after
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BASE = 'https://gsfxqzvmyzjjgpigrste.supabase.co';
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

await loadDotEnv('.env.preview.keys');
await loadDotEnv('.env.preview.auth.local');

const admin = createClient(BASE, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const ownerA = Deno.env.get('PREVIEW_OWNER_A_UID')!;

const { data: comercios } = await admin
  .from('comercios')
  .select('id, owner_id, en_linea, billing_exempt')
  .order('created_at', { ascending: true });

const commerceA = (comercios ?? []).find((c) => c.owner_id === ownerA)!;

const { data: pay } = await admin
  .from('payments')
  .select(
    'status, amount, currency, order_id, provider_checkout_id, paid_at, period_start, period_end, updated_at',
  )
  .eq('business_id', commerceA.id)
  .eq('status', 'completed')
  .order('paid_at', { ascending: false })
  .limit(1)
  .maybeSingle();

const { data: sub } = await admin
  .from('subscriptions')
  .select('status, current_period_start, current_period_end, updated_at')
  .eq('business_id', commerceA.id)
  .maybeSingle();

const { data: events } = await admin
  .from('payment_events')
  .select('provider_event_id, event_type, processed, processed_at, created_at')
  .eq('provider', 'zeno')
  .eq('event_type', 'checkout.completed')
  .order('created_at', { ascending: false });

// Real Zeno events start with msg_3H (svix style); exclude synthetic msg_ok_/msg_retry_/msg_amt_/msg_cur_
const realEvents = (events ?? []).filter((e) =>
  String(e.provider_event_id).startsWith('msg_3H'),
);

const snap = {
  label: Deno.args[0] ?? 'snap',
  comercios: (comercios ?? []).map((c) => ({
    id: mask(c.id),
    owner: c.owner_id === ownerA ? 'A' : 'other',
    en_linea: c.en_linea,
    billing_exempt: c.billing_exempt,
  })),
  payment: pay
    ? {
        status: pay.status,
        amount: pay.amount,
        currency: pay.currency,
        order: mask(pay.order_id, 10),
        checkout: mask(pay.provider_checkout_id, 8),
        paid_at: pay.paid_at,
        period_start: pay.period_start,
        period_end: pay.period_end,
        updated_at: pay.updated_at,
      }
    : null,
  subscription: sub,
  real_completed_events: realEvents.map((e) => ({
    svix: mask(e.provider_event_id, 12),
    processed: e.processed,
    processed_at: e.processed_at,
    created_at: e.created_at,
  })),
  real_completed_event_count: realEvents.length,
  real_processed_count: realEvents.filter((e) => e.processed).length,
};

const outPath = `tmp-idempotency-${snap.label}.json`;
await Deno.writeTextFile(outPath, JSON.stringify(snap, null, 2));
console.log(JSON.stringify(snap, null, 2));
console.log('WROTE=' + outPath);
