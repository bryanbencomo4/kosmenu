'use client';

import { Caveat, Manrope } from 'next/font/google';
import { ArrowLeft, ArrowRight, Plus, Search, ShoppingBag, SlidersHorizontal, Star, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { KioskDecor, KioskMotionStyles } from './KioskDecor';
import { KioskHome } from './KioskHome';
import { KioskImage } from './KioskImage';
import { KioskTopBar } from './KioskTopBar';
import { KioskVoucher } from './KioskVoucher';
import { useLockBodyScroll } from '../../../../_lib/use-lock-body-scroll';
import { foldSearchText } from '../../../../_lib/search-text';
import { useKioskPageChrome } from './useKioskPageChrome';
import {
  FULFILLMENT_LABEL,
  type KioskCategory,
  type KioskFulfillment,
  type KioskProduct,
  type KioskScreen,
  type KioskVoucherData,
} from './kiosk-types';
import { DEFAULT_KIOSK_HOME_CONFIG, type KioskHomeConfig } from '../../../../_lib/kiosk-home-config';
import type { MenuThemeMode } from '../../_lib/menu-theme';

const hintFont = Caveat({
  subsets: ['latin'],
  weight: ['500', '600'],
});

const titleFont = Manrope({
  subsets: ['latin'],
  weight: ['700', '800'],
});

type KioskMenuExperienceProps = {
  businessName: string;
  logoUrl: string | null;
  ratingAverage: number;
  ratingCount: number;
  initialLetter: string;
  locationLabel: string | null;
  socialLinks?: Array<{ network: string; href: string }>;
  tagline?: string | null;
  isOpen: boolean;
  openCaption: string;
  closedCaption: string;
  supportsDelivery: boolean;
  homeConfig?: KioskHomeConfig;
  fulfillment: KioskFulfillment | null;
  onSelectFulfillment: (fulfillment: KioskFulfillment) => void;
  onResetFulfillment: () => void;
  categories: KioskCategory[];
  productsByCategory: Record<string, KioskProduct[]>;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  cartCount: number;
  cartTotalLabel: string;
  onAddProduct: (productId: string) => void;
  onPay: () => void;
  payCtaLabel?: string;
  addedPrompt: { productName: string } | null;
  onContinueAdding: () => void;
  onPayFromPrompt: () => void;
  voucher: KioskVoucherData | null;
  onTrackVoucher: () => void;
  onNewOrder: () => void;
  tickerEntries: string[];
  currencies: string[];
  selectedCurrency: string;
  onSelectCurrency: (currency: string) => void;
  themeMode: MenuThemeMode;
  onToggleTheme: () => void;
  stickyOffsetClass?: string;
};

export function KioskMenuExperience({
  businessName,
  logoUrl,
  ratingAverage,
  ratingCount,
  initialLetter,
  locationLabel,
  socialLinks,
  tagline,
  isOpen,
  openCaption,
  closedCaption,
  supportsDelivery,
  homeConfig = DEFAULT_KIOSK_HOME_CONFIG,
  fulfillment,
  onSelectFulfillment,
  onResetFulfillment,
  categories,
  productsByCategory,
  searchQuery,
  onSearchChange,
  cartCount,
  cartTotalLabel,
  onAddProduct,
  onPay,
  payCtaLabel = 'Ir a pagar',
  addedPrompt,
  onContinueAdding,
  onPayFromPrompt,
  voucher,
  onTrackVoucher,
  onNewOrder,
  tickerEntries,
  currencies,
  selectedCurrency,
  onSelectCurrency,
  themeMode,
  onToggleTheme,
  stickyOffsetClass,
}: KioskMenuExperienceProps) {
  const browseOnly = !fulfillment || !isOpen;
  useLockBodyScroll(Boolean(addedPrompt && !browseOnly));
  const [screen, setScreen] = useState<KioskScreen>(fulfillment ? 'categories' : 'home');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (!fulfillment) return;
    setScreen((current) => (current === 'home' ? 'categories' : current));
  }, [fulfillment]);

  useEffect(() => {
    const whatsappUrl = voucher?.whatsappUrl?.trim();
    if (!whatsappUrl || !voucher?.orderId || typeof window === 'undefined') return;

    const openedKey = `elmenuxfa:order-wa-auto-opened:${voucher.orderId}`;
    try {
      if (window.sessionStorage.getItem(openedKey) === '1') return;
    } catch {
      // Continue with the one-time automatic attempt if storage is unavailable.
    }

    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(openedKey, '1');
      } catch {
        // The voucher remains available even when storage is unavailable.
      }
      window.location.assign(whatsappUrl);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [voucher?.orderId, voucher?.whatsappUrl]);

  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? null;
  const activeProducts = activeCategoryId ? productsByCategory[activeCategoryId] ?? [] : [];

  const visibleCategories = useMemo(() => {
    const query = foldSearchText(searchQuery);
    if (!query || screen !== 'categories') return categories;
    return categories.filter((category) => foldSearchText(category.name).includes(query));
  }, [categories, searchQuery, screen]);

  const visibleProducts = useMemo(() => {
    const query = foldSearchText(searchQuery);
    if (!query || screen !== 'products') return activeProducts;
    return activeProducts.filter((product) => {
      const haystack = foldSearchText(`${product.name} ${product.description}`);
      return haystack.includes(query);
    });
  }, [activeProducts, searchQuery, screen]);

  useKioskPageChrome({ themeMode });
  const topBar = (
    <KioskTopBar
      tickerEntries={tickerEntries}
      currencies={currencies}
      selectedCurrency={selectedCurrency}
      onSelectCurrency={onSelectCurrency}
    />
  );
  const stickyChromeClass = `sticky z-40 ${stickyOffsetClass ?? 'top-0'}`;

  if (voucher) {
    return (
      <KioskVoucher
        voucher={voucher}
        businessName={businessName}
        logoUrl={logoUrl}
        initialLetter={initialLetter}
        onTrack={onTrackVoucher}
        onNewOrder={() => {
          setScreen('home');
          setActiveCategoryId(null);
          onNewOrder();
        }}
      />
    );
  }

  if (!fulfillment && screen === 'home') {
    return (
      <div className="relative flex h-[100svh] max-h-[100svh] flex-col overflow-hidden bg-[var(--menu-background)] text-[var(--menu-text)]">
        <div className={stickyChromeClass}>{topBar}</div>
        <KioskHome
          businessName={businessName}
          logoUrl={logoUrl}
          ratingAverage={ratingAverage}
          ratingCount={ratingCount}
          initialLetter={initialLetter}
          isOpen={isOpen}
          closedCaption={closedCaption}
          openCaption={openCaption}
          locationLabel={locationLabel}
          socialLinks={socialLinks}
          tagline={tagline}
          supportsDelivery={supportsDelivery}
          homeConfig={homeConfig}
          themeMode={themeMode}
          onToggleTheme={onToggleTheme}
          onSelect={(next) => {
            onSelectFulfillment(next);
            onSearchChange('');
            setActiveCategoryId(null);
            setScreen('categories');
          }}
          onBrowseMenu={() => {
            onSearchChange('');
            setActiveCategoryId(null);
            setScreen('categories');
          }}
        />
      </div>
    );
  }

  return (
    <section className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-[var(--menu-background)] text-[var(--menu-text)]">
      <KioskDecor density="lite" />
      <KioskMotionStyles />
      <div className={stickyChromeClass}>
        {topBar}
        <header className="bg-[color-mix(in_srgb,var(--menu-background)_88%,var(--menu-surface))] px-5 py-3 backdrop-blur-[6px]">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
          <button
            type="button"
            onClick={() => {
              onSearchChange('');
              if (screen === 'products') {
                setScreen('categories');
                setActiveCategoryId(null);
                return;
              }
              setScreen('home');
              setActiveCategoryId(null);
              if (fulfillment) onResetFulfillment();
            }}
            className="grid h-11 w-11 place-items-center rounded-[14px] bg-[var(--menu-surface)] text-[var(--menu-text)] shadow-[var(--menu-shadow)]"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--menu-text-muted)]">
              {fulfillment ? FULFILLMENT_LABEL[fulfillment] : 'Solo consulta'}
            </p>
            <h2 className={`${titleFont.className} truncate text-lg font-extrabold tracking-[-0.03em] text-[var(--menu-text)]`}>
              {screen === 'products' ? activeCategory?.name || 'Productos' : 'Categorías'}
            </h2>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[var(--menu-text-muted)]" aria-label={
              ratingCount > 0
                ? `Calificación ${ratingAverage.toFixed(1)} de 5, ${ratingCount} calificaciones`
                : 'Este comercio aún no tiene calificaciones'
            }>
              <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
              {ratingCount > 0
                ? <><span className="text-[var(--menu-text)]">{ratingAverage.toFixed(1)}</span><span aria-hidden="true">·</span>{ratingCount} {ratingCount === 1 ? 'calificación' : 'calificaciones'}</>
                : 'Aún sin calificaciones'}
            </p>
          </div>
          {logoUrl ? (
            <KioskImage
              src={logoUrl}
              alt=""
              className="h-11 w-11 rounded-[14px] bg-[var(--menu-surface)] shadow-[var(--menu-shadow)]"
            />
          ) : (
            <div
              className="grid h-11 w-11 place-items-center rounded-[14px] text-sm font-extrabold"
              style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
            >
              {initialLetter}
            </div>
          )}
        </div>
        <label className="mx-auto mt-3 flex h-12 w-full max-w-5xl items-center gap-2 rounded-[18px] bg-[var(--menu-surface)] px-3.5 text-[var(--menu-text)] shadow-[var(--menu-shadow)]">
          <Search className="h-4 w-4 text-[var(--menu-text-muted)]" />
          <input
            id="kiosk-menu-search"
            name="kiosk-menu-search"
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={screen === 'products' ? 'Buscar producto' : 'Buscar categoría'}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-[var(--menu-text-muted)]"
          />
          {searchQuery ? (
            <button type="button" onClick={() => onSearchChange('')} aria-label="Limpiar busqueda">
              <X className="h-4 w-4 text-[var(--menu-text-muted)]" />
            </button>
          ) : null}
        </label>
      </header>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-5 py-4 pb-36">
        <p
          className={`${hintFont.className} kiosk-enter mb-4 text-[22px] font-semibold sm:text-[26px]`}
          style={{ color: 'color-mix(in srgb, var(--menu-primary) 72%, var(--menu-text))' }}
        >
          {browseOnly
            ? isOpen
              ? 'Solo consulta. Para pedir, vuelve y elige cómo lo quieres.'
              : 'Estamos cerrados. Puedes ver el menú y pedir cuando abramos.'
            : screen === 'products'
              ? 'Arma tu pedido a tu ritmo.'
              : '¿Qué se te antoja hoy?'}
        </p>

        {screen === 'categories' ? (
          visibleCategories.length === 0 ? (
            <EmptyState message="No hay categorías con esa búsqueda." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visibleCategories.map((category, index) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setActiveCategoryId(category.id);
                    onSearchChange('');
                    setScreen('products');
                  }}
                  className="kiosk-card overflow-hidden rounded-[22px] bg-[var(--menu-surface)] text-left shadow-[var(--menu-shadow)] transition duration-200 ease-out hover:-translate-y-0.5"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <div className="relative aspect-[4/3] bg-[var(--menu-surface-alt)]">
                    {category.coverUrl ? (
                      <KioskImage src={category.coverUrl} alt="" className="h-full w-full" />
                    ) : (
                      <div className="grid h-full place-items-center text-5xl">{category.glyph}</div>
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-[color-mix(in_srgb,var(--menu-surface)_92%,transparent)] px-2 py-1 text-[11px] font-semibold text-[var(--menu-text-muted)]">
                      {category.productCount}
                    </span>
                  </div>
                  <div className="px-3 py-3">
                    <p className={`${titleFont.className} text-sm font-extrabold leading-5 text-[var(--menu-text)]`}>
                      {category.name}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : visibleProducts.length === 0 ? (
          <EmptyState message="No hay productos con esa búsqueda." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visibleProducts.map((product, index) => (
              <button
                key={product.id}
                type="button"
                aria-label={browseOnly ? product.name : `Ver detalles de ${product.name}`}
                onClick={() => {
                  if (browseOnly) return;
                  onAddProduct(product.id);
                }}
                className={`kiosk-card flex w-full overflow-hidden rounded-[22px] bg-[var(--menu-surface)] text-left shadow-[var(--menu-shadow)] ${
                  browseOnly
                    ? 'cursor-default'
                    : 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--menu-primary)]'
                }`}
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div className="h-32 w-32 shrink-0 bg-[var(--menu-surface-alt)] sm:h-36 sm:w-36">
                  {product.imageUrl ? (
                    <KioskImage src={product.imageUrl} alt={product.name} className="h-full w-full" />
                  ) : (
                    <div className="grid h-full place-items-center text-3xl">{activeCategory?.glyph || '🍽️'}</div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between p-3.5">
                  <div>
                    <h3 className={`${titleFont.className} text-base font-extrabold leading-5 text-[var(--menu-text)]`}>
                      {product.name}
                    </h3>
                    {product.description ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-4 text-[var(--menu-text-muted)]">{product.description}</p>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {product.optionsSummary ? (
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--menu-text)]">{product.priceLabel}</p>
                        <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--menu-text-muted)]">
                          {product.optionsSummary}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm font-bold text-[var(--menu-text)]">{product.priceLabel}</p>
                    )}
                    {!browseOnly ? (
                      <span
                        className={`inline-flex shrink-0 items-center justify-center rounded-[14px] font-bold ${
                          product.available
                            ? 'h-10 w-10 sm:h-auto sm:min-h-10 sm:w-auto sm:gap-1.5 sm:px-3.5 sm:py-2 sm:text-xs'
                            : 'min-h-10 px-2.5 py-2 text-[10px] sm:px-3.5 sm:text-xs'
                        }`}
                        style={{
                          backgroundColor: 'var(--menu-primary)',
                          color: 'var(--menu-on-primary)',
                          opacity: product.available ? 1 : 0.55,
                        }}
                      >
                        {product.available ? (
                          product.optionsSummary ? (
                            <SlidersHorizontal className="h-4 w-4" strokeWidth={2.4} />
                          ) : (
                            <Plus className="h-4 w-4" strokeWidth={2.5} />
                          )
                        ) : null}
                        <span className={product.available ? 'hidden sm:inline' : undefined}>
                          {!product.available ? 'No disponible' : product.optionsSummary ? 'Elegir' : 'Agregar'}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {cartCount > 0 && !browseOnly ? (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3 rounded-[22px] bg-[var(--menu-surface)] px-4 py-3 shadow-[var(--menu-shadow)]">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--menu-text-muted)]">Tu pedido</p>
              <p className={`${titleFont.className} truncate text-lg font-extrabold text-[var(--menu-text)]`}>
                {cartCount} {cartCount === 1 ? 'item' : 'items'} · {cartTotalLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={onPay}
              className="inline-flex min-h-12 items-center gap-2 rounded-[16px] px-5 text-sm font-bold"
              style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
            >
              {payCtaLabel === 'Siguiente' ? (
                <ArrowRight className="h-4 w-4" />
              ) : (
                <ShoppingBag className="h-4 w-4" />
              )}
              {payCtaLabel}
            </button>
          </div>
        </div>
      ) : null}

      {addedPrompt && !browseOnly ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[22px] bg-[var(--menu-surface)] p-5 text-[var(--menu-text)] shadow-[var(--menu-shadow)]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--menu-text-muted)]">Agregado</p>
            <h3 className={`${titleFont.className} mt-2 text-2xl font-extrabold tracking-[-0.04em]`}>
              {addedPrompt.productName}
            </h3>
            <p
              className={`${hintFont.className} mt-2 text-[22px] font-semibold leading-7`}
              style={{ color: 'color-mix(in srgb, var(--menu-primary) 72%, var(--menu-text))' }}
            >
              ¿Seguimos armando el pedido o vamos a pagar?
            </p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={onPayFromPrompt}
                className="min-h-12 rounded-[16px] text-sm font-bold"
                style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
              >
                Ir a pagar
              </button>
              <button
                type="button"
                onClick={onContinueAdding}
                className="min-h-12 rounded-[16px] bg-[var(--menu-surface-alt)] text-sm font-bold text-[var(--menu-text-muted)]"
              >
                Seguir agregando
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="grid min-h-[36vh] place-items-center rounded-[22px] bg-[var(--menu-surface)] px-6 text-center text-sm font-medium text-[var(--menu-text-muted)] shadow-[var(--menu-shadow)]">
      {message}
    </div>
  );
}
