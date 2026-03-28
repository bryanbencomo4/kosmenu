import { NextResponse } from 'next/server';
import { Resend } from 'resend';

type SendOrderPayload = {
  clientEmail?: string;
  comercioNombre?: string;
  orderId?: string;
  orderTrackingUrl?: string;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendOrderPayload;
    const clientEmail = (body.clientEmail ?? '').trim().toLowerCase();
    const comercioNombre = (body.comercioNombre ?? 'Kosmenu').trim() || 'Kosmenu';
    const orderId = (body.orderId ?? '').trim();

    if (!clientEmail || !emailRegex.test(clientEmail)) {
      return NextResponse.json({ error: 'Correo invalido.' }, { status: 400 });
    }

    if (!orderId) {
      return NextResponse.json({ error: 'ORDER_ID invalido.' }, { status: 400 });
    }

    const orderUrl = `https://kosmenu.vercel.app/orders/${encodeURIComponent(orderId)}`;
    const trackingLink =
      (body.orderTrackingUrl ?? '').trim() ||
      `https://www.google.com/search?q=${encodeURIComponent(orderUrl)}`;

    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'Kosmenu <onboarding@resend.dev>';

    if (!resendApiKey) {
      return NextResponse.json(
        {
          ok: false,
          message: 'RESEND_API_KEY no configurada. El pedido continuo sin correo.',
        },
        { status: 200 },
      );
    }

    const resend = new Resend(resendApiKey);

    const subject = `Pedido recibido en ${comercioNombre}`;
    const text =
      `Tu pedido en ${comercioNombre} está en proceso. ` +
      `Síguelo aquí: ${trackingLink}`;

    await resend.emails.send({
      from: fromEmail,
      to: clientEmail,
      subject,
      text,
      html: `<p>Tu pedido en <strong>${comercioNombre}</strong> está en proceso.</p><p>Síguelo aquí: <a href="${trackingLink}">${trackingLink}</a></p>`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error enviando correo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
