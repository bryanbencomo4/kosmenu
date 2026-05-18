import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';

import { AdminLoginForm } from './AdminLoginForm';
import { getCurrentAdmin, loginAdminAction } from '../_lib/admin-auth';
import {
  ADMIN_HOME_PATH,
  sanitizeAdminNextPath,
} from '../_lib/admin-routes';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const errorMessages: Record<string, string> = {
  missing_credentials: 'Ingresa correo y clave para continuar.',
  invalid_credentials: 'Credenciales invalidas o usuario sin acceso habilitado.',
};

const successMessages: Record<string, string> = {
  password_reset_success: 'Clave actualizada. Ya puedes iniciar sesion con tu nueva contraseña.',
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
  const messageCode = firstValue(params.message) ?? '';
  const nextParam = sanitizeAdminNextPath(firstValue(params.next) ?? ADMIN_HOME_PATH);
  const errorMessage = errorMessages[errorCode] ?? null;
  const successMessage = successMessages[messageCode] ?? null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#090612] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10rem] top-[-9rem] h-[28rem] w-[28rem] rounded-full bg-[#7c3aed]/45 blur-[130px]" />
        <div className="absolute bottom-[-12rem] right-[-8rem] h-[30rem] w-[30rem] rounded-full bg-[#3949ff]/42 blur-[140px]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(189,172,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(189,172,255,0.16)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(circle_at_center,black,transparent_85%)]" />
        <div className="absolute left-[-6rem] top-[10rem] h-[18rem] w-[18rem] rounded-full border border-[#6b4fd0]/20" />
        <div className="absolute bottom-[-7rem] right-[-3rem] h-[20rem] w-[20rem] rounded-full border border-[#6b4fd0]/20" />
        <div className="absolute left-[9%] top-[72%] h-2.5 w-2.5 rounded-full bg-[#c4a1ff] shadow-[0_0_18px_6px_rgba(196,161,255,0.4)]" />
        <div className="absolute right-[15%] top-[18%] h-2.5 w-2.5 rounded-full bg-[#c4a1ff] shadow-[0_0_18px_6px_rgba(196,161,255,0.4)]" />
      </div>

      <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <section className="relative w-full max-w-[31rem] overflow-hidden rounded-[2rem] border border-[#8661f3]/55 bg-[linear-gradient(180deg,rgba(25,20,52,0.92)_0%,rgba(15,12,35,0.96)_100%)] shadow-[0_0_0_1px_rgba(212,190,255,0.05),0_40px_120px_-46px_rgba(2,3,15,0.95),0_0_80px_rgba(124,58,237,0.2)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(173,120,255,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(87,98,255,0.1),transparent_32%)]" />

          <div className="relative px-7 py-9 sm:px-12 sm:py-11">
            <div className="flex justify-center">
              <div className="flex items-center gap-4 rounded-[1.5rem] px-2 py-1">
                <div className="flex h-14 w-14 items-center justify-center rounded-[1.1rem] border border-[#9f7dff]/65 bg-[linear-gradient(180deg,rgba(180,116,255,0.22)_0%,rgba(180,116,255,0.08)_100%)] shadow-[0_0_30px_rgba(163,118,255,0.2)]">
                  <Image
                    src="/branding/isotipo.png"
                    alt="elmenuxfa.com"
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded-lg object-contain"
                    priority
                  />
                </div>
                <p className="font-[var(--font-display)] text-[1.9rem] font-black tracking-[-0.04em] text-white sm:text-[2.1rem]">
                  elmenuxfa.com
                </p>
              </div>
            </div>

            <div className="mt-10 text-center">
              <h1 className="font-[var(--font-display)] text-4xl font-black tracking-[-0.05em] text-white sm:text-[2.85rem]">
                Iniciar sesión
              </h1>
              <p className="mt-3 text-lg text-[#b6afd2]">Accede al panel administrativo</p>
            </div>

            <AdminLoginForm
              loginAction={loginAdminAction}
              nextParam={nextParam}
              errorMessage={errorMessage}
              successMessage={successMessage}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
