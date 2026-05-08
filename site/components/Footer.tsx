import Image from 'next/image';
import Link from 'next/link';
import { Facebook, Instagram, MessageCircle } from 'lucide-react';

const footerGroups = [
  {
    title: 'Producto',
    links: ['Inicio', 'Cómo funciona', 'Demo'],
  },
  {
    title: 'Recursos',
    links: ['Beneficios', 'WhatsApp', 'Soporte'],
  },
  {
    title: 'Legal',
    links: ['Privacidad', 'Términos', 'Contacto'],
  },
] as const;

export function Footer() {
  return (
    <footer className="perf-section border-t border-white/10 bg-[#090d16]">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[1.25fr_0.8fr_0.8fr_0.8fr_0.8fr]">
        <div>
          <div className="flex items-center gap-3">
            <Image
              src="/branding/isotipo.png"
              alt="elmenuxfa.com"
              width={34}
              height={34}
              className="rounded-xl border border-white/10"
            />
            <div>
              <p className="font-[var(--font-display)] text-lg font-extrabold text-white">elmenuxfa.com</p>
              <p className="text-sm text-slate-400">Menú digital para negocios de comida</p>
            </div>
          </div>
        </div>

        {footerGroups.map((group) => (
          <div key={group.title}>
            <p className="text-sm font-semibold text-white">{group.title}</p>
            <ul className="mt-5 space-y-3">
              {group.links.map((link) => (
                <li key={link}>
                  <Link
                    href="#"
                    className="text-sm text-slate-400 transition-all duration-300 hover:text-white"
                  >
                    {link}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="text-sm font-semibold text-white">Síguenos</p>
          <div className="mt-5 flex items-center gap-3">
            {[Instagram, Facebook, MessageCircle].map((Icon, index) => (
              <Link
                key={index}
                href="#"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-all duration-300 hover:border-violet-400/30 hover:text-white"
              >
                <Icon className="h-4 w-4" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-white/8">
        <div className="mx-auto max-w-7xl px-6 py-5 text-sm text-slate-500">
          © 2025 elmenuxfa.com Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}