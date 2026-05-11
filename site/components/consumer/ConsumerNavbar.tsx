import Image from 'next/image';
import Link from 'next/link';
import { Heart, MapPin, Search, TicketPercent, User2 } from 'lucide-react';

const navLinks: Array<{
  label: string;
  href: string;
  icon: typeof Search;
  active?: boolean;
}> = [
  { label: 'Explorar', href: '#explorar', icon: Search, active: true },
  { label: 'Mapa', href: '#mapa', icon: MapPin },
  { label: 'Promociones', href: '#promociones', icon: TicketPercent },
  { label: 'Favoritos', href: '#favoritos', icon: Heart },
];

export function ConsumerNavbar() {
  return (
    <header className="sticky top-0 z-50 px-4 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px] overflow-hidden rounded-t-[1.5rem] border border-white/8 bg-[#050814]/92 shadow-[0_30px_90px_-60px_rgba(76,29,149,0.75)] backdrop-blur-xl sm:rounded-t-[1.65rem] lg:rounded-t-[1.85rem]">
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-6 sm:py-4 lg:px-10">
          <Link href="#explorar" className="flex min-w-0 items-center gap-3 sm:gap-4">
            <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-violet-400/25 bg-violet-500/10 shadow-[0_12px_28px_-18px_rgba(124,58,237,0.95)] sm:h-12 sm:w-12">
              <Image
                src="/branding/isotipo.png"
                alt="Isotipo elmenuxfa.com"
                width={48}
                height={48}
                priority
                className="h-8 w-8 scale-[1.18] object-contain sm:h-9 sm:w-9"
              />
            </span>
            <span className="truncate font-[var(--font-display)] text-[1rem] font-extrabold tracking-[-0.04em] text-white sm:text-[1.45rem] lg:text-[1.75rem]">
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
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[1.2rem] border border-violet-400/25 bg-[linear-gradient(180deg,rgba(124,58,237,0.16),rgba(124,58,237,0.06))] px-4 text-sm font-semibold text-violet-100 transition-all duration-300 hover:border-violet-300/45 hover:bg-violet-500/12 sm:h-14 sm:px-7 sm:text-[1rem]"
          >
            <Image
              src="/branding/isotipo.png"
              alt=""
              width={1}
              height={1}
              className="hidden"
            />
            <User2 className="h-5 w-5 text-violet-300" />
            <span className="hidden min-[440px]:inline">Iniciar sesión</span>
          </button>
        </div>

        <nav className="hide-scrollbar flex gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:hidden">
          {navLinks.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12px] font-medium sm:text-[13px] ${
                  item.active
                    ? 'border-violet-400/35 bg-violet-500/12 text-white'
                    : 'border-white/10 bg-white/5 text-slate-200'
                }`}
              >
                <Icon className={`h-4 w-4 ${item.active ? 'text-violet-300' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}