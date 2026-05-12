"use client";

import { useState } from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Heart, MapPin, Menu, Search, Store, TicketPercent, User2, X } from 'lucide-react';

const businessCtaHref = 'https://business.elmenuxfa.com';

const navLinks: Array<{
  label: string;
  shortLabel?: string;
  href: string;
  icon: typeof Search;
  active?: boolean;
}> = [
  { label: 'Explorar', shortLabel: 'Inicio', href: '#explorar', icon: Search, active: true },
  { label: 'Mapa', href: '#mapa', icon: MapPin },
  { label: 'Promociones', shortLabel: 'Promos', href: '#promociones', icon: TicketPercent },
  { label: 'Favoritos', href: '#favoritos', icon: Heart },
];

export function ConsumerNavbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] overflow-hidden rounded-t-[1.5rem] border border-white/8 bg-[#050814]/92 shadow-[0_30px_90px_-60px_rgba(76,29,149,0.75)] backdrop-blur-xl sm:rounded-t-[1.65rem] lg:rounded-t-[1.85rem]">
        <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2.5 sm:px-6 sm:py-4 lg:px-10">
          <Link href="#explorar" className="flex min-w-0 items-center gap-2.5 sm:gap-4">
            <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-violet-400/25 bg-violet-500/10 shadow-[0_12px_28px_-18px_rgba(124,58,237,0.95)] sm:h-12 sm:w-12">
              <Image
                src="/branding/isotipo.png"
                alt="Isotipo elmenuxfa.com"
                width={48}
                height={48}
                priority
                className="h-7 w-7 scale-[1.18] object-contain sm:h-9 sm:w-9"
              />
            </span>
            <span className="truncate font-[var(--font-display)] text-[0.88rem] font-extrabold tracking-[-0.04em] text-white min-[390px]:text-[0.94rem] min-[430px]:text-[1rem] sm:text-[1.45rem] lg:text-[1.75rem]">
              elmenuxfa.com
            </span>
          </Link>

          <nav className="hidden items-center gap-7 lg:flex xl:gap-10">
            {navLinks.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`relative inline-flex items-center gap-3 pb-1 text-[1.05rem] font-semibold transition-all duration-300 hover:text-white ${
                    item.active ? 'text-white' : 'text-slate-200'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${item.active ? 'text-violet-400' : 'text-violet-300'}`} />
                  <span>{item.label}</span>
                  {item.active ? (
                    <span className="absolute inset-x-0 -bottom-[1.35rem] h-[3px] rounded-full bg-violet-400 shadow-[0_0_18px_rgba(167,139,250,0.9)]" />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href={businessCtaHref}
              className="hidden h-11 items-center justify-center gap-2 rounded-[1rem] border border-[#FACC15]/28 bg-[#FACC15]/10 px-4 text-[13px] font-bold text-[#FACC15] transition-all duration-300 hover:border-[#FACC15]/45 hover:bg-[#FACC15]/14 lg:inline-flex"
            >
              <Store className="h-4.5 w-4.5" />
              Para negocios
            </a>

            <button
              type="button"
              aria-label="Iniciar sesión próximamente"
              title="Próximamente"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[1rem] border border-violet-400/25 bg-[linear-gradient(180deg,rgba(124,58,237,0.16),rgba(124,58,237,0.06))] px-3 text-[12px] font-semibold text-violet-100 transition-all duration-300 hover:border-violet-300/45 hover:bg-violet-500/12 min-[390px]:px-3.5 min-[430px]:px-4 sm:h-14 sm:px-7 sm:text-[1rem]"
            >
              <Image
                src="/branding/isotipo.png"
                alt=""
                width={1}
                height={1}
                className="hidden"
              />
              <User2 className="h-4.5 w-4.5 text-violet-300 sm:h-5 sm:w-5" />
              <span>Iniciar sesión</span>
            </button>

            <button
              type="button"
              aria-label={isMobileMenuOpen ? 'Cerrar menú principal' : 'Abrir menú principal'}
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[1rem] border border-white/10 bg-white/5 text-slate-100 transition-all duration-300 hover:border-violet-400/30 hover:bg-white/10 lg:hidden"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div className="border-b border-white/8 px-3 py-2 sm:px-6 lg:hidden">
          <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1">
            {navLinks.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[11px] font-semibold transition-all duration-300 ${
                    item.active
                      ? 'border-violet-400/35 bg-violet-500/12 text-white'
                      : 'border-white/10 bg-white/5 text-slate-200'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${item.active ? 'text-violet-300' : 'text-slate-400'}`} />
                  <span>{item.shortLabel ?? item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {isMobileMenuOpen ? (
          <div className="border-b border-white/8 px-3 py-3 sm:px-6 lg:hidden">
            <div className="mb-3">
              <a
                href={businessCtaHref}
                className="inline-flex w-full items-center justify-between gap-3 rounded-[1rem] border border-[#FACC15]/24 bg-[#FACC15]/10 px-4 py-3 text-left text-[13px] font-semibold text-[#FDE68A] transition-all duration-300 hover:border-[#FACC15]/40 hover:bg-[#FACC15]/14"
              >
                <span className="inline-flex min-w-0 items-center gap-3">
                  <Store className="h-4.5 w-4.5 shrink-0 text-[#FACC15]" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold text-[#FDE68A]">Lleva tu negocio a ElMenúXFA</span>
                    <span className="mt-0.5 block text-[11px] text-[#FDE68A]/75">Ir a la página para contratar el servicio</span>
                  </span>
                </span>
                <ArrowUpRight className="h-4.5 w-4.5 shrink-0 text-[#FACC15]" />
              </a>
            </div>

            <nav className="grid gap-2">
              {navLinks.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`inline-flex min-w-0 items-center justify-between gap-3 rounded-[1rem] border px-3.5 py-3 text-left text-[13px] font-semibold transition-all duration-300 ${
                      item.active
                        ? 'border-violet-400/35 bg-violet-500/12 text-white'
                        : 'border-white/10 bg-white/5 text-slate-200'
                    }`}
                  >
                    <span className="inline-flex min-w-0 items-center gap-3">
                      <Icon className={`h-4.5 w-4.5 shrink-0 ${item.active ? 'text-violet-300' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="text-[11px] text-slate-400">Ir</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  );
}