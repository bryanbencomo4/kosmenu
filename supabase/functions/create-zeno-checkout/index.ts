/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ZenoPaymentProvider } from '../_shared/zeno-payment-provider.ts';
import { normalizeAmountString } from '../_shared/payment-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-comercio-id',
};

const PLAN_CODE = 'menu_monthly';
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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const zenoApiKey = (Deno.env.get('ZENO_API_KEY') ?? '').trim();
    const zenoBaseUrl = (Deno.env.get('ZENO_API_BASE_URL') ?? '').trim();
    const successRedirect =
      (Deno.env.get('ZENO_SUCCESS_REDIRECT_URL') ?? '').trim() ||
      'https://app.elmenuxfa.com/payment/success';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing Supabase environment' }, 500);
    }
    if (!zenoApiKey) {
      return jsonResponse({ error: 'ZENO_API_KEY is not configured' }, 500);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await safeJson(req);
    // Ignore any client-supplied price — server loads plan from DB.
    if (body.priceAmount != null || body.price_amount != null || body.amount != null) {
      // Still reject manipulation attempts explicitly for audit clarity.
      console.warn('create-zeno-checkout: ignored client-supplied price fields', {
        user_id: user.id,
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const comercioId = await resolveOwnedComercioId(admin, user.id, req, body);
    if (!comercioId) {
      return jsonResponse(
        {
          error: 'Business not found',
          message: 'No se encontró un negocio asociado a tu usuario.',
        },
        404,
      );
    }

    const { data: plan, error: planError } = await admin
      .from('plans')
      .select('id, code, name, price_amount, price_currency, billing_interval, is_active')
      .eq('code', PLAN_CODE)
      .eq('is_active', true)
      .maybeSingle();

    if (planError || !plan) {
      return jsonResponse({ error: 'Plan not available', message: planError?.message }, 500);
    }

    const priceAmount = Number(plan.price_amount);
    const priceCurrency = String(plan.price_currency ?? 'USD').toUpperCase();
    if (!Number.isFinite(priceAmount) || priceAmount <= 0) {
      return jsonResponse({ error: 'Invalid plan price in database' }, 500);
    }

    let subscription = await getOrCreateSubscription(admin, {
      userId: user.id,
      businessId: comercioId,
      planId: plan.id,
    });

    // Reuse non-expired open checkout.
    const nowIso = new Date().toISOString();
    const { data: openPayment } = await admin
      .from('payments')
      .select('id, provider_checkout_id, checkout_url, expires_at, order_id, status')
      .eq('subscription_id', subscription.id)
      .eq('status', 'open')
      .gt('expires_at', nowIso)
      .not('checkout_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openPayment?.checkout_url && openPayment.provider_checkout_id) {
      return jsonResponse(
        {
          checkoutUrl: openPayment.checkout_url,
          checkoutId: openPayment.provider_checkout_id,
          expiresAt: openPayment.expires_at,
          reused: true,
          orderId: openPayment.order_id,
        },
        200,
      );
    }

    const periodStart = new Date();
    const periodEnd = addOneMonth(periodStart);
    const orderId = `km_${comercioId.slice(0, 8)}_${crypto.randomUUID().replace(/-/g, '')}`;

    const { data: paymentRow, error: paymentInsertError } = await admin
      .from('payments')
      .insert({
        subscription_id: subscription.id,
        business_id: comercioId,
        provider: PROVIDER,
        order_id: orderId,
        amount: priceAmount,
        currency: priceCurrency,
        status: 'open',
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
      })
      .select('id, order_id')
      .single();

    if (paymentInsertError || !paymentRow) {
      return jsonResponse(
        {
          error: 'Could not create payment',
          message: paymentInsertError?.message ?? 'insert failed',
        },
        500,
      );
    }

    const zeno = new ZenoPaymentProvider({
      apiKey: zenoApiKey,
      baseUrl: zenoBaseUrl || undefined,
    });

    let checkout;
    try {
      checkout = await zeno.createCheckout({
        orderId,
        priceAmount: normalizeAmountString(priceAmount),
        priceCurrency,
        successRedirectUrl: successRedirect,
      });
    } catch (zenoError) {
      await admin
        .from('payments')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', paymentRow.id);

      const message = zenoError instanceof Error ? zenoError.message : 'Zeno checkout failed';
      return jsonResponse({ error: 'Checkout provider error', message }, 502);
    }

    const { error: updateError } = await admin
      .from('payments')
      .update({
        provider_checkout_id: checkout.checkoutId,
        checkout_url: checkout.checkoutUrl,
        expires_at: checkout.expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentRow.id);

    if (updateError) {
      return jsonResponse(
        { error: 'Could not persist checkout', message: updateError.message },
        500,
      );
    }

    // Ensure subscription stays pending until webhook completes.
    if (subscription.status !== 'active' && subscription.status !== 'pending') {
      await admin
        .from('subscriptions')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', subscription.id);
    }

    return jsonResponse(
      {
        checkoutUrl: checkout.checkoutUrl,
        checkoutId: checkout.checkoutId,
        expiresAt: checkout.expiresAt,
        reused: false,
        orderId,
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('create-zeno-checkout failed', message);
    return jsonResponse({ error: 'Internal error', message }, 500);
  }
});

async function resolveOwnedComercioId(
  admin: ReturnType<typeof createClient>,
  userId: string,
  req: Request,
  body: Record<string, unknown>,
): Promise<string | null> {
  const requested = normalizeString(
    req.headers.get('x-comercio-id') ??
      body.comercio_id ??
      body.business_id ??
      body.commerce_id,
  );

  let query = admin
    .from('comercios')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (requested) {
    query = admin
      .from('comercios')
      .select('id')
      .eq('owner_id', userId)
      .eq('id', requested)
      .limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data?.id) {
    return null;
  }
  return String(data.id);
}

async function getOrCreateSubscription(
  admin: ReturnType<typeof createClient>,
  args: { userId: string; businessId: string; planId: string },
): Promise<{ id: string; status: string }> {
  const { data: existing } = await admin
    .from('subscriptions')
    .select('id, status')
    .eq('business_id', args.businessId)
    .eq('plan_id', args.planId)
    .maybeSingle();

  if (existing?.id) {
    return { id: existing.id, status: String(existing.status) };
  }

  const { data: created, error } = await admin
    .from('subscriptions')
    .insert({
      user_id: args.userId,
      business_id: args.businessId,
      plan_id: args.planId,
      provider: PROVIDER,
      status: 'pending',
    })
    .select('id, status')
    .single();

  if (error || !created) {
    // Race: another request created it.
    const { data: raced } = await admin
      .from('subscriptions')
      .select('id, status')
      .eq('business_id', args.businessId)
      .eq('plan_id', args.planId)
      .maybeSingle();
    if (raced?.id) {
      return { id: raced.id, status: String(raced.status) };
    }
    throw new Error(error?.message ?? 'Could not create subscription');
  }

  return { id: created.id, status: String(created.status) };
}

function addOneMonth(from: Date): Date {
  const d = new Date(from.getTime());
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

async function safeJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const payload = await req.json();
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
  } catch {
    // empty body is fine
  }
  return {};
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
