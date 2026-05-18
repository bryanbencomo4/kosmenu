'use client';

import Link from 'next/link';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';

import { ADMIN_FORGOT_PASSWORD_PATH } from '../_lib/admin-routes';

type AdminLoginFormProps = {
  loginAction: (formData: FormData) => void | Promise<void>;
  nextParam: string;
  errorMessage: string | null;
  successMessage: string | null;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-[1.1rem] bg-[linear-gradient(90deg,#b974ff_0%,#d59cff_100%)] px-5 text-base font-black text-[#160d2e] shadow-[0_20px_50px_-18px_rgba(185,116,255,0.58)] transition duration-200 hover:scale-[1.01] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9bbff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#120d29] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
    >
      {pending ? 'Validando acceso...' : 'Entrar al panel'}
      <ArrowRight className="size-5" strokeWidth={2.4} />
    </button>
  );
}

export function AdminLoginForm({
  loginAction,
  nextParam,
  errorMessage,
  successMessage,
}: AdminLoginFormProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <form action={loginAction} className="mt-10 space-y-5">
      <input type="hidden" name="next" value={nextParam} />

      <label className="block space-y-3">
        <span className="text-base font-semibold text-white">Correo</span>
        <div className="flex h-14 items-center gap-3 rounded-[1rem] border border-[#4d4477] bg-[rgba(20,17,42,0.76)] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition focus-within:border-[#a78bfa] focus-within:shadow-[0_0_0_4px_rgba(167,139,250,0.14)]">
          <Mail className="size-5 shrink-0 text-[#c7adff]" strokeWidth={2.1} />
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="operaciones@elmenuxfa.com"
            required
            className="h-full w-full bg-transparent text-base text-white outline-none placeholder:text-[#7a739a]"
          />
        </div>
      </label>

      <label className="block space-y-3">
        <span className="text-base font-semibold text-white">Clave</span>
        <div className="flex h-14 items-center gap-3 rounded-[1rem] border border-[#4d4477] bg-[rgba(20,17,42,0.76)] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition focus-within:border-[#a78bfa] focus-within:shadow-[0_0_0_4px_rgba(167,139,250,0.14)]">
          <LockKeyhole className="size-5 shrink-0 text-[#c7adff]" strokeWidth={2.1} />
          <input
            name="password"
            type={isPasswordVisible ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Ingresa tu clave"
            required
            className="h-full w-full bg-transparent text-base text-white outline-none placeholder:text-[#7a739a]"
          />
          <button
            type="button"
            onClick={() => setIsPasswordVisible((current) => !current)}
            className="inline-flex size-8 items-center justify-center rounded-full text-[#b89bff] transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b4ff]/70"
            aria-label={isPasswordVisible ? 'Ocultar clave' : 'Mostrar clave'}
          >
            {isPasswordVisible ? <EyeOff className="size-5" strokeWidth={2.1} /> : <Eye className="size-5" strokeWidth={2.1} />}
          </button>
        </div>
      </label>

      {errorMessage ? (
        <div className="rounded-[1rem] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-[1rem] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {successMessage}
        </div>
      ) : null}

      <div className="pt-1">
        <SubmitButton />
      </div>

      <div className="pt-1 text-center">
        <Link
          href={ADMIN_FORGOT_PASSWORD_PATH}
          className="inline-flex text-base font-semibold text-[#cbadff] underline decoration-[#cbadff]/35 underline-offset-4 transition hover:text-white"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
    </form>
  );
}