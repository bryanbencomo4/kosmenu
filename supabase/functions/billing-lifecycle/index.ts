/// <reference path="../_shared/edge-runtime.d.ts" />

/**
 * Hourly billing lifecycle:
 * 1. mark subscriptions past_due after period end
 * 2. suspend after 3-day grace and unpublish non-exempt menus
 * 3. reconcile open Zeno checkouts (covers missed webhooks)
 *
 * Auth: x-billing-worker-secret matching internal_worker_secrets.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ZenoPaymentProvider } from '../_shared/zeno-payment-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-billing-worker-secret',
};

const PROVIDER = 'zeno';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing Supabase environment' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    await authorizeRequest(req, admin);

    const { data: pastDue, error: pastDueError } = await admin.rpc(
      'mark_subscriptions_past_due',
    );
    if (pastDueError) {
      throw new Error(`mark_subscriptions_past_due: ${pastDueError.message}`);
    }

    const { data: suspended, error: suspendError } = await admin.rpc(
      'suspend_subscriptions_after_grace',
    );
    if (suspendError) {
      throw new Error(`suspend_subscriptions_after_grace: ${suspendError.message}`);
    }

    const reconciled = await reconcileOpenCheckouts(admin);

    return jsonResponse({
      ok: true,
      pastDueMarked: Number(pastDue ?? 0),
      suspended: Number(suspended ?? 0),
      reconciled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'lifecycle failed';
    const status = error instanceof HttpError ? error.status : 500;
    console.error('billing-lifecycle failed', message);
    return jsonResponse({ error: message }, status);
  }
});

async function reconcileOpenCheckouts(
  admin: ReturnType<typeof createClient>,
): Promise<{ scanned: number; activated: number; errors: number }> {
  const zenoApiKey = (Deno.env.get('ZENO_API_KEY') ?? '').trim();
  const zenoBaseUrl = (Deno.env.get('ZENO_API_BASE_URL') ?? '').trim();
  if (!zenoApiKey) {
    return { scanned: 0, activated: 0, errors: 0 };
  }

  const { data: payments, error } = await admin
    .from('payments')
    .select('id, order_id, amount, currency, provider_checkout_id')
    .eq('provider', PROVIDER)
    .in('status', ['open', 'partially_paid'])
    .order('created_at', { ascending: false })
    .limit(25);

  if (error || !payments?.length) {
    return { scanned: 0, activated: 0, errors: error ? 1 : 0 };
  }

  const zeno = new ZenoPaymentProvider({
    apiKey: zenoApiKey,
    baseUrl: zenoBaseUrl || undefined,
  });

  let activated = 0;
  let errors = 0;

  for (const payment of payments) {
    const checkoutId = String(payment.provider_checkout_id ?? '').trim();
    const orderId = String(payment.order_id ?? '').trim();
    if (!checkoutId || !orderId) continue;

    try {
      const checkout = await zeno.getCheckoutStatus(checkoutId);
      if (checkout.status !== 'completed') continue;

      const paidAmount = Number(checkout.paidAmount ?? checkout.priceAmount ?? payment.amount);
      const currency = (checkout.priceCurrency || String(payment.currency ?? 'USD')).toUpperCase();
      const { error: rpcError } = await admin.rpc('apply_zeno_checkout_completed', {
        p_order_id: orderId,
        p_provider_checkout_id: checkoutId,
        p_paid_amount: paidAmount,
        p_currency: currency,
        p_paid_at: new Date().toISOString(),
      });
      if (rpcError) {
        errors += 1;
        console.error('billing-lifecycle reconcile rpc', rpcError.message);
        continue;
      }
      activated += 1;
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message : 'lookup failed';
      console.error('billing-lifecycle reconcile', message);
    }
  }

  return { scanned: payments.length, activated, errors };
}

async function authorizeRequest(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const providedSecret = (req.headers.get('x-billing-worker-secret') ?? '').trim();
  if (!providedSecret) {
    throw new HttpError('Unauthorized request. Missing billing worker secret.', 401);
  }

  const { data, error } = await supabase
    .from('internal_worker_secrets')
    .select('secret')
    .eq('worker_name', 'billing_lifecycle_worker')
    .maybeSingle();

  if (error) {
    throw new HttpError(`Error loading worker secret: ${error.message}`, 500);
  }

  const expectedSecret = String(data?.secret ?? '').trim();
  if (!expectedSecret) {
    throw new HttpError('Missing internal worker secret for billing_lifecycle_worker.', 500);
  }
  if (providedSecret !== expectedSecret) {
    throw new HttpError('Unauthorized request. Invalid billing worker secret.', 401);
  }
}

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
