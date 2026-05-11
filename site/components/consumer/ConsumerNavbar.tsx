import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, Heart, User2 } from 'lucide-react';

const navLinks: Array<{
  label: string;
  href: string;
  badge?: string;
}> = [
  { label: 'Explorar', href: '#explorar' },
  { label: 'Mapa', href: '#mapa' },
  { label: 'Promociones', href: '#promociones', badge: 'NUEVO' },
  { label: 'Favoritos', href: '#favoritos' },
];

export function ConsumerNavbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/6 bg-[#050914]/92 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="#explorar" className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-violet-400/25 bg-violet-500/10 shadow-[0_12px_28px_-18px_rgba(124,58,237,0.95)]">
            <Image
              src="/branding/isotipo.png"
              alt="Isotipo elmenuxfa.com"
              width={42}
              height={42}
              priority
              className="h-8 w-8 scale-[1.2] object-contain"
            />
          </span>
          <span className="truncate font-[var(--font-display)] text-[1.15rem] font-extrabold tracking-[-0.04em] text-white sm:text-[1.35rem]">
            elmenuxfa.com
          </span>
        </Link>

        <nav className="hidden items-center gap-10 lg:flex">
          {navLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100 transition-all duration-300 hover:text-white"
            >
              <span>{item.label}</span>
              {item.label === 'Explorar' ? <ChevronDown className="h-4 w-4 text-slate-400" /> : null}
              {item.badge ? (
                <span className="rounded-full border border-[#FACC15]/35 bg-[#FACC15]/12 px-2 py-0.5 text-[10px] font-black tracking-[0.16em] text-[#FACC15]">
                  {item.badge}
                </span>
              ) : null}
              {item.label === 'Favoritos' ? <Heart className="h-4 w-4 text-slate-400" /> : null}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          aria-label="Iniciar sesión próximamente"
          title="Próximamente"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-400/35 bg-transparent px-4 py-2.5 text-sm font-semibold text-violet-100 transition-all duration-300 hover:bg-violet-500/12 sm:px-5"
        >
          <User2 className="h-4 w-4" />
          Iniciar sesión
        </button>
      </div>

      <nav className="hide-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6 lg:hidden">
        {navLinks.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[13px] font-medium text-slate-200"
          >
            <span>{item.label}</span>
            {item.badge ? (
              <span className="rounded-full bg-[#FACC15] px-1.5 py-0.5 text-[9px] font-black tracking-[0.15em] text-[#111827]">
                {item.badge}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
    </header>
  );
}