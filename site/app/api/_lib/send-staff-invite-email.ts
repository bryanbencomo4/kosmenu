import 'server-only';

import { Resend } from 'resend';

import { appSiteUrl, supportEmail } from '../../_lib/public-site-config';
import { escapeHtml } from './send-order-validation';

export type SendStaffInviteEmailInput = {
  toEmail: string;
  comercioNombre: string;
  roleLabel: string;
  actionUrl: string;
  /** When true, invitee already has an account — magic/sign-in link. */
  existingUser: boolean;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canSendStaffInviteEmail() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendStaffInviteEmail(input: SendStaffInviteEmailInput) {
  const toEmail = (input.toEmail ?? '').trim().toLowerCase();
  const comercioNombre = (input.comercioNombre ?? 'el negocio').trim() || 'el negocio';
  const roleLabel = (input.roleLabel ?? 'Usuario').trim() || 'Usuario';
  const actionUrl = (input.actionUrl ?? '').trim() || appSiteUrl;
  const existingUser = Boolean(input.existingUser);

  if (!toEmail || !emailRegex.test(toEmail)) {
    return { ok: false as const, skipped: true as const, reason: 'invalid-email' };
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    return { ok: false as const, skipped: true as const, reason: 'resend-not-configured' };
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || `elmenuxfa.com <${supportEmail}>`;
  const resend = new Resend(resendApiKey);

  const safeComercio = escapeHtml(comercioNombre);
  const safeRole = escapeHtml(roleLabel);
  const safeHref = actionUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const safeLinkText = escapeHtml(actionUrl);
  const headline = existingUser ? 'Te agregaron a un negocio' : 'Invitación a unirte';
  const bodyCopy = existingUser
    ? `Te asignaron el rol <strong>${safeRole}</strong> en <strong>${safeComercio}</strong>. Inicia sesión con este correo para entrar al panel.`
    : `Te invitaron como <strong>${safeRole}</strong> en <strong>${safeComercio}</strong>. Abre el enlace para crear tu contraseña y aceptar la invitación.`;
  const cta = existingUser ? 'Abrir panel e iniciar sesión' : 'Crear contraseña y unirme';
  const subject = existingUser
    ? `Acceso a ${comercioNombre} en elmenuxfa.com`.slice(0, 180)
    : `Invitación a ${comercioNombre} — crea tu contraseña`.slice(0, 180);

  const html = `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#F6F2FF;font-family:Arial,Helvetica,sans-serif;color:#1F1147;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F6F2FF;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background-color:#FFFFFF;border:1px solid #E3D8F8;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="background-color:#5B21B6;padding:28px 24px;text-align:center;">
                <p style="margin:0;color:#EDE9FE;font-size:12px;letter-spacing:2px;font-weight:700;text-transform:uppercase;">elmenuxfa.com</p>
                <h1 style="margin:10px 0 0 0;color:#FFFFFF;font-size:28px;line-height:1.2;font-weight:800;">${escapeHtml(headline)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 12px 24px;">
                <p style="margin:0;color:#1F1147;font-size:16px;line-height:1.6;">
                  ${bodyCopy}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px 28px 24px;text-align:center;">
                <a href="${safeHref}" style="display:inline-block;background-color:#6D28D9;border-radius:999px;padding:16px 34px;color:#FFFFFF;text-decoration:none;font-size:17px;font-weight:700;line-height:1;" rel="noreferrer">${escapeHtml(cta)}</a>
                <p style="margin:14px 0 0 0;color:#6B5A92;font-size:13px;line-height:1.5;word-break:break-all;">${safeLinkText}</p>
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
    to: [toEmail],
    subject,
    html,
  });

  return { ok: true as const };
}
