'use client';

import { ArrowRight, BookOpen, Bot, Sparkles, X } from 'lucide-react';
import { useEffect } from 'react';

import { useLockBodyScroll } from '../../../../_lib/use-lock-body-scroll';

type KioskOrderModeSheetProps = {
  open: boolean;
  businessName: string;
  onClose: () => void;
  onChooseAssistant: () => void;
  onChooseMenu: () => void;
};

/**
 * Home “Ver menú” chooser — same sheet chrome as pagos / horario / opciones.
 * Renders inside the themed kiosk tree (no portal) so --menu-* vars apply.
 */
export function KioskOrderModeSheet({
  open,
  businessName,
  onClose,
  onChooseAssistant,
  onChooseMenu,
}: KioskOrderModeSheetProps) {
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const name = businessName.trim() || 'el restaurante';

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      data-kiosk-order-mode="1"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kiosk-order-mode-title"
        className="kiosk-order-mode-panel relative flex w-full max-w-md flex-col overflow-hidden rounded-[24px] shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
        style={{
          backgroundColor: 'var(--menu-surface, #ffffff)',
          color: 'var(--menu-text, #111111)',
        }}
      >
        {/* Soft brand wash — matches home hero warmth without clutter */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-36"
          aria-hidden
          style={{
            background: `
              radial-gradient(90% 80% at 12% 0%, color-mix(in srgb, var(--menu-primary, #c9a227) 28%, transparent), transparent 62%),
              radial-gradient(70% 70% at 92% 8%, color-mix(in srgb, var(--menu-accent, #e8b923) 18%, transparent), transparent 55%)
            `,
          }}
        />

        <div className="relative flex items-start justify-between gap-3 px-5 pb-1 pt-4 sm:px-6">
          <div className="min-w-0 pr-2">
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: 'var(--menu-text-muted, #6b7280)' }}
            >
              Cómo quieres pedir
            </p>
            <h2
              id="kiosk-order-mode-title"
              className="mt-1.5 text-[1.45rem] font-black leading-[1.15] tracking-[-0.035em] sm:text-2xl"
              style={{ fontFamily: 'var(--font-title, var(--font-display), Poppins, system-ui, sans-serif)' }}
            >
              Elige tu forma de pedir
            </h2>
            <p
              className="mt-1.5 text-sm leading-6"
              style={{ color: 'var(--menu-text-muted, #6b7280)' }}
            >
              En {name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative space-y-2.5 px-5 pb-5 pt-3 sm:px-6">
          <button
            type="button"
            data-kiosk-order-mode-assistant="1"
            onClick={onChooseAssistant}
            className="group flex w-full items-stretch gap-3.5 overflow-hidden rounded-[20px] px-3.5 py-3.5 text-left transition active:scale-[0.99]"
            style={{
              backgroundColor: 'var(--menu-primary, #c9a227)',
              color: 'var(--menu-on-primary, #111111)',
              boxShadow:
                '0 16px 36px color-mix(in srgb, var(--menu-primary, #c9a227) 38%, transparent)',
            }}
          >
            <span
              className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
              style={{ backgroundColor: 'color-mix(in srgb, var(--menu-on-primary, #111) 14%, transparent)' }}
            >
              <Bot className="h-5 w-5" strokeWidth={2.3} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className="text-[16px] font-black tracking-[-0.02em]"
                  style={{ fontFamily: 'var(--font-title, var(--font-display), Poppins, system-ui, sans-serif)' }}
                >
                  Asistente virtual
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--menu-on-primary, #111) 14%, transparent)',
                  }}
                >
                  <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  Recomendado
                </span>
              </span>
              <span
                className="mt-1 block text-[13px] leading-snug opacity-85"
              >
                Chat tipo WhatsApp: te guía, arma el pedido y cotiza el delivery.
              </span>
            </span>
            <span className="flex shrink-0 items-center self-center opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100">
              <ArrowRight className="h-5 w-5" strokeWidth={2.2} aria-hidden />
            </span>
          </button>

          <button
            type="button"
            data-kiosk-order-mode-menu="1"
            onClick={onChooseMenu}
            className="group flex w-full items-stretch gap-3.5 rounded-[20px] border px-3.5 py-3.5 text-left transition active:scale-[0.99]"
            style={{
              backgroundColor: 'var(--menu-surface-alt, #f3f4f6)',
              borderColor: 'var(--menu-border, #e5e7eb)',
              color: 'var(--menu-text, #111111)',
            }}
          >
            <span
              className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--menu-primary, #c9a227) 16%, transparent)',
                color: 'var(--menu-primary, #c9a227)',
              }}
            >
              <BookOpen className="h-5 w-5" strokeWidth={2.3} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="text-[16px] font-black tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-title, var(--font-display), Poppins, system-ui, sans-serif)' }}
              >
                Menú digital
              </span>
              <span
                className="mt-1 block text-[13px] leading-snug"
                style={{ color: 'var(--menu-text-muted, #6b7280)' }}
              >
                Navega categorías y productos a tu ritmo, como siempre.
              </span>
            </span>
            <span
              className="flex shrink-0 items-center self-center transition group-hover:translate-x-0.5"
              style={{ color: 'var(--menu-text-muted, #6b7280)' }}
            >
              <ArrowRight className="h-5 w-5" strokeWidth={2.2} aria-hidden />
            </span>
          </button>
        </div>
      </div>

      <style>{`
        .kiosk-order-mode-panel {
          animation: kiosk-order-mode-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes kiosk-order-mode-in {
          from { opacity: 0; transform: translateY(18px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .kiosk-order-mode-panel { animation: none; }
        }
      `}</style>
    </div>
  );
}
