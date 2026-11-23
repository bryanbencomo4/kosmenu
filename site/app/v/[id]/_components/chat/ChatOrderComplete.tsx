'use client';

import { useEffect, useRef } from 'react';
import { CheckCircle2, ExternalLink, MessageCircle } from 'lucide-react';

import { handleWhatsAppLinkClick } from '../../../../_lib/whatsapp-href';
import { chatThemeVars, type ChatThemeMode } from './chat-theme';

export type ChatOrderCompleteProps = {
  orderId: string;
  totalLabel: string;
  whatsappUrl: string | null;
  trackingUrl?: string | null;
  theme?: ChatThemeMode;
  businessName?: string;
  /** Auto-open WhatsApp once (same behaviour as menu voucher). */
  autoOpenWhatsApp?: boolean;
  onBackToChat: () => void;
};

/**
 * Post-order success screen inside the chatbot — opens restaurant WhatsApp
 * like the traditional menu, without leaving the chat session.
 */
export function ChatOrderComplete({
  orderId,
  totalLabel,
  whatsappUrl,
  trackingUrl = null,
  theme = 'dark',
  businessName = 'el restaurante',
  autoOpenWhatsApp = true,
  onBackToChat,
}: ChatOrderCompleteProps) {
  const themeStyle = chatThemeVars(theme);
  const openedRef = useRef(false);

  useEffect(() => {
    if (!autoOpenWhatsApp || !whatsappUrl || openedRef.current) return;
    if (typeof window === 'undefined') return;
    const key = `elmenuxfa:order-wa-auto-opened:${orderId}`;
    try {
      if (window.sessionStorage.getItem(key) === '1') return;
    } catch {
      /* continue */
    }
    const timer = window.setTimeout(() => {
      openedRef.current = true;
      try {
        window.sessionStorage.setItem(key, '1');
      } catch {
        /* ignore */
      }
      if (!handleWhatsAppLinkClick(whatsappUrl)) {
        window.location.assign(whatsappUrl);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [autoOpenWhatsApp, whatsappUrl, orderId]);

  return (
    <section
      className="fixed inset-0 z-[65] flex flex-col overflow-hidden"
      style={{
        ...themeStyle,
        backgroundColor: 'var(--chat-bg)',
        color: 'var(--chat-text)',
      }}
      data-chat-order-complete="1"
      role="dialog"
      aria-modal="true"
      aria-label="Pedido confirmado"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.3]"
        style={{
          backgroundImage: 'url(/chat/doodle-pattern.png)',
          backgroundSize: '360px',
          backgroundRepeat: 'repeat',
        }}
        aria-hidden
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-8">
        <div
          className="w-full max-w-sm overflow-hidden rounded-3xl border px-5 py-6 text-center shadow-lg"
          style={{
            backgroundColor: 'var(--chat-card)',
            borderColor: 'var(--chat-card-border)',
          }}
        >
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-full"
            style={{
              backgroundColor:
                'color-mix(in srgb, var(--chat-send) 22%, transparent)',
              color: 'var(--chat-send)',
            }}
          >
            <CheckCircle2 className="h-8 w-8" strokeWidth={2.2} />
          </div>
          <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">
            Pedido confirmado
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-snug text-[var(--chat-text-muted)]">
            {businessName} ya recibió tu pedido. Te contactamos por WhatsApp
            para confirmarlo.
          </p>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--chat-text-muted)]">
            Total
          </p>
          <p className="text-[26px] font-bold tracking-[-0.03em] text-[var(--chat-text)]">
            {totalLabel}
          </p>
          <p className="mt-1 text-[12px] text-[var(--chat-text-muted)]">
            Pedido #{orderId.slice(0, 8)}
          </p>

          <div className="mt-5 flex flex-col gap-2">
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(event) => {
                  if (handleWhatsAppLinkClick(whatsappUrl)) {
                    event.preventDefault();
                  }
                }}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full text-[14px] font-semibold"
                style={{
                  backgroundColor: 'var(--chat-send)',
                  color: 'var(--chat-send-fg)',
                }}
                data-chat-order-wa="1"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
                Abrir WhatsApp
              </a>
            ) : null}
            {trackingUrl ? (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full text-[13.5px] font-semibold text-[var(--chat-link)]"
                style={{ backgroundColor: 'var(--chat-input)' }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Seguir pedido
              </a>
            ) : null}
            <button
              type="button"
              onClick={onBackToChat}
              className="inline-flex min-h-11 items-center justify-center rounded-full text-[13.5px] font-semibold text-[var(--chat-text-muted)]"
              data-chat-order-back="1"
            >
              Volver al chat
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
