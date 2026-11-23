import { NextResponse } from 'next/server';
import { z } from 'zod';

import { canReviewPayments } from '../../../_lib/admin-billing';
import { requireAdminPermission } from '../../../_lib/admin-auth';
import { getAdminSupabaseClient } from '../../../_lib/admin-supabase';
import {
  KIT_RECEIPTS_BUCKET,
  KIT_SHIPMENT_STATUSES,
  kitOrderPublicCode,
} from '../../../../_lib/kit-shipments';
import {
  canSendKitShipmentEmail,
  sendKitShipmentEmail,
} from '../../../../api/_lib/send-kit-shipment-email';

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(KIT_SHIPMENT_STATUSES).optional(),
  zoom_tracking: z.string().trim().max(120).nullable().optional(),
  admin_note: z.string().trim().max(500).nullable().optional(),
  confirm_payment: z.boolean().optional(),
});

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireAdminPermission('subscriptions.read');
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('kit_shipments')
    .select(
      'id, created_at, updated_at, gift_qty, extras_qty, extras_unit_price_usd, product_total_usd, recipient_name, phone, email, ci, estado, ciudad, zoom_office, business_slug, payment_reference, receipt_path, declared_amount, declared_currency, status, admin_note, zoom_tracking, reviewed_at',
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[admin/kit/shipments] list', error.message);
    return NextResponse.json({ error: 'No se pudo cargar.' }, { status: 500 });
  }

  const rows = await Promise.all(
    (data ?? []).map(async (row) => {
      let receiptUrl: string | null = null;
      if (row.receipt_path) {
        const signed = await supabase.storage
          .from(KIT_RECEIPTS_BUCKET)
          .createSignedUrl(row.receipt_path, 10 * 60);
        receiptUrl = signed.data?.signedUrl ?? null;
      }
      return {
        ...row,
        code: kitOrderPublicCode(row.id),
        receipt_url: receiptUrl,
      };
    }),
  );

  return NextResponse.json({ ok: true, data: rows });
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdminPermission('subscriptions.read');
    if (!canReviewPayments(admin.role)) {
      return NextResponse.json({ error: 'Sin permiso para revisar.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
    }

    const supabase = getAdminSupabaseClient();
    const { data: existing, error: loadError } = await supabase
      .from('kit_shipments')
      .select('*')
      .eq('id', parsed.data.id)
      .maybeSingle();

    if (loadError || !existing) {
      return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      reviewed_by: admin.authUserId,
      reviewed_at: new Date().toISOString(),
    };

    if (parsed.data.zoom_tracking !== undefined) {
      updates.zoom_tracking = parsed.data.zoom_tracking;
    }
    if (parsed.data.admin_note !== undefined) {
      updates.admin_note = parsed.data.admin_note;
    }

    let nextStatus = existing.status as string;
    if (parsed.data.confirm_payment && existing.status === 'pending_payment') {
      nextStatus = 'pending_ship';
      updates.status = nextStatus;
    }
    if (parsed.data.status) {
      nextStatus = parsed.data.status;
      updates.status = nextStatus;
    }

    const { data: updated, error } = await supabase
      .from('kit_shipments')
      .update(updates)
      .eq('id', parsed.data.id)
      .select('*')
      .single();

    if (error || !updated) {
      console.error('[admin/kit/shipments] patch', error?.message);
      return NextResponse.json({ error: 'No se pudo actualizar.' }, { status: 500 });
    }

    if (
      nextStatus === 'shipped' &&
      existing.status !== 'shipped' &&
      canSendKitShipmentEmail()
    ) {
      await sendKitShipmentEmail({
        kind: 'shipped',
        toEmail: updated.email,
        recipientName: updated.recipient_name,
        shipmentId: updated.id,
        giftQty: updated.gift_qty,
        extrasQty: updated.extras_qty,
        productTotalUsd: Number(updated.product_total_usd),
        status: 'shipped',
        estado: updated.estado,
        ciudad: updated.ciudad,
        zoomOffice: updated.zoom_office,
        zoomTracking: updated.zoom_tracking,
        paymentReference: updated.payment_reference,
      }).catch((err) => console.error('[admin/kit/shipments] email', err));
    }

    return NextResponse.json({
      ok: true,
      data: { ...updated, code: kitOrderPublicCode(updated.id) },
    });
  } catch (err) {
    console.error('[admin/kit/shipments] PATCH', err);
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}
