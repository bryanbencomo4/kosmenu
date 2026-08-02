'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Heart } from 'lucide-react';
import type { ProductNudge } from '../../_lib/upsell-heuristics';

export type UpsellGridProduct = {
  id: string;
  nombre: string;
  descripcion?: string | null;
  precio?: number | null;
  imagen_url?: string | null;
  disponible?: boolean | null;
  nudge: ProductNudge | null;
};

type UpsellProductGridProps = {
  title: string;
  products: UpsellGridProduct[];
  getQuantity: (id: string) => number;
  formatPrice: (amount: number) => string;
  resolveImage: (url?: string | null) => string | null;
  onAdd: (id: string) => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  titleStyle?: CSSProperties;
};

function nudgeColors(accent: ProductNudge['accent']) {
  if (accent === 'green') return { bg: 'rgba(22,163,74,0.12)', fg: '#15803D' };
  if (accent === 'orange') return { bg: 'rgba(234,88,12,0.12)', fg: '#C2410C' };
  return {
    bg: 'color-mix(in srgb, var(--menu-primary) 14%, transparent)',
    fg: 'var(--menu-primary)',
  };
}

export function UpsellProductGrid({
  title,
  products,
  getQuantity,
  formatPrice,
  resolveImage,
  onAdd,
  onIncrement,
  onDecrement,
  titleStyle,
}: UpsellProductGridProps) {
  if (!products.length) return null;

  return (
    <section className="mx-auto mt-6 w-full max-w-[430px] px-4 sm:max-w-[760px] sm:px-6">
      <h2 className="text-lg font-black tracking-[-0.02em]" style={{ ...titleStyle, color: 'var(--menu-text)' }}>
        {title}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {products.map((product) => (
          <UpsellProductTile
            key={product.id}
            product={product}
            quantity={getQuantity(product.id)}
            priceLabel={formatPrice(Number(product.precio ?? 0))}
            imageUrl={resolveImage(product.imagen_url)}
            onAdd={() => onAdd(product.id)}
            onIncrement={() => onIncrement(product.id)}
            onDecrement={() => onDecrement(product.id)}
          />
        ))}
      </div>
    </section>
  );
}

function UpsellProductTile({
  product,
  quantity,
  priceLabel,
  imageUrl,
  onAdd,
  onIncrement,
  onDecrement,
}: {
  product: UpsellGridProduct;
  quantity: number;
  priceLabel: string;
  imageUrl: string | null;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const unavailable = product.disponible === false || (product.precio ?? 0) <= 0;
  const nudge = product.nudge;
  const nudgeStyle = nudge ? nudgeColors(nudge.accent) : null;

  return (
    <article
      className="flex flex-col overflow-hidden rounded-[22px] border"
      style={{
        backgroundColor: 'var(--menu-surface)',
        borderColor: 'var(--menu-border)',
        boxShadow: 'var(--menu-shadow)',
      }}
    >
      <div className="relative px-3 pt-3">
        <button
          type="button"
          className="absolute right-3 top-3 z-[1] grid h-8 w-8 place-items-center rounded-full"
          style={{ backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text-muted)' }}
          aria-label="Favorito (próximamente)"
        >
          <Heart className="h-4 w-4" />
        </button>
        <div className="mx-auto h-[108px] w-[108px] overflow-hidden rounded-full bg-[var(--menu-surface-alt)]">
          {imageUrl && !failed ? (
            <img
              src={imageUrl}
              alt={product.nombre}
              className="h-full w-full object-cover"
              onError={() => setFailed(true)}
            />
          ) : (
            <div className="grid h-full place-items-center text-3xl opacity-40">🍕</div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-2">
        <h3 className="line-clamp-1 text-[14px] font-extrabold" style={{ color: 'var(--menu-text)' }}>
          {product.nombre}
        </h3>
        <p className="mt-1 line-clamp-2 min-h-[2rem] text-[11px] leading-4" style={{ color: 'var(--menu-text-muted)' }}>
          {product.descripcion?.trim() || 'Preparación de la casa'}
        </p>
        <p className="mt-2 text-[15px] font-black" style={{ color: 'var(--menu-primary)' }}>
          {priceLabel}
        </p>

        <div className="mt-2">
          {quantity === 0 ? (
            <button
              type="button"
              disabled={unavailable}
              onClick={onAdd}
              className="inline-flex min-h-9 w-full items-center justify-center rounded-full text-xs font-black disabled:opacity-50"
              style={{
                backgroundColor: 'var(--menu-primary)',
                color: 'var(--menu-on-primary)',
              }}
            >
              {unavailable ? 'Agotado' : 'Agregar'}
            </button>
          ) : (
            <div
              className="inline-flex w-full items-center justify-between rounded-full border px-1 py-0.5"
              style={{ borderColor: 'var(--menu-border)' }}
            >
              <button
                type="button"
                onClick={onDecrement}
                className="grid h-8 w-8 place-items-center rounded-full text-base font-black"
                style={{ backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text)' }}
              >
                −
              </button>
              <span className="text-sm font-black" style={{ color: 'var(--menu-text)' }}>
                {quantity}
              </span>
              <button
                type="button"
                onClick={onIncrement}
                className="grid h-8 w-8 place-items-center rounded-full text-base font-black"
                style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>

      {nudge && nudgeStyle ? (
        <div
          className="border-t px-2.5 py-1.5 text-center text-[10px] font-bold leading-tight"
          style={{
            backgroundColor: nudgeStyle.bg,
            color: nudgeStyle.fg,
            borderColor: 'var(--menu-border)',
          }}
        >
          {nudge.kind === 'drink' ? '+ ' : ''}
          {nudge.label}
        </div>
      ) : null}
    </article>
  );
}
