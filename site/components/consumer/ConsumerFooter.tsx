import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, Mail, MessageCircleMore, Store } from 'lucide-react';

import {
  businessSiteUrl,
  marketingWhatsappHref,
  privacyPagePath,
  supportEmailHref,
  termsPagePath,
} from '../../app/_lib/public-site-config';
import { ConsumerNewsletterForm } from './ConsumerNewsletterForm';

const channelLinks = [
  { label: 'WhatsApp', href: marketingWhatsappHref, icon: MessageCircleMore },
  { label: 'Correo', href: supportEmailHref, icon: Mail },
  { label: 'Para negocios', href: businessSiteUrl, icon: Store },
] as const;

function isExternalHref(href: string) {
  return href.startsWith('http') || href.startsWith('mailto:');
}

function shouldOpenInNewTab(href: string) {
  return href.startsWith('http');
}

const footerColumns = [
  {
    title: 'Explorar',
    links: [
      { label: 'Todos los negocios', href: '#explorar' },
      { label: 'Categorías', href: '#categorias' },
      { label: 'Negocios nuevos', href: '#favoritos' },
      { label: 'Abiertos ahora', href: '#explorar' },
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
      { label: 'Centro de ayuda', href: marketingWhatsappHref },
      { label: 'Contacto', href: supportEmailHref },
      { label: 'Términos y condiciones', href: termsPagePath },
      { label: 'Política de privacidad', href: privacyPagePath },
    ],
  },
] as const;

export function ConsumerFooter() {
  return (
    <footer id="ayuda" className="border-t border-white/10 bg-[#050912] px-3 py-5 sm:px-6 lg:px-8 lg:py-8">
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
          <p className="mt-3 max-w-sm text-[13px] leading-6 text-slate-300 sm:mt-4 sm:text-sm">
            Tu guía local para encontrar menús, negocios y promociones cerca de ti.
          </p>
          <div className="mt-3 flex items-center gap-2 sm:mt-4">
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
                  className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200 transition-all duration-300 hover:border-violet-400/30 hover:text-white sm:h-9 sm:w-9"
                >
                  <Icon className="h-4 w-4" />
                </a>
              );
            })}
          </div>
        </div>

        <div className="order-3 space-y-2 lg:hidden">
          {footerColumns.map((column) => (
            <details key={column.title} className="group rounded-[0.95rem] border border-white/10 bg-[#07111f]/58 px-3.5 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black uppercase tracking-[0.16em] text-white">
                <span>{column.title}</span>
                <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-300 group-open:rotate-180" />
              </summary>
              <ul className="mt-3 space-y-2 border-t border-white/8 pt-3">
                {column.links.map((link) => (
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
            </details>
          ))}
        </div>

        <div className="order-3 hidden gap-x-10 gap-y-6 sm:grid-cols-2 sm:gap-y-8 lg:grid lg:grid-cols-4 xl:order-2 xl:gap-x-14 xl:gap-y-8">
          {footerColumns.map((column) => (
            <div key={column.title} className="min-w-0">
              <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">{column.title}</h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
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
        </div>

        <div id="newsletter" className="order-2 rounded-[1rem] border border-white/10 bg-[#07111f]/78 p-4 shadow-[0_30px_90px_-60px_rgba(124,58,237,0.85)] xl:order-3 xl:max-w-[360px] xl:justify-self-end">
          <p className="text-[13px] font-bold text-white">Recibe promociones exclusivas</p>
          <ConsumerNewsletterForm />
        </div>
      </div>
    </footer>
  );
}