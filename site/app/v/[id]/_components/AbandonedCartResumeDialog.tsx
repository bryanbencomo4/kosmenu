'use client';

import { ShoppingBag } from 'lucide-react';
import type { CSSProperties } from 'react';

export type AbandonedCartPreviewItem = {
  id: string;
  name: string;
  quantity: number;
  imageUrl?: string | null;
  lineTotalLabel?: string;
};

type AbandonedCartResumeDialogProps = {
  open: boolean;
  businessName: string;
  itemCount: number;
  totalLabel: string;
  fulfillmentLabel?: string | null;
  savedLabel?: string | null;
  items: AbandonedCartPreviewItem[];
  titleFontStyle?: CSSProperties;
  onResume: () => void;
  onStartFresh: () => void;
};

export function AbandonedCartResumeDialog({
  open,
  businessName,
  itemCount,
  totalLabel,
  fulfillmentLabel,
  savedLabel,
  items,
  titleFontStyle,
  onResume,
  onStartFresh,
}: AbandonedCartResumeDialogProps) {
  if (!open) return null;

  const previewItems = items.slice(0, 4);
  const extraCount = Math.max(0, items.length - previewItems.length);
  const unitsLabel = itemCount === 1 ? '1 producto' : `${itemCount} productos`;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/55 px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-8 sm:items-center sm:pb-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="abandoned-cart-title"
      aria-describedby="abandoned-cart-desc"
    >
      <div className="kos-modal-backdrop pointer-events-none absolute inset-0" aria-hidden />
      <div className="kos-sheet-panel relative w-full max-w-md overflow-hidden rounded-[30px] bg-[var(--menu-surface)] shadow-[0_28px_80px_rgba(15,23,42,0.38)]">
        <div
          className="relative px-5 pb-4 pt-5"
          style={{
            background:
              'linear-gradient(165deg, color-mix(in srgb, var(--menu-primary) 18%, var(--menu-surface)) 0%, var(--menu-surface) 72%)',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)]"
              style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
            >
              <ShoppingBag className="h-5 w-5" strokeWidth={2.4} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--menu-text-muted)]">
                Pedido sin completar
              </p>
              <h3
                id="abandoned-cart-title"
                className="mt-1.5 text-[1.35rem] font-black leading-tight tracking-[-0.035em] text-[var(--menu-text)]"
                style={titleFontStyle}
              >
                ¿Retomas tu última compra?
              </h3>
              <p id="abandoned-cart-desc" className="mt-2 text-sm leading-6 text-[var(--menu-text-muted)]">
                Dejaste un pedido a medias en <span className="font-semibold text-[var(--menu-text)]">{businessName}</span>.
                Puedes continuar donde lo dejaste o empezar uno nuevo.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-5 pb-5">
          <div className="rounded-[22px] border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-[var(--menu-text)]">{unitsLabel}</p>
              <p className="text-sm font-black text-[var(--menu-text)]">{totalLabel}</p>
            </div>
            {(fulfillmentLabel || savedLabel) && (
              <p className="mt-1 text-xs font-semibold text-[var(--menu-text-muted)]">
                {[fulfillmentLabel, savedLabel].filter(Boolean).join(' · ')}
              </p>
            )}

            {previewItems.length > 0 ? (
              <ul className="mt-3 space-y-2.5">
                {previewItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[14px] bg-[var(--menu-surface)]">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-[10px] font-black text-[var(--menu-text-muted)]">
                          {item.quantity}×
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--menu-text)]">{item.name}</p>
                      <p className="text-xs font-semibold text-[var(--menu-text-muted)]">
                        {item.quantity} unid.{item.lineTotalLabel ? ` · ${item.lineTotalLabel}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {extraCount > 0 ? (
              <p className="mt-2.5 text-xs font-semibold text-[var(--menu-text-muted)]">
                +{extraCount} {extraCount === 1 ? 'ítem más' : 'ítems más'}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="kos-pressable min-h-12 rounded-2xl px-4 py-3.5 text-sm font-black shadow-[0_16px_32px_rgba(15,23,42,0.16)]"
              style={{
                backgroundColor: 'var(--menu-primary)',
                color: 'var(--menu-on-primary)',
              }}
            >
              Continuar pedido
            </button>
            <button
              type="button"
              onClick={onStartFresh}
              className="min-h-12 rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface)] px-4 py-3 text-sm font-bold text-[var(--menu-text)]"
            >
              Empezar de nuevo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
