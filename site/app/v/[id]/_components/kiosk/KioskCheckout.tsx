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
            className="grid h-11 w-11 place-items-center rounded-[14px] bg-[var(--menu-surface)] text-[var(--menu-text)] shadow-[var(--menu-shadow)]"
            aria-label="Cerrar checkout"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className={`${titleFont.className} truncate text-xl font-extrabold tracking-[-0.04em] text-[var(--menu-text)]`}>
              {title}
            </h2>
            <p className="truncate text-sm font-medium text-[var(--menu-text-muted)]">{subtitle}</p>
          </div>
          {fulfillment ? (
            <span
              className="shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
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
                        backgroundColor: done || active ? 'var(--menu-primary)' : 'var(--menu-surface-alt)',
                        color: done || active ? 'var(--menu-on-primary)' : 'var(--menu-text-muted)',
                      }}
                    >
                      {done ? '✓' : index + 1}
                    </span>
                    <p
                      className={`truncate text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        active ? 'text-[var(--menu-text)]' : 'text-[var(--menu-text-muted)]'
                      }`}
                    >
                      {step.title}
                    </p>
                  </div>
                  <div
                    className="mt-2 h-1 rounded-full"
                    style={{
                      backgroundColor: done || active ? 'var(--menu-primary)' : 'var(--menu-border)',
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
            <div
              className="mt-4 rounded-[18px] px-4 py-3 text-sm font-semibold"
              style={{
                backgroundColor: 'color-mix(in srgb, #F43F5E 16%, var(--menu-surface))',
                color: 'color-mix(in srgb, #E11D48 72%, var(--menu-text))',
              }}
            >
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <footer className="relative z-10 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3 rounded-[22px] bg-[var(--menu-surface)] px-4 py-3 shadow-[var(--menu-shadow)]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--menu-text-muted)]">Total</p>
            <p className={`${titleFont.className} text-[28px] font-extrabold tracking-[-0.05em] text-[var(--menu-text)]`}>
              {totalLabel}
            </p>
            <p className="text-xs font-medium text-[var(--menu-text-muted)]">{itemsLabel}</p>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={submitting}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[16px] bg-[var(--menu-surface-alt)] px-4 text-sm font-bold text-[var(--menu-text-muted)] disabled:opacity-45"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled}
              className="min-h-12 rounded-[16px] text-sm font-bold disabled:opacity-45"
              style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
            >
              {nextLabel}
            </button>
          </div>
          {submitting ? (
            <p className="text-center text-xs font-medium text-[var(--menu-text-muted)]">
              Estamos guardando tu pedido. No cierres esta ventana.
            </p>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
