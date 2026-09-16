import Image from 'next/image';
import Link from 'next/link';

import { MerchantAuthControls, MerchantMobileSignupLink } from './merchant/MerchantAuthControls';

type NavbarProps = {
  supportHref: string;
  loginHref: string;
  signupHref: string;
};

const navLinks = [
  { label: 'Inicio', href: '#inicio' },
  { label: 'Kit', href: '#kit' },
  { label: 'Cómo funciona', href: '#como-funciona' },
  { label: 'Precio', href: '#pricing' },
  { label: 'Demo', href: '#demo' },
  { label: 'Buscar menú', href: '#buscar' },
] as const;

export function Navbar({ supportHref, loginHref, signupHref }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-[#090D16]/88 backdrop-blur-xl">
      <div className="mx-auto max-w-[1240px] px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-2.5 sm:gap-4">
          <Link
            href="#inicio"
            className="flex min-w-0 items-center gap-2 transition-all duration-300 hover:scale-[1.01] sm:gap-3"
          >
            <Image
              src="/branding/isotipo.png"
              alt="elmenuxfa"
              width={34}
              height={34}
              className="h-9 w-9 rounded-xl border border-white/10 shadow-[0_12px_30px_-18px_rgba(124,58,237,0.85)] sm:h-[34px] sm:w-[34px]"
            />
            <div className="min-w-0">
              <p className="truncate font-[var(--font-display)] text-[0.98rem] font-extrabold tracking-tight text-white sm:text-[1.05rem]">
                elmenuxfa
              </p>
              <p className="hidden text-xs text-slate-400 sm:block">Menú inteligente para restaurantes</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-5 lg:flex xl:gap-8">
            {navLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="relative text-sm font-semibold text-slate-100 transition-all duration-300 hover:text-white"
              >
                {item.label}
                {item.label === 'Inicio' ? (
                  <span className="absolute -bottom-5 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-full bg-[#FACC15] shadow-[0_0_16px_rgba(250,204,21,0.55)]" />
                ) : null}
              </Link>
            ))}
            <Link href={supportHref} className="text-sm font-semibold text-slate-100 transition-all duration-300 hover:text-white">
              Soporte
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <MerchantAuthControls loginHref={loginHref} signupHref={signupHref} />
          </div>
        </div>

        <nav className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {navLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[13px] font-medium text-slate-300 transition-all duration-300 hover:border-violet-400/40 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={supportHref}
            className="whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[13px] font-medium text-slate-300"
          >
            Soporte
          </Link>
          <MerchantMobileSignupLink signupHref={signupHref} />
        </nav>
      </div>
    </header>
  );
}
