'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';

import { useLockBodyScroll } from '../../../../_lib/use-lock-body-scroll';
import { chatThemeVars, type ChatThemeMode } from './chat-theme';

export type ChatCheckoutStep = {
  id: number;
  title: string;
};

type ChatCheckoutShellProps = {
  steps: ChatCheckoutStep[];
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
  theme?: ChatThemeMode;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
  children: ReactNode;
};

/**
 * Full-bleed checkout secondary screen inside the chatbot (WhatsApp-feel).
 * Same step contract as KioskCheckout — menu logic stays in page.tsx.
 */
export function ChatCheckoutShell({
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
  theme = 'dark',
  onClose,
  onBack,
  onNext,
  children,
}: ChatCheckoutShellProps) {
  useLockBodyScroll(true);
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStepId),
  );
  const themeStyle = chatThemeVars(theme);

  return (
    <section
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden"
      style={{
        ...themeStyle,
        backgroundColor: 'var(--chat-bg)',
        color: 'var(--chat-text)',
      }}
      data-chat-checkout="1"
      data-chat-theme={theme}
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      {/* Soft doodle wash like the chat wallpaper */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'url(/chat/doodle-pattern.png)',
          backgroundSize: '360px',
          backgroundRepeat: 'repeat',
        }}
        aria-hidden
      />

      <header
        className="relative z-20 shrink-0 border-b px-3 pb-3 pt-[max(0.65rem,env(safe-area-inset-top))]"
        style={{
          backgroundColor: 'var(--chat-header)',
          borderColor: 'var(--chat-header-border)',
        }}
      >
        <div className="mx-auto flex w-full max-w-lg items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--chat-text-muted)] transition hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
            aria-label="Cerrar y volver al chat"
            data-chat-checkout-close="1"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-[var(--chat-text)]">
              {title}
            </h2>
            <p className="truncate text-[12.5px] text-[var(--chat-text-muted)]">
              {subtitle}
            </p>
          </div>
        </div>

        <ol className="mx-auto mt-3 flex w-full max-w-lg items-center gap-1.5 px-1">
          {steps.map((step, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;
            return (
              <li key={step.id} className="min-w-0 flex-1">
                <div
                  className="h-1 rounded-full transition-colors"
                  style={{
                    backgroundColor:
                      done || active
                        ? 'var(--chat-send)'
                        : 'color-mix(in srgb, var(--chat-text) 14%, transparent)',
                    opacity: active ? 1 : done ? 0.75 : 1,
                  }}
                  aria-hidden
                />
                <p
                  className={`mt-1.5 truncate text-center text-[10px] font-semibold uppercase tracking-[0.08em] ${
                    active
                      ? 'text-[var(--chat-text)]'
                      : 'text-[var(--chat-text-muted)]'
                  }`}
                >
                  {step.title}
                </p>
              </li>
            );
          })}
        </ol>
      </header>

      <div
        data-sheet-scroll
        className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [touch-action:pan-y]"
      >
        <div className="mx-auto w-full max-w-lg pb-3">
          {error ? (
            <div
              className="mb-3 rounded-2xl px-3.5 py-3 text-[13px] font-medium leading-snug"
              style={{
                backgroundColor:
                  'color-mix(in srgb, #F43F5E 18%, var(--chat-card))',
                color: '#FECDD3',
              }}
              role="alert"
            >
              {error}
            </div>
          ) : null}
          <div
            className="overflow-hidden rounded-2xl border shadow-sm [&_input]:bg-[var(--chat-input)] [&_textarea]:bg-[var(--chat-input)] [&_select]:bg-[var(--chat-input)]"
            style={{
              backgroundColor: 'var(--chat-card)',
              borderColor: 'var(--chat-card-border)',
              // Map menu tokens used by step children onto chat tokens so
              // existing checkout fields stay readable without a rewrite.
              ['--menu-background' as string]: 'var(--chat-bg)',
              ['--menu-surface' as string]: 'var(--chat-card)',
              ['--menu-surface-alt' as string]: 'var(--chat-input)',
              ['--menu-text' as string]: 'var(--chat-text)',
              ['--menu-text-muted' as string]: 'var(--chat-text-muted)',
              ['--menu-primary' as string]: 'var(--chat-send)',
              ['--menu-on-primary' as string]: 'var(--chat-send-fg)',
              ['--menu-border' as string]: 'var(--chat-card-border)',
              ['--menu-shadow' as string]: '0 1px 0 rgba(0,0,0,0.12)',
            }}
          >
            <div className="p-3 sm:p-4">{children}</div>
          </div>
        </div>
      </div>

      <footer
        className="relative z-20 shrink-0 border-t px-3 pt-2.5"
        style={{
          backgroundColor: 'var(--chat-composer)',
          borderColor: 'var(--chat-header-border)',
          paddingBottom: 'max(0.65rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="mx-auto flex w-full max-w-lg flex-col gap-2.5">
          <div className="flex items-end justify-between gap-3 px-0.5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--chat-text-muted)]">
                Total
              </p>
              <p className="truncate text-[22px] font-bold tracking-[-0.03em] text-[var(--chat-text)]">
                {totalLabel}
              </p>
              <p className="text-[11.5px] text-[var(--chat-text-muted)]">
                {itemsLabel}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={submitting}
              className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold text-[var(--chat-text-muted)] disabled:opacity-45"
              style={{ backgroundColor: 'var(--chat-input)' }}
              data-chat-checkout-back="1"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
              {backLabel}
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled}
              className="min-h-12 rounded-full text-[14px] font-semibold disabled:opacity-45"
              style={{
                backgroundColor: 'var(--chat-send)',
                color: 'var(--chat-send-fg)',
              }}
              data-chat-checkout-next="1"
            >
              {nextLabel}
            </button>
          </div>
          {submitting ? (
            <p className="text-center text-[11.5px] text-[var(--chat-text-muted)]">
              Guardando tu pedido… no cierres esta ventana.
            </p>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
