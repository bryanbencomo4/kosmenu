/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  extractCheckoutFields,
  ZenoPaymentProvider,
} from '../_shared/zeno-payment-provider.ts';

const PROVIDER = 'zeno';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = (Deno.env.get('ZENO_WEBHOOK_SECRET') ?? '').trim();
  const zenoApiKey = (Deno.env.get('ZENO_API_KEY') ?? '').trim() || 'sk_unused_for_webhook';

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase environment' }, 500);
  }
  if (!webhookSecret) {
    return jsonResponse({ error: 'ZENO_WEBHOOK_SECRET is not configured' }, 500);
  }

  // CRITICAL: verify signature against the raw body before any JSON parse/transform.
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const svixId = headers['svix-id'] ?? headers['Svix-Id'] ?? '';
  if (!svixId) {
    return jsonResponse({ error: 'Missing svix-id' }, 400);
  }

  const zeno = new ZenoPaymentProvider({
    apiKey: zenoApiKey,
    webhookSecret,
    baseUrl: Deno.env.get('ZENO_API_BASE_URL') ?? undefined,
  });

  let event;
  try {
    event = await zeno.verifyWebhook(rawBody, headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid signature';
    console.error('zeno-webhook signature failed', message);
    return jsonResponse({ error: 'Invalid webhook signature', message }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Persist event first for at-least-once idempotency (svix-id).
  // If a prior attempt stored the row but failed processing, reprocess it.
  const { data: existingEvent } = await admin
    .from('payment_events')
    .select('id, processed')
    .eq('provider', PROVIDER)
    .eq('provider_event_id', svixId)
    .maybeSingle();

  if (existingEvent?.processed === true) {
    return jsonResponse({ ok: true, duplicate: true }, 200);
  }

  let eventRowId = existingEvent?.id as string | undefined;

  if (!eventRowId) {
    const { data: inserted, error: insertError } = await admin
      .from('payment_events')
      .insert({
        provider: PROVIDER,
        provider_event_id: svixId,
        event_type: event.type,
        payload: { type: event.type, data: event.data },
        processed: false,
      })
      .select('id')
      .maybeSingle();

    if (insertError) {
      if (isUniqueViolation(insertError)) {
        const { data: raced } = await admin
          .from('payment_events')
          .select('id, processed')
          .eq('provider', PROVIDER)
          .eq('provider_event_id', svixId)
          .maybeSingle();

        if (raced?.processed === true) {
          return jsonResponse({ ok: true, duplicate: true }, 200);
        }
        eventRowId = raced?.id as string | undefined;
      } else {
        console.error('zeno-webhook failed to store event', insertError.message);
        return jsonResponse(
          { error: 'Could not store event', message: insertError.message },
          500,
        );
      }
    } else {
      eventRowId = inserted?.id as string | undefined;
    }
  }

  if (!eventRowId) {
    return jsonResponse({ error: 'Could not store event' }, 500);
  }

  try {
    const result = await applyEvent(admin, event);
    await admin
      .from('payment_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        processing_error: null,
      })
      .eq('id', eventRowId);

    return jsonResponse({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed';
    await admin
      .from('payment_events')
      .update({
        processed: false,
        processing_error: message.slice(0, 1000),
      })
      .eq('id', eventRowId);

    console.error('zeno-webhook processing failed', message);
    // Non-2xx so Zeno retries; unfinished rows are reprocessed on next delivery.
    return jsonResponse({ error: 'Processing failed', message }, 500);
  }
});

async function applyEvent(
  admin: ReturnType<typeof createClient>,
  event: { type: string; data: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const fields = extractCheckoutFields(event.data);

  switch (event.type) {
    case 'checkout.completed': {
      if (!fields.orderId || !fields.checkoutId) {
        throw new Error('Missing orderId or checkout id');
      }
      const { data, error } = await admin.rpc('apply_zeno_checkout_completed', {
        p_order_id: fields.orderId,
        p_provider_checkout_id: fields.checkoutId,
        p_paid_amount: fields.paidAmount,
        p_currency: fields.currency,
        p_paid_at: new Date().toISOString(),
      });
      if (error) {
        throw new Error(error.message);
      }
      return { action: 'checkout.completed', result: data };
    }
    case 'checkout.expired': {
      const { data, error } = await admin.rpc('apply_zeno_checkout_expired', {
        p_order_id: fields.orderId,
        p_provider_checkout_id: fields.checkoutId,
      });
      if (error) {
        throw new Error(error.message);
      }
      return { action: 'checkout.expired', result: data };
    }
    case 'checkout.partially_paid': {
      const { data, error } = await admin.rpc('apply_zeno_checkout_partially_paid', {
        p_order_id: fields.orderId,
        p_provider_checkout_id: fields.checkoutId,
        p_paid_amount: fields.paidAmount,
      });
      if (error) {
        throw new Error(error.message);
      }
      return { action: 'checkout.partially_paid', result: data };
    }
    default:
      return { action: 'ignored', type: event.type };
  }
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === '23505' || /duplicate key|unique/i.test(error.message ?? '');
}

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
