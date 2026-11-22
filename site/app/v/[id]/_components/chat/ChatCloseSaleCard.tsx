'use client';

import { CheckCircle2, Sparkles } from 'lucide-react';

import type { ChatCloseSalePrompt } from './chat-types';

type ChatCloseSaleCardProps = {
  prompt: ChatCloseSalePrompt;
  busy?: boolean;
  onWantMore: () => void;
  onReadyToPay: () => void;
};

/**
 * High-stakes close-sale choice after an item is added.
 * Primary path = pay; secondary = keep browsing complements.
 */
export function ChatCloseSaleCard({
  prompt,
  busy = false,
  onWantMore,
  onReadyToPay,
}: ChatCloseSaleCardProps) {
  if (prompt.status === 'answered_pay') {
    return (
      <div
        className="w-full max-w-[min(100%,20.5rem)] rounded-2xl border px-3.5 py-3 shadow-sm"
        style={{
          backgroundColor: 'var(--chat-card)',
          borderColor: 'var(--chat-card-border)',
        }}
        data-chat-close-sale="answered_pay"
      >
        <p className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--chat-send)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.3} aria-hidden />
          Perfecto — vamos a pagar
        </p>
      </div>
    );
  }

  if (prompt.status === 'answered_more') {
    return (
      <div
        className="w-full max-w-[min(100%,20.5rem)] overflow-hidden rounded-2xl border shadow-sm"
        style={{
          backgroundColor: 'var(--chat-card)',
          borderColor: 'var(--chat-card-border)',
        }}
        data-chat-close-sale="answered_more"
      >
        <div className="border-b px-3.5 py-2.5" style={{ borderColor: 'var(--chat-card-border)' }}>
          <p className="flex items-center gap-2 text-[12.5px] font-medium text-[var(--chat-text-muted)]">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--chat-send)]" strokeWidth={2.3} aria-hidden />
            Mira las opciones arriba — o paga cuando quieras
          </p>
        </div>
        <div className="p-2.5">
          <button
            type="button"
            data-chat-close-sale-pay="1"
            disabled={busy}
            onClick={onReadyToPay}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-3 text-[14.5px] font-bold transition active:scale-[0.99] disabled:opacity-50"
            style={{
              backgroundColor: 'var(--chat-send)',
              color: 'var(--chat-send-fg)',
              boxShadow: '0 10px 22px color-mix(in srgb, var(--chat-send) 35%, transparent)',
            }}
          >
            <CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden />
            Estoy listo para pagar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-[min(100%,20.5rem)] overflow-hidden rounded-2xl border shadow-sm"
      style={{
        backgroundColor: 'var(--chat-card)',
        borderColor: 'var(--chat-card-border)',
      }}
      data-chat-close-sale="pending"
      data-close-sale-id={prompt.id}
    >
      <div className="border-b px-3.5 py-2.5" style={{ borderColor: 'var(--chat-card-border)' }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--chat-text-muted)]">
          Tu pedido
        </p>
        <p className="mt-0.5 text-[14px] font-semibold leading-snug text-[var(--chat-text)]">
          ¿Seguimos o pasamos a pagar?
        </p>
      </div>
      <div className="flex flex-col gap-2 p-2.5">
        <button
          type="button"
          data-chat-close-sale-pay="1"
          disabled={busy}
          onClick={onReadyToPay}
          className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-3 text-[14.5px] font-bold transition active:scale-[0.99] disabled:opacity-50"
          style={{
            backgroundColor: 'var(--chat-send)',
            color: 'var(--chat-send-fg)',
            boxShadow: '0 10px 22px color-mix(in srgb, var(--chat-send) 35%, transparent)',
          }}
        >
          <CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden />
          Estoy listo para pagar
        </button>
        <button
          type="button"
          data-chat-close-sale-more="1"
          disabled={busy}
          onClick={onWantMore}
          className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border px-3 text-[13.5px] font-semibold transition active:scale-[0.99] disabled:opacity-50"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--chat-bubble-in) 70%, transparent)',
            borderColor: 'var(--chat-card-border)',
            color: 'var(--chat-text)',
          }}
        >
          <Sparkles className="h-4 w-4 text-[var(--chat-send)]" strokeWidth={2.3} aria-hidden />
          Sí, quiero algo más
        </button>
      </div>
    </div>
  );
}
