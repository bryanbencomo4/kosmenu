'use client';

import { Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';

import { KioskDecor, KioskMotionStyles } from './KioskDecor';
import { FULFILLMENT_LABEL, type KioskFulfillment } from './kiosk-types';

const titleFont = Manrope({
  subsets: ['latin'],
  weight: ['700', '800'],
});

export type KioskCheckoutStep = {
  id: number;
  title: string;
};

type KioskCheckoutProps = {
  fulfillment: KioskFulfillment | null;
  steps: KioskCheckoutStep[];
  currentStepId: number;
  title: string;
  subtitle: string;
  totalLabel: string;
  itemsLabel: string;
  error: string | null;
  backLabel: string;
  nextLabel: string;
  nextDisabled: boolean;
  submitting: boolean;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
  children: ReactNode;
};

export function KioskCheckout({
  fulfillment,
  steps,
  currentStepId,
  title,
  subtitle,
  totalLabel,
  itemsLabel,
  error,
  backLabel,
  nextLabel,
  nextDisabled,
  submitting,
  onClose,
  onBack,
  onNext,
  children,
}: KioskCheckoutProps) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStepId),
  );

  return (
    <section className="fixed inset-0 z-[60] flex flex-col overflow-x-hidden bg-[var(--menu-background)] text-[var(--menu-text)]">
      <KioskDecor density="lite" />
      <KioskMotionStyles />

      <header className="relative z-10 px-5 py-3">
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-[14px] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
            aria-label="Cerrar checkout"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className={`${titleFont.className} truncate text-xl font-extrabold tracking-[-0.04em] text-[#111827]`}>
              {title}
            </h2>
            <p className="truncate text-sm font-medium text-slate-500">{subtitle}</p>
          </div>
          {fulfillment ? (
            <span
              className="shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white"
              style={{ backgroundColor: 'var(--menu-primary)' }}
            >
              {FULFILLMENT_LABEL[fulfillment]}
            </span>
          ) : null}
        </div>
        <ol className="mx-auto mt-4 flex w-full max-w-[560px] items-center gap-2">
          {steps.map((step, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;
            return (
              <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                      style={{
                        backgroundColor: done || active ? 'var(--menu-primary)' : '#E5E7EB',
                        color: done || active ? 'var(--menu-on-primary)' : '#6B7280',
                      }}
                    >
                      {done ? '✓' : index + 1}
                    </span>
                    <p
                      className={`truncate text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        active ? 'text-[#111827]' : 'text-slate-400'
                      }`}
                    >
                      {step.title}
                    </p>
                  </div>
                  <div
                    className="mt-2 h-1 rounded-full"
                    style={{
                      backgroundColor: done || active ? 'var(--menu-primary)' : '#E5E7EB',
                      opacity: active ? 1 : done ? 0.7 : 1,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto w-full max-w-[560px] pb-4">
          <div>{children}</div>
          {error ? (
            <div className="mt-4 rounded-[18px] bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <footer className="relative z-10 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3 rounded-[22px] bg-white px-4 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Total</p>
            <p className={`${titleFont.className} text-[28px] font-extrabold tracking-[-0.05em] text-[#111827]`}>
              {totalLabel}
            </p>
            <p className="text-xs font-medium text-slate-500">{itemsLabel}</p>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={submitting}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[16px] bg-slate-50 px-4 text-sm font-bold text-slate-600 disabled:opacity-45"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled}
              className="min-h-12 rounded-[16px] text-sm font-bold text-white disabled:opacity-45"
              style={{ backgroundColor: 'var(--menu-primary)' }}
            >
              {nextLabel}
            </button>
          </div>
          {submitting ? (
            <p className="text-center text-xs font-medium text-slate-500">
              Estamos guardando tu pedido. No cierres esta ventana.
            </p>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
