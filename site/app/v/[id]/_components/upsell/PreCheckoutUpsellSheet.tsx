'use client';

import { Caveat } from 'next/font/google';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Minus, Plus, ShoppingBag, ShoppingCart, Trash2, X } from 'lucide-react';

import type { CartLineSelection } from '../../../../_lib/menu-product-options';
import { useLockBodyScroll } from '../../../../_lib/use-lock-body-scroll';
import type { PreCheckoutSuggestionGroup } from '../../../../_lib/pre-checkout-upsell';
import {
  UpsellOptionConfigurator,
  type UpsellConfigurableProduct,
} from './UpsellOptionConfigurator';

const hintFont = Caveat({
  subsets: ['latin'],
  weight: ['500', '600'],
});

const VISIBLE_PRODUCTS = 4;

export type PreCheckoutCartPreviewItem = {
  id: string;
  name: string;
  detail?: string | null;
  quantity: number;
  priceLabel: string;
  imageUrl?: string | null;
};

export type PreCheckoutProductCard = {
  id: string;
  nombre: string;
  precio: number;
  imagen_url: string | null;
  quantity: number;
  hasOptions: boolean;
};

export type PreCheckoutUpsellGroupCard = Omit<PreCheckoutSuggestionGroup, 'products'> & {
  products: PreCheckoutProductCard[];
};

type PreCheckoutUpsellSheetProps = {
  open: boolean;
  cartItems: PreCheckoutCartPreviewItem[];
  cartCount: number;
  cartTotalLabel: string;
  groups: PreCheckoutUpsellGroupCard[];
  formatPrice: (amount: number) => string;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove?: (cartKey: string) => void;
  onKeepShopping: () => void;
  onContinue: () => void;
  resolveConfigurableProduct: (productId: string) => UpsellConfigurableProduct | null;
  onConfirmConfigured: (productId: string, selection: CartLineSelection, quantity: number) => void;
  canConfigure?: boolean;
};

function kindEmoji(kind: PreCheckoutSuggestionGroup['kind']) {
  if (kind === 'bebida') return '🥤';
  if (kind === 'postre') return '🍰';
  if (kind === 'acompanamiento') return '🍟';
  return '✨';
}

function kindSubtitle(kind: PreCheckoutSuggestionGroup['kind']) {
  if (kind === 'bebida') return 'Refresca tu comida con nuestras bebidas';
  if (kind === 'postre') return 'El final perfecto para tu comida';
  if (kind === 'acompanamiento') return 'Para completar el plato';
  return 'Algo más para tu pedido';
}

function QuantityStepper({
  quantity,
  onMinus,
  onPlus,
}: {
  quantity: number;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2.5">
      <button
        type="button"
        onClick={onMinus}
        disabled={quantity <= 0}
        aria-label="Quitar uno"
        className="grid h-8 w-8 place-items-center rounded-full border disabled:opacity-35"
        style={{ borderColor: 'var(--menu-border)', color: 'var(--menu-text)' }}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-5 text-center text-[14px] font-black" style={{ color: 'var(--menu-text)' }}>
        {quantity}
      </span>
      <button
        type="button"
        onClick={onPlus}
        aria-label="Agregar uno"
        className="grid h-8 w-8 place-items-center rounded-full"
        style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AddButton({ onClick, label = '+ Agregar' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center justify-center gap-1 rounded-full py-2 text-[12px] font-black"
      style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
    >
      {label}
    </button>
  );
}

function ProductCard({
  product,
  formatPrice,
  onAdd,
  onDecrement,
  onConfigure,
}: {
  product: PreCheckoutProductCard;
  formatPrice: (amount: number) => string;
  onAdd: () => void;
  onDecrement: () => void;
  onConfigure: () => void;
}) {
  const showStepper = !product.hasOptions && product.quantity > 0;
  const priceLabel = product.hasOptions
    ? `Desde ${formatPrice(product.precio)}`
    : formatPrice(product.precio);

  return (
    <article
      className="flex w-[148px] shrink-0 snap-start flex-col rounded-[20px] p-2.5 lg:w-auto"
      style={{ backgroundColor: 'var(--menu-surface-alt)' }}
    >
      <button type="button" onClick={product.hasOptions ? onConfigure : onAdd} className="text-left">
        <div
          className="mb-2 grid h-20 place-items-center overflow-hidden rounded-[14px] lg:h-24"
          style={{ backgroundColor: 'var(--menu-background)' }}
        >
          {product.imagen_url ? (
            <img
              src={product.imagen_url}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-2xl" aria-hidden>
              ✨
            </span>
          )}
        </div>
        <p className="line-clamp-2 min-h-9 text-[12px] font-bold leading-4 lg:text-[13px] lg:leading-5" style={{ color: 'var(--menu-text)' }}>
          {product.nombre}
        </p>
        <p className="mt-1 text-[12px] font-black lg:text-[13px]" style={{ color: 'var(--menu-primary)' }}>
          {priceLabel}
        </p>
        {product.hasOptions ? (
          <p className="mt-0.5 text-[10px] font-semibold" style={{ color: 'var(--menu-text-muted)' }}>
            Tiene opciones
          </p>
        ) : null}
      </button>
      <div className="mt-2.5">
        {product.hasOptions ? (
          <AddButton onClick={onConfigure} />
        ) : showStepper ? (
          <QuantityStepper quantity={product.quantity} onMinus={onDecrement} onPlus={onAdd} />
        ) : (
          <AddButton onClick={onAdd} />
        )}
      </div>
    </article>
  );
}

function CartList({
  items,
  compact,
  onRemove,
}: {
  items: PreCheckoutCartPreviewItem[];
  compact?: boolean;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className={compact ? 'max-h-52 space-y-2.5 overflow-y-auto' : 'space-y-4'}>
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-3">
          {item.imageUrl ? (
            <div
              className="h-10 w-10 shrink-0 overflow-hidden rounded-[12px]"
              style={{ backgroundColor: 'var(--menu-background)' }}
            >
              <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold lg:text-[14px]" style={{ color: 'var(--menu-text)' }}>
              {item.name}
            </p>
            <p className="truncate text-[11px]" style={{ color: 'var(--menu-text-muted)' }}>
              {item.detail ? `${item.detail} · ` : ''}x{item.quantity}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p className="text-[12px] font-black lg:text-[13px]" style={{ color: 'var(--menu-text)' }}>
              {item.priceLabel}
            </p>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={`Quitar ${item.name}`}
                className="inline-flex min-h-8 items-center gap-1 rounded-full px-1 text-[11px] font-black text-rose-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Quitar
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function SuggestionGroup({
  group,
  formatPrice,
  onAdd,
  onDecrement,
  onConfigure,
}: {
  group: PreCheckoutUpsellGroupCard;
  formatPrice: (amount: number) => string;
  onAdd: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onConfigure: (productId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = Math.max(0, group.products.length - VISIBLE_PRODUCTS);
  const visible = expanded ? group.products : group.products.slice(0, VISIBLE_PRODUCTS);

  return (
    <section>
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[16px] font-black" style={{ color: 'var(--menu-text)' }}>
            <span className="mr-1.5" aria-hidden>
              {group.icono?.trim() || kindEmoji(group.kind)}
            </span>
            {group.categoryName}
          </p>
          <p className="text-[12px]" style={{ color: 'var(--menu-text-muted)' }}>
            {kindSubtitle(group.kind)}
          </p>
        </div>
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 text-[12px] font-bold"
            style={{ color: 'var(--menu-primary)' }}
          >
            {expanded ? 'Ver menos' : 'Ver más'}
            <ArrowRight className={`h-3.5 w-3.5 ${expanded ? 'rotate-90' : ''}`} />
          </button>
        ) : null}
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 xl:grid-cols-4 [&::-webkit-scrollbar]:hidden">
        {visible.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            formatPrice={formatPrice}
            onAdd={() => onAdd(product.id)}
            onDecrement={() => onDecrement(product.id)}
            onConfigure={() => onConfigure(product.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function PreCheckoutUpsellSheet({
  open,
  cartItems,
  cartCount,
  cartTotalLabel,
  groups,
  formatPrice,
  onIncrement,
  onDecrement,
  onRemove,
  onKeepShopping,
  onContinue,
  resolveConfigurableProduct,
  onConfirmConfigured,
  canConfigure = true,
}: PreCheckoutUpsellSheetProps) {
  useLockBodyScroll(open);
  const [recsReady, setRecsReady] = useState(false);
  const [configuring, setConfiguring] = useState<UpsellConfigurableProduct | null>(null);

  useEffect(() => {
    if (!open) {
      setRecsReady(false);
      setConfiguring(null);
      return;
    }
    const frame = window.requestAnimationFrame(() => setRecsReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function openConfigurator(productId: string) {
    const resolved = resolveConfigurableProduct(productId);
    if (!resolved) return;
    setConfiguring(resolved);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[68] flex items-end justify-center bg-black/45 lg:items-center lg:p-4">
      <div
        className="relative flex max-h-[92dvh] w-full max-w-[1080px] flex-col overflow-hidden rounded-t-[28px] shadow-[var(--menu-shadow)] lg:max-h-[min(92vh,820px)] lg:rounded-[28px]"
        style={{ backgroundColor: 'var(--menu-surface)', color: 'var(--menu-text)' }}
        role="dialog"
        aria-labelledby="pre-checkout-upsell-title"
      >
        <div className="flex items-center justify-between px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
          <p className="text-[12px] font-semibold" style={{ color: 'var(--menu-text-muted)' }}>
            Tu pedido · {cartCount}
          </p>
          <button
            type="button"
            onClick={onKeepShopping}
            aria-label="Cerrar"
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{ backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div data-sheet-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y]">
          <div className="lg:grid lg:min-h-full lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside
              className="hidden border-r px-5 py-6 lg:flex lg:flex-col"
              style={{ backgroundColor: 'var(--menu-surface-alt)', borderColor: 'var(--menu-border)' }}
            >
              <div className="mb-5 flex items-center gap-2" style={{ color: 'var(--menu-text-muted)' }}>
                <ShoppingCart className="h-4 w-4" />
                <p className="text-[13px] font-semibold" style={{ color: 'var(--menu-text)' }}>
                  Tu pedido
                </p>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{ backgroundColor: 'var(--menu-surface)', color: 'var(--menu-text)' }}
                >
                  {cartCount} {cartCount === 1 ? 'item' : 'items'}
                </span>
              </div>
              <CartList items={cartItems} onRemove={onRemove} />
              <div className="mt-auto border-t pt-4" style={{ borderColor: 'var(--menu-border)' }}>
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--menu-text-muted)' }}>
                    Total actual
                  </p>
                  <p className="text-[18px] font-black" style={{ color: 'var(--menu-text)' }}>
                    {cartTotalLabel}
                  </p>
                </div>
              </div>
            </aside>

            <div className="px-4 pb-3 pt-1 lg:px-6 lg:pb-6 lg:pt-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2
                  id="pre-checkout-upsell-title"
                  className={`${hintFont.className} max-w-[22rem] text-[30px] font-semibold leading-[1.12] sm:max-w-[30rem] sm:text-[36px] lg:text-[40px]`}
                >
                  ¿Seguimos armando el pedido{' '}
                  <span style={{ color: 'var(--menu-primary)' }}>o vamos a pagar?</span>
                </h2>
                <button
                  type="button"
                  onClick={onKeepShopping}
                  aria-label="Cerrar"
                  className="hidden h-9 w-9 shrink-0 place-items-center rounded-full lg:grid"
                  style={{ backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text-muted)' }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[13px]" style={{ color: 'var(--menu-text-muted)' }}>
                Completa tu pedido con estas deliciosas opciones
              </p>

              <section
                className="mt-4 rounded-[20px] p-3 lg:hidden"
                style={{ backgroundColor: 'var(--menu-surface-alt)' }}
              >
                <CartList items={cartItems} compact onRemove={onRemove} />
                <div className="mt-3 flex items-center justify-between border-t pt-2.5" style={{ borderColor: 'var(--menu-border)' }}>
                  <p className="text-[12px] font-semibold" style={{ color: 'var(--menu-text-muted)' }}>
                    Total actual
                  </p>
                  <p className="text-[15px] font-black" style={{ color: 'var(--menu-text)' }}>
                    {cartTotalLabel}
                  </p>
                </div>
              </section>

              {recsReady ? (
                <div className="mt-5 space-y-5">
                  {groups.map((group) => (
                    <SuggestionGroup
                      key={group.categoryId}
                      group={group}
                      formatPrice={formatPrice}
                      onAdd={onIncrement}
                      onDecrement={onDecrement}
                      onConfigure={openConfigurator}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="mt-5 h-32 animate-pulse rounded-[20px]"
                  style={{ backgroundColor: 'var(--menu-surface-alt)' }}
                />
              )}
            </div>
          </div>
        </div>

        <div
          className="grid grid-cols-2 gap-2 border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:gap-3 lg:px-6"
          style={{ borderColor: 'var(--menu-border)', backgroundColor: 'var(--menu-surface)' }}
        >
          <button
            type="button"
            onClick={onKeepShopping}
            className="inline-flex min-h-12 flex-col items-center justify-center rounded-[16px] px-2 text-center"
            style={{ backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text)' }}
          >
            <span className="inline-flex items-center gap-1 text-[13px] font-bold">
              <ArrowLeft className="h-4 w-4" />
              Seguir agregando
            </span>
            <span className="mt-0.5 text-[10px] font-medium" style={{ color: 'var(--menu-text-muted)' }}>
              Explora más del menú
            </span>
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={cartCount <= 0}
            className="inline-flex min-h-12 flex-col items-center justify-center rounded-[16px] px-2 text-center disabled:opacity-40"
            style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
          >
            <span className="inline-flex items-center gap-1 text-[13px] font-black">
              <ShoppingBag className="h-4 w-4" />
              Ir a pagar
            </span>
            <span className="mt-0.5 text-[10px] font-medium opacity-80">Continuar con el checkout</span>
          </button>
        </div>

        {configuring ? (
          <UpsellOptionConfigurator
            product={configuring}
            formatPrice={formatPrice}
            canAdd={canConfigure}
            onClose={() => setConfiguring(null)}
            onConfirm={(selection, quantity) => {
              onConfirmConfigured(configuring.id, selection, quantity);
              setConfiguring(null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
