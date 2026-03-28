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

    const trackingLink =
      `https://kosmenu.vercel.app/orders/${encodeURIComponent(orderId)}`;

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
    const html = `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#121212;font-family:Arial,Helvetica,sans-serif;color:#F4F4F4;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#121212;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background-color:#181818;border:1px solid #2D2D2D;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="background-color:#10261A;padding:28px 24px;text-align:center;border-bottom:1px solid #1E3A2B;">
                <p style="margin:0;color:#4ADE80;font-size:12px;letter-spacing:2px;font-weight:700;text-transform:uppercase;">Kosmenu</p>
                <h1 style="margin:10px 0 0 0;color:#EBD38A;font-size:34px;line-height:1.2;font-weight:800;">¡Pedido Confirmado!</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 12px 24px;">
                <p style="margin:0;color:#F4F4F4;font-size:17px;line-height:1.6;">
                  Hola, hemos recibido tu pedido en <strong>${comercioNombre}</strong>. Estamos preparando todo con mucho cariño.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 8px 24px;text-align:center;">
                <a href="${trackingLink}" style="display:inline-block;background-color:#1FA86A;border-radius:999px;padding:16px 34px;color:#FFFFFF;text-decoration:none;font-size:17px;font-weight:700;line-height:1;">Ver Seguimiento</a>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px 20px 24px;text-align:center;">
                <p style="margin:0;color:#B7B7B7;font-size:13px;line-height:1.5;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
                <p style="margin:8px 0 0 0;color:#EBD38A;font-size:13px;line-height:1.5;word-break:break-all;">${trackingLink}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 24px 24px;text-align:center;border-top:1px solid #2D2D2D;">
                <p style="margin:0;color:#9AA0A6;font-size:13px;">Gracias por confiar en Kosmenú</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    await resend.emails.send({
      from: fromEmail,
      to: clientEmail,
      subject,
      text,
      html,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error enviando correo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
