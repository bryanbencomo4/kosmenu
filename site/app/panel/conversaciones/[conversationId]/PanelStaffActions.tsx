'use client';

import { Bot, Headphones } from 'lucide-react';

type PanelStaffActionsProps = {
  busy?: boolean;
  showTake?: boolean;
  showReturn?: boolean;
  onTake: () => void;
  onReturn: () => void;
};

/**
 * Meta / WhatsApp Business–inspired staff controls under the chat header.
 * Primary join is a full green CTA; return is a soft pill.
 * Closing/archiving is intentionally unavailable — merchants keep history.
 */
export function PanelStaffActions({
  busy = false,
  showTake = false,
  showReturn = false,
  onTake,
  onReturn,
}: PanelStaffActionsProps) {
  if (!showTake && !showReturn) return null;

  return (
    <div
      className="shrink-0 border-b px-3 py-2.5"
      style={{
        backgroundColor: 'var(--chat-header)',
        borderColor: 'var(--chat-header-border)',
      }}
      data-panel-staff-actions="1"
    >
      {showTake ? (
        <button
          type="button"
          disabled={busy}
          data-testid="take-conversation-visible"
          className="group inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-full px-4 text-[14px] font-semibold tracking-tight text-[var(--chat-send-fg)] shadow-sm transition enabled:active:scale-[0.99] enabled:hover:brightness-110 disabled:opacity-50"
          style={{ backgroundColor: 'var(--chat-send)' }}
          onClick={onTake}
        >
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20"
            aria-hidden
          >
            <Headphones className="h-4 w-4" strokeWidth={2.25} />
          </span>
          Unirse al chat
        </button>
      ) : showReturn ? (
        <button
          type="button"
          disabled={busy}
          data-testid="return-assistant-visible"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-3 text-[13px] font-semibold text-[var(--chat-text)] transition enabled:active:scale-[0.99] disabled:opacity-50"
          style={{
            backgroundColor:
              'color-mix(in srgb, var(--chat-send) 14%, var(--chat-input))',
          }}
          onClick={onReturn}
        >
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor:
                'color-mix(in srgb, var(--chat-send) 22%, transparent)',
              color: 'var(--chat-send)',
            }}
            aria-hidden
          >
            <Bot className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span className="leading-tight">Devolver al asistente</span>
        </button>
      ) : null}
    </div>
  );
}
