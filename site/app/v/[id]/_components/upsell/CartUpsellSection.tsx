'use client';

import { X } from 'lucide-react';

export type CartUpsellSuggestion = {
  productId: string;
  ruleId: string;
  name: string;
  price: number;
  imageUrl: string | null;
};

type CartUpsellSectionProps = {
  suggestions: CartUpsellSuggestion[];
  formatPrice: (amount: number) => string;
  onAdd: (suggestion: CartUpsellSuggestion) => void;
  onDismiss: (suggestion: CartUpsellSuggestion) => void;
};

/** Momento 2/4: based on the whole cart, shown inline in the order review step. */
export function CartUpsellSection({ suggestions, formatPrice, onAdd, onDismiss }: CartUpsellSectionProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4">
      <h5 className="text-sm font-black text-slate-950">Completa tu pedido</h5>
      <div className="mt-3 space-y-2">
        {suggestions.map((suggestion) => (
          <div key={suggestion.productId} className="flex items-center gap-3 rounded-[18px] border border-slate-200 p-2.5">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[12px] bg-slate-100">
              {suggestion.imageUrl ? (
                <img src={suggestion.imageUrl} alt={suggestion.name} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-slate-900">{suggestion.name}</p>
              <p className="text-[12px] font-semibold text-slate-500">{formatPrice(suggestion.price)}</p>
            </div>
            <button
              type="button"
              onClick={() => onAdd(suggestion)}
              className="shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-black text-white"
            >
              + Agregar
            </button>
            <button
              type="button"
              onClick={() => onDismiss(suggestion)}
              aria-label="Quitar sugerencia"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
