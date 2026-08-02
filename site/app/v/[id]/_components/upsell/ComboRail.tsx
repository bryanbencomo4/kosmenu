import type { CSSProperties } from 'react';
import type { ComboRailItem } from '../../_lib/upsell-heuristics';

type ComboRailProps = {
  items: ComboRailItem[];
  formatPrice: (amount: number) => string;
  onAdd: (productId: string) => void;
  titleStyle?: CSSProperties;
};

const badgeStyles: Record<ComboRailItem['badge'], { bg: string; fg: string }> = {
  mas_pedido: { bg: '#DC2626', fg: '#fff' },
  mejor_valor: { bg: '#16A34A', fg: '#fff' },
  ahorra: { bg: '#EA580C', fg: '#fff' },
};

export function ComboRail({ items, formatPrice, onAdd, titleStyle }: ComboRailProps) {
  if (!items.length) return null;

  return (
    <section className="mx-auto mt-5 w-full max-w-6xl">
      <div className="flex items-end justify-between px-4 sm:px-6">
        <h2 className="text-lg font-black tracking-[-0.02em]" style={{ ...titleStyle, color: 'var(--menu-text)' }}>
          Combos recomendados
        </h2>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--menu-text-muted)' }}>
          Demo upsell
        </span>
      </div>

      <div className="mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:px-6">
        {items.map((item) => {
          const badge = badgeStyles[item.badge];
          const price = Number(item.product.precio ?? 0);
          return (
            <article
              key={item.product.id}
              className="w-[210px] shrink-0 overflow-hidden rounded-[22px] border"
              style={{
                backgroundColor: 'var(--menu-surface)',
                borderColor: 'var(--menu-border)',
                boxShadow: 'var(--menu-shadow)',
              }}
            >
              <div className="relative h-[128px] bg-[var(--menu-surface-alt)]">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.product.nombre} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-3xl opacity-40">🍽️</div>
                )}
                <span
                  className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em]"
                  style={{ backgroundColor: badge.bg, color: badge.fg }}
                >
                  {item.badgeLabel}
                </span>
              </div>
              <div className="p-3">
                <h3 className="line-clamp-1 text-sm font-extrabold" style={{ color: 'var(--menu-text)' }}>
                  {item.product.nombre}
                </h3>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4" style={{ color: 'var(--menu-text-muted)' }}>
                  {item.product.descripcion?.trim() || 'Combo listo para pedir'}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-black" style={{ color: 'var(--menu-primary)' }}>
                      {formatPrice(price)}
                    </p>
                    <p className="text-[11px] font-semibold line-through" style={{ color: 'var(--menu-text-muted)' }}>
                      {formatPrice(item.compareAtPrice)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAdd(item.product.id)}
                    className="rounded-full px-3 py-1.5 text-xs font-black"
                    style={{
                      backgroundColor: 'var(--menu-primary)',
                      color: 'var(--menu-on-primary)',
                    }}
                  >
                    Agregar
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
