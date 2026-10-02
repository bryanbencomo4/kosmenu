'use client';

import { Manrope } from 'next/font/google';
import { Check } from 'lucide-react';

import { FULFILLMENT_LABEL, type KioskVoucherData } from './kiosk-types';

const titleFont = Manrope({
  subsets: ['latin'],
  weight: ['700', '800'],
});

type KioskVoucherProps = {
  voucher: KioskVoucherData;
  businessName: string;
  logoUrl: string | null;
  initialLetter: string;
  onTrack: () => void;
  onNewOrder: () => void;
};

function WhatsAppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.02 3.2c-7.05 0-12.8 5.7-12.8 12.73 0 2.24.59 4.42 1.7 6.35L3.2 28.8l6.72-1.76a12.86 12.86 0 0 0 6.1 1.56h.01c7.05 0 12.8-5.7 12.8-12.73S23.07 3.2 16.02 3.2Zm7.45 18.05c-.31.86-1.8 1.64-2.5 1.74-.64.1-1.45.14-2.34-.14-.54-.18-1.23-.4-2.12-.79-3.73-1.61-6.16-5.36-6.35-5.61-.18-.25-1.51-2-1.51-3.82s.93-2.68 1.29-3.06c.31-.33.82-.48 1.31-.48.16 0 .3 0 .43.01.38.02.57.04.82.63.31.74 1.06 2.58 1.15 2.77.10.18.16.4.03.64-.12.25-.19.4-.37.62-.18.21-.35.38-.53.58-.19.21-.4.43-.17.82.22.4 1 1.64 2.14 2.66 1.48 1.31 2.68 1.72 3.1 1.9.31.14.64.12.86-.1.27-.27.93-1.08 1.18-1.45.25-.37.5-.3.82-.18.33.12 2.08.98 2.43 1.16.36.18.59.27.68.42.08.15.08.86-.23 1.72Z" />
    </svg>
  );
}

export function KioskVoucher({
  voucher,
  businessName,
  logoUrl,
  initialLetter,
  onTrack,
  onNewOrder,
}: KioskVoucherProps) {
  return (
    <section className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-[var(--menu-background)] px-5 py-6 text-[var(--menu-text)]">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={businessName}
              className="h-16 w-16 rounded-[18px] bg-[var(--menu-surface)] object-cover shadow-[var(--menu-shadow)]"
            />
          ) : (
            <div
              className="grid h-16 w-16 place-items-center rounded-[18px] text-2xl font-extrabold shadow-[var(--menu-shadow)]"
              style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
            >
              {initialLetter}
            </div>
          )}
          <span
            className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--menu-primary) 16%, var(--menu-surface))',
              color: 'var(--menu-primary)',
            }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
            Pedido recibido
          </span>
          <h1 className={`${titleFont.className} mt-3 text-[32px] font-extrabold tracking-[-0.05em] text-[var(--menu-text)]`}>
            {voucher.orderId}
          </h1>
          <p className="mt-1 text-sm font-medium text-[var(--menu-text-muted)]">
            {businessName} · {FULFILLMENT_LABEL[voucher.fulfillment]}
          </p>
        </div>

        <div className="rounded-[22px] bg-[var(--menu-surface)] p-5 shadow-[var(--menu-shadow)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--menu-text-muted)]">Tu pedido</p>
          <ul className="mt-4 space-y-3">
            {voucher.items.map((item) => (
              <li key={`${item.name}-${item.quantity}`} className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-sm font-medium text-[var(--menu-text)]">
                  <span className="mr-1.5 font-bold text-[var(--menu-text-muted)]">{item.quantity}×</span>
                  {item.name}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--menu-text)]">{item.priceLabel}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center justify-between border-t border-dashed border-[var(--menu-border)] pt-4">
            <span className="text-sm font-semibold text-[var(--menu-text-muted)]">Total</span>
            <span className={`${titleFont.className} text-2xl font-extrabold tracking-[-0.04em] text-[var(--menu-text)]`}>
              {voucher.totalLabel}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onTrack}
            className="min-h-12 rounded-[16px] text-sm font-bold"
            style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
          >
            Ver seguimiento
          </button>
          {voucher.whatsappUrl ? (
            <a
              href={voucher.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[16px] bg-[#25D366] text-sm font-bold text-white"
            >
              <WhatsAppMark className="h-5 w-5" />
              Escribir al restaurante
            </a>
          ) : null}
          <button
            type="button"
            onClick={onNewOrder}
            className="min-h-12 rounded-[16px] bg-[var(--menu-surface)] text-sm font-bold text-[var(--menu-text)] shadow-[var(--menu-shadow)]"
          >
            Ir al menú
          </button>
        </div>
      </div>
    </section>
  );
}
