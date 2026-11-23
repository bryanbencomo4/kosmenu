import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  canSendBillingPaymentEmail,
  sendBillingPaymentEmail,
  type BillingPaymentEmailKind,
} from './send-billing-payment-email';

const METHOD_LABELS: Record<string, string> = {
  pago_movil: 'Pago Móvil',
  crypto_usdt: 'Binance Pay',
  gift_card: 'Tarjeta de regalo',
  bancolombia: 'Bancolombia',
  nequi: 'Nequi',
  zinli: 'Zinli',
  bre_b: 'Bre-B',
  efectivo: 'Efectivo',
};

type SubmissionRow = {
  id: string;
  business_id: string;
  user_id: string;
  method_code: string;
  months: number;
  amount_usd: number;
  declared_amount: number | null;
  declared_currency: string | null;
  reference: string | null;
  review_note: string | null;
  payment_id: string | null;
  status: string;
};

export async function notifyBillingPaymentStatus(opts: {
  supabase: SupabaseClient;
  submissionId: string;
  kind: BillingPaymentEmailKind;
}) {
  if (!canSendBillingPaymentEmail()) {
    return { ok: false as const, skipped: true as const, reason: 'resend-not-configured' };
  }

  const { data: submission, error } = await opts.supabase
    .from('payment_submissions')
    .select(
      'id, business_id, user_id, method_code, months, amount_usd, declared_amount, declared_currency, reference, review_note, payment_id, status',
    )
    .eq('id', opts.submissionId)
    .maybeSingle();

  if (error || !submission) {
    return { ok: false as const, skipped: true as const, reason: 'submission-not-found' };
  }

  const row = submission as SubmissionRow;

  const [{ data: business }, userResult] = await Promise.all([
    opts.supabase.from('comercios').select('id, nombre').eq('id', row.business_id).maybeSingle(),
    opts.supabase.auth.admin.getUserById(row.user_id),
  ]);

  const toEmail = userResult.data.user?.email?.trim().toLowerCase() ?? '';
  if (!toEmail) {
    return { ok: false as const, skipped: true as const, reason: 'owner-email-missing' };
  }

  let periodEnd: string | null = null;
  if (opts.kind === 'approved') {
    const { data: sub } = await opts.supabase
      .from('subscriptions')
      .select('current_period_end')
      .eq('business_id', row.business_id)
      .maybeSingle();
    periodEnd = (sub?.current_period_end as string | null) ?? null;
  }

  const methodName =
    METHOD_LABELS[row.method_code] ??
    row.method_code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  try {
    const result = await sendBillingPaymentEmail({
      kind: opts.kind,
      toEmail,
      businessName: business?.nombre ?? 'tu negocio',
      methodName,
      amountUsd: Number(row.amount_usd) || 0,
      months: Number(row.months) || 1,
      reference: row.reference,
      declaredAmount: row.declared_amount,
      declaredCurrency: row.declared_currency,
      reviewNote: row.review_note,
      submissionId: row.id,
      paymentId: row.payment_id,
      periodEnd,
    });
    return result;
  } catch (err) {
    console.error('[billing-email] send failed', err);
    return { ok: false as const, skipped: false as const, reason: 'send-failed' };
  }
}
