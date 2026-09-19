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
              className="h-16 w-16 rounded-[18px] bg-white object-cover shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
            />
          ) : (
            <div
              className="grid h-16 w-16 place-items-center rounded-[18px] text-2xl font-extrabold text-white shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
              style={{ backgroundColor: 'var(--menu-primary)' }}
            >
              {initialLetter}
            </div>
          )}
          <span
            className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--menu-primary) 14%, white)',
              color: 'var(--menu-primary)',
            }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
            Pedido recibido
          </span>
          <h1 className={`${titleFont.className} mt-3 text-[32px] font-extrabold tracking-[-0.05em] text-[#111827]`}>
            {voucher.orderId}
          </h1>
          <p className="mt-1 text-sm font-medium text-[var(--menu-text-muted)]">
            {businessName} · {FULFILLMENT_LABEL[voucher.fulfillment]}
          </p>
        </div>

        <div className="rounded-[22px] bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Tu pedido</p>
          <ul className="mt-4 space-y-3">
            {voucher.items.map((item) => (
              <li key={`${item.name}-${item.quantity}`} className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-sm font-medium">
                  <span className="mr-1.5 font-bold text-slate-500">{item.quantity}×</span>
                  {item.name}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{item.priceLabel}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center justify-between border-t border-dashed border-[var(--menu-border)] pt-4">
            <span className="text-sm font-semibold text-slate-500">Total</span>
            <span className={`${titleFont.className} text-2xl font-extrabold tracking-[-0.04em] text-[#111827]`}>
              {voucher.totalLabel}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onTrack}
            className="min-h-12 rounded-[16px] text-sm font-bold text-white"
            style={{ backgroundColor: 'var(--menu-primary)' }}
          >
            Ver seguimiento
          </button>
          <button
            type="button"
            onClick={onNewOrder}
            className="min-h-12 rounded-[16px] bg-white text-sm font-bold shadow-[0_8px_30px_rgba(15,23,42,0.06)]"
          >
            Nuevo pedido
          </button>
        </div>
      </div>
    </section>
  );
}
