'use client';

import { useMemo, useState } from 'react';
import { Caveat, Manrope } from 'next/font/google';
import { ArrowLeft, BellRing, Check, CreditCard } from 'lucide-react';

import type { CatalogPaymentGroup } from '../upsell/PreCheckoutUpsellSheet';
import { KioskImage } from './KioskImage';

const titleFont = Manrope({
  subsets: ['latin'],
  weight: ['700', '800'],
});

const scriptFont = Caveat({
  subsets: ['latin'],
  weight: ['500', '600'],
});

export type CatalogReadyItem = {
  name: string;
  quantity: number;
  priceLabel: string;
};

type KioskCatalogReadyProps = {
  businessName: string;
  logoUrl: string | null;
  initialLetter: string;
  items: CatalogReadyItem[];
  itemCount: number;
  totalLabel: string;
  paymentGroups?: CatalogPaymentGroup[];
  selectedPaymentCurrency?: string;
  onSelectPaymentCurrency?: (currency: string) => void;
  onNewOrder: () => void;
};

function currencyChipLabel(currency: string) {
  return currency === 'VES' ? 'Bs (VES)' : currency;
}

export function KioskCatalogReady({
  businessName,
  logoUrl,
  initialLetter,
  items,
  itemCount,
  totalLabel,
  paymentGroups = [],
  selectedPaymentCurrency,
  onSelectPaymentCurrency,
  onNewOrder,
}: KioskCatalogReadyProps) {
  const [showPayments, setShowPayments] = useState(false);
  const payableGroups = useMemo(
    () => paymentGroups.filter((group) => group.methods.length > 0),
    [paymentGroups],
  );
  const activePaymentCurrency =
    payableGroups.find((group) => group.currency === selectedPaymentCurrency)?.currency ??
    payableGroups[0]?.currency ??
    '';
  const activePaymentMethods =
    payableGroups.find((group) => group.currency === activePaymentCurrency)?.methods ?? [];

  return (
    <section className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-[var(--menu-background)] px-5 py-6 text-[var(--menu-text)]">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
        <div className="flex flex-col items-center text-center">
          {logoUrl ? (
            <KioskImage
              src={logoUrl}
              sourceUrl={logoUrl}
              displayWidth={240}
              alt={businessName}
              fit="cover"
              className="h-16 w-16 rounded-[18px] bg-[var(--menu-surface)] shadow-[var(--menu-shadow)]"
            />
          ) : (
            <div
              className="grid h-16 w-16 place-items-center rounded-[18px] text-2xl font-extrabold shadow-[var(--menu-shadow)]"
              style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
            >
              {initialLetter}
            </div>
          )}
          <span
            className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--menu-primary) 16%, var(--menu-surface))',
              color: 'var(--menu-primary)',
            }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
            Pedido listo para mostrar
          </span>
          <h1
            className={`${titleFont.className} mt-3 text-[30px] font-extrabold tracking-[-0.05em] text-[var(--menu-text)]`}
          >
            {showPayments ? 'Métodos de pago' : 'Resumen del pedido'}
          </h1>
          <p className="mt-1 text-sm font-medium text-[var(--menu-text-muted)]">{businessName}</p>
        </div>

        {showPayments ? (
          <div className="mt-5 flex-1 space-y-3">
            <p className={`${scriptFont.className} text-[1.55rem] leading-none`} style={{ color: 'var(--menu-primary)' }}>
              Cómo pagar
            </p>
            {payableGroups.length === 0 ? (
              <p className="text-[13px] font-medium text-[var(--menu-text-muted)]">
                Este comercio no publicó métodos de pago.
              </p>
            ) : (
              <>
                {payableGroups.length > 1 ? (
                  <div
                    className="rounded-[18px] p-3"
                    style={{ backgroundColor: 'var(--menu-surface)' }}
                    role="group"
                    aria-label="Moneda de pago"
                  >
                    <p className="mb-2 text-xs font-semibold text-[var(--menu-text-muted)]">Moneda de pago</p>
                    <div className="flex gap-2">
                      {payableGroups.map((group) => {
                        const isSelected = group.currency === activePaymentCurrency;
                        return (
                          <button
                            key={group.currency}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => onSelectPaymentCurrency?.(group.currency)}
                            className="min-h-10 flex-1 rounded-xl px-3 text-sm font-bold"
                            style={
                              isSelected
                                ? {
                                    backgroundColor: 'var(--menu-primary)',
                                    color: 'var(--menu-on-primary)',
                                  }
                                : {
                                    backgroundColor: 'var(--menu-surface-alt)',
                                    color: 'var(--menu-text-muted)',
                                  }
                            }
                          >
                            {currencyChipLabel(group.currency)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="space-y-2">
                  {activePaymentMethods.map((method) => (
                    <div
                      key={method.id}
                      className="rounded-[22px] px-4 py-4 shadow-[var(--menu-shadow)]"
                      style={{ backgroundColor: 'var(--menu-surface)' }}
                    >
                      <p className="text-sm font-bold">{method.label}</p>
                      {method.details ? (
                        <p className="mt-1 text-xs text-[var(--menu-text-muted)]">{method.details}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div
              className="mt-5 rounded-[22px] px-4 py-4 shadow-[var(--menu-shadow)]"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--menu-primary) 12%, var(--menu-surface))',
                color: 'var(--menu-text)',
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px]"
                  style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
                >
                  <BellRing className="h-5 w-5" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 text-left">
                  <p
                    className={`${scriptFont.className} text-[1.55rem] leading-none`}
                    style={{ color: 'var(--menu-primary)' }}
                  >
                    Llama a un mesero
                  </p>
                  <p className="mt-1.5 text-[13px] font-medium leading-snug text-[var(--menu-text)]">
                    Ya puedes llamar a un mesero para mostrarle este pedido y confirmar cómo pagar.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[22px] bg-[var(--menu-surface)] p-5 shadow-[var(--menu-shadow)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--menu-text-muted)]">
                  Tu pedido
                </p>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                  style={{ backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text)' }}
                >
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
              </div>
              <ul className="mt-4 space-y-3">
                {items.map((item, index) => (
                  <li key={`${item.name}-${index}`} className="flex items-start justify-between gap-3">
                    <span className="min-w-0 text-sm font-medium text-[var(--menu-text)]">
                      <span className="mr-1.5 font-bold text-[var(--menu-text-muted)]">{item.quantity}×</span>
                      {item.name}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--menu-text)]">
                      {item.priceLabel}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex items-center justify-between border-t border-dashed border-[var(--menu-border)] pt-4">
                <span className="text-sm font-semibold text-[var(--menu-text-muted)]">Total</span>
                <span
                  className={`${titleFont.className} text-2xl font-extrabold tracking-[-0.04em] text-[var(--menu-text)]`}
                >
                  {totalLabel}
                </span>
              </div>
            </div>
          </>
        )}

        <div className="mt-auto grid gap-2 pt-6 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {showPayments ? (
            <button
              type="button"
              onClick={() => setShowPayments(false)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[16px] text-sm font-bold shadow-[var(--menu-shadow)]"
              style={{ backgroundColor: 'var(--menu-surface)', color: 'var(--menu-text)' }}
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al resumen
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onNewOrder}
                className="min-h-12 rounded-[16px] text-sm font-bold"
                style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
              >
                Realizar una nueva orden
              </button>
              <button
                type="button"
                onClick={() => setShowPayments(true)}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[16px] text-sm font-semibold text-[var(--menu-text-muted)]"
              >
                <CreditCard className="h-4 w-4" />
                Ver métodos de pago
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
