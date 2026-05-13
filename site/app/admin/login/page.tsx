import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentAdmin, loginAdminAction } from '../_lib/admin-auth';
import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH, sanitizeAdminNextPath } from '../_lib/admin-routes';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const errorMessages: Record<string, string> = {
  missing_credentials: 'Ingresa correo y clave para continuar.',
  invalid_credentials: 'Credenciales invalidas o usuario sin acceso habilitado.',
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export const metadata: Metadata = {
  title: 'Login',
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const currentAdmin = await getCurrentAdmin();

  if (currentAdmin) {
    redirect(ADMIN_HOME_PATH);
  }

  const params = await searchParams;
  const errorCode = firstValue(params.error) ?? '';
  const nextParam = sanitizeAdminNextPath(firstValue(params.next) ?? ADMIN_HOME_PATH);
  const errorMessage = errorMessages[errorCode] ?? null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#7c3aed_0%,rgba(124,58,237,0.18)_22%,transparent_42%),radial-gradient(circle_at_bottom_right,#1d4ed8_0%,rgba(29,78,216,0.16)_16%,transparent_38%),linear-gradient(180deg,#0f1025_0%,#151337_50%,#1b1646_100%)] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,520px)]">
        <section className="space-y-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-violet-100">
            Admin Maestro
          </span>
          <div className="space-y-3">
            <h1 className="max-w-2xl font-[var(--font-display)] text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl">
              Acceso seguro para operaciones, soporte y growth.
            </h1>
            <p className="max-w-xl text-sm leading-7 text-violet-100/80 sm:text-base">
              Esta fase habilita el panel base de admin.elmenuxfa.com con corte por hostname, RBAC minimo,
              auditoria y permisos validados solo en servidor.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-100/72">Seguridad</p>
              <p className="mt-2 text-sm font-semibold text-white">Cookie httpOnly</p>
              <p className="mt-2 text-xs leading-6 text-violet-100/72">Sin exponer service role al navegador.</p>
            </div>
            <div className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-100/72">RBAC</p>
              <p className="mt-2 text-sm font-semibold text-white">Permisos server-side</p>
              <p className="mt-2 text-xs leading-6 text-violet-100/72">Validacion por rol antes de cada lectura critica.</p>
            </div>
            <div className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-100/72">Auditoria</p>
              <p className="mt-2 text-sm font-semibold text-white">Trazabilidad inicial</p>
              <p className="mt-2 text-xs leading-6 text-violet-100/72">Eventos de login, denegacion y lectura de perfil.</p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/12 bg-white/[0.08] p-6 shadow-[0_40px_100px_-50px_rgba(5,8,22,0.88)] backdrop-blur-xl sm:p-8">
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-100/72">Ingreso restringido</p>
            <h2 className="font-[var(--font-display)] text-2xl font-black tracking-[-0.04em] text-white">
              Inicia sesion con tu cuenta habilitada
            </h2>
            <p className="text-sm leading-7 text-violet-100/75">
              Solo usuarios existentes y activos en <span className="font-semibold text-white">admin_users</span> pueden acceder.
            </p>
          </div>

          <form action={loginAdminAction} className="mt-6 space-y-4">
            <input type="hidden" name="next" value={nextParam} />

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-violet-50">Correo</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="operaciones@elmenuxfa.com"
                className="h-12 w-full rounded-[1rem] border border-white/12 bg-[#12142c]/90 px-4 text-sm text-white outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-300/30"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-violet-50">Clave</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Ingresa tu clave"
                className="h-12 w-full rounded-[1rem] border border-white/12 bg-[#12142c]/90 px-4 text-sm text-white outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-300/30"
              />
            </label>

            {errorMessage ? (
              <div className="rounded-[1rem] border border-rose-300/30 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center rounded-[1rem] bg-[#c084fc] px-5 text-sm font-black text-[#120b28] transition hover:bg-[#d8b4fe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16183a]"
            >
              Entrar al panel
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-violet-100/72">
            <p>Hostname interno: {ADMIN_LOGIN_PATH}</p>
            <Link href="/" className="font-semibold text-white underline decoration-violet-200/30 underline-offset-4">
              Volver al dashboard raiz
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}