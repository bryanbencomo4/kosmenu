import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logBdvIngestOutcome, logBdvPaymentEvent } from '../../../../api/_lib/bdv-events';
import {
  assignBdvPaymentToBusiness,
  assignBdvPaymentToPendingOrder,
  ingestBdvPayment,
  reprocessBdvPayment,
} from '../../../../api/_lib/bdv-ingest';
import { canReviewPayments } from '../../../_lib/admin-billing';
import { logAdminAction } from '../../../_lib/admin-audit';
import { requireAdminPermission } from '../../../_lib/admin-auth';
import { getAdminSupabaseClient } from '../../../_lib/admin-supabase';

export const dynamic = 'force-dynamic';

const assignSchema = z.object({
  action: z.literal('assign'),
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  months: z.number().int().min(1).max(24).optional(),
});

const assignOrderSchema = z.object({
  action: z.literal('assign_order'),
  id: z.string().uuid(),
  order_id: z.string().uuid(),
});

const rejectSchema = z.object({
  action: z.literal('reject'),
  id: z.string().uuid(),
  note: z.string().trim().min(3).max(500),
});

const reprocessSchema = z.object({
  action: z.literal('reprocess'),
  id: z.string().uuid(),
});

const createOrderSchema = z.object({
  action: z.literal('create_order'),
  business_id: z.string().uuid(),
  months: z.number().int().min(1).max(24).default(1),
  expected_phone: z.string().trim().max(32).optional(),
  reference: z.string().trim().max(64).optional(),
});

const testPaymentSchema = z.object({
  action: z.literal('test_payment'),
  amount: z.number().nonnegative(),
  reference: z.string().trim().min(4).max(64),
  sender_phone: z.string().trim().max(32).optional(),
});

const PAYMENT_COLUMNS =
  'id, payment_id, amount, currency, reference, operation_number, sender_phone, sender_name, bank_date, bank_time, raw_text, status, event, source_package, device_id, match_reason, matched_business_id, matched_order_id, matched_submission_id, payload, created_at, updated_at';

type BdvPaymentRow = {
  id: string;
  payment_id: string;
  amount: number | string | null;
  currency: string;
  reference: string | null;
  operation_number: string | null;
  sender_phone: string | null;
  sender_name: string | null;
  bank_date: string | null;
  bank_time: string | null;
  raw_text: string | null;
  status: string;
  event: string | null;
  source_package: string | null;
  device_id: string | null;
  match_reason: string | null;
  matched_business_id: string | null;
  matched_order_id: string | null;
  matched_submission_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

async function loadPendingOrders(supabase: ReturnType<typeof getAdminSupabaseClient>) {
  const [{ data: businesses }, { data: orders }] = await Promise.all([
    supabase.from('comercios').select('id, nombre, slug').order('nombre', { ascending: true }).limit(300),
    supabase
      .from('bdv_checkout_orders')
      .select('id, business_id, amount_usd, expected_amount_ves, expected_phone, reference, status, created_at, months, plan_code')
      .eq('status', 'PENDING_PAYMENT')
      .order('created_at', { ascending: false })
      .limit(80),
  ]);
  const businessById = new Map((businesses ?? []).map((item) => [item.id, item]));
  return {
    businesses: businesses ?? [],
    pending_orders: (orders ?? []).map((order) => ({
      ...order,
      business_name: businessById.get(order.business_id)?.nombre ?? null,
    })),
    businessById,
  };
}

async function decoratePayments(
  supabase: ReturnType<typeof getAdminSupabaseClient>,
  rows: BdvPaymentRow[],
  businessById: Map<string, { id: string; nombre: string; slug: string | null }>,
) {
  const missingBusinessIds = [
    ...new Set(
      rows
        .map((row) => row.matched_business_id)
        .filter((id): id is string => Boolean(id) && !businessById.has(id)),
    ),
  ];
  if (missingBusinessIds.length > 0) {
    const { data } = await supabase.from('comercios').select('id, nombre, slug').in('id', missingBusinessIds);
    for (const item of data ?? []) {
      businessById.set(item.id, item);
    }
  }

  const orderIds = [...new Set(rows.map((row) => row.matched_order_id).filter(Boolean))] as string[];
  const { data: orders } = orderIds.length
    ? await supabase
        .from('bdv_checkout_orders')
        .select('id, plan_code, months, amount_usd, status, paid_at')
        .in('id', orderIds)
    : { data: [] as Array<{ id: string; plan_code: string; months: number; amount_usd: number; status: string; paid_at: string | null }> };

  const orderById = new Map((orders ?? []).map((item) => [item.id, item]));

  return rows.map((row) => {
    const business = row.matched_business_id ? businessById.get(row.matched_business_id) : null;
    const order = row.matched_order_id ? orderById.get(row.matched_order_id) : null;
    return {
      ...row,
      business_name: business?.nombre ?? null,
      business_slug: business?.slug ?? null,
      order_label: order
        ? `${order.plan_code} · ${order.months} mes${order.months === 1 ? '' : 'es'}`
        : row.matched_submission_id
          ? `Solicitud ${row.matched_submission_id.slice(0, 8)}`
          : null,
    };
  });
}

export async function GET(request: Request) {
  const admin = await requireAdminPermission('subscriptions.read');
  if (!canReviewPayments(admin.role) && admin.role !== 'sales') {
    return NextResponse.json({ error: 'No puedes ver pagos BDV.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const paymentId = url.searchParams.get('id')?.trim() || '';
  const supabase = getAdminSupabaseClient();
  const catalogs = await loadPendingOrders(supabase);

  if (paymentId) {
    const { data, error } = await supabase.from('bdv_payments').select(PAYMENT_COLUMNS).eq('id', paymentId).maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Pago no encontrado.' }, { status: 404 });
    }

    const row = data as BdvPaymentRow;
    const [decorated] = await decoratePayments(supabase, [row], catalogs.businessById);
    const [{ data: events }, { data: audit }, { data: ledger }, { data: matchedOrder }] = await Promise.all([
      supabase
        .from('payment_events')
        .select('id, event_type, payload, processed, processing_error, created_at')
        .eq('provider', 'bdv_pago_movil')
        .contains('payload', { payment_id: row.payment_id })
        .order('created_at', { ascending: true })
        .limit(80),
      supabase
        .from('admin_audit_logs')
        .select('action, actor_email, created_at')
        .eq('entity_type', 'bdv_payments')
        .or(`entity_id.eq.${row.id},entity_id.eq.${row.payment_id}`)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('payments')
        .select('id, paid_at, period_start, period_end, amount, provider')
        .eq('order_id', `bdv:${row.payment_id}`)
        .maybeSingle(),
      row.matched_order_id
        ? supabase
            .from('bdv_checkout_orders')
            .select('id, plan_code, months, amount_usd, status, paid_at')
            .eq('id', row.matched_order_id)
            .maybeSingle()
        : Promise.resolve({ data: null as { id: string; plan_code: string; months: number; amount_usd: number; status: string; paid_at: string | null } | null }),
    ]);

    const { data: planRow } = matchedOrder?.plan_code
      ? await supabase.from('plans').select('code, name').eq('code', matchedOrder.plan_code).maybeSingle()
      : { data: null as { code: string; name: string } | null };

    return NextResponse.json({
      ok: true,
      payment: {
        ...decorated,
        plan_code: matchedOrder?.plan_code ?? planRow?.code ?? null,
        plan_name: planRow?.name ?? matchedOrder?.plan_code ?? null,
        months: matchedOrder?.months ?? null,
        activated_at: ledger?.paid_at ?? matchedOrder?.paid_at ?? (row.status === 'CONFIRMED' ? row.updated_at : null),
        processed_by: audit?.[0]?.actor_email ?? (row.status === 'CONFIRMED' ? 'Sistema (BDV Payment Bridge)' : null),
        device_id: row.device_id,
      },
      events: events ?? [],
      audit: audit ?? [],
      businesses: catalogs.businesses,
      pending_orders: catalogs.pending_orders,
    });
  }

  const reference = url.searchParams.get('reference')?.trim() ?? '';
  const phone = url.searchParams.get('phone')?.trim() ?? '';
  const name = url.searchParams.get('name')?.trim() ?? '';
  const status = url.searchParams.get('status')?.trim() ?? '';
  const from = url.searchParams.get('from')?.trim() ?? '';
  const to = url.searchParams.get('to')?.trim() ?? '';

  let query = supabase.from('bdv_payments').select(PAYMENT_COLUMNS).order('created_at', { ascending: false }).limit(200);
  if (reference) query = query.ilike('reference', `%${reference}%`);
  if (phone) query = query.ilike('sender_phone', `%${phone}%`);
  if (name) query = query.ilike('sender_name', `%${name}%`);
  if (status && status !== 'all') {
    if (status === 'MATCHED') {
      query = query.eq('status', 'RECEIVED').not('match_reason', 'is', null);
    } else {
      query = query.eq('status', status);
    }
  }
  if (from) query = query.gte('created_at', new Date(`${from}T00:00:00.000`).toISOString());
  if (to) query = query.lte('created_at', new Date(`${to}T23:59:59.999`).toISOString());

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = await decoratePayments(supabase, (data ?? []) as BdvPaymentRow[], catalogs.businessById);
  return NextResponse.json({
    ok: true,
    data: rows,
    businesses: catalogs.businesses,
    pending_orders: catalogs.pending_orders,
  });
}

export async function POST(request: Request) {
  const admin = await requireAdminPermission('subscriptions.read');
  if (!canReviewPayments(admin.role)) {
    return NextResponse.json({ error: 'No puedes gestionar pagos BDV.' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Datos invalidos.' }, { status: 400 });
  }

  const action = (payload as { action?: string }).action;
  const supabase = getAdminSupabaseClient();

  try {
    if (action === 'assign') {
      const parsed = assignSchema.parse(payload);
      const result = await assignBdvPaymentToBusiness({
        paymentRowId: parsed.id,
        businessId: parsed.business_id,
        months: parsed.months,
      });
      await logBdvPaymentEvent({
        eventType: 'admin_assign',
        paymentId: result.payment_id,
        paymentRowId: parsed.id,
        payload: { business_id: parsed.business_id, actor: admin.email },
      });
      await logAdminAction({
        action: 'bdv_payment.assign',
        actorUserId: admin.authUserId,
        actorEmail: admin.email,
        entityType: 'bdv_payments',
        entityId: parsed.id,
        newData: result,
        requestHeaders: request.headers,
      });
      return NextResponse.json(result);
    }

    if (action === 'assign_order') {
      const parsed = assignOrderSchema.parse(payload);
      const result = await assignBdvPaymentToPendingOrder({
        paymentRowId: parsed.id,
        orderId: parsed.order_id,
      });
      await logBdvPaymentEvent({
        eventType: 'admin_assign',
        paymentId: result.payment_id,
        paymentRowId: parsed.id,
        payload: { order_id: parsed.order_id, actor: admin.email },
      });
      if (result.status === 'CONFIRMED' && !result.idempotent) {
        await logBdvPaymentEvent({
          eventType: 'activation_completed',
          paymentId: result.payment_id,
          paymentRowId: parsed.id,
          payload: { reason: 'admin_assign', order_id: parsed.order_id },
        });
      }
      await logAdminAction({
        action: 'bdv_payment.assign_order',
        actorUserId: admin.authUserId,
        actorEmail: admin.email,
        entityType: 'bdv_payments',
        entityId: parsed.id,
        newData: result,
        requestHeaders: request.headers,
      });
      return NextResponse.json(result);
    }

    if (action === 'reprocess') {
      const parsed = reprocessSchema.parse(payload);
      await logBdvPaymentEvent({
        eventType: 'admin_reprocess',
        paymentRowId: parsed.id,
        payload: { actor: admin.email },
      });
      const result = await reprocessBdvPayment(parsed.id);
      await logBdvIngestOutcome(result);
      await logAdminAction({
        action: 'bdv_payment.reprocess',
        actorUserId: admin.authUserId,
        actorEmail: admin.email,
        entityType: 'bdv_payments',
        entityId: parsed.id,
        newData: result,
        requestHeaders: request.headers,
      });
      return NextResponse.json(result);
    }

    if (action === 'reject') {
      const parsed = rejectSchema.parse(payload);
      const { data: current, error: loadError } = await supabase
        .from('bdv_payments')
        .select('id, payment_id, status')
        .eq('id', parsed.id)
        .maybeSingle();
      if (loadError) {
        return NextResponse.json({ error: loadError.message }, { status: 500 });
      }
      if (!current) {
        return NextResponse.json({ error: 'Pago no encontrado.' }, { status: 404 });
      }
      if (current.status === 'CONFIRMED') {
        return NextResponse.json({ error: 'Un pago confirmado no se puede rechazar.' }, { status: 400 });
      }
      const { error } = await supabase
        .from('bdv_payments')
        .update({
          status: 'REJECTED',
          match_reason: parsed.note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parsed.id)
        .neq('status', 'CONFIRMED');
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      await logBdvPaymentEvent({
        eventType: 'admin_reject',
        paymentId: current.payment_id,
        paymentRowId: parsed.id,
        payload: { note: parsed.note, actor: admin.email },
      });
      await logAdminAction({
        action: 'bdv_payment.reject',
        actorUserId: admin.authUserId,
        actorEmail: admin.email,
        entityType: 'bdv_payments',
        entityId: parsed.id,
        newData: { note: parsed.note },
        requestHeaders: request.headers,
      });
      return NextResponse.json({ ok: true, status: 'REJECTED' });
    }

    if (action === 'create_order') {
      const parsed = createOrderSchema.parse(payload);
      const [{ data: plan }, { data: rateRow }, { data: business }] = await Promise.all([
        supabase.from('plans').select('price_amount, code').eq('code', 'menu_monthly').maybeSingle(),
        supabase.from('global_market_rates').select('bcv_rate').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('comercios').select('id, whatsapp, telefonos').eq('id', parsed.business_id).maybeSingle(),
      ]);
      if (!business) {
        return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });
      }
      const amountUsd = Number(plan?.price_amount ?? 10) * parsed.months;
      const bcvRate = rateRow?.bcv_rate != null ? Number(rateRow.bcv_rate) : null;
      const expectedVes = bcvRate != null ? Math.round(amountUsd * bcvRate * 100) / 100 : null;
      const { data, error } = await supabase
        .from('bdv_checkout_orders')
        .insert({
          business_id: parsed.business_id,
          plan_code: 'menu_monthly',
          months: parsed.months,
          amount_usd: amountUsd,
          expected_amount_ves: expectedVes,
          expected_phone: parsed.expected_phone || business.whatsapp || business.telefonos || null,
          reference: parsed.reference || null,
          status: 'PENDING_PAYMENT',
        })
        .select('id, business_id, amount_usd, expected_amount_ves, status')
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      await logAdminAction({
        action: 'bdv_checkout_order.create',
        actorUserId: admin.authUserId,
        actorEmail: admin.email,
        entityType: 'bdv_checkout_orders',
        entityId: data.id,
        newData: data,
        requestHeaders: request.headers,
      });
      return NextResponse.json({ ok: true, data });
    }

    if (action === 'test_payment') {
      const parsed = testPaymentSchema.parse(payload);
      const paymentId = `bdv-test-${randomUUID()}`;
      await logBdvPaymentEvent({
        eventType: 'hmac_validated',
        paymentId,
        payload: { source: 'admin_test', actor: admin.email },
      });
      const result = await ingestBdvPayment(
        {
          event: 'payment_received',
          payment_id: paymentId,
          amount: parsed.amount,
          currency: 'VES',
          reference: parsed.reference,
          operation_number: null,
          sender_name: null,
          sender_phone: parsed.sender_phone ?? null,
          raw_text: `Pago de prueba ElMenúXFA por Bs.${parsed.amount} Ref: ${parsed.reference}`,
          bank_date: null,
          bank_time: null,
          source_package: 'elmenuxfa.test',
        },
        { deviceId: 'BDV-TEST' },
      );
      await logBdvIngestOutcome(result);
      await logAdminAction({
        action: 'bdv_payment.test',
        actorUserId: admin.authUserId,
        actorEmail: admin.email,
        entityType: 'bdv_payments',
        entityId: paymentId,
        newData: result,
        requestHeaders: request.headers,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Accion no soportada.' }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? 'Datos invalidos.'
        : error instanceof Error
          ? error.message
          : 'No se pudo completar.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
