/// <reference path="../_shared/edge-runtime.d.ts" />

/**
 * Reconciles open Zeno checkouts against the Zeno API.
 * Safety net when webhooks are delayed/missing: if Zeno reports COMPLETED,
 * applies the same RPC as zeno-webhook.
 *
 * Auth: Bearer user JWT (owner) OR service_role key.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ZenoPaymentProvider } from '../_shared/zeno-payment-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-comercio-id',
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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const zenoApiKey = (Deno.env.get('ZENO_API_KEY') ?? '').trim();
    const zenoBaseUrl = (Deno.env.get('ZENO_API_BASE_URL') ?? '').trim();

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
    const token = authHeader.slice(7).trim();
    const isServiceRole =
      token === serviceRoleKey || jwtRole(token) === 'service_role';

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = await safeJson(req);
    let businessId = normalizeString(
      req.headers.get('x-comercio-id') ??
        body.comercio_id ??
        body.business_id ??
        body.commerce_id,
    );

    if (!isServiceRole) {
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

      let query = admin
        .from('comercios')
        .select('id')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1);
      if (businessId) {
        query = admin
          .from('comercios')
          .select('id')
          .eq('owner_id', user.id)
          .eq('id', businessId)
          .limit(1);
      }
      const { data: commerce, error: cErr } = await query.maybeSingle();
      if (cErr || !commerce?.id) {
        return jsonResponse({ error: 'Business not found' }, 404);
      }
      businessId = String(commerce.id);
    } else if (!businessId) {
      businessId = normalizeString(body.slug)
        ? await resolveBusinessIdBySlug(admin, normalizeString(body.slug))
        : '';
      if (!businessId) {
        return jsonResponse(
          { error: 'comercio_id or slug required for service reconcile' },
          400,
        );
      }
    }

    const zeno = new ZenoPaymentProvider({
      apiKey: zenoApiKey,
      baseUrl: zenoBaseUrl || undefined,
    });

    const { data: payments, error: payErr } = await admin
      .from('payments')
      .select(
        'id, order_id, status, amount, currency, provider_checkout_id, checkout_url, expires_at',
      )
      .eq('business_id', businessId)
      .eq('provider', PROVIDER)
      .in('status', ['open', 'partially_paid'])
      .order('created_at', { ascending: false })
      .limit(5);

    if (payErr) {
      return jsonResponse({ error: 'Could not load payments', message: payErr.message }, 500);
    }

    if (!payments?.length) {
      // Already completed? Report current subscription state.
      const { data: sub } = await admin
        .from('subscriptions')
        .select('id, status')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: commerce } = await admin
        .from('comercios')
        .select('en_linea, billing_exempt')
        .eq('id', businessId)
        .maybeSingle();
      return jsonResponse({
        ok: true,
        reconciled: false,
        reason: 'no_open_payments',
        subscriptionStatus: sub?.status ?? null,
        enLinea: commerce?.en_linea === true,
        billingExempt: commerce?.billing_exempt === true,
      });
    }

    const results: Record<string, unknown>[] = [];
    let activated = false;

    for (const payment of payments) {
      const checkoutId = String(payment.provider_checkout_id ?? '').trim();
      const orderId = String(payment.order_id ?? '').trim();
      if (!checkoutId || !orderId) {
        results.push({
          paymentId: payment.id,
          skipped: true,
          reason: 'missing_checkout_or_order',
        });
        continue;
      }

      let checkout;
      try {
        checkout = await zeno.getCheckoutStatus(checkoutId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Zeno lookup failed';
        results.push({
          paymentId: payment.id,
          checkoutId: maskId(checkoutId),
          error: message.slice(0, 200),
        });
        continue;
      }

      if (checkout.status !== 'completed') {
        results.push({
          paymentId: payment.id,
          checkoutId: maskId(checkoutId),
          zenoStatus: checkout.status,
          reconciled: false,
        });
        continue;
      }

      const paidAmount = Number(checkout.paidAmount ?? checkout.priceAmount ?? payment.amount);
      const currency = (checkout.priceCurrency || String(payment.currency ?? 'USD')).toUpperCase();

      const { data, error } = await admin.rpc('apply_zeno_checkout_completed', {
        p_order_id: orderId,
        p_provider_checkout_id: checkoutId,
        p_paid_amount: paidAmount,
        p_currency: currency,
        p_paid_at: new Date().toISOString(),
      });

      if (error) {
        results.push({
          paymentId: payment.id,
          checkoutId: maskId(checkoutId),
          zenoStatus: 'completed',
          error: error.message,
        });
        continue;
      }

      activated = true;
      results.push({
        paymentId: payment.id,
        checkoutId: maskId(checkoutId),
        zenoStatus: 'completed',
        reconciled: true,
        result: data,
      });
    }

    const { data: sub } = await admin
      .from('subscriptions')
      .select('id, status')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: commerce } = await admin
      .from('comercios')
      .select('en_linea, billing_exempt')
      .eq('id', businessId)
      .maybeSingle();

    return jsonResponse({
      ok: true,
      activated,
      subscriptionStatus: sub?.status ?? null,
      enLinea: commerce?.en_linea === true,
      billingExempt: commerce?.billing_exempt === true,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('reconcile-zeno-checkout failed', message);
    return jsonResponse({ error: 'Internal error', message }, 500);
  }
});

async function resolveBusinessIdBySlug(
  admin: ReturnType<typeof createClient>,
  slug: string,
): Promise<string> {
  const { data } = await admin
    .from('comercios')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  return data?.id ? String(data.id) : '';
}

function maskId(value: string, keep = 8): string {
  if (value.length <= keep + 3) return `${value.slice(0, 4)}…`;
  return `${value.slice(0, keep)}…`;
}

function jwtRole(token: string): string {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return '';
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { role?: string };
    return String(payload.role ?? '');
  } catch {
    return '';
  }
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function safeJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const payload = await req.json();
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
  } catch {
    // empty body ok
  }
  return {};
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
