import type { CSSProperties } from 'react';
import type { CrossSellItem } from '../../_lib/upsell-heuristics';

type CrossSellRailProps = {
  items: CrossSellItem[];
  formatPrice: (amount: number) => string;
  onAdd: (productId: string) => void;
  titleStyle?: CSSProperties;
};

export function CrossSellRail({ items, formatPrice, onAdd, titleStyle }: CrossSellRailProps) {
  if (!items.length) return null;

  return (
    <section className="mx-auto mt-6 w-full max-w-6xl">
      <h2 className="px-4 text-lg font-black tracking-[-0.02em] sm:px-6" style={{ ...titleStyle, color: 'var(--menu-text)' }}>
        Clientes también agregan
      </h2>
      <div className="mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:px-6">
        {items.map(({ product, imageUrl }) => (
          <article
            key={product.id}
            className="w-[112px] shrink-0 overflow-hidden rounded-[18px] border"
            style={{
              backgroundColor: 'var(--menu-surface)',
              borderColor: 'var(--menu-border)',
            }}
          >
            <div className="relative h-[88px] bg-[var(--menu-surface-alt)]">
              {imageUrl ? (
                <img src={imageUrl} alt={product.nombre} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-2xl opacity-40">🥤</div>
              )}
              <button
                type="button"
                onClick={() => onAdd(product.id)}
                aria-label={`Agregar ${product.nombre}`}
                className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full text-sm font-black"
                style={{
                  backgroundColor: 'var(--menu-primary)',
                  color: 'var(--menu-on-primary)',
                }}
              >
                +
              </button>
            </div>
            <div className="p-2">
              <p className="line-clamp-2 min-h-[2rem] text-[11px] font-bold leading-4" style={{ color: 'var(--menu-text)' }}>
                {product.nombre}
              </p>
              <p className="mt-1 text-[12px] font-black" style={{ color: 'var(--menu-primary)' }}>
                {formatPrice(Number(product.precio ?? 0))}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
