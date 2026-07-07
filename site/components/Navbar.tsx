import Image from 'next/image';
import Link from 'next/link';
import { MessageCircleMore } from 'lucide-react';

type NavbarProps = {
  whatsappHref: string;
  appHref: string;
};

const navLinks = [
  { label: 'Inicio', href: '#inicio' },
  { label: 'Beneficios', href: '#beneficios' },
  { label: 'Cómo funciona', href: '#como-funciona' },
  { label: 'Precio', href: '#pricing' },
  { label: 'Demo', href: '#demo' },
] as const;

export function Navbar({ whatsappHref, appHref }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-[#090D16]/88 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-2.5 sm:gap-4">
          <Link
            href="#inicio"
            className="flex min-w-0 items-center gap-2 transition-all duration-300 hover:scale-[1.01] sm:gap-3"
          >
            <Image
              src="/branding/isotipo.png"
              alt="elmenuxfa.com"
              width={34}
              height={34}
              className="h-9 w-9 rounded-xl border border-white/10 shadow-[0_12px_30px_-18px_rgba(124,58,237,0.85)] sm:h-[34px] sm:w-[34px]"
            />
            <div className="min-w-0">
              <p className="truncate font-[var(--font-display)] text-[0.98rem] font-extrabold tracking-tight text-white sm:text-[1.05rem]">
                elmenuxfa.com
              </p>
              <p className="hidden text-xs text-slate-400 sm:block">Menú digital para restaurantes</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`relative text-sm font-semibold transition-all duration-300 hover:text-white ${
                  item.label === 'Inicio' ? 'text-[#FACC15]' : 'text-slate-100'
                }`}
              >
                {item.label}
                {item.label === 'Inicio' ? (
                  <span className="absolute -bottom-5 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-full bg-[linear-gradient(90deg,#f5d84b,#d946ef)] shadow-[0_0_18px_rgba(217,70,239,0.65)]" />
                ) : null}
              </Link>
            ))}
            <Link href={whatsappHref} className="text-sm font-semibold text-slate-100 transition-all duration-300 hover:text-white">
              WhatsApp
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={appHref}
              className="hidden items-center justify-center rounded-full border border-white/14 bg-white/6 px-4 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-violet-300/30 hover:bg-white/10 sm:inline-flex"
            >
              Iniciar sesion
            </Link>
            <Link
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#FACC15] px-3.5 py-2 text-[11px] font-bold text-[#0B0F1A] shadow-[0_20px_50px_-20px_rgba(250,204,21,0.75)] transition-all duration-300 hover:scale-105 hover:bg-[#fde047] sm:gap-2 sm:px-6 sm:py-3 sm:text-sm"
            >
              <span className="sm:hidden">Activar menú</span>
              <span className="hidden sm:inline">Solicitar activación</span>
              <MessageCircleMore className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Link>
          </div>
        </div>

        <nav className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1 md:hidden">
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
            href={whatsappHref}
            className="whitespace-nowrap rounded-full border border-[#FACC15]/30 bg-[#FACC15]/10 px-3 py-2 text-[13px] font-medium text-[#FACC15]"
          >
            WhatsApp
          </Link>
          <Link
            href={appHref}
            className="whitespace-nowrap rounded-full border border-violet-400/28 bg-violet-500/10 px-3 py-2 text-[13px] font-medium text-violet-200"
          >
            App web
          </Link>
        </nav>
      </div>
    </header>
  );
}