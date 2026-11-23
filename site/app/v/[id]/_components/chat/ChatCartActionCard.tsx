'use client';

import type { ChatCartActionData } from './chat-types';
import { ChatProductCard } from './ChatProductCard';

type ChatCartActionCardProps = {
  action: ChatCartActionData;
  busy?: boolean;
  confirmed?: boolean;
  /** Merchant supervision: show the same card without client confirm CTAs. */
  readOnly?: boolean;
  onConfirm: (action: ChatCartActionData) => void;
  onDismiss?: (action: ChatCartActionData) => void;
  onConfigure?: (productId: string) => void;
  onOpenImage?: (src: string, alt: string) => void;
};

export function ChatCartActionCard({
  action,
  busy = false,
  confirmed = false,
  readOnly = false,
  onConfirm,
  onDismiss,
  onConfigure,
  onOpenImage,
}: ChatCartActionCardProps) {
  if (action.type === 'propose_add') {
    const opts = action.product_card.selected_options?.join(' · ');
    return (
      <div
        className="w-full max-w-[min(100%,20.5rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] shadow-sm"
        data-chat-cart-action={action.type}
        data-proposal-id={action.proposal_id}
        data-confirmed={confirmed ? '1' : '0'}
        data-chat-readonly={readOnly ? '1' : undefined}
      >
        <ChatProductCard
          card={{
            ...action.product_card,
            // Proposal already carries a validated selection — only Confirm.
            requires_configuration: false,
          }}
          bare
          onOpenImage={onOpenImage}
        />
        <div className="border-t border-[var(--chat-card-border)] px-2.5 py-2">
          <p className="text-[12px] leading-snug text-[var(--chat-text-muted)]">
            {action.quantity}×
            {opts ? ` ${opts}` : ''} ·{' '}
            <span className="font-semibold tabular-nums text-[var(--chat-text)]">
              {action.line_total} {action.currency}
            </span>
          </p>
          {readOnly ? (
            <p className="mt-1.5 text-[11.5px] font-medium text-[var(--chat-text-muted)]">
              Propuesta mostrada al cliente
            </p>
          ) : !confirmed ? (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                data-chat-confirm-action={action.type}
                data-proposal-id={action.proposal_id}
                disabled={busy}
                className="flex-1 rounded-lg bg-[var(--chat-send)] px-2 py-1.5 text-[12.5px] font-semibold text-[var(--chat-send-fg)] disabled:opacity-50"
                onClick={() => onConfirm(action)}
              >
                Confirmar
              </button>
              {onDismiss ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--chat-text-muted)] disabled:opacity-50"
                  onClick={() => onDismiss(action)}
                >
                  Ahora no
                </button>
              ) : null}
            </div>
          ) : (
            <p className="mt-1.5 text-[11.5px] font-medium text-[var(--chat-send)]">
              En el carrito
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-[min(100%,20.5rem)] rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-2.5 shadow-sm"
      data-chat-cart-action={action.type}
      data-proposal-id={action.proposal_id}
      data-confirmed={confirmed ? '1' : '0'}
      data-chat-readonly={readOnly ? '1' : undefined}
    >
      <p className="text-[13.5px] font-medium leading-snug text-[var(--chat-text)]">
        {action.label}
      </p>
      {action.type === 'propose_update_qty' ? (
        <p className="mt-0.5 text-[12px] text-[var(--chat-text-muted)]">
          {action.line_total} {action.currency}
        </p>
      ) : null}
      {readOnly ? (
        <p className="mt-1.5 text-[11.5px] font-medium text-[var(--chat-text-muted)]">
          Acción mostrada al cliente
        </p>
      ) : !confirmed ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            data-chat-confirm-action={action.type}
            data-proposal-id={action.proposal_id}
            disabled={busy}
            className="flex-1 rounded-lg bg-[var(--chat-send)] px-2 py-1.5 text-[12.5px] font-semibold text-[var(--chat-send-fg)] disabled:opacity-50"
            onClick={() => onConfirm(action)}
          >
            {action.type === 'open_checkout'
              ? 'Continuar pedido'
              : 'Confirmar'}
          </button>
          {onDismiss ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--chat-text-muted)] disabled:opacity-50"
              onClick={() => onDismiss(action)}
            >
              Ahora no
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-1.5 text-[11.5px] font-medium text-[var(--chat-send)]">
          Listo
        </p>
      )}
    </div>
  );
}
