'use client';

import { merchantAppAuthHref } from '../_lib/public-site-config';

type BusinessAuthCardProps = {
  /** Kept for call-site compatibility; auth completes on app.elmenuxfa.com. */
  onAuthed?: (accessToken: string) => void;
};

/**
 * Business bot auth → same Flutter AuthScreen on app.elmenuxfa.com.
 * No second email/password form in Next.
 */
export function BusinessAuthCard(_props: BusinessAuthCardProps) {
  const href = merchantAppAuthHref('/asistente');

  return (
    <div
      className="mt-1.5 w-[min(92%,20.5rem)] shrink-0 overflow-hidden rounded-2xl rounded-tl-md border border-black/[0.08] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
      data-business-auth-card="1"
    >
      <p className="text-[13px] font-semibold text-[#111B21]">🔐 Entrar al panel</p>
      <p className="mt-0.5 text-[12px] text-[#667781]">
        Usa el mismo inicio de sesión de tu negocio en app.elmenuxfa.com
      </p>
      <a
        href={href}
        className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-[#5B21B6] px-3 py-2.5 text-[13px] font-semibold text-white"
        data-testid="business-auth-app-login"
      >
        Ir a iniciar sesión
      </a>
    </div>
  );
}
