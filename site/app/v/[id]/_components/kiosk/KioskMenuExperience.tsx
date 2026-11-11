'use client';

import { ArrowLeft, ArrowRight, Package, Plus, Search, ShoppingBag, SlidersHorizontal, Star, X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { KioskDecor, KioskMotionStyles } from './KioskDecor';
import { KioskHome } from './KioskHome';
import { KioskImage } from './KioskImage';
import { KioskTopBar } from './KioskTopBar';
import { KioskVoucher } from './KioskVoucher';
import { useLockBodyScroll } from '../../../../_lib/use-lock-body-scroll';
import { foldSearchText } from '../../../../_lib/search-text';
import { handleWhatsAppLinkClick } from '../../../../_lib/whatsapp-href';
import { useKioskPageChrome } from './useKioskPageChrome';
import {
  CHECKOUT_FULFILLMENT_SHORT_LABEL,
  FULFILLMENT_LABEL,
  type KioskCategory,
  type KioskFulfillment,
  type KioskProduct,
  type KioskScreen,
  type KioskVoucherData,
} from './kiosk-types';
import { DEFAULT_KIOSK_HOME_CONFIG, type KioskHomeConfig } from '../../../../_lib/kiosk-home-config';
import { parseCategoryUpsellKind } from '../../../../_lib/pre-checkout-upsell';
import type { MenuThemeMode } from '../../_lib/menu-theme';

/** Cap hero slides — keeps home bandwidth tiny (next slide loads only after current is ready). */
const MAX_HOME_HERO_IMAGES = 5;

function isMainCategoryRole(role: string | null | undefined) {
  return parseCategoryUpsellKind(role) === null;
}

function collectCategoryProductImages(
  cats: KioskCategory[],
  productsByCategory: Record<string, KioskProduct[]>,
  limit: number,
) {
  const out: Array<{ imageUrl: string; imageSourceUrl: string }> = [];
  const seen = new Set<string>();
  for (const category of cats) {
    for (const product of productsByCategory[category.id] ?? []) {
      const imageUrl = (product.imageUrl ?? '').trim();
      if (!imageUrl || seen.has(imageUrl)) continue;
      seen.add(imageUrl);
      out.push({
        imageUrl,
        imageSourceUrl: (product.imageSourceUrl ?? product.imageUrl ?? '').trim() || imageUrl,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export type KioskMenuShellHandle = {
  /** Browser/system back: pop products → categories → home. Returns true if handled. */
  handleBack: () => boolean;
  /** Synthetic history depth for this shell (0 at session root). */
  historyDepth: () => number;
  /** Jump to categories so the guest can keep building the cart. */
  openCategories: () => void;
};

type KioskMenuExperienceProps = {
  businessName: string;
  logoUrl: string | null;
  ratingAverage: number;
  ratingCount: number;
  initialLetter: string;
  locationLabel: string | null;
  operatingStateLabels?: string[];
  socialLinks?: Array<{ network: string; href: string }>;
  /** Digits-only WhatsApp for chat links (e.g. 58412...). */
  whatsappNumber?: string | null;
  tagline?: string | null;
  isOpen: boolean;
  openCaption: string;
  closedCaption: string;
  /** Raw `comercio.horarios` for the home status badge sheet. */
  businessHours?: unknown;
  supportsDelivery: boolean;
  homeConfig?: KioskHomeConfig;
  paymentGroups?: Array<{
    currency: string;
    methods: Array<{ id: string; label: string; details: string }>;
  }>;
  fulfillment: KioskFulfillment | null;
  catalogMode?: boolean;
  /** Mesa QR (?catalogo=1): hide fulfillment actions on home. */
  catalogOnlySession?: boolean;
  /** Waiter mode: skip home picker, stay on dine-in categories. */
  assistedMode?: boolean;
  onSelectFulfillment: (fulfillment: KioskFulfillment) => void;
  onResetFulfillment: () => void;
  onEnterCatalog: () => void;
  onLeaveCatalog: () => void;
  directionsUrl?: string | null;
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
  onHistoryDepthChange?: (depth: number) => void;
};

function kioskSessionLocksHome(options: {
  assistedMode: boolean;
  catalogOnlySession?: boolean;
  catalogMode?: boolean;
}) {
  // Mesa QR still shows the branded home first; only waiter mode skips it.
  return options.assistedMode;
}

function kioskScreenHistoryDepth(
  screen: KioskScreen,
  options: {
    assistedMode: boolean;
    catalogOnlySession: boolean;
    catalogMode: boolean;
  },
) {
  const locksHome = kioskSessionLocksHome(options);
  if (screen === 'products') return locksHome ? 1 : 2;
  if (screen === 'categories') return locksHome ? 0 : 1;
  return 0;
}

export const KioskMenuExperience = forwardRef<
  KioskMenuShellHandle,
  KioskMenuExperienceProps
>(function KioskMenuExperience(
  {
    businessName,
    logoUrl,
    ratingAverage,
    ratingCount,
    initialLetter,
    locationLabel,
    operatingStateLabels = [],
    socialLinks,
    whatsappNumber = null,
    tagline,
    isOpen,
    openCaption,
    closedCaption,
    businessHours = null,
    supportsDelivery,
    homeConfig = DEFAULT_KIOSK_HOME_CONFIG,
    paymentGroups = [],
    fulfillment,
    catalogMode = false,
    catalogOnlySession = false,
    assistedMode = false,
    onSelectFulfillment,
    onResetFulfillment,
    onEnterCatalog,
    onLeaveCatalog,
    directionsUrl = null,
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
    onHistoryDepthChange,
  },
  ref,
) {
  const hasOrderMode =
    homeConfig.comerAqui ||
    homeConfig.paraLlevar ||
    (homeConfig.delivery && supportsDelivery);
  // Fulfillment is chosen while assembling the order, so an open menu can be ordered
  // before a mode is selected. Closed, catalog-locked, or mode-less menus stay view-only.
  const browseOnly = !assistedMode && !catalogMode && (!isOpen || !hasOrderMode);
  useLockBodyScroll(Boolean(addedPrompt && !browseOnly));
  const [screen, setScreen] = useState<KioskScreen>(
    assistedMode || fulfillment ? 'categories' : 'home',
  );
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const sessionOpts = {
    assistedMode,
    catalogOnlySession,
    catalogMode,
  };

  function goBackInShell() {
    onSearchChange('');
    if (screen === 'products') {
      setScreen('categories');
      setActiveCategoryId(null);
      return true;
    }
    if (screen !== 'categories') {
      return false;
    }
    if (assistedMode) {
      return false;
    }
    setScreen('home');
    setActiveCategoryId(null);
    if (fulfillment) onResetFulfillment();
    if (catalogMode) onLeaveCatalog();
    return true;
  }

  useImperativeHandle(
    ref,
    () => ({
      handleBack: goBackInShell,
      historyDepth: () => kioskScreenHistoryDepth(screen, sessionOpts),
      openCategories: () => {
        onSearchChange('');
        setActiveCategoryId(null);
        setScreen('categories');
      },
    }),
    // screen/sessionOpts drive depth; handlers close over latest values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [screen, assistedMode, catalogOnlySession, catalogMode, fulfillment],
  );

  useEffect(() => {
    onHistoryDepthChange?.(
      kioskScreenHistoryDepth(screen, {
        assistedMode,
        catalogOnlySession,
        catalogMode,
      }),
    );
  }, [
    screen,
    assistedMode,
    catalogOnlySession,
    catalogMode,
    onHistoryDepthChange,
  ]);

  useEffect(() => {
    if (assistedMode || fulfillment) {
      setScreen((current) => (current === 'home' ? 'categories' : current));
    }
  }, [assistedMode, fulfillment]);

  const prefetchedCategoriesRef = useRef<Set<string>>(new Set());

  /** Prefetch only the first visible product tiles of one category (on intent). */
  function prefetchCategoryProductImages(categoryId: string) {
    if (typeof window === 'undefined') return;
    if (prefetchedCategoriesRef.current.has(categoryId)) return;
    // Avoid competing with visible work on constrained links.
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (conn?.saveData) return;
    if (conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') return;

    prefetchedCategoriesRef.current.add(categoryId);
    const products = productsByCategory[categoryId] ?? [];
    const loaders: HTMLImageElement[] = [];
    for (const product of products.slice(0, 4)) {
      const url = (product.imageUrl ?? '').trim();
      if (!url) continue;
      const img = new Image();
      img.decoding = 'async';
      img.fetchPriority = 'low';
      img.src = url;
      loaders.push(img);
    }
    // Keep refs briefly so GC does not cancel in-flight requests.
    window.setTimeout(() => {
      for (const img of loaders) img.src = '';
    }, 8000);
  }

  // Catalog entered from the home CTA jumps to categories. Mesa QR (?catalogo=1)
  // stays on the branded home until the guest taps the primary CTA.
  useEffect(() => {
    if (!catalogMode || assistedMode || fulfillment || catalogOnlySession) return;
    setScreen((current) => (current === 'home' ? 'categories' : current));
  }, [catalogMode, assistedMode, fulfillment, catalogOnlySession]);

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
      if (!handleWhatsAppLinkClick(whatsappUrl)) {
        window.location.assign(whatsappUrl);
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [voucher?.orderId, voucher?.whatsappUrl]);

  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? null;
  const activeProducts = activeCategoryId ? productsByCategory[activeCategoryId] ?? [] : [];
  const searchQueryFolded = foldSearchText(searchQuery);

  const catalogProducts = useMemo(
    () =>
      categories.flatMap((category) =>
        (productsByCategory[category.id] ?? []).map((product) => ({ product, category })),
      ),
    [categories, productsByCategory],
  );

  /**
   * Home hero slides: prefer product photos from main/normal categories when those exist;
   * otherwise fall back to other categories. Empty → logo fallback in KioskHome.
   */
  const homeHeroImages = useMemo(() => {
    const mainCats = categories.filter((category) => isMainCategoryRole(category.role));
    if (mainCats.length > 0) {
      return collectCategoryProductImages(mainCats, productsByCategory, MAX_HOME_HERO_IMAGES);
    }
    return collectCategoryProductImages(categories, productsByCategory, MAX_HOME_HERO_IMAGES);
  }, [categories, productsByCategory]);

  const searchHits = useMemo(() => {
    if (!searchQueryFolded) return null;
    const categoryHits = categories
      .filter((category) => foldSearchText(category.name).includes(searchQueryFolded))
      .map((category) => ({ kind: 'category' as const, category }));
    const productHits = catalogProducts
      .filter(({ product }) =>
        foldSearchText(`${product.name} ${product.description}`).includes(searchQueryFolded),
      )
      .map(({ product, category }) => ({ kind: 'product' as const, product, category }));
    return [...categoryHits, ...productHits];
  }, [catalogProducts, categories, searchQueryFolded]);

  useKioskPageChrome({ themeMode });
  const [chromeCompact, setChromeCompact] = useState(false);
  const chromeSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (screen === 'home' || voucher) {
      setChromeCompact(false);
      return;
    }
    const sentinel = chromeSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setChromeCompact(!entry.isIntersecting);
      },
      {
        // Collapse as soon as the sentinel leaves the sticky chrome band.
        root: null,
        threshold: 0,
        rootMargin: stickyOffsetClass === 'top-12' ? '-48px 0px 0px 0px' : '0px 0px 0px 0px',
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [screen, stickyOffsetClass, voucher]);

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

  if (!assistedMode && screen === 'home') {
    return (
      <div className="relative flex h-[100svh] max-h-[100svh] flex-col overflow-hidden bg-[var(--menu-background)] text-[var(--menu-text)]">
        <KioskHome
          businessName={businessName}
          logoUrl={logoUrl}
          ratingAverage={ratingAverage}
          ratingCount={ratingCount}
          initialLetter={initialLetter}
          isOpen={isOpen}
          closedCaption={closedCaption}
          openCaption={openCaption}
          businessHours={businessHours}
          locationLabel={locationLabel}
          operatingStateLabels={operatingStateLabels}
          socialLinks={socialLinks}
          whatsappNumber={whatsappNumber}
          tagline={tagline}
          supportsDelivery={supportsDelivery}
          homeConfig={homeConfig}
          paymentGroups={paymentGroups}
          themeMode={themeMode}
          catalogOnlySession={catalogOnlySession}
          directionsUrl={directionsUrl}
          heroImages={homeHeroImages}
          onToggleTheme={onToggleTheme}
          onSelect={(next) => {
            if (catalogOnlySession) return;
            onLeaveCatalog();
            onSelectFulfillment(next);
            onSearchChange('');
            setActiveCategoryId(null);
            setScreen('categories');
          }}
          onBrowseMenu={() => {
            // Only mesa QR (?catalogo=1) skips "Ver menú". Merchant flag
            // homeConfig.catalogo enables that QR flow — it must not block browse
            // on the normal URL when the restaurant is closed.
            if (catalogOnlySession) return;
            onLeaveCatalog();
            onSearchChange('');
            setActiveCategoryId(null);
            setScreen('categories');
          }}
          onOpenCatalog={() => {
            onEnterCatalog();
            onSearchChange('');
            setActiveCategoryId(null);
            setScreen('categories');
          }}
        />
      </div>
    );
  }

  return (
    <section className="relative flex min-h-[100dvh] flex-col overflow-x-clip bg-[var(--menu-background)] text-[var(--menu-text)]">
      <KioskDecor density="lite" />
      <KioskMotionStyles />
      {/* Tall sentinel (collapsed via -mb) delays compact mode a few scroll pixels. */}
      <div
        ref={chromeSentinelRef}
        className="pointer-events-none -mb-10 h-10 w-full shrink-0"
        aria-hidden
      />
      <div
        className={`${stickyChromeClass} isolate`}
        data-chrome-compact={chromeCompact ? '1' : '0'}
      >
        {topBar}
        <header
          className={`border-b px-5 backdrop-blur-xl transition-[padding,background-color,box-shadow,border-color] duration-200 ease-out ${
            chromeCompact
              ? 'border-[color-mix(in_srgb,var(--menu-border)_70%,transparent)] bg-[color-mix(in_srgb,var(--menu-background)_94%,var(--menu-surface))] py-2 shadow-[0_10px_28px_rgba(15,23,42,0.08)]'
              : 'border-transparent bg-[color-mix(in_srgb,var(--menu-background)_88%,var(--menu-surface))] py-3 shadow-none'
          }`}
        >
          <div
            className={`mx-auto flex w-full max-w-5xl items-center gap-3 transition-[gap] duration-200 ${
              chromeCompact ? 'gap-2.5' : 'gap-3'
            }`}
          >
            {assistedMode && screen === 'categories' ? null : (
              <button
                type="button"
                onClick={() => {
                  goBackInShell();
                }}
                className={`grid shrink-0 place-items-center rounded-[14px] bg-[var(--menu-surface)] text-[var(--menu-text)] shadow-[var(--menu-shadow)] transition-[width,height] duration-200 ${
                  chromeCompact ? 'h-9 w-9' : 'h-11 w-11'
                }`}
                aria-label="Volver"
              >
                <ArrowLeft className={chromeCompact ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={2.2} />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p
                className={`font-semibold uppercase tracking-[0.22em] text-[var(--menu-text-muted)] transition-[font-size,opacity,max-height,margin] duration-200 ${
                  chromeCompact
                    ? 'max-h-0 overflow-hidden text-[9px] opacity-0'
                    : 'max-h-5 text-[10px] opacity-100'
                }`}
              >
                {catalogMode
                  ? 'Catálogo'
                  : fulfillment
                    ? assistedMode
                      ? FULFILLMENT_LABEL[fulfillment]
                      : CHECKOUT_FULFILLMENT_SHORT_LABEL[fulfillment]
                    : isOpen
                      ? 'Menú'
                      : 'Solo consulta'}
              </p>
              <h2
                className={`truncate font-extrabold tracking-[-0.03em] text-[var(--menu-text)] transition-[font-size,line-height] duration-200 ${
                  chromeCompact ? 'text-[15px] leading-tight' : 'text-lg leading-snug'
                }`}
              >
                {screen === 'products' ? activeCategory?.name || 'Productos' : 'Categorías'}
              </h2>
              <p
                className={`flex items-center gap-1 font-semibold text-[var(--menu-text-muted)] transition-[opacity,max-height,margin] duration-200 ${
                  chromeCompact
                    ? 'mt-0 max-h-0 overflow-hidden opacity-0'
                    : 'mt-0.5 max-h-5 text-[11px] opacity-100'
                }`}
                aria-hidden={chromeCompact}
                aria-label={
                  ratingCount > 0
                    ? `Calificación ${ratingAverage.toFixed(1)} de 5, ${ratingCount} calificaciones`
                    : 'Este comercio aún no tiene calificaciones'
                }
              >
                <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
                {ratingCount > 0 ? (
                  <>
                    <span className="text-[var(--menu-text)]">{ratingAverage.toFixed(1)}</span>
                    <span aria-hidden="true">·</span>
                    {ratingCount} {ratingCount === 1 ? 'calificación' : 'calificaciones'}
                  </>
                ) : (
                  'Aún sin calificaciones'
                )}
              </p>
            </div>
            {logoUrl ? (
              <KioskImage
                src={logoUrl}
                sourceUrl={logoUrl}
                displayWidth={240}
                alt=""
                fit="cover"
                className={`rounded-[14px] bg-[var(--menu-surface)] shadow-[var(--menu-shadow)] transition-[width,height] duration-200 ${
                  chromeCompact ? 'h-9 w-9' : 'h-11 w-11'
                }`}
              />
            ) : (
              <div
                className={`grid place-items-center rounded-[14px] font-extrabold transition-[width,height,font-size] duration-200 ${
                  chromeCompact ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm'
                }`}
                style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
              >
                {initialLetter}
              </div>
            )}
          </div>
          <label
            className={`mx-auto flex w-full max-w-5xl items-center gap-2 rounded-[18px] bg-[var(--menu-surface)] px-3.5 text-[var(--menu-text)] shadow-[var(--menu-shadow)] transition-[margin,height] duration-200 ${
              chromeCompact ? 'mt-2 h-11' : 'mt-3 h-12'
            }`}
          >
            <Search className="h-4 w-4 shrink-0 text-[var(--menu-text-muted)]" />
            <input
              id="kiosk-menu-search"
              name="kiosk-menu-search"
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar en el menú"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-full min-w-0 flex-1 appearance-none bg-transparent text-sm font-medium outline-none placeholder:text-[var(--menu-text-muted)] [-webkit-appearance:none] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden [&::-webkit-search-results-button]:hidden [&::-webkit-search-results-decoration]:hidden"
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
          className={`kiosk-enter mb-4 text-[22px] font-semibold sm:text-[26px]`}
          style={{ color: 'color-mix(in srgb, var(--menu-primary) 72%, var(--menu-text))' }}
        >
          {browseOnly
            ? !isOpen
              ? 'Estamos cerrados. Puedes ver el menú y pedir cuando abramos.'
              : 'Este negocio no tiene modalidades de pedido activas.'
            : screen === 'products'
              ? 'Arma tu pedido a tu ritmo.'
              : '¿Qué se te antoja hoy?'}
        </p>

        {searchHits ? (
          searchHits.length === 0 ? (
            <EmptyState message="No hay resultados con esa búsqueda." />
          ) : (
            <div className="grid gap-3">
              {searchHits.map((hit) =>
                hit.kind === 'category' ? (
                  <button
                    key={`category-${hit.category.id}`}
                    type="button"
                    onClick={() => {
                      setActiveCategoryId(hit.category.id);
                      onSearchChange('');
                      setScreen('products');
                    }}
                    className="kiosk-card flex w-full items-center gap-3 overflow-hidden rounded-[22px] bg-[var(--menu-surface)] p-3 text-left shadow-[var(--menu-shadow)]"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[16px] bg-[var(--menu-surface-alt)]">
                      {hit.category.coverUrl ? (
                        <KioskImage
                          src={hit.category.coverUrl}
                          sourceUrl={hit.category.coverSourceUrl || hit.category.coverUrl}
                          displayWidth={160}
                          alt=""
                          className="h-full w-full"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-2xl">{hit.category.glyph}</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--menu-text-muted)]">Categoría</p>
                      <p className={`truncate text-base font-extrabold text-[var(--menu-text)]`}>{hit.category.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--menu-text-muted)]">
                        {hit.category.productCount} {hit.category.productCount === 1 ? 'producto' : 'productos'}
                      </p>
                    </div>
                  </button>
                ) : (
                  <button
                    key={`product-${hit.product.id}`}
                    type="button"
                    aria-label={`Ver detalles de ${hit.product.name}`}
                    onClick={() => onAddProduct(hit.product.id)}
                    className="kiosk-card flex w-full items-center gap-3 overflow-hidden rounded-[22px] bg-[var(--menu-surface)] p-3 text-left shadow-[var(--menu-shadow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--menu-primary)]"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[16px] bg-[var(--menu-surface-alt)]">
                      {hit.product.imageUrl ? (
                        <KioskImage
                          src={hit.product.imageUrl}
                          sourceUrl={hit.product.imageSourceUrl || hit.product.imageUrl}
                          displayWidth={160}
                          alt={hit.product.name}
                          className="h-full w-full"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-2xl">{hit.category.glyph || '🍽️'}</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--menu-text-muted)]">
                        Producto · {hit.category.name}
                      </p>
                      <p className={`truncate text-base font-extrabold text-[var(--menu-text)]`}>{hit.product.name}</p>
                      <p className="mt-0.5 text-sm font-bold text-[var(--menu-text)]">{hit.product.priceLabel}</p>
                    </div>
                  </button>
                ),
              )}
            </div>
          )
        ) : screen === 'categories' ? (
          categories.length === 0 ? (
            <EmptyState message="No hay categorías con esa búsqueda." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {categories.map((category, index) => (
                <button
                  key={category.id}
                  type="button"
                  onPointerDown={() => prefetchCategoryProductImages(category.id)}
                  onClick={() => {
                    setActiveCategoryId(category.id);
                    onSearchChange('');
                    setScreen('products');
                  }}
                  className="kiosk-card flex h-full flex-col overflow-hidden rounded-[22px] bg-[var(--menu-surface)] text-left shadow-[var(--menu-shadow)] transition duration-200 ease-out hover:-translate-y-0.5"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  {/* Uniform 3:4 frame — cover fills card (no white letterbox / no blur). */}
                  <div className="relative aspect-[3/4] w-full shrink-0 overflow-hidden bg-[var(--menu-surface-alt)]">
                    <div className="absolute inset-0">
                      {category.coverUrl ? (
                        <KioskImage
                          src={category.coverUrl}
                          sourceUrl={category.coverSourceUrl || category.coverUrl}
                          displayWidth={360}
                          alt=""
                          fit="cover"
                          priority={index < 4}
                          className="h-full w-full"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-5xl">
                          {category.glyph}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-end justify-between gap-2 px-3 pb-3 pt-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold uppercase tracking-wide text-[var(--menu-text)]">
                        {category.name}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-[var(--menu-text-muted)]">
                        <Package
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: 'color-mix(in srgb, var(--menu-primary) 78%, #8a6a3a)' }}
                          aria-hidden
                        />
                        <span className="truncate">
                          {category.productCount}{' '}
                          {category.productCount === 1 ? 'producto' : 'productos'}
                        </span>
                      </p>
                    </div>
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                      style={{
                        background: 'color-mix(in srgb, var(--menu-primary) 14%, var(--menu-surface-alt))',
                        color: 'color-mix(in srgb, var(--menu-primary) 78%, #8a6a3a)',
                      }}
                      aria-hidden
                    >
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : activeProducts.length === 0 ? (
          <EmptyState message="No hay productos con esa búsqueda." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {activeProducts.map((product, index) => (
              <button
                key={product.id}
                type="button"
                aria-label={`Ver detalles de ${product.name}`}
                onClick={() => onAddProduct(product.id)}
                className="kiosk-card flex w-full items-start overflow-hidden rounded-[22px] bg-[var(--menu-surface)] text-left shadow-[var(--menu-shadow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--menu-primary)]"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div className="aspect-[3/4] w-[7.75rem] shrink-0 self-start overflow-hidden bg-[var(--menu-surface-alt)] sm:w-36">
                  {product.imageUrl ? (
                    <KioskImage
                      src={product.imageUrl}
                      sourceUrl={product.imageSourceUrl || product.imageUrl}
                      displayWidth={360}
                      alt={product.name}
                      fit="cover"
                      priority={index < 4}
                      className="h-full w-full"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-3xl">
                      {activeCategory?.glyph || '🍽️'}
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch p-3.5">
                  <div>
                    <h3 className={`text-base font-extrabold leading-5 text-[var(--menu-text)]`}>
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
              <p className={`truncate text-lg font-extrabold text-[var(--menu-text)]`}>
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
            <h3 className={`mt-2 text-2xl font-extrabold tracking-[-0.04em]`}>
              {addedPrompt.productName}
            </h3>
            <p
              className={`mt-2 text-[22px] font-semibold leading-7`}
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
});

function EmptyState({ message }: { message: string }) {
  return (
    <div className="grid min-h-[36vh] place-items-center rounded-[22px] bg-[var(--menu-surface)] px-6 text-center text-sm font-medium text-[var(--menu-text-muted)] shadow-[var(--menu-shadow)]">
      {message}
    </div>
  );
}
