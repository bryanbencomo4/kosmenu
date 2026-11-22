'use client';

import { MessageCircle } from 'lucide-react';

type ChatModeSwitcherProps = {
  /** When true, shows the entry control to open the assistant from the traditional menu. */
  visible: boolean;
  onOpenAssistant: () => void;
};

/**
 * Entry point from the traditional menu into the assistant preview.
 * Hidden when preview is disabled or the assistant is already open.
 */
export function ChatModeSwitcher({ visible, onOpenAssistant }: ChatModeSwitcherProps) {
  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] z-[45] flex justify-center px-4 sm:bottom-28">
      <button
        type="button"
        onClick={onOpenAssistant}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[var(--menu-border)] bg-[var(--menu-surface)] px-4 py-2.5 text-sm font-bold text-[var(--menu-text)] shadow-[var(--menu-shadow)] transition hover:border-[var(--menu-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--menu-primary)]"
        aria-label="Abrir asistente virtual (demostración)"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--menu-primary)] text-[var(--menu-on-primary)]">
          <MessageCircle className="h-4 w-4" aria-hidden />
        </span>
        Probar asistente
        <span className="rounded-full bg-[var(--menu-surface-alt)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--menu-text-muted)]">
          Demo
        </span>
      </button>
    </div>
  );
}
