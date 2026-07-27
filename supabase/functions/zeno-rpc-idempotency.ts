/**
 * Re-apply completed checkout RPC to prove period is not extended twice.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const admin = createClient(
  'https://gsfxqzvmyzjjgpigrste.supabase.co',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);
const ownerA = Deno.env.get('PREVIEW_OWNER_A_UID')!;

const { data: c } = await admin
  .from('comercios')
  .select('id, en_linea, billing_exempt')
  .eq('owner_id', ownerA)
  .maybeSingle();

const { data: pay } = await admin
  .from('payments')
  .select('order_id, provider_checkout_id, amount, currency')
  .eq('business_id', c!.id)
  .eq('status', 'completed')
  .order('paid_at', { ascending: false })
  .limit(1)
  .maybeSingle();

const { data: subBefore } = await admin
  .from('subscriptions')
  .select('current_period_start, current_period_end, status, updated_at')
  .eq('business_id', c!.id)
  .maybeSingle();

const { count: eventsBefore } = await admin
  .from('payment_events')
  .select('id', { count: 'exact', head: true })
  .eq('provider', 'zeno');

const { data: r1, error: e1 } = await admin.rpc('apply_zeno_checkout_completed', {
  p_order_id: pay!.order_id,
  p_provider_checkout_id: pay!.provider_checkout_id,
  p_paid_amount: Number(pay!.amount),
  p_currency: pay!.currency,
  p_paid_at: new Date().toISOString(),
});

const { data: subAfter } = await admin
  .from('subscriptions')
  .select('current_period_start, current_period_end, status, updated_at')
  .eq('business_id', c!.id)
  .maybeSingle();

const { data: cAfter } = await admin
  .from('comercios')
  .select('en_linea, billing_exempt')
  .eq('id', c!.id)
  .maybeSingle();

const { data: allComercios } = await admin
  .from('comercios')
  .select('billing_exempt, en_linea');

const { count: eventsAfter } = await admin
  .from('payment_events')
  .select('id', { count: 'exact', head: true })
  .eq('provider', 'zeno');

console.log(
  JSON.stringify(
    {
      rpc_error: e1?.message ?? null,
      rpc_idempotent: (r1 as { idempotent?: boolean } | null)?.idempotent === true,
      rpc_ok: (r1 as { ok?: boolean } | null)?.ok === true,
      period_unchanged:
        subBefore!.current_period_end === subAfter!.current_period_end &&
        subBefore!.current_period_start === subAfter!.current_period_start,
      status_still_active: subAfter!.status === 'active',
      en_linea_unchanged: c!.en_linea === cAfter!.en_linea,
      billing_exempt_unchanged: c!.billing_exempt === cAfter!.billing_exempt,
      payment_events_count_unchanged: eventsBefore === eventsAfter,
      all_billing_exempt: (allComercios ?? []).every((x) => x.billing_exempt === true),
      all_online: (allComercios ?? []).every((x) => x.en_linea === true),
      period_start: subAfter!.current_period_start,
      period_end: subAfter!.current_period_end,
    },
    null,
    2,
  ),
);
