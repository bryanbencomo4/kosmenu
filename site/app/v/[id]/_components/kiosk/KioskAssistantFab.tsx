'use client';

import { Bot } from 'lucide-react';

type KioskAssistantFabProps = {
  visible: boolean;
  onOpen: () => void;
};

/**
 * Soft floating entry to the assistant on categories/products.
 * Sits low on the right, clear of the cart chrome when present.
 */
export function KioskAssistantFab({ visible, onOpen }: KioskAssistantFabProps) {
  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        data-kiosk-assistant-fab="1"
        onClick={onOpen}
        aria-label="Abrir asistente virtual"
        className="pointer-events-auto fixed z-[44] inline-flex h-12 w-12 items-center justify-center rounded-full text-[var(--menu-on-primary,#fff)] transition active:scale-95"
        style={{
          right: 'max(1rem, env(safe-area-inset-right))',
          // Lower on screen (~2rem less than before) so it sits nearer the cart/edge.
          bottom: 'max(3.5rem, calc(env(safe-area-inset-bottom) + 2.5rem))',
          background:
            'linear-gradient(145deg, color-mix(in srgb, var(--menu-primary) 78%, white), var(--menu-primary))',
          boxShadow:
            '0 12px 28px color-mix(in srgb, var(--menu-primary) 40%, transparent)',
        }}
      >
        <span className="kiosk-assistant-fab-pulse absolute inset-0 rounded-full" aria-hidden />
        <Bot className="relative h-[22px] w-[22px]" strokeWidth={2.2} aria-hidden />
      </button>
      <style>{`
        .kiosk-assistant-fab-pulse {
          animation: kiosk-assistant-fab-pulse 2.4s ease-out infinite;
          background: color-mix(in srgb, var(--menu-primary) 45%, transparent);
        }
        @keyframes kiosk-assistant-fab-pulse {
          0% { transform: scale(1); opacity: 0.55; }
          70% { transform: scale(1.55); opacity: 0; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .kiosk-assistant-fab-pulse { animation: none; opacity: 0; }
        }
      `}</style>
    </>
  );
}
