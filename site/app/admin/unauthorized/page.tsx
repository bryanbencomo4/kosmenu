import type { Metadata } from 'next';
import Link from 'next/link';

import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH } from '../_lib/admin-routes';

export const metadata: Metadata = {
  title: 'Unauthorized',
};

export default function AdminUnauthorizedPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6f3ff_0%,#f2f4ff_48%,#eef2ff_100%)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-3xl items-center justify-center">
        <div className="w-full rounded-[2rem] border border-violet-200/80 bg-white p-8 text-center shadow-[0_40px_100px_-60px_rgba(15,23,42,0.45)] sm:p-10">
          <span className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-violet-700">
            Acceso denegado
          </span>
          <h1 className="mt-5 font-[var(--font-display)] text-3xl font-black tracking-[-0.05em] text-slate-950 sm:text-4xl">
            Tu cuenta no tiene permisos para entrar aqui.
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
            Si ya tienes credenciales validas, verifica que tu usuario este activo en admin_users y que el rol
            asignado cubra el modulo que intentabas abrir.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href={ADMIN_HOME_PATH}
              className="inline-flex h-11 items-center justify-center rounded-[1rem] bg-violet-600 px-5 text-sm font-black text-white transition hover:bg-violet-700"
            >
              Volver al dashboard
            </Link>
            <Link
              href={ADMIN_LOGIN_PATH}
              className="inline-flex h-11 items-center justify-center rounded-[1rem] border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
            >
              Ir al login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}