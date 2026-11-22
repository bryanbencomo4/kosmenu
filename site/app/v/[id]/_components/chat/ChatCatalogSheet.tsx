'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent } from 'react';

import { ChatHorizontalScroller } from './ChatHorizontalScroller';
import { ChatThumbImage } from './ChatThumbImage';
import { findProductImageEl, flyToCart } from './chat-fly-to-cart';
import {
  CHAT_CATALOG_PAGE_SIZE,
  filterCatalogProducts,
  toChatProductCard,
} from './chat-catalog';
import type { ChatCatalogSnapshot } from './chat-catalog';
import type { ChatProductCardData } from './chat-types';

type ChatCatalogSheetProps = {
  open: boolean;
  onClose: () => void;
  catalog: ChatCatalogSnapshot | null;
  /** Show skeleton rows while the catalog is being fetched. */
  loading?: boolean;
  initialCategoryId?: string | null;
  initialQuery?: string;
  onConfigureProduct?: (productId: string) => void;
  onAddSimpleProduct?: (productId: string) => void;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ChatCatalogSheet(props: ChatCatalogSheetProps) {
  // Mount the body only while open so internal state (query/page) resets naturally.
  if (!props.open) return null;
  return <ChatCatalogSheetBody {...props} />;
}

function ChatCatalogSheetBody({
  onClose,
  catalog,
  loading = false,
  initialCategoryId = null,
  initialQuery = '',
  onConfigureProduct,
  onAddSimpleProduct,
}: ChatCatalogSheetProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState(initialQuery);
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [visible, setVisible] = useState(CHAT_CATALOG_PAGE_SIZE);
  const deferredQuery = useDeferredValue(query);

  // Restore focus to the opener on close. Focus the dialog shell (not the
  // search input) so mobile keyboards stay closed and products stay visible.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  const page = useMemo(() => {
    if (!catalog) return { items: [], total: 0, hasMore: false };
    return filterCatalogProducts(catalog, {
      categoryId,
      query: deferredQuery,
      offset: 0,
      limit: visible,
    });
  }, [catalog, categoryId, deferredQuery, visible]);

  const cards = useMemo<ChatProductCardData[]>(
    () => page.items.map(toChatProductCard),
    [page.items],
  );

  const loadMore = useCallback(() => {
    setVisible((v) => v + CHAT_CATALOG_PAGE_SIZE);
  }, []);

  const resetPaging = () => {
    setVisible(CHAT_CATALOG_PAGE_SIZE);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  // Infinite scroll via IntersectionObserver (button remains as fallback).
  useEffect(() => {
    if (!page.hasMore) return;
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root, rootMargin: '0px 0px 160px 0px' },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [page.hasMore, page.items.length, loadMore]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const categories = catalog?.categories ?? [];
  const isEmpty = !loading && page.total === 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4"
      data-chat-catalog-sheet="1"
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-label="Cerrar menú"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-black/50"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[var(--chat-card-border)] bg-[var(--chat-bg)] text-[var(--chat-text)] shadow-2xl outline-none sm:h-[min(42rem,85dvh)] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--chat-header-border)] bg-[var(--chat-header)] px-4 py-3">
          <h2 id={titleId} className="text-[16px] font-semibold">
            Nuestro menú
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            data-chat-catalog-close="1"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--chat-text-muted)] hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-send)] dark:hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="shrink-0 space-y-2 border-b border-[var(--chat-header-border)] bg-[var(--chat-header)] pb-2 pt-2">
          <div className="px-3">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPaging();
              }}
              placeholder="Buscar en el menú"
              aria-label="Buscar en el menú"
              enterKeyHint="search"
              autoComplete="off"
              className="w-full rounded-full border border-[var(--chat-card-border)] bg-[var(--chat-input)] px-4 py-2 text-[14px] text-[var(--chat-text)] outline-none placeholder:text-[var(--chat-text-muted)] focus:ring-2 focus:ring-[var(--chat-send)]"
            />
          </div>
          {categories.length > 0 ? (
            <ChatHorizontalScroller ariaLabel="Filtrar por categoría" snap={false}>
              <CategoryChip
                label="Todos"
                active={categoryId === null}
                onClick={() => {
                  setCategoryId(null);
                  resetPaging();
                }}
              />
              {categories.map((c) => (
                <CategoryChip
                  key={c.id}
                  label={c.name}
                  active={categoryId === c.id}
                  onClick={() => {
                    setCategoryId(c.id);
                    resetPaging();
                  }}
                />
              ))}
            </ChatHorizontalScroller>
          ) : null}
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
        >
          {loading ? (
            <ul className="space-y-2" aria-busy="true" aria-label="Cargando menú">
              {Array.from({ length: 6 }, (_, i) => (
                <li
                  key={i}
                  className="flex h-[76px] animate-pulse items-center gap-3 rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-2"
                >
                  <div className="h-[60px] w-[60px] rounded-lg bg-[var(--chat-input)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/3 rounded bg-[var(--chat-input)]" />
                    <div className="h-3 w-1/3 rounded bg-[var(--chat-input)]" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p
                className="px-1 pb-2 text-[12px] text-[var(--chat-text-muted)]"
                role="status"
                aria-live="polite"
              >
                {page.total === 1 ? '1 producto' : `${page.total} productos`}
              </p>
              {isEmpty ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <p className="text-[14px] font-semibold">Sin resultados</p>
                  <p className="text-[12px] text-[var(--chat-text-muted)]">
                    Prueba con otra palabra o elige otra categoría.
                  </p>
                  {query || categoryId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setCategoryId(null);
                        resetPaging();
                      }}
                      className="mt-1 rounded-full border border-[var(--chat-card-border)] bg-[var(--chat-card)] px-3 py-1.5 text-[12px] font-semibold"
                    >
                      Limpiar filtros
                    </button>
                  ) : null}
                </div>
              ) : (
                <ul className="space-y-2">
                  {cards.map((card) => (
                    <CatalogRow
                      key={card.product_id}
                      card={card}
                      onConfigure={onConfigureProduct}
                      onAddSimple={onAddSimpleProduct}
                    />
                  ))}
                </ul>
              )}
              {page.hasMore ? (
                <div ref={sentinelRef} className="flex justify-center py-3">
                  <button
                    type="button"
                    onClick={loadMore}
                    className="rounded-full border border-[var(--chat-card-border)] bg-[var(--chat-card)] px-4 py-2 text-[12px] font-semibold shadow-sm"
                  >
                    Cargar más
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-send)] ${
        active
          ? 'border-transparent bg-[var(--chat-send)] text-[var(--chat-send-fg)]'
          : 'border-[var(--chat-card-border)] bg-[var(--chat-card)] text-[var(--chat-text)]'
      }`}
    >
      {label}
    </button>
  );
}

function CatalogRow({
  card,
  onConfigure,
  onAddSimple,
}: {
  card: ChatProductCardData;
  onConfigure?: (productId: string) => void;
  onAddSimple?: (productId: string) => void;
}) {
  const canConfigure =
    card.available && card.requires_configuration && typeof onConfigure === 'function';
  const canAdd =
    card.available && !card.requires_configuration && typeof onAddSimple === 'function';
  const price =
    card.price_label ||
    (card.price_unit != null ? `${card.price_unit} ${card.currency}` : 'Ver precio');

  return (
    <li
      data-chat-catalog-row="1"
      data-chat-product-card={card.product_id}
      className={`flex items-center gap-3 rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-2 ${
        card.available ? '' : 'opacity-70'
      }`}
    >
      <div className="h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-[var(--chat-input)]">
        <ChatThumbImage
          src={card.image_url}
          sourceUrl={card.image_source_url || card.image_url}
          fallbackLetter={card.name}
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[14px] font-semibold leading-snug">{card.name}</h3>
        {card.description ? (
          <p className="line-clamp-1 text-[12px] leading-snug text-[var(--chat-text-muted)]">
            {card.description}
          </p>
        ) : null}
        <p className="mt-0.5 text-[13px] font-semibold tabular-nums">{price}</p>
      </div>
      {canConfigure ? (
        <button
          type="button"
          data-chat-configure={card.product_id}
          onClick={() => onConfigure?.(card.product_id)}
          className="shrink-0 rounded-full bg-[var(--chat-send)] px-3 py-1.5 text-[12px] font-semibold text-[var(--chat-send-fg)] active:opacity-90"
        >
          Opciones
        </button>
      ) : canAdd ? (
        <button
          type="button"
          aria-label={`Agregar ${card.name}`}
          data-chat-add-simple={card.product_id}
          onClick={(e) => {
            void flyToCart({
              source: findProductImageEl(e.currentTarget),
              imageUrl: card.image_url,
            });
            onAddSimple?.(card.product_id);
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--chat-send)] text-[20px] font-semibold leading-none text-[var(--chat-send-fg)] active:opacity-90"
        >
          +
        </button>
      ) : !card.available ? (
        <span className="shrink-0 text-[11px] font-medium text-amber-600 dark:text-amber-300">
          No disponible
        </span>
      ) : null}
    </li>
  );
}
