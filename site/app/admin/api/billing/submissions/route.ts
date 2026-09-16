import { NextResponse } from 'next/server';
import { z } from 'zod';

import { canReviewPayments } from '../../../_lib/admin-billing';
import { logAdminAction } from '../../../_lib/admin-audit';
import { requireAdminPermission } from '../../../_lib/admin-auth';
import { getAdminSupabaseClient } from '../../../_lib/admin-supabase';

export const dynamic = 'force-dynamic';

const reviewSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional(),
});

type SubmissionRow = {
  id: string;
  business_id: string;
  method_code: string;
  status: string;
  months: number;
  amount_usd: number;
  declared_amount: number | null;
  declared_currency: string | null;
  reference: string | null;
  payer_name: string | null;
  receipt_path: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  advisor_id: string | null;
};

export async function GET(request: Request) {
  const admin = await requireAdminPermission('subscriptions.read');
  if (!canReviewPayments(admin.role) && admin.role !== 'sales') {
    return NextResponse.json({ error: 'No puedes ver la cola de pagos.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? 'pending';
  const supabase = getAdminSupabaseClient();

  let query = supabase
    .from('payment_submissions')
    .select(
      'id, business_id, method_code, status, months, amount_usd, declared_amount, declared_currency, reference, payer_name, receipt_path, review_note, created_at, reviewed_at, advisor_id',
    )
    .order('created_at', { ascending: false })
    .limit(80);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as SubmissionRow[];
  const businessIds = [...new Set(rows.map((row) => row.business_id))];
  const advisorIds = [...new Set(rows.map((row) => row.advisor_id).filter(Boolean))] as string[];

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
          .createSignedUrl(row.receipt_path, 600);
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
      };
    }),
  );

  return NextResponse.json({ ok: true, data: decorated });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminPermission('subscriptions.read');
  if (!canReviewPayments(admin.role)) {
    return NextResponse.json({ error: 'No puedes revisar pagos.' }, { status: 403 });
  }

  let payload: z.infer<typeof reviewSchema>;
  try {
    payload = reviewSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? 'Datos invalidos.' : 'Datos invalidos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (payload.action === 'reject' && !payload.note?.trim()) {
    return NextResponse.json({ error: 'Escribe el motivo del rechazo.' }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();
  const rpcName = payload.action === 'approve' ? 'approve_manual_payment' : 'reject_manual_payment';
  const { data, error } = await supabase.rpc(rpcName, {
    p_submission_id: payload.id,
    p_note: payload.note?.trim() || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await supabase
    .from('payment_submissions')
    .update({ reviewed_by: admin.authUserId })
    .eq('id', payload.id)
    .is('reviewed_by', null);

  await logAdminAction({
    action: `admin.payment_submissions.${payload.action}`,
    actorUserId: admin.authUserId,
    actorEmail: admin.email,
    entityType: 'payment_submissions',
    entityId: payload.id,
    newData: data,
    requestHeaders: request.headers,
  });

  return NextResponse.json({ ok: true, data });
}
