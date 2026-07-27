import Image from 'next/image';
import Link from 'next/link';
import { Mail, MessageCircle } from 'lucide-react';

import {
  marketingWhatsappHref,
  privacyPagePath,
  supportEmailHref,
  termsPagePath,
} from '../app/_lib/public-site-config';

function isExternalHref(href: string) {
  return href.startsWith('http') || href.startsWith('mailto:');
}

function shouldOpenInNewTab(href: string) {
  return href.startsWith('http');
}

const footerGroups = [
  {
    title: 'Producto',
    links: [
      { label: 'Inicio', href: '#inicio' },
      { label: 'Cómo funciona', href: '#como-funciona' },
      { label: 'Demo', href: '#demo' },
    ],
  },
  {
    title: 'Recursos',
    links: [
      { label: 'Beneficios', href: '#beneficios' },
      { label: 'Soporte', href: marketingWhatsappHref },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacidad', href: privacyPagePath },
      { label: 'Términos', href: termsPagePath },
      { label: 'Contacto', href: supportEmailHref },
    ],
  },
] as const;

const channelLinks = [
  { label: 'Soporte', href: marketingWhatsappHref, icon: MessageCircle },
  { label: 'Correo', href: supportEmailHref, icon: Mail },
] as const;

export function Footer() {
  const currentYear = new Date().getFullYear();

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
                <li key={link.label}>
                  {isExternalHref(link.href) ? (
                    <a
                      href={link.href}
                      target={shouldOpenInNewTab(link.href) ? '_blank' : undefined}
                      rel={shouldOpenInNewTab(link.href) ? 'noopener noreferrer' : undefined}
                      className="text-sm text-slate-400 transition-all duration-300 hover:text-white"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-slate-400 transition-all duration-300 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="text-sm font-semibold text-white">Canales</p>
          <div className="mt-5 flex items-center gap-3">
            {channelLinks.map((channel) => {
              const Icon = channel.icon;

              return (
                <a
                  key={channel.label}
                  href={channel.href}
                  aria-label={channel.label}
                  title={channel.label}
                  target={shouldOpenInNewTab(channel.href) ? '_blank' : undefined}
                  rel={shouldOpenInNewTab(channel.href) ? 'noopener noreferrer' : undefined}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-all duration-300 hover:border-violet-400/30 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                </a>
              );
            })}
          </div>
        </div>
      </div>

      <div className="border-t border-white/8">
        <div className="mx-auto max-w-7xl px-6 py-5 text-sm text-slate-500">
          © {currentYear} elmenuxfa.com Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}