'use client';

import { LayoutGrid } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ChatHorizontalScroller } from '../v/[id]/_components/chat/ChatHorizontalScroller';
import { ChatThumbImage } from '../v/[id]/_components/chat/ChatThumbImage';
import {
  BusinessProductManageCard,
  type BusinessManageProduct,
} from './BusinessProductManageCard';

export type BusinessMenuProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  available: boolean;
  categoryId: string | null;
  imageUrl: string | null;
};

export type BusinessMenuCategory = {
  id: string;
  name: string;
  imageUrl: string | null;
  productCount: number;
  availableCount: number;
};

export type BusinessMenuViewData = {
  currency: string;
  categories: BusinessMenuCategory[];
  products: BusinessMenuProduct[];
};

const PAGE = 8;

function priceLabel(p: BusinessMenuProduct): string | null {
  if (p.price == null || !Number.isFinite(p.price)) return null;
  const code = (p.currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: code === 'BS' ? 'VES' : code,
      maximumFractionDigits: 2,
    }).format(p.price);
  } catch {
    return `${p.price} ${code}`;
  }
}

function productsForCategory(
  menu: BusinessMenuViewData,
  categoryId: string,
): BusinessMenuProduct[] {
  return menu.products.filter((p) =>
    categoryId === '_none' ? !p.categoryId : p.categoryId === categoryId,
  );
}

/** Lazy-mount section when near viewport (keeps many categories cheap). */
function LazySection({
  children,
  minHeight = 168,
}: {
  children: ReactNode;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: '240px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ minHeight: active ? undefined : minHeight }}>
      {active ? children : null}
    </div>
  );
}

function ProductRail({
  products,
  onPick,
  onSeeAll,
}: {
  products: BusinessMenuProduct[];
  onPick: (p: BusinessMenuProduct) => void;
  onSeeAll?: () => void;
}) {
  const [visible, setVisible] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const slice = products.slice(0, visible);
  const hasMore = visible < products.length;

  const loadMore = useCallback(() => {
    setVisible((v) => Math.min(products.length, v + PAGE));
  }, [products.length]);

  useEffect(() => {
    setVisible(PAGE);
  }, [products]);

  useEffect(() => {
    if (!hasMore) return;
    const root = rootRef.current?.querySelector('[data-chat-h-scroll="1"]');
    const target = sentinelRef.current;
    if (!root || !target || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root, rootMargin: '0px 120px 0px 0px', threshold: 0.01 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [hasMore, slice.length, loadMore]);

  if (products.length === 0) return null;

  return (
    <div ref={rootRef} data-business-product-rail="1">
      <ChatHorizontalScroller ariaLabel="Productos de la categoría" snap={false}>
        {slice.map((p, index) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className={`flex w-[156px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] text-left shadow-sm transition active:scale-[0.98] ${
              p.available ? '' : 'opacity-70'
            }`}
            data-business-menu-product={p.id}
          >
            <span className="relative h-[96px] w-full bg-[var(--chat-input)]">
              <ChatThumbImage
                src={p.imageUrl}
                sourceUrl={p.imageUrl}
                priority={index < 2}
                fallbackLetter={p.name}
              />
              {!p.available ? (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                  Agotado
                </span>
              ) : null}
            </span>
            <span className="flex flex-1 flex-col p-2">
              <span className="line-clamp-1 text-[12.5px] font-semibold text-[var(--chat-text)]">
                {p.name}
              </span>
              <span className="mt-1 text-[12.5px] font-semibold tabular-nums text-[var(--chat-text)]">
                {priceLabel(p) || '—'}
              </span>
              <span className="mt-1.5 text-[11px] font-medium text-[var(--chat-send)]">
                Gestionar
              </span>
            </span>
          </button>
        ))}
        {hasMore ? (
          <div
            ref={sentinelRef}
            className="flex w-10 shrink-0 items-center justify-center self-stretch text-[11px] text-[var(--chat-text-muted)]"
            aria-hidden
          >
            …
          </div>
        ) : null}
        {onSeeAll ? (
          <button
            type="button"
            onClick={onSeeAll}
            className="flex w-[112px] shrink-0 snap-start flex-col items-center justify-center gap-2 self-stretch rounded-xl border border-[var(--chat-card-border)] bg-[color-mix(in_srgb,var(--chat-send)_12%,var(--chat-card))] px-2 text-center shadow-sm"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--chat-send)] text-[var(--chat-send-fg)]">
              <LayoutGrid className="h-5 w-5" strokeWidth={2.1} />
            </span>
            <span className="text-[12px] font-semibold text-[var(--chat-text)]">Ver todos</span>
          </button>
        ) : null}
      </ChatHorizontalScroller>
    </div>
  );
}

type BusinessMenuViewProps = {
  menu: BusinessMenuViewData;
  onAction: (text: string) => void;
};

export function BusinessMenuView({ menu, onAction }: BusinessMenuViewProps) {
  const [focusCategoryId, setFocusCategoryId] = useState<string | null>(null);
  const [managing, setManaging] = useState<BusinessManageProduct | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const categories = menu.categories;

  const focusedProducts = useMemo(() => {
    if (!focusCategoryId) return null;
    return productsForCategory(menu, focusCategoryId);
  }, [focusCategoryId, menu]);

  const pickProduct = (p: BusinessMenuProduct) => {
    setManaging({
      id: p.id,
      name: p.name,
      priceLabel: priceLabel(p),
      available: p.available,
      imageUrl: p.imageUrl,
    });
  };

  const scrollToCategory = (id: string) => {
    setFocusCategoryId(null);
    requestAnimationFrame(() => {
      sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  if (categories.length === 0) {
    return (
      <div className="mt-1.5 max-w-[min(92%,22rem)] rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-3 text-[12px] text-[var(--chat-text-muted)]">
        Sin categorías todavía. Usa <strong>➕ Producto</strong> abajo.
      </div>
    );
  }

  return (
    <div className="mt-1.5 w-full max-w-[min(100%,28rem)]" data-business-menu-view="1">
      {/* Category jump rail */}
      <ChatHorizontalScroller ariaLabel="Categorías del menú" snap={false} className="py-1">
        {categories.map((c, index) => (
          <button
            key={c.id}
            type="button"
            onClick={() => scrollToCategory(c.id)}
            className="relative aspect-[3/4] w-[108px] shrink-0 overflow-hidden rounded-2xl bg-[var(--chat-input)] text-left shadow-md active:scale-[0.97]"
            aria-label={`${c.name}, ${c.productCount} productos`}
          >
            <span className="absolute inset-0">
              <ChatThumbImage
                src={c.imageUrl}
                sourceUrl={c.imageUrl}
                priority={index < 3}
                fallbackLetter={c.name}
                className="h-full w-full object-cover"
              />
            </span>
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black/75 via-black/35 to-transparent" />
            <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {c.productCount}
            </span>
            <span className="pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-2 pt-5">
              <span className="line-clamp-2 text-[12px] font-semibold text-white">{c.name}</span>
            </span>
          </button>
        ))}
      </ChatHorizontalScroller>

      {focusCategoryId && focusedProducts ? (
        <div className="mt-2 rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-2 shadow-sm">
          <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
            <p className="text-[13px] font-semibold text-[var(--chat-text)]">
              {categories.find((c) => c.id === focusCategoryId)?.name || 'Categoría'}
            </p>
            <button
              type="button"
              className="text-[12px] font-medium text-[var(--chat-send)]"
              onClick={() => setFocusCategoryId(null)}
            >
              Ver todas
            </button>
          </div>
          <ProductRail products={focusedProducts} onPick={pickProduct} />
        </div>
      ) : (
        <div className="mt-1 space-y-3">
          {categories.map((c) => {
            const products = productsForCategory(menu, c.id);
            return (
              <LazySection key={c.id}>
                <section
                  ref={(el) => {
                    sectionRefs.current[c.id] = el;
                  }}
                  data-business-menu-category={c.id}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 px-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[var(--chat-text)]">
                        {c.name}
                      </p>
                      <p className="text-[11px] text-[var(--chat-text-muted)]">
                        {c.availableCount}/{c.productCount} disponibles
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFocusCategoryId(c.id)}
                      className="shrink-0 rounded-full border border-[var(--chat-card-border)] bg-[var(--chat-card)] px-3 py-1 text-[12px] font-semibold text-[var(--chat-text)]"
                    >
                      Ver
                    </button>
                  </div>
                  <ProductRail
                    products={products}
                    onPick={pickProduct}
                    onSeeAll={() => setFocusCategoryId(c.id)}
                  />
                </section>
              </LazySection>
            );
          })}
        </div>
      )}

      {managing ? (
        <BusinessProductManageCard
          product={managing}
          onClose={() => setManaging(null)}
          onAction={(text) => {
            setManaging(null);
            onAction(text);
          }}
        />
      ) : null}
    </div>
  );
}
