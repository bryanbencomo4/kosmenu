import { NextResponse } from 'next/server';
import { sendOrderEmail } from '../_lib/send-order-email';

type SendOrderPayload = {
  clientEmail?: string;
  comercioNombre?: string;
  orderId?: string;
  orderTrackingUrl?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendOrderPayload;
    const result = await sendOrderEmail({
      clientEmail: body.clientEmail ?? '',
      comercioNombre: body.comercioNombre ?? 'Kosmenu',
      orderId: body.orderId ?? '',
      orderTrackingUrl: body.orderTrackingUrl,
    });

    if (result.skipped) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 200 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error enviando correo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
