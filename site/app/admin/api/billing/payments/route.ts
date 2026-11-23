import { NextResponse } from 'next/server';

import { canReviewPayments } from '../../../_lib/admin-billing';
import { requireAdminPermission } from '../../../_lib/admin-auth';
import { getAdminSupabaseClient } from '../../../_lib/admin-supabase';

export const dynamic = 'force-dynamic';

function classifyChannel(provider: string | null | undefined) {
  const value = (provider ?? '').trim().toLowerCase();
  if (!value) return { channel: 'unknown', mode: 'unknown' as const };
  if (value.startsWith('manual:')) {
    return { channel: value.slice('manual:'.length) || 'manual', mode: 'manual' as const };
  }
  if (value === 'bdv_pago_movil' || value === 'zeno' || value === 'gift_card') {
    return { channel: value, mode: 'automatic' as const };
  }
  return { channel: value, mode: 'automatic' as const };
}

function methodLabel(code: string) {
  const map: Record<string, string> = {
    pago_movil: 'Pago Móvil',
    crypto_usdt: 'Binance Pay',
    zeno: 'Binance Pay',
    gift_card: 'Tarjeta de regalo',
    bdv_pago_movil: 'Pago Móvil (BDV)',
    bancolombia: 'Bancolombia',
    nequi: 'Nequi',
    zinli: 'Zinli',
    bre_b: 'Bre-B',
    efectivo: 'Efectivo',
  };
  return map[code] ?? code;
}

export async function GET(request: Request) {
  const admin = await requireAdminPermission('subscriptions.read');
  if (!canReviewPayments(admin.role) && admin.role !== 'sales') {
    return NextResponse.json({ error: 'No puedes ver los pagos.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const tab = url.searchParams.get('tab') ?? 'ledger';
  const supabase = getAdminSupabaseClient();

  if (tab === 'queue') {
    const status = url.searchParams.get('status') ?? 'pending';
    let query = supabase
      .from('payment_submissions')
      .select(
        'id, business_id, method_code, status, months, amount_usd, declared_amount, declared_currency, reference, payer_name, receipt_path, review_note, created_at, reviewed_at, advisor_id, payment_id, user_id',
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    const businessIds = [...new Set(rows.map((row) => row.business_id))];
    const advisorIds = [
      ...new Set(rows.map((row) => row.advisor_id).filter(Boolean)),
    ] as string[];

    const [{ data: businesses }, { data: advisors }] = await Promise.all([
      businessIds.length
        ? supabase.from('comercios').select('id, nombre, slug').in('id', businessIds)
        : Promise.resolve({ data: [] as Array<{ id: string; nombre: string; slug: string }> }),
      advisorIds.length
        ? supabase.from('sales_advisors').select('id, full_name, code').in('id', advisorIds)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; code: string }> }),
    ]);

    const businessById = new Map((businesses ?? []).map((item) => [item.id, item]));
    const advisorById = new Map((advisors ?? []).map((item) => [item.id, item]));

    const decorated = await Promise.all(
      rows.map(async (row) => {
        let receiptUrl: string | null = null;
        if (row.receipt_path) {
          const signed = await supabase.storage
            .from('comprobantes-suscripcion')
            .createSignedUrl(row.receipt_path, 900);
          receiptUrl = signed.data?.signedUrl ?? null;
        }
        const business = businessById.get(row.business_id);
        const advisor = row.advisor_id ? advisorById.get(row.advisor_id) : null;
        return {
          ...row,
          business_name: business?.nombre ?? 'Negocio',
          business_slug: business?.slug ?? null,
          advisor_name: advisor?.full_name ?? null,
          advisor_code: advisor?.code ?? null,
          receipt_url: receiptUrl,
          method_label: methodLabel(row.method_code),
          mode: 'manual' as const,
        };
      }),
    );

    return NextResponse.json({ ok: true, data: decorated });
  }

  // Ledger: completed grants from payments table
  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select(
      'id, business_id, provider, order_id, amount, currency, status, paid_at, created_at, period_start, period_end',
    )
    .order('created_at', { ascending: false })
    .limit(120);

  if (paymentsError) {
    return NextResponse.json({ error: paymentsError.message }, { status: 500 });
  }

  const rows = payments ?? [];
  const businessIds = [...new Set(rows.map((row) => row.business_id).filter(Boolean))] as string[];

  const { data: businesses } = businessIds.length
    ? await supabase.from('comercios').select('id, nombre, slug').in('id', businessIds)
    : { data: [] as Array<{ id: string; nombre: string; slug: string }> };

  const businessById = new Map((businesses ?? []).map((item) => [item.id, item]));

  const manualSubmissionIds = rows
    .map((row) => {
      const orderId = `${row.order_id ?? ''}`;
      if (!orderId.startsWith('manual:')) return null;
      return orderId.slice('manual:'.length);
    })
    .filter(Boolean) as string[];

  const { data: linkedSubs } = manualSubmissionIds.length
    ? await supabase
        .from('payment_submissions')
        .select('id, receipt_path, reference, method_code, payer_name')
        .in('id', manualSubmissionIds)
    : { data: [] as Array<{
        id: string;
        receipt_path: string | null;
        reference: string | null;
        method_code: string;
        payer_name: string | null;
      }> };

  const subById = new Map((linkedSubs ?? []).map((item) => [item.id, item]));

  const decorated = await Promise.all(
    rows.map(async (row) => {
      const classified = classifyChannel(row.provider);
      const business = row.business_id ? businessById.get(row.business_id) : null;
      const orderId = `${row.order_id ?? ''}`;
      const submissionId = orderId.startsWith('manual:') ? orderId.slice(7) : null;
      const linked = submissionId ? subById.get(submissionId) : null;

      let receiptUrl: string | null = null;
      if (linked?.receipt_path) {
        const signed = await supabase.storage
          .from('comprobantes-suscripcion')
          .createSignedUrl(linked.receipt_path, 900);
        receiptUrl = signed.data?.signedUrl ?? null;
      }

      return {
        id: row.id,
        business_id: row.business_id,
        business_name: business?.nombre ?? 'Negocio',
        business_slug: business?.slug ?? null,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        paid_at: row.paid_at ?? row.created_at,
        period_start: row.period_start,
        period_end: row.period_end,
        provider: row.provider,
        order_id: row.order_id,
        mode: classified.mode,
        channel: classified.channel,
        method_label: methodLabel(classified.channel),
        reference: linked?.reference ?? null,
        payer_name: linked?.payer_name ?? null,
        receipt_url: receiptUrl,
        submission_id: submissionId,
        bdv_payment_id:
          typeof row.order_id === 'string' && row.order_id.startsWith('bdv:')
            ? row.order_id.slice(4)
            : null,
      };
    }),
  );

  return NextResponse.json({ ok: true, data: decorated });
}
