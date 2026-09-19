import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceSupabaseClient } from './supabase-server';
import {
  matchBdvPendingTarget,
  parseBdvPaymentPayload,
  type BdvIncomingPayment,
  type BdvPendingTarget,
} from './bdv-match';

type CheckoutOrderRow = {
  id: string;
  business_id: string;
  submission_id: string | null;
  plan_code: string;
  months: number;
  amount_usd: number | string;
  expected_amount_ves: number | string | null;
  expected_phone: string | null;
  reference: string | null;
};

type SubmissionRow = {
  id: string;
  business_id: string;
  plan_code: string;
  months: number;
  amount_usd: number | string;
  declared_amount: number | string | null;
  declared_currency: string | null;
  reference: string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTargetFromOrder(row: CheckoutOrderRow): BdvPendingTarget {
  return {
    id: row.id,
    businessId: row.business_id,
    submissionId: row.submission_id,
    planCode: row.plan_code,
    months: row.months,
    amountUsd: toNumber(row.amount_usd) ?? 0,
    expectedAmountVes: toNumber(row.expected_amount_ves),
    expectedPhone: row.expected_phone,
    reference: row.reference,
  };
}

export type BdvIngestResult = {
  ok: true;
  status: 'RECEIVED' | 'CONFIRMED' | 'REJECTED';
  payment_id: string;
  idempotent?: boolean;
  matched_business_id?: string | null;
  match_reason?: string | null;
};

export async function ingestBdvPayment(
  payload: unknown,
  options?: { deviceId?: string | null; supabase?: SupabaseClient },
): Promise<BdvIngestResult> {
  const payment = parseBdvPaymentPayload(payload);
  if (!payment) {
    throw new Error('INVALID_PAYLOAD');
  }

  const supabase = options?.supabase ?? getServiceSupabaseClient();
  const existing = await supabase
    .from('bdv_payments')
    .select('payment_id, status, matched_business_id, match_reason')
    .eq('payment_id', payment.payment_id)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  if (existing.data) {
    if (existing.data.status === 'RECEIVED') {
      const retried = await tryConfirmExistingPayment(supabase, existing.data.payment_id, payment);
      if (retried) return retried;
    }
    return {
      ok: true,
      status: existing.data.status as BdvIngestResult['status'],
      payment_id: payment.payment_id,
      idempotent: true,
      matched_business_id: existing.data.matched_business_id,
      match_reason: existing.data.match_reason,
    };
  }

  const insert = await supabase
    .from('bdv_payments')
    .insert({
      payment_id: payment.payment_id,
      amount: payment.amount,
      currency: payment.currency || 'VES',
      reference: payment.reference,
      operation_number: payment.operation_number,
      sender_name: payment.sender_name,
      sender_phone: payment.sender_phone,
      bank_date: payment.bank_date,
      bank_time: payment.bank_time,
      raw_text: payment.raw_text,
      status: 'RECEIVED',
      event: payment.event,
      source_package: payment.source_package,
      device_id: options?.deviceId ?? null,
      payload: payload as Record<string, unknown>,
    })
    .select('id, payment_id, status')
    .single();

  if (insert.error) {
    if (insert.error.code === '23505') {
      return ingestBdvPayment(payload, options);
    }
    throw new Error(insert.error.message);
  }

  const targets = await loadPendingTargets(supabase);
  const match = matchBdvPendingTarget(payment, targets);

  if (!match) {
    return {
      ok: true,
      status: 'RECEIVED',
      payment_id: payment.payment_id,
      matched_business_id: null,
      match_reason: null,
    };
  }

  await activateMatchedPayment(supabase, insert.data.id, payment, match.target, match.reason);

  return {
    ok: true,
    status: 'CONFIRMED',
    payment_id: payment.payment_id,
    matched_business_id: match.target.businessId,
    match_reason: match.reason,
  };
}

async function tryConfirmExistingPayment(
  supabase: SupabaseClient,
  paymentId: string,
  payment: BdvIncomingPayment,
): Promise<BdvIngestResult | null> {
  const { data: row, error } = await supabase
    .from('bdv_payments')
    .select('id, status')
    .eq('payment_id', paymentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || row.status !== 'RECEIVED') return null;

  const targets = await loadPendingTargets(supabase);
  const match = matchBdvPendingTarget(payment, targets);
  if (!match) return null;

  await activateMatchedPayment(supabase, row.id, payment, match.target, match.reason);
  return {
    ok: true,
    status: 'CONFIRMED',
    payment_id: paymentId,
    matched_business_id: match.target.businessId,
    match_reason: match.reason,
  };
}

async function loadPendingTargets(supabase: SupabaseClient) {
  const [{ data: orders, error: ordersError }, { data: submissions, error: submissionsError }, rate] =
    await Promise.all([
      supabase
        .from('bdv_checkout_orders')
        .select(
          'id, business_id, submission_id, plan_code, months, amount_usd, expected_amount_ves, expected_phone, reference',
        )
        .eq('status', 'PENDING_PAYMENT')
        .order('created_at', { ascending: true }),
      supabase
        .from('payment_submissions')
        .select('id, business_id, plan_code, months, amount_usd, declared_amount, declared_currency, reference')
        .eq('status', 'pending')
        .eq('method_code', 'pago_movil')
        .order('created_at', { ascending: true }),
      loadBcvRate(supabase),
    ]);

  if (ordersError) throw new Error(ordersError.message);
  if (submissionsError) throw new Error(submissionsError.message);

  const fromOrders = ((orders ?? []) as CheckoutOrderRow[]).map(toTargetFromOrder);
  const orderBusinessIds = new Set(fromOrders.map((item) => item.businessId));
  const fromSubmissions: BdvPendingTarget[] = ((submissions ?? []) as SubmissionRow[])
    .filter((row) => !orderBusinessIds.has(row.business_id))
    .map((row) => {
      const amountUsd = toNumber(row.amount_usd) ?? 0;
      const declared = toNumber(row.declared_amount);
      const declaredIsVes = (row.declared_currency ?? '').toUpperCase() === 'VES';
      return {
        id: `submission:${row.id}`,
        businessId: row.business_id,
        submissionId: row.id,
        planCode: row.plan_code,
        months: row.months,
        amountUsd,
        expectedAmountVes: declaredIsVes && declared != null ? declared : rate != null ? round2(amountUsd * rate) : null,
        expectedPhone: null,
        reference: row.reference,
      };
    });

  return [...fromOrders, ...fromSubmissions];
}

async function loadBcvRate(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('global_market_rates')
    .select('bcv_rate')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return toNumber(data?.bcv_rate as number | string | null);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

async function activateMatchedPayment(
  supabase: SupabaseClient,
  bdvRowId: string,
  payment: BdvIncomingPayment,
  target: BdvPendingTarget,
  reason: string,
) {
  const grant = await supabase.rpc('grant_subscription_period', {
    p_business_id: target.businessId,
    p_plan_code: target.planCode,
    p_months: target.months,
    p_provider: 'bdv_pago_movil',
    p_order_id: `bdv:${payment.payment_id}`,
    p_amount: target.amountUsd,
    p_currency: 'USD',
    p_paid_at: new Date().toISOString(),
  });

  if (grant.error) {
    throw new Error(grant.error.message);
  }

  const paymentUuid = (grant.data as { payment_id?: string } | null)?.payment_id ?? null;
  const submissionId = target.submissionId;

  if (submissionId) {
    await supabase
      .from('payment_submissions')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        review_note: `Confirmado automáticamente por BDV (${reason}).`,
        payment_id: paymentUuid,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId)
      .eq('status', 'pending');
  }

  if (!target.id.startsWith('submission:')) {
    await supabase
      .from('bdv_checkout_orders')
      .update({
        status: 'PAID',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.id)
      .eq('status', 'PENDING_PAYMENT');
  }

  await supabase
    .from('bdv_payments')
    .update({
      status: 'CONFIRMED',
      match_reason: reason,
      matched_business_id: target.businessId,
      matched_order_id: target.id.startsWith('submission:') ? null : target.id,
      matched_submission_id: submissionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bdvRowId);
}

export async function rememberBdvNonce(nonce: string, supabase?: SupabaseClient) {
  const client = supabase ?? getServiceSupabaseClient();
  const { error } = await client.from('bdv_nonces').insert({ nonce });
  if (!error) return { ok: true as const };
  if (error.code === '23505') return { ok: false as const, error: 'Unauthorized' };
  throw new Error(error.message);
}

export async function assignBdvPaymentToBusiness(input: {
  paymentRowId: string;
  businessId: string;
  months?: number;
  planCode?: string;
}) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from('bdv_payments')
    .select('id, payment_id, amount, reference, status')
    .eq('id', input.paymentRowId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('PAYMENT_NOT_FOUND');
  if (data.status === 'CONFIRMED') {
    return { ok: true, status: 'CONFIRMED' as const, idempotent: true, payment_id: data.payment_id };
  }

  const synthetic: BdvIncomingPayment = {
    payment_id: data.payment_id,
    amount: toNumber(data.amount),
    currency: 'VES',
    reference: data.reference,
    operation_number: null,
    sender_name: null,
    sender_phone: null,
    raw_text: null,
    bank_date: null,
    bank_time: null,
    source_package: null,
  };

  const planCode = input.planCode ?? 'menu_monthly';
  const months = input.months ?? 1;
  const { data: plan } = await supabase
    .from('plans')
    .select('price_amount')
    .eq('code', planCode)
    .maybeSingle();
  const unitPrice = toNumber(plan?.price_amount as number | string | null) ?? 10;

  const target: BdvPendingTarget = {
    id: `manual:${input.businessId}`,
    businessId: input.businessId,
    submissionId: null,
    planCode,
    months,
    amountUsd: round2(unitPrice * months),
    expectedAmountVes: toNumber(data.amount),
    expectedPhone: null,
    reference: data.reference,
  };

  await activateMatchedPayment(supabase, data.id, synthetic, target, 'admin_assign');
  return { ok: true, status: 'CONFIRMED' as const, payment_id: data.payment_id };
}

export async function assignBdvPaymentToPendingOrder(input: { paymentRowId: string; orderId: string }) {
  const supabase = getServiceSupabaseClient();
  const [{ data, error }, { data: order, error: orderError }] = await Promise.all([
    supabase
      .from('bdv_payments')
      .select('id, payment_id, amount, reference, status, sender_phone, sender_name, operation_number, raw_text')
      .eq('id', input.paymentRowId)
      .maybeSingle(),
    supabase
      .from('bdv_checkout_orders')
      .select(
        'id, business_id, submission_id, plan_code, months, amount_usd, expected_amount_ves, expected_phone, reference, status',
      )
      .eq('id', input.orderId)
      .maybeSingle(),
  ]);

  if (error) throw new Error(error.message);
  if (orderError) throw new Error(orderError.message);
  if (!data) throw new Error('PAYMENT_NOT_FOUND');
  if (!order) throw new Error('ORDER_NOT_FOUND');
  if (data.status === 'CONFIRMED') {
    return { ok: true, status: 'CONFIRMED' as const, idempotent: true, payment_id: data.payment_id };
  }
  if (order.status !== 'PENDING_PAYMENT') {
    throw new Error('ORDER_NOT_PENDING');
  }

  const incoming: BdvIncomingPayment = {
    payment_id: data.payment_id,
    amount: toNumber(data.amount),
    currency: 'VES',
    reference: data.reference,
    operation_number: data.operation_number,
    sender_name: data.sender_name,
    sender_phone: data.sender_phone,
    raw_text: data.raw_text,
    bank_date: null,
    bank_time: null,
    source_package: null,
  };

  await activateMatchedPayment(supabase, data.id, incoming, toTargetFromOrder(order as CheckoutOrderRow), 'admin_assign');
  return { ok: true, status: 'CONFIRMED' as const, payment_id: data.payment_id };
}

export async function reprocessBdvPayment(paymentRowId: string) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from('bdv_payments')
    .select(
      'id, payment_id, status, payload, device_id, amount, currency, reference, operation_number, sender_name, sender_phone, raw_text, bank_date, bank_time, source_package',
    )
    .eq('id', paymentRowId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('PAYMENT_NOT_FOUND');
  if (data.status === 'CONFIRMED') {
    return {
      ok: true as const,
      status: 'CONFIRMED' as const,
      payment_id: data.payment_id,
      idempotent: true,
    };
  }

  if (data.status === 'REJECTED' || data.status === 'ERROR') {
    const reset = await supabase
      .from('bdv_payments')
      .update({
        status: 'RECEIVED',
        match_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id);
    if (reset.error) throw new Error(reset.error.message);
  }

  const storedPayload = data.payload;
  const payload =
    storedPayload && typeof storedPayload === 'object' && !Array.isArray(storedPayload) && Object.keys(storedPayload).length > 0
      ? storedPayload
      : {
          event: 'payment_received',
          payment_id: data.payment_id,
          amount: toNumber(data.amount),
          currency: data.currency || 'VES',
          reference: data.reference,
          operation_number: data.operation_number,
          sender_name: data.sender_name,
          sender_phone: data.sender_phone,
          raw_text: data.raw_text,
          bank_date: data.bank_date,
          bank_time: data.bank_time,
          source_package: data.source_package,
        };

  return ingestBdvPayment(payload, { deviceId: data.device_id, supabase });
}
