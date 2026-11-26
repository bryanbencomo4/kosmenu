'use client';

import { LayoutGrid } from 'lucide-react';
import { createPortal } from 'react-dom';
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
            className={`flex w-[172px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] text-left shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition active:opacity-90 ${
              p.available ? '' : 'opacity-75'
            }`}
            data-business-menu-product={p.id}
          >
            <span className="relative block aspect-square w-full bg-[var(--chat-input)]">
              <ChatThumbImage
                src={p.imageUrl}
                sourceUrl={p.imageUrl}
                priority={index < 2}
                fallbackLetter={p.name}
              />
              {!p.available ? (
                <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10.5px] font-semibold text-white">
                  Agotado
                </span>
              ) : null}
            </span>
            <span className="flex flex-1 flex-col px-3 pb-2.5 pt-2.5">
              <span className="line-clamp-2 min-h-[2.5em] text-[14px] font-semibold leading-[1.25] text-[var(--chat-text)]">
                {p.name}
              </span>
              <span className="mt-1 text-[13px] tabular-nums text-[var(--chat-text-muted)]">
                {priceLabel(p) || 'Sin precio'}
              </span>
            </span>
            <span className="flex h-11 items-center justify-center border-t border-[var(--chat-card-border)] text-[14px] font-medium text-[var(--chat-send)]">
              Gestionar
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
            className="flex w-[120px] shrink-0 snap-start flex-col items-center justify-center gap-2 self-stretch rounded-2xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] px-2 text-center shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
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
  // Host for the manage sheet: the assistant root (carries the theme variables).
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const hostProbeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setPortalHost(
      (hostProbeRef.current?.closest('[data-business-assistant="1"]') as HTMLElement | null) ?? document.body,
    );
  }, []);

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
    <div ref={hostProbeRef} className="mt-1.5 w-full max-w-[min(100%,28rem)]" data-business-menu-view="1">
      {/* Category jump rail */}
      <ChatHorizontalScroller ariaLabel="Categorías del menú" snap={false} className="py-1">
        {categories.map((c, index) => (
          <button
            key={c.id}
            type="button"
            onClick={() => scrollToCategory(c.id)}
            className="flex w-[148px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] text-left shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition active:opacity-90"
            aria-label={`${c.name}, ${c.productCount} productos`}
          >
            <span className="relative block aspect-[4/3] w-full bg-[var(--chat-input)]">
              <ChatThumbImage
                src={c.imageUrl}
                sourceUrl={c.imageUrl}
                priority={index < 3}
                fallbackLetter={c.name}
                className="h-full w-full object-cover"
              />
            </span>
            <span className="flex flex-1 flex-col px-3 pb-2.5 pt-2.5">
              <span className="line-clamp-2 min-h-[2.5em] text-[14px] font-semibold leading-[1.25] text-[var(--chat-text)]">
                {c.name}
              </span>
              <span className="mt-1 text-[12.5px] text-[var(--chat-text-muted)]">
                {c.productCount} {c.productCount === 1 ? 'producto' : 'productos'}
              </span>
            </span>
            <span className="flex h-10 items-center justify-center border-t border-[var(--chat-card-border)] text-[14px] font-medium text-[var(--chat-send)]">
              Ver productos
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

      {managing && portalHost
        ? createPortal(
            // Rendered at the assistant root (not inside the chat bubble): bubbles have transforms /
            // overflow that would trap a `fixed` sheet and leave it under the composer.
            <div
              className="fixed inset-0 z-[95] flex items-end justify-center"
              role="dialog"
              aria-modal="true"
              aria-label={managing.name}
              data-business-manage-sheet="1"
            >
              <button
                type="button"
                aria-label="Cerrar"
                className="absolute inset-0 bg-black/45"
                onClick={() => setManaging(null)}
              />
              <div className="relative z-10 w-full max-w-md pb-[env(safe-area-inset-bottom)] [animation:chat-sheet-in_180ms_ease-out]">
                <BusinessProductManageCard
                  sheet
                  product={managing}
                  onClose={() => setManaging(null)}
                  onAction={(text) => {
                    setManaging(null);
                    onAction(text);
                  }}
                />
              </div>
            </div>,
            portalHost,
          )
        : null}
    </div>
  );
}
