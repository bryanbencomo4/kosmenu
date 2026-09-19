'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

import { adminSiteHost, chatWhatsappHref } from '../app/_lib/public-site-config';

const AUTO_OPEN_STORAGE_KEY = 'elmenuxfa-wa-autochat';

const CHAT_MESSAGES = [
  '¿Listo para transformar tu restaurante?\u00A0🚀',
  '¿Quieres adquirir el Kit Menú Inteligente\u00A0📦 o tienes alguna duda sobre la plataforma?\u00A0📲',
  '¡Escríbenos y te ayudamos de inmediato!\u00A0✨',
] as const;

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.02 3.2c-7.05 0-12.8 5.7-12.8 12.73 0 2.24.59 4.42 1.7 6.35L3.2 28.8l6.72-1.76a12.86 12.86 0 0 0 6.1 1.56h.01c7.05 0 12.8-5.7 12.8-12.73S23.07 3.2 16.02 3.2Zm7.45 18.05c-.31.86-1.8 1.64-2.5 1.74-.64.1-1.45.14-2.34-.14-.54-.18-1.23-.4-2.12-.79-3.73-1.61-6.16-5.36-6.35-5.61-.18-.25-1.51-2-1.51-3.82s.93-2.68 1.29-3.06c.31-.33.82-.48 1.31-.48.16 0 .3 0 .43.01.38.02.57.04.82.63.31.74 1.06 2.58 1.15 2.77.10.18.16.4.03.64-.12.25-.19.4-.37.62-.18.21-.35.38-.53.58-.19.21-.4.43-.17.82.22.4 1 1.64 2.14 2.66 1.48 1.31 2.68 1.72 3.1 1.9.31.14.64.12.86-.1.27-.27.93-1.08 1.18-1.45.25-.37.5-.3.82-.18.33.12 2.08.98 2.43 1.16.36.18.59.27.68.42.08.15.08.86-.23 1.72Z" />
    </svg>
  );
}

function TypingDots() {
  return (
    <div className="whatsapp-chat-message inline-flex items-center gap-1 rounded-[1.1rem] rounded-tl-md bg-white px-3.5 py-3 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.55)]">
      <span className="whatsapp-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
      <span className="whatsapp-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
      <span className="whatsapp-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
    </div>
  );
}

function shouldHideWidget(pathname: string, hostname: string) {
  if (hostname.toLowerCase() === adminSiteHost) return true;
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/v/') ||
    pathname.startsWith('/preview') ||
    pathname.startsWith('/orders') ||
    pathname.startsWith('/delivery') ||
    pathname.startsWith('/api')
  );
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function WhatsAppChatWidget() {
  const pathname = usePathname();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const allowOutsideCloseRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [hostname, setHostname] = useState('');
  const [typing, setTyping] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);

  const hidden = shouldHideWidget(pathname, hostname);

  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  useEffect(() => {
    if (hidden) return;

    let alreadyClosed = false;
    try {
      alreadyClosed = window.sessionStorage.getItem(AUTO_OPEN_STORAGE_KEY) === 'closed';
    } catch {
      alreadyClosed = false;
    }
    if (alreadyClosed) return;

    const openTimer = window.setTimeout(() => {
      setOpen(true);
    }, 900);

    return () => window.clearTimeout(openTimer);
  }, [hidden]);

  useEffect(() => {
    if (!open) {
      setTyping(false);
      setVisibleCount(0);
      allowOutsideCloseRef.current = false;
      return;
    }

    if (prefersReducedMotion()) {
      setTyping(false);
      setVisibleCount(CHAT_MESSAGES.length);
      allowOutsideCloseRef.current = true;
      return;
    }

    setTyping(true);
    setVisibleCount(0);
    allowOutsideCloseRef.current = false;

    const timers = [
      window.setTimeout(() => {
        setTyping(false);
        setVisibleCount(1);
      }, 1200),
      window.setTimeout(() => setTyping(true), 1900),
      window.setTimeout(() => {
        setTyping(false);
        setVisibleCount(2);
      }, 3100),
      window.setTimeout(() => setTyping(true), 3800),
      window.setTimeout(() => {
        setTyping(false);
        setVisibleCount(3);
        allowOutsideCloseRef.current = true;
      }, 5000),
      window.setTimeout(() => {
        allowOutsideCloseRef.current = true;
      }, 2600),
    ];

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const closeChat = () => {
      setOpen(false);
      try {
        window.sessionStorage.setItem(AUTO_OPEN_STORAGE_KEY, 'closed');
      } catch {
        // Ignore storage errors; auto-open may repeat this session.
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeChat();
    };
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!allowOutsideCloseRef.current) return;
      const target = event.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        closeChat();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('touchstart', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  if (hidden) {
    return null;
  }

  const statusLabel = typing || visibleCount < CHAT_MESSAGES.length ? 'escribiendo…' : 'en línea';

  const closeChat = () => {
    setOpen(false);
    try {
      window.sessionStorage.setItem(AUTO_OPEN_STORAGE_KEY, 'closed');
    } catch {
      // Ignore storage errors.
    }
  };

  return (
    <div ref={rootRef} className="whatsapp-chat-widget pointer-events-none fixed bottom-4 right-4 z-[60] sm:bottom-6 sm:right-6">
      <div className="flex flex-col items-end gap-3">
        {open ? (
          <section
            id={panelId}
            role="dialog"
            aria-label="Chat de elmenuxfa"
            aria-modal="false"
            aria-live="polite"
            className="whatsapp-chat-panel pointer-events-auto w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[1.45rem] border border-white/10 bg-[#f4f1ea] shadow-[0_28px_80px_-28px_rgba(0,0,0,0.72)]"
          >
            <header className="relative flex items-center gap-3 bg-[linear-gradient(135deg,#120b24_0%,#1a1038_52%,#0b0f1a_100%)] px-4 py-3.5">
              <div className="relative">
                <Image
                  src="/branding/isotipo.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full border border-white/15 object-cover"
                />
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#1a1038] bg-[#25D366]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-[var(--font-display)] text-[0.98rem] font-extrabold leading-none text-white">
                  elmenuxfa
                </p>
                <p className="mt-1 text-[11px] font-medium text-violet-100/80">{statusLabel}</p>
              </div>
              <button
                type="button"
                onClick={closeChat}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Cerrar chat"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="relative min-h-[11.5rem] px-3.5 py-4">
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-[0.18]"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 12% 18%, rgba(124,58,237,0.22), transparent 28%), radial-gradient(circle at 88% 82%, rgba(250,204,21,0.16), transparent 24%)',
                }}
              />
              <div className="relative flex w-[min(100%,20.5rem)] flex-col gap-2">
                {CHAT_MESSAGES.slice(0, visibleCount).map((message, index) => (
                  <div
                    key={message}
                    className={`whatsapp-chat-message rounded-[1.1rem] rounded-tl-md bg-white px-3.5 py-3 text-[0.92rem] leading-5 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.55)] ${
                      index === 0 ? 'font-semibold text-[#1a1038]' : 'text-slate-700'
                    }`}
                  >
                    {message}
                  </div>
                ))}

                {typing ? <TypingDots /> : null}

                {visibleCount === CHAT_MESSAGES.length ? (
                  <p className="whatsapp-chat-message px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                    Ahora
                  </p>
                ) : null}
              </div>
            </div>

            <div className="border-t border-black/5 bg-white px-3.5 py-3">
              <a
                href={chatWhatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 text-[0.92rem] font-bold text-white shadow-[0_16px_30px_-18px_rgba(37,211,102,0.95)] transition hover:bg-[#20bd5a]"
              >
                Escribir por WhatsApp
                <WhatsAppGlyph className="h-5 w-5" />
              </a>
            </div>
          </section>
        ) : null}

        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? 'Cerrar chat de WhatsApp' : 'Abrir chat de WhatsApp'}
          onClick={() => {
            if (open) {
              closeChat();
              return;
            }
            setOpen(true);
          }}
          className="pointer-events-auto relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_18px_40px_-16px_rgba(37,211,102,1),0_0_0_6px_rgba(37,211,102,0.16)] transition hover:scale-105 hover:bg-[#20bd5a]"
        >
          {open ? <X className="h-6 w-6" /> : <WhatsAppGlyph className="h-7 w-7" />}
        </button>
      </div>
    </div>
  );
}
