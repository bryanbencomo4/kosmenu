import Image from 'next/image';
import Link from 'next/link';
import { Heart, MapPin, Search, TicketPercent, User2 } from 'lucide-react';

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
            <span className="truncate font-[var(--font-display)] text-[0.95rem] font-extrabold tracking-[-0.04em] text-white min-[430px]:text-[1rem] sm:text-[1.45rem] lg:text-[1.75rem]">
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

          <button
            type="button"
            aria-label="Iniciar sesión próximamente"
            title="Próximamente"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-[1rem] border border-violet-400/25 bg-[linear-gradient(180deg,rgba(124,58,237,0.16),rgba(124,58,237,0.06))] px-0 text-sm font-semibold text-violet-100 transition-all duration-300 hover:border-violet-300/45 hover:bg-violet-500/12 min-[480px]:h-11 min-[480px]:w-auto min-[480px]:px-4 sm:h-14 sm:px-7 sm:text-[1rem]"
          >
            <Image
              src="/branding/isotipo.png"
              alt=""
              width={1}
              height={1}
              className="hidden"
            />
            <User2 className="h-5 w-5 text-violet-300" />
            <span className="hidden min-[480px]:inline">Iniciar sesión</span>
          </button>
        </div>

        <nav className="grid grid-cols-4 gap-1.5 px-2.5 py-2.5 sm:px-6 lg:hidden">
          {navLinks.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`inline-flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-[1rem] border px-2 py-2.5 text-center text-[11px] font-medium leading-none transition-all duration-300 sm:text-[12px] ${
                  item.active
                    ? 'border-violet-400/35 bg-violet-500/12 text-white'
                    : 'border-white/10 bg-white/5 text-slate-200'
                }`}
              >
                <Icon className={`h-4.5 w-4.5 ${item.active ? 'text-violet-300' : 'text-slate-400'}`} />
                <span className="truncate">{item.shortLabel ?? item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}