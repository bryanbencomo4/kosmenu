import Image from 'next/image';
import Link from 'next/link';
import { MessageCircleMore } from 'lucide-react';

type NavbarProps = {
  whatsappHref: string;
};

const navLinks = [
  { label: 'Inicio', href: '#inicio' },
  { label: 'Cómo funciona', href: '#como-funciona' },
  { label: 'Beneficios', href: '#beneficios' },
  { label: 'Demo', href: '#demo' },
] as const;

export function Navbar({ whatsappHref }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-[#090D16]/88 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="#inicio"
            className="flex items-center gap-3 transition-all duration-300 hover:scale-[1.01]"
          >
            <Image
              src="/branding/isotipo.png"
              alt="elmenuxfa.com"
              width={34}
              height={34}
              className="rounded-xl border border-white/10 shadow-[0_12px_30px_-18px_rgba(124,58,237,0.85)]"
            />
            <div>
              <p className="font-[var(--font-display)] text-[1.05rem] font-extrabold tracking-tight text-white">
                elmenuxfa.com
              </p>
              <p className="text-xs text-slate-400">Menú digital para negocios de comida</p>
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

          <Link
            href={whatsappHref}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FACC15] px-6 py-3 text-sm font-bold text-[#0B0F1A] shadow-[0_20px_50px_-20px_rgba(250,204,21,0.75)] transition-all duration-300 hover:scale-105 hover:bg-[#fde047]"
          >
            Empieza gratis ahora
            <MessageCircleMore className="h-4 w-4" />
          </Link>
        </div>

        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
          {navLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-300 transition-all duration-300 hover:border-violet-400/40 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={whatsappHref}
            className="whitespace-nowrap rounded-full border border-[#FACC15]/30 bg-[#FACC15]/10 px-3 py-2 text-sm font-medium text-[#FACC15]"
          >
            WhatsApp
          </Link>
        </nav>
      </div>
    </header>
  );
}