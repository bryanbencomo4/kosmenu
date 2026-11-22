'use client';

import {
  Banknote,
  CreditCard,
  Smartphone,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import type { ChatPaymentMethod } from './chat-payments';
import type { PaymentMethodIconKind } from '../../../../_lib/payment-method-display';

const KIND_ICON: Record<PaymentMethodIconKind, LucideIcon> = {
  cash: Banknote,
  pago_movil: Smartphone,
  binance: Wallet,
  transfer: CreditCard,
  wallet: Wallet,
  card: CreditCard,
};

type ChatPaymentMethodsCardProps = {
  methods: ChatPaymentMethod[];
  onOpenCheckout?: () => void;
};

export function ChatPaymentMethodsCard({
  methods,
  onOpenCheckout,
}: ChatPaymentMethodsCardProps) {
  if (methods.length === 0) return null;
  return (
    <div
      className="w-full max-w-[min(100%,22.5rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] shadow-sm"
      data-chat-payment-methods="1"
    >
      <div className="border-b border-[var(--chat-card-border)] px-3 py-2">
        <p className="text-[13px] font-semibold text-[var(--chat-text)]">
          Métodos de pago
        </p>
        <p className="text-[11.5px] leading-snug text-[var(--chat-text-muted)]">
          El checkout confirma el detalle exacto al pagar.
        </p>
      </div>
      <ul className="divide-y divide-[var(--chat-card-border)]">
        {methods.map((m) => {
          const Icon = KIND_ICON[m.kind] || Wallet;
          return (
            <li key={m.id} className="flex items-start gap-2.5 px-3 py-2.5">
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--chat-send)_18%,transparent)] text-[var(--chat-send)]"
                aria-hidden
              >
                <Icon className="h-4 w-4" strokeWidth={2.1} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold leading-snug text-[var(--chat-text)]">
                  {m.label}
                  {m.currency ? (
                    <span className="ml-1.5 text-[11px] font-medium text-[var(--chat-text-muted)]">
                      {m.currency}
                    </span>
                  ) : null}
                </p>
                {m.summary ? (
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--chat-text-muted)]">
                    {m.summary}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {typeof onOpenCheckout === 'function' ? (
        <div className="border-t border-[var(--chat-card-border)] p-2">
          <button
            type="button"
            data-chat-payment-checkout="1"
            onClick={onOpenCheckout}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--chat-send)] px-3 py-2 text-[13px] font-semibold text-[var(--chat-send-fg)] active:opacity-90"
          >
            Ir a pagar
          </button>
        </div>
      ) : null}
    </div>
  );
}
