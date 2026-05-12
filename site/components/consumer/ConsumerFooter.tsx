import Image from 'next/image';
import Link from 'next/link';
import { Facebook, Instagram, MessageCircleMore } from 'lucide-react';

const footerColumns = [
  {
    title: 'Explorar',
    links: [
      { label: 'Todos los negocios', href: '#explorar' },
      { label: 'Categorías', href: '#categorias' },
      { label: 'Negocios nuevos', href: '#favoritos' },
    ],
  },
  {
    title: 'Mapa',
    links: [
      { label: 'Ver en el mapa', href: '#mapa' },
      { label: 'Buscar por zona', href: '#mapa' },
      { label: 'Cómo llegar', href: '#mapa' },
    ],
  },
  {
    title: 'Promociones',
    links: [
      { label: 'Promos del día', href: '#promociones' },
      { label: 'Cupones', href: '#promociones' },
      { label: 'Marcas exclusivas', href: '#promociones' },
    ],
  },
  {
    title: 'Ayuda',
    links: [
      { label: 'Centro de ayuda', href: '#ayuda' },
      { label: 'Contacto', href: 'mailto:hola@elmenuxfa.com' },
      { label: 'Términos y condiciones', href: '#' },
      { label: 'Política de privacidad', href: '#' },
    ],
  },
] as const;

export function ConsumerFooter() {
  return (
    <footer id="ayuda" className="border-t border-white/10 bg-[#050912] px-3 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto grid max-w-[1440px] gap-6 sm:gap-8 lg:gap-10 xl:grid-cols-[1.1fr_2.6fr_1.4fr] xl:items-start">
        <div className="order-1">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-violet-400/25 bg-violet-500/10">
              <Image
                src="/branding/isotipo.png"
                alt="Isotipo elmenuxfa.com"
                width={42}
                height={42}
                className="h-8 w-8 scale-[1.2] object-contain"
              />
            </span>
            <span className="font-[var(--font-display)] text-[1.15rem] font-extrabold tracking-[-0.04em] text-white sm:text-[1.35rem]">
              elmenuxfa.com
            </span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
            Tu guía local para encontrar los mejores negocios, menús y promociones cerca de ti.
          </p>
          <div className="mt-4 flex items-center gap-2">
            {[Instagram, Facebook, MessageCircleMore].map((Icon, index) => (
              <button key={index} type="button" aria-label="Red social" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200">
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        <div className="order-3 grid gap-x-10 gap-y-6 sm:grid-cols-2 sm:gap-y-8 lg:grid-cols-4 xl:order-2 xl:gap-x-14 xl:gap-y-8">
          {footerColumns.map((column) => (
            <div key={column.title} className="min-w-0">
              <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">{column.title}</h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-400 transition-all duration-300 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div id="newsletter" className="order-2 rounded-[1rem] border border-white/10 bg-[#07111f]/78 p-4 shadow-[0_30px_90px_-60px_rgba(124,58,237,0.85)] xl:order-3 xl:max-w-[360px] xl:justify-self-end">
          <p className="text-[13px] font-bold text-white">Recibe promociones exclusivas</p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="block flex-1">
              <span className="sr-only">Correo para recibir promociones</span>
              <input
                type="email"
                placeholder="Ingresa tu correo electrónico"
                className="h-11 w-full rounded-[0.85rem] border border-white/10 bg-[#050c18] px-4 text-sm text-white outline-none transition-all duration-300 placeholder:text-slate-500 focus:border-violet-400/45"
              />
            </label>
            <button
              type="button"
              aria-label="Suscribirme al boletín de promociones"
              className="inline-flex h-11 w-full items-center justify-center rounded-[0.85rem] bg-[#FACC15] px-5 text-sm font-black text-[#0B1120] transition-all duration-300 hover:bg-[#fde047] sm:w-auto"
            >
              Suscribirme
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">No spam. Puedes darte de baja cuando quieras.</p>
        </div>
      </div>
    </footer>
  );
}