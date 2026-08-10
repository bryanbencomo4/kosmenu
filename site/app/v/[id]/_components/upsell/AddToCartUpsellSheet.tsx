'use client';

import { X } from 'lucide-react';

export type AddToCartSuggestion = {
  productId: string;
  ruleId: string;
  name: string;
  price: number;
  imageUrl: string | null;
};

type AddToCartUpsellSheetProps = {
  open: boolean;
  suggestions: AddToCartSuggestion[];
  formatPrice: (amount: number) => string;
  onAdd: (suggestion: AddToCartSuggestion) => void;
  onDismiss: () => void;
};

/**
 * Momento 1: right after "Agregar al carrito". At most 1–2 suggestions, and
 * adding one never opens another sheet (no chained upsell nagging).
 */
export function AddToCartUpsellSheet({ open, suggestions, formatPrice, onAdd, onDismiss }: AddToCartUpsellSheetProps) {
  if (!open || suggestions.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 px-3 pb-3 sm:items-center" onClick={onDismiss}>
      <div
        className="w-full max-w-sm rounded-[26px] p-4 shadow-2xl"
        style={{ backgroundColor: 'var(--menu-surface)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-black" style={{ color: 'var(--menu-text)' }}>
            ¿Quieres completar tu pedido?
          </h3>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
            style={{ backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.productId}
              className="flex items-center gap-3 rounded-[18px] border p-2.5"
              style={{ borderColor: 'var(--menu-border)' }}
            >
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[14px] bg-[var(--menu-surface-alt)]">
                {suggestion.imageUrl ? (
                  <img src={suggestion.imageUrl} alt={suggestion.name} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold" style={{ color: 'var(--menu-text)' }}>
                  {suggestion.name}
                </p>
                <p className="text-[12px] font-semibold" style={{ color: 'var(--menu-primary)' }}>
                  {formatPrice(suggestion.price)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onAdd(suggestion)}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-black"
                style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
              >
                + Agregar
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-3 w-full rounded-full py-2 text-center text-[13px] font-bold"
          style={{ color: 'var(--menu-text-muted)' }}
        >
          No, gracias
        </button>
      </div>
    </div>
  );
}
