'use client';

import { ChevronRight } from 'lucide-react';

export type BusinessManageProduct = {
  id: string;
  name: string;
  priceLabel: string | null;
  available: boolean;
  imageUrl: string | null;
};

type BusinessProductManageCardProps = {
  product: BusinessManageProduct;
  onAction: (text: string) => void;
  onClose: () => void;
  /** Render as a bottom sheet (WhatsApp-style action list) instead of an inline chat card. */
  sheet?: boolean;
};

function buildActions(product: BusinessManageProduct) {
  return [
    {
      id: 'price',
      icon: '💵',
      label: 'Cambiar precio',
      hint: product.priceLabel ? `Ahora: ${product.priceLabel}` : 'Aún sin precio',
      text: `cambiar precio ${product.name}`,
    },
    product.available
      ? {
          id: 'out',
          icon: '⏸️',
          label: 'Marcar como agotado',
          hint: 'Deja de aparecer para pedir',
          text: `agotar ${product.name}`,
        }
      : {
          id: 'on',
          icon: '✅',
          label: 'Volver a activar',
          hint: 'Disponible otra vez',
          text: `activar ${product.name}`,
        },
    {
      id: 'photo',
      icon: '🖼️',
      label: 'Cambiar foto',
      hint: 'Sube o toma una nueva',
      text: `cambiar foto ${product.name}`,
    },
    {
      id: 'hide',
      icon: '🙈',
      label: 'Ocultar del menú',
      hint: 'No lo verán tus clientes',
      text: `ocultar ${product.name}`,
    },
  ];
}

function Thumb({ product, size }: { product: BusinessManageProduct; size: string }) {
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-xl bg-[var(--chat-input)]`}>
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[18px] font-bold text-[var(--chat-text-muted)]">
          {product.name.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}

/**
 * In-chat product control panel. `sheet` = the bottom-sheet version used from the menu carousel.
 */
export function BusinessProductManageCard({
  product,
  onAction,
  onClose,
  sheet,
}: BusinessProductManageCardProps) {
  const actions = buildActions(product);

  if (sheet) {
    return (
      <div
        className="w-full overflow-hidden rounded-t-3xl border border-b-0 border-[var(--chat-card-border)] bg-[var(--chat-card)] shadow-2xl"
        data-business-product-manage={product.id}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--chat-text-muted)]/40" />
        <div className="flex items-center gap-3 px-4 pb-3 pt-3">
          <Thumb product={product} size="h-14 w-14" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-[var(--chat-text)]">{product.name}</p>
            <p className="mt-0.5 flex items-center gap-2 text-[13px] text-[var(--chat-text-muted)]">
              <span className="tabular-nums">{product.priceLabel || 'Sin precio'}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                  product.available
                    ? 'bg-emerald-500/15 text-emerald-600'
                    : 'bg-rose-500/15 text-rose-500'
                }`}
              >
                {product.available ? 'Disponible' : 'Agotado'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--chat-input)] text-[14px] text-[var(--chat-text-muted)]"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="mx-4 h-px bg-[var(--chat-card-border)]" />
        <ul className="px-2 py-1.5">
          {actions.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onAction(a.text)}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left active:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--chat-send)_14%,transparent)] text-[18px]">
                  {a.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-[var(--chat-text)]">{a.label}</span>
                  <span className="block truncate text-[12px] text-[var(--chat-text-muted)]">{a.hint}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--chat-text-muted)]" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      className="mt-1.5 w-full max-w-[min(92%,22rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-3 shadow-sm"
      data-business-product-manage={product.id}
    >
      <div className="flex items-start gap-2.5">
        <Thumb product={product} size="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--chat-text)]">{product.name}</p>
          <p className="mt-0.5 text-[12px] text-[var(--chat-text-muted)]">
            {product.priceLabel || 'Sin precio'}
            {product.available ? '' : ' · agotado'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-1.5 py-0.5 text-[12px] text-[var(--chat-text-muted)]"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
      <p className="mt-2 text-[11px] text-[var(--chat-text-muted)]">¿Qué quieres hacer con este producto?</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onAction(a.text)}
            className="rounded-lg border border-[var(--chat-card-border)] bg-[var(--chat-input)] px-2 py-2 text-[12px] font-semibold text-[var(--chat-text)] active:opacity-90"
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
