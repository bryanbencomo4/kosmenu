'use client';

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
};

/**
 * In-chat product control panel — same comfort idea as BusinessAuthCard.
 */
export function BusinessProductManageCard({
  product,
  onAction,
  onClose,
}: BusinessProductManageCardProps) {
  const actions = [
    { id: 'price', label: '💵 Precio', text: `cambiar precio ${product.name}` },
    product.available
      ? { id: 'out', label: '⏸️ Agotar', text: `agotar ${product.name}` }
      : { id: 'on', label: '✅ Activar', text: `activar ${product.name}` },
    { id: 'hide', label: '🙈 Ocultar', text: `ocultar ${product.name}` },
    { id: 'photo', label: '🖼️ Foto', text: `cambiar foto ${product.name}` },
  ];

  return (
    <div
      className="mt-1.5 w-full max-w-[min(92%,22rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-3 shadow-sm"
      data-business-product-manage={product.id}
    >
      <div className="flex items-start gap-2.5">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--chat-input)]">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[14px] font-bold text-[var(--chat-text-muted)]">
              {product.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--chat-text)]">
            {product.name}
          </p>
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
      <p className="mt-2 text-[11px] text-[var(--chat-text-muted)]">
        ¿Qué quieres hacer con este producto?
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onAction(a.text)}
            className="rounded-lg border border-[var(--chat-card-border)] bg-[var(--chat-input)] px-2 py-2 text-[12px] font-semibold text-[var(--chat-text)] active:opacity-90"
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
