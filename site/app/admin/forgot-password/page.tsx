'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { ADMIN_FORGOT_PASSWORD_PATH, ADMIN_LOGIN_PATH } from '../_lib/admin-routes';

const GENERIC_SUCCESS_MESSAGE =
  'Si el correo está habilitado, recibirás un enlace para restablecer tu contraseña.';

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedEmail = email.trim();

    startTransition(() => {
      void (async () => {
        try {
          await fetch('/admin/api/auth/recover', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: submittedEmail }),
            cache: 'no-store',
          });
        } catch {
          // Keep the same generic response to avoid leaking operational details.
        }

        setNotice(GENERIC_SUCCESS_MESSAGE);
      })();
    });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#7c3aed_0%,rgba(124,58,237,0.18)_22%,transparent_42%),radial-gradient(circle_at_bottom_right,#1d4ed8_0%,rgba(29,78,216,0.16)_16%,transparent_38%),linear-gradient(180deg,#0f1025_0%,#151337_50%,#1b1646_100%)] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,520px)]">
        <section className="space-y-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-violet-100">
            Admin Maestro
          </span>
          <div className="space-y-3">
            <h1 className="max-w-2xl font-[var(--font-display)] text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl">
              Recupera el acceso al panel admin sin depender del Site URL público.
            </h1>
            <p className="max-w-xl text-sm leading-7 text-violet-100/80 sm:text-base">
              Este flujo inicia desde admin.elmenuxfa.com y envía el enlace de recuperación con un
              <span className="font-semibold text-white"> redirectTo </span>
              explícito hacia el reset del admin.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-100/72">Recovery</p>
              <p className="mt-2 text-sm font-semibold text-white">redirectTo fijo</p>
              <p className="mt-2 text-xs leading-6 text-violet-100/72">
                El enlace se genera para el host admin aunque Supabase mantenga el Site URL público.
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-100/72">Privacidad</p>
              <p className="mt-2 text-sm font-semibold text-white">Respuesta genérica</p>
              <p className="mt-2 text-xs leading-6 text-violet-100/72">
                Nunca revelamos si el correo existe ni si tiene acceso administrativo.
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-100/72">Auditoría</p>
              <p className="mt-2 text-sm font-semibold text-white">Trazabilidad</p>
              <p className="mt-2 text-xs leading-6 text-violet-100/72">
                El request queda auditado sin exponer secretos ni tokens al navegador.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/12 bg-white/[0.08] p-6 shadow-[0_40px_100px_-50px_rgba(5,8,22,0.88)] backdrop-blur-xl sm:p-8">
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-100/72">¿Olvidaste tu contraseña?</p>
            <h2 className="font-[var(--font-display)] text-2xl font-black tracking-[-0.04em] text-white">
              Enviaremos un enlace seguro de recuperación
            </h2>
            <p className="text-sm leading-7 text-violet-100/75">
              Ingresa tu correo para iniciar el flujo definitivo del admin.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-violet-50">Correo</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                name="email"
                type="email"
                autoComplete="email"
                placeholder="operaciones@elmenuxfa.com"
                required
                className="h-12 w-full rounded-[1rem] border border-white/12 bg-[#12142c]/90 px-4 text-sm text-white outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-300/30"
                disabled={isPending}
              />
            </label>

            {notice ? (
              <div className="rounded-[1rem] border border-emerald-300/30 bg-emerald-500/12 px-4 py-3 text-sm text-emerald-100">
                {notice}
              </div>
            ) : null}

            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center rounded-[1rem] bg-[#c084fc] px-5 text-sm font-black text-[#120b28] transition hover:bg-[#d8b4fe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16183a] disabled:cursor-not-allowed disabled:bg-violet-200/40 disabled:text-[#120b28]/70"
              disabled={isPending}
            >
              {isPending ? 'Enviando enlace...' : 'Enviar enlace de recuperación'}
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-violet-100/72">
            <p>Hostname interno: {ADMIN_FORGOT_PASSWORD_PATH}</p>
            <Link
              href={ADMIN_LOGIN_PATH}
              className="font-semibold text-white underline decoration-violet-200/30 underline-offset-4"
            >
              Volver a login
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}