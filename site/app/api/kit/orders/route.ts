import { NextResponse } from 'next/server';

import {
  computeKitProductTotalUsd,
  KIT_EXTRAS_MAX,
  KIT_EXTRAS_UNIT_USD,
  KIT_GIFT_QTY,
  KIT_RECEIPTS_BUCKET,
  kitOrderPublicCode,
  resolveKitStatus,
} from '../../../_lib/kit-shipments';
import {
  COMPROBANTE_MAX_BYTES,
  resolveComprobanteMime,
  validateComprobanteFile,
} from '../../_lib/comprobante-upload';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';
import {
  canSendKitShipmentEmail,
  notifyOpsKitShipment,
  sendKitShipmentEmail,
} from '../../_lib/send-kit-shipment-email';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function textField(form: FormData, key: string, max = 200) {
  return String(form.get(key) ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, max);
}

function parseExtrasQty(raw: string) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(KIT_EXTRAS_MAX, Math.floor(n));
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`kit:orders:${ip}`, 5, 60 * 60 * 1000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta más tarde.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const form = await request.formData();
    const extrasQty = parseExtrasQty(textField(form, 'extrasQty', 8));
    const recipientName = textField(form, 'recipientName', 120);
    const phone = textField(form, 'phone', 40);
    const email = textField(form, 'email', 160).toLowerCase();
    const ci = textField(form, 'ci', 40);
    const estado = textField(form, 'estado', 80);
    const ciudad = textField(form, 'ciudad', 80);
    const zoomOffice = textField(form, 'zoomOffice', 160);
    const businessSlug = textField(form, 'businessSlug', 80) || null;
    const paymentReference = textField(form, 'paymentReference', 80) || null;
    const declaredAmountRaw = textField(form, 'declaredAmount', 24);
    const declaredAmount = declaredAmountRaw
      ? Number.parseFloat(declaredAmountRaw.replace(',', '.'))
      : null;

    if (!recipientName || recipientName.length < 2) {
      return NextResponse.json({ error: 'Indica el nombre del destinatario.' }, { status: 400 });
    }
    if (!phone || phone.replace(/\D/g, '').length < 7) {
      return NextResponse.json({ error: 'Indica un teléfono válido.' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Indica un correo válido.' }, { status: 400 });
    }
    if (!ci || ci.length < 5) {
      return NextResponse.json({ error: 'Indica la cédula / RIF.' }, { status: 400 });
    }
    if (!estado || !ciudad || !zoomOffice) {
      return NextResponse.json(
        { error: 'Completa estado, ciudad y oficina Zoom.' },
        { status: 400 },
      );
    }

    const productTotalUsd = computeKitProductTotalUsd(extrasQty);
    const status = resolveKitStatus(extrasQty);

    if (extrasQty > 0) {
      if (!paymentReference || paymentReference.length < 4) {
        return NextResponse.json(
          { error: 'Con extras debes indicar la referencia del Pago Móvil.' },
          { status: 400 },
        );
      }
    }

    const file = form.get('receipt');
    let receiptPath: string | null = null;

    if (file instanceof File && file.size > 0) {
      if (file.size > COMPROBANTE_MAX_BYTES) {
        return NextResponse.json({ error: 'El comprobante es demasiado grande (máx. 5 MB).' }, { status: 413 });
      }
      const bytes = await file.arrayBuffer();
      const mimeType = resolveComprobanteMime({ declaredMime: file.type, bytes });
      const validated = validateComprobanteFile({
        fileName: file.name,
        mimeType: mimeType ?? file.type,
        sizeBytes: file.size,
      });
      if (validated.ok === false) {
        return NextResponse.json({ error: validated.error }, { status: 415 });
      }

      const objectPath = `${crypto.randomUUID()}/${validated.safeFileName}`;
      const supabaseUpload = getServiceSupabaseClient();
      const { error: uploadError } = await supabaseUpload.storage
        .from(KIT_RECEIPTS_BUCKET)
        .upload(objectPath, bytes, {
          contentType:
            mimeType ??
            (validated.safeFileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
          upsert: false,
        });
      if (uploadError) {
        console.error('[kit/orders] receipt upload', uploadError.message);
        return NextResponse.json({ error: 'No se pudo subir el comprobante.' }, { status: 500 });
      }
      receiptPath = objectPath;
    } else if (extrasQty > 0) {
      return NextResponse.json(
        { error: 'Adjunta el comprobante del Pago Móvil para los extras.' },
        { status: 400 },
      );
    }

    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
      .from('kit_shipments')
      .insert({
        gift_qty: KIT_GIFT_QTY,
        extras_qty: extrasQty,
        extras_unit_price_usd: KIT_EXTRAS_UNIT_USD,
        product_total_usd: productTotalUsd,
        recipient_name: recipientName,
        phone,
        email,
        ci,
        estado,
        ciudad,
        zoom_office: zoomOffice,
        business_slug: businessSlug,
        payment_reference: paymentReference,
        receipt_path: receiptPath,
        declared_amount:
          declaredAmount != null && Number.isFinite(declaredAmount) ? declaredAmount : null,
        declared_currency: extrasQty > 0 ? 'VES' : null,
        status,
      })
      .select('id, status, gift_qty, extras_qty, product_total_usd')
      .single();

    if (error || !data) {
      console.error('[kit/orders] insert', error?.message);
      return NextResponse.json({ error: 'No se pudo guardar el pedido.' }, { status: 500 });
    }

    const emailPayload = {
      kind: 'received' as const,
      toEmail: email,
      recipientName,
      shipmentId: data.id as string,
      giftQty: KIT_GIFT_QTY,
      extrasQty,
      productTotalUsd,
      status: data.status as 'pending_payment' | 'pending_ship' | 'shipped' | 'cancelled',
      estado,
      ciudad,
      zoomOffice,
      paymentReference,
    };

    if (canSendKitShipmentEmail()) {
      await Promise.allSettled([
        sendKitShipmentEmail(emailPayload),
        notifyOpsKitShipment(emailPayload),
      ]);
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          id: data.id,
          code: kitOrderPublicCode(data.id as string),
          status: data.status,
          giftQty: data.gift_qty,
          extrasQty: data.extras_qty,
          productTotalUsd: Number(data.product_total_usd),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Missing environment variable')) {
      return NextResponse.json({ error: 'Servicio no disponible.' }, { status: 503 });
    }
    console.error('[kit/orders]', err);
    return NextResponse.json({ error: 'Error al procesar el pedido.' }, { status: 500 });
  }
}
