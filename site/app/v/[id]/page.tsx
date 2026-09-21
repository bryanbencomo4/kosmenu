'use client';

import Head from 'next/head';
import { ArrowRight, ArrowUp, ChevronDown, Flame, Info, Mail, MapPin, Menu, MessageCircle, Phone, Share2, ShoppingCart, Store, Truck, User, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { PublicMenuSkeletonLoader } from './_components/PublicMenuSkeletonLoader';
import PhoneInput, { isValidPhoneNumber, parsePhoneNumber } from 'react-phone-number-input';
import type { Country } from 'react-phone-number-input';
import {
  buildMenuTheme,
  menuThemeCssVars,
  normalizeMenuThemeMode,
  type MenuThemeMode,
} from './_lib/menu-theme';
import {
  displayProductImage,
  resolveHeroCover,
} from './_lib/product-image';
import {
  resolveFreeDeliveryGoal,
  resolveUpsellSuggestions,
  type EngineOrderType,
  type EngineProduct,
  type EngineRule,
  type EngineSettings,
  type EngineSurface,
} from './_lib/upsell-engine';
import { getOrCreateUpsellSessionId, trackUpsellEvent, type UpsellSurface } from './_lib/upsell-session';
import { AddToCartUpsellSheet, type AddToCartSuggestion } from './_components/upsell/AddToCartUpsellSheet';
import { ProductOptionsSheet } from './_components/ProductOptionsSheet';
import { KioskMenuExperience } from './_components/kiosk/KioskMenuExperience';
import { KioskCheckout } from './_components/kiosk/KioskCheckout';
import { KioskImage } from './_components/kiosk/KioskImage';
import { FULFILLMENT_LABEL, type KioskFulfillment, type KioskVoucherData } from './_components/kiosk/kiosk-types';
import { CartUpsellSection, type CartUpsellSuggestion } from './_components/upsell/CartUpsellSection';
import type { BundleRailItem } from './_components/upsell/BundleRail';
import { formatPaymentMethodDetails } from '../../_lib/payment-method-display';
import {
  exchangeSourceLabel,
  resolveCheckoutCurrencyRate,
  resolveCheckoutCurrencySource,
} from '../../_lib/checkout-exchange-rate';
import {
  buildCartLineKey,
  buildOrderLineLabel,
  formatProductPriceLabel,
  getProductMinimumPrice,
  isServicioAdicionalName,
  parseCartLineKey,
  productRequiresConfiguration,
  resolveCartLineUnitPrice,
  summarizeCartLineSelection,
  type CartLineSelection,
} from '../../_lib/menu-product-options';
import { consumeRepeatOrder } from '../../_lib/repeat-order';
import { resolveBusinessScheduleStatus } from '../../api/_lib/business-hours';
import { trackMenuFunnelEvent, trackPublicMenuVisit } from './_lib/track-menu-analytics';
import {
  loadPublicMenuFromBrowser,
  readStalePublicMenu,
  shouldFallbackToBrowserMenu,
  writeStalePublicMenu,
} from './_lib/load-public-menu-client';
import {
  checkoutAttemptFingerprint,
  humanizeOrderSubmitError,
  resolveCheckoutAttempt,
  type CheckoutAttempt,
} from './_lib/checkout-idempotency';

type CategoriaRow = {
  id: string;
  nombre: string;
  orden?: number | null;
  icono?: string | null;
  opciones_menu?: unknown;
};

type ProductoRow = {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion?: string | null;
  precio?: number | null;
  imagen_url?: string | null;
  disponible?: boolean | null;
  upsell_badge?: string | null;
  precio_comparacion?: number | null;
  upsell_enabled?: boolean | null;
  orden?: number | null;
  opciones_menu?: unknown;
};

type UpsellSettingsRow = {
  enabled?: boolean | null;
  show_add_to_cart?: boolean | null;
  show_cart?: boolean | null;
  show_checkout?: boolean | null;
  max_add_suggestions?: number | null;
  max_cart_suggestions?: number | null;
  max_checkout_suggestions?: number | null;
  free_delivery_threshold?: number | string | null;
  free_delivery_order_types?: string[] | null;
};

type UpsellRuleTargetRow = {
  target_type: 'product' | 'category';
  product_id?: string | null;
  category_id?: string | null;
  position?: number | null;
  enabled?: boolean | null;
};

type UpsellRuleRow = {
  id: string;
  enabled?: boolean | null;
  trigger_type: 'product' | 'category' | 'cart';
  trigger_product_id?: string | null;
  trigger_category_id?: string | null;
  trigger_min_qty?: number | null;
  surface: EngineSurface;
  priority?: 'low' | 'normal' | 'high' | null;
  min_cart_amount?: number | null;
  max_cart_amount?: number | null;
  order_type?: EngineOrderType | null;
  max_suggestions?: number | null;
  upsell_rule_targets?: UpsellRuleTargetRow[] | null;
};

type BundleItemRow = {
  product_id: string;
  quantity: number;
  required?: boolean | null;
};

type BundleRow = {
  id: string;
  name: string;
  description?: string | null;
  bundle_price: number | string;
  enabled?: boolean | null;
  bundle_items?: BundleItemRow[] | null;
};

type BrandingConfig = {
  schema_version?: number | null;
  color_principal?: string | null;
  color_secundario?: string | null;
  fuente_titulos?: string | null;
  fuente_cuerpo?: string | null;
  estilo_botones?: string | null;
  mood_tags?: string[] | null;
  descripcion_visual?: string | null;
  layout_type?: 'list' | 'grid' | 'compact' | string | null;
  config_visual?: {
    items_per_row?: number | null;
    menu_sticky?: boolean | null;
    show_images?: boolean | null;
  } | null;
  config_negocio?: {
    metodos_pago?: string[] | null;
    moneda_default?: string | null;
    checkout_currencies?: string[] | null;
    currencies?: string[] | null;
    exchange_rates?: Record<string, number | string | null> | null;
    exchange_rate_modes?: Record<string, string | null> | null;
    exchange_rate_sources?: Record<string, string | null> | null;
  } | null;
  colores_personalizados?: {
    background?: string | null;
    card_surface?: string | null;
    text_on_primary?: string | null;
  } | null;
};

type ComercioRow = {
  id: string;
  slug?: string | null;
  nombre?: string | null;
  moneda?: string | null;
  costo_envio?: number | string | null;
  tasa_cambio_pesos?: number | string | null;
  exchange_rate_mode?: string | null;
  exchange_rate_source?: string | null;
  exchange_rate_value?: number | string | null;
  exchange_rate_quote_currency?: string | null;
  logo_url?: string | null;
  latitud?: number | string | null;
  longitud?: number | string | null;
  permite_delivery?: boolean | null;
  recibe_pedidos_whatsapp?: boolean | null;
  whatsapp?: string | null;
  telefono?: string | null;
  telefonos?: string | null;
  celular?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  descripcion?: string | null;
  menu_palette_primary?: number | string | null;
  menu_palette_accent?: number | string | null;
  menu_palette_surface?: number | string | null;
  menu_palette_text?: number | string | null;
  menu_theme_mode?: string | null;
  color_principal?: string | number | null;
  menu_layout?: string | null;
  menu_font?: string | null;
  horarios?: unknown;
  /** Never exposed by public DTO; kept optional only for type compatibility. */
  branding_ia?: BrandingConfig | null;
};

type MetodoPagoRow = {
  id: string;
  nombre?: string | null;
  tipo?: string | null;
  banco?: string | null;
  titular?: string | null;
  cedula?: string | null;
  telefono?: string | null;
  numero?: string | null;
  alias?: string | null;
  descripcion?: string | null;
  detalles?: string | null;
  nota?: string | null;
  moneda?: string | null;
  currency?: string | null;
  moneda_codigo?: string | null;
  tasa_cambio?: number | string | null;
  exchange_rate?: number | string | null;
  rate?: number | string | null;
};

type MenuData = {
  comercio: ComercioRow;
  categorias: CategoriaRow[];
  productos: ProductoRow[];
  metodosPago: MetodoPagoRow[];
  checkoutExchange?: {
    currencies?: string[];
    exchangeRates?: Record<string, number | null>;
    exchangeRateModes?: Record<string, string>;
    exchangeRateSources?: Record<string, string>;
  } | null;
  marketRates?: MarketRatesRow | null;
  upsellSettings?: UpsellSettingsRow | null;
  upsellRules?: UpsellRuleRow[] | null;
  bundles?: BundleRow[] | null;
};

type MarketRatesRow = {
  bcv_rate?: number | string | null;
  p2p_binance_rate?: number | string | null;
  payload?: {
    google_rates?: Record<string, number | string | null> | null;
    bcv_rates?: {
      USD?: number | string | null;
      EUR?: number | string | null;
    } | null;
  } | null;
};

type OrderDeliveryMode = 'pickup' | 'delivery';
type DeliveryPoint = { lat: number; lng: number };
type DeliveryPointSelectionSource = 'none' | 'business-default' | 'user';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const publicBaseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://elmenuxfa.com').replace(/\/$/, '');
const checkoutDraftStorageKey = 'elmenuxfa:checkout-customer-v1';
const splashLogoCacheKeyPrefix = 'elmenuxfa:splash-logo:';
const splashNameCacheKeyPrefix = 'elmenuxfa:splash-name:';
const kioskFulfillmentStoragePrefix = 'elmenuxfa-kiosk-fulfillment:';

function isKioskFulfillment(value: string | null | undefined): value is KioskFulfillment {
  return value === 'dine_in' || value === 'takeaway' || value === 'delivery';
}
const selectedCurrencyStorageKeyPrefix = 'elmenuxfa:selected-currency:';
const kioskThemeStoragePrefix = 'elmenuxfa-kiosk-theme:';
const googleMapsJsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';
const preferLeafletMapPicker = false;
const topTickerHeightPx = 36;
const topAppBarHeightPx = 56;
const stickySearchTopPx = topTickerHeightPx + topAppBarHeightPx + 10;
const categoryTitleRevealOffsetPx = 30;

type MotionIntensity = 'subtle' | 'medium' | 'strong';
type MotionDirection = 'up' | 'down' | 'left' | 'right' | 'none';

type GoogleLatLngLike = {
  lat(): number;
  lng(): number;
};

type GooglePlaceResult = {
  formatted_address?: string;
  name?: string;
  geometry?: {
    location?: GoogleLatLngLike | null;
  } | null;
};

type GoogleMapHandle = {
  panTo(point: DeliveryPoint): void;
  setZoom(zoom: number): void;
  addListener(event: string, listener: () => void): void;
  getCenter(): GoogleLatLngLike | null;
};

type GoogleGeocoder = {
  geocode(
    request: { location?: DeliveryPoint; address?: string },
    callback: (results: GooglePlaceResult[] | null, status: string) => void,
  ): void;
};

type GoogleAutocomplete = {
  bindTo(name: string, map: GoogleMapHandle): void;
  addListener(event: string, listener: () => void): void;
  getPlace(): GooglePlaceResult | null;
};

type GoogleMapsApi = {
  maps?: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapHandle;
    Geocoder: new () => GoogleGeocoder;
    places?: {
      Autocomplete?: new (input: HTMLInputElement, options: { fields: string[] }) => GoogleAutocomplete;
    };
  };
};

type LeafletCenter = {
  lat: number;
  lng: number;
};

type LeafletMapHandle = {
  setView(coords: [number, number], zoom: number): LeafletMapHandle;
  getCenter(): LeafletCenter | null;
  on(event: string, handler: () => void): void;
  remove(): void;
};

type LeafletTileLayer = {
  addTo(map: LeafletMapHandle): void;
};

type LeafletApi = {
  map(element: HTMLElement, options: Record<string, unknown>): LeafletMapHandle;
  tileLayer(url: string, options: Record<string, unknown>): LeafletTileLayer;
};

type WindowWithExternalMaps = Window & typeof globalThis & Record<string, unknown> & {
  google?: GoogleMapsApi;
  L?: LeafletApi;
};

type MapPickerHandle = {
  remove?: () => void;
  panTo?: (point: DeliveryPoint) => void;
  setZoom?: (zoom: number) => void;
  setView?: (coords: [number, number], zoom: number) => unknown;
};

type ValidationDetail = {
  path?: string;
  message?: string;
};

function getWindowWithExternalMaps() {
  return window as WindowWithExternalMaps;
}

const MOTION_TOKENS = {
  duration: {
    instant: 1,
    fast: 180,
    base: 280,
    slow: 420,
    hero: 560,
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    entrance: 'cubic-bezier(0.22, 1, 0.36, 1)',
    emphasized: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
  distance: {
    subtle: 8,
    medium: 16,
    strong: 24,
  },
  scale: {
    subtle: 0.994,
    medium: 0.985,
    strong: 0.975,
  },
  staggerStep: 55,
} as const;

const defaultProductImage =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">' +
      '<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#334155"/></linearGradient></defs>' +
      '<rect width="640" height="640" fill="url(#g)"/>' +
      '<circle cx="320" cy="240" r="92" fill="#f8fafc" fill-opacity="0.8"/>' +
      '<rect x="155" y="390" width="330" height="52" rx="26" fill="#f8fafc" fill-opacity="0.7"/>' +
      '<text x="320" y="560" text-anchor="middle" font-size="28" font-family="Arial" fill="#f8fafc">elmenuxfa.com</text>' +
      '</svg>',
  );

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let googleMapsScriptPromise: Promise<GoogleMapsApi | null> | null = null;
let leafletAssetsPromise: Promise<LeafletApi | null> | null = null;

function waitForGoogleMapsReady(timeoutMs = 10000) {
  return new Promise<GoogleMapsApi | null>((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }

    const startedAt = Date.now();
    const tick = () => {
      const windowWithMaps = getWindowWithExternalMaps();
      if (windowWithMaps.google?.maps) {
        resolve(windowWithMaps.google);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Google Maps API no termino de cargar.'));
        return;
      }

      window.setTimeout(tick, 60);
    };

    tick();
  });
}

function loadGoogleMapsApi() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const windowWithMaps = getWindowWithExternalMaps();
  if (windowWithMaps.google?.maps) return Promise.resolve(windowWithMaps.google);
  if (!googleMapsJsApiKey) return Promise.resolve(null);
  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  googleMapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-kosmenu-google-maps="1"]') as HTMLScriptElement | null;
    if (existing) {
      waitForGoogleMapsReady().then(resolve).catch(reject);
      existing.addEventListener('load', () => {
        waitForGoogleMapsReady().then(resolve).catch(reject);
      });
      existing.addEventListener('error', reject);
      return;
    }

    const callbackName = '__kosmenuGoogleMapsReady';
    windowWithMaps[callbackName] = () => {
      waitForGoogleMapsReady()
        .then((google) => {
          delete windowWithMaps[callbackName];
          resolve(google);
        })
        .catch((error) => {
          delete windowWithMaps[callbackName];
          reject(error);
        });
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsJsApiKey)}&libraries=places&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.dataset.kosmenuGoogleMaps = '1';
    script.onerror = (error) => {
      delete windowWithMaps[callbackName];
      reject(error);
    };
    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
}

function loadLeafletAssets() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const windowWithMaps = getWindowWithExternalMaps();
  if (windowWithMaps.L) return Promise.resolve(windowWithMaps.L);
  if (leafletAssetsPromise) return leafletAssetsPromise;

  leafletAssetsPromise = new Promise((resolve, reject) => {
    const existingCss = document.querySelector('link[data-kosmenu-leaflet="1"]') as HTMLLinkElement | null;
    if (!existingCss) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      css.dataset.kosmenuLeaflet = '1';
      document.head.appendChild(css);
    }

    const existingScript = document.querySelector('script[data-kosmenu-leaflet="1"]') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(getWindowWithExternalMaps().L ?? null));
      existingScript.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.defer = true;
    script.dataset.kosmenuLeaflet = '1';
    script.onload = () => resolve(getWindowWithExternalMaps().L ?? null);
    script.onerror = (error) => reject(error);
    document.head.appendChild(script);
  });

  return leafletAssetsPromise;
}

function getCategoryScrollOffset(stickySearchCard: HTMLDivElement | null) {
  const stickyHeight = stickySearchCard?.getBoundingClientRect().height ?? 108;
  return topTickerHeightPx + topAppBarHeightPx + stickyHeight + categoryTitleRevealOffsetPx;
}

async function reverseGeocodeWithNominatim(point: DeliveryPoint) {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lng}&accept-language=es`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) return '';
    const payload = await response.json();
    return (payload?.display_name ?? '').toString().trim();
  } catch {
    return '';
  }
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

function preloadImageAsset(src: string, timeoutMs = 1200) {
  if (typeof window === 'undefined' || !src.trim()) return Promise.resolve(false);

  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = window.setTimeout(() => finish(false), timeoutMs);

    image.onload = () => {
      window.clearTimeout(timer);
      finish(true);
    };

    image.onerror = () => {
      window.clearTimeout(timer);
      finish(false);
    };

    image.decoding = 'async';
    image.src = src;
  });
}

function useCountUp(target: number, enabled: boolean, durationMs = 1100) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setValue(0);
      return;
    }

    const safeTarget = Math.max(0, Math.round(target));
    if (safeTarget === 0) {
      setValue(0);
      return;
    }

    let frameId = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(safeTarget * eased));

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [durationMs, enabled, target]);

  return value;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updatePreference);
      return () => mediaQuery.removeEventListener('change', updatePreference);
    }

    mediaQuery.addListener(updatePreference);
    return () => mediaQuery.removeListener(updatePreference);
  }, []);

  return prefersReducedMotion;
}

function motionDelay(index: number, step: number = MOTION_TOKENS.staggerStep) {
  return Math.max(0, index) * step;
}

function revealMotionStyle({
  delay = 0,
  duration = MOTION_TOKENS.duration.slow,
  intensity = 'medium',
  direction = 'up',
}: {
  delay?: number;
  duration?: number;
  intensity?: MotionIntensity;
  direction?: MotionDirection;
} = {}) {
  const distance = MOTION_TOKENS.distance[intensity];
  const translateX = direction === 'left' ? `${distance}px` : direction === 'right' ? `${-distance}px` : '0px';
  const translateY = direction === 'up' ? `${distance}px` : direction === 'down' ? `${-distance}px` : '0px';

  return {
    '--kos-enter-delay': `${delay}ms`,
    '--kos-enter-duration': `${duration}ms`,
    '--kos-enter-x': translateX,
    '--kos-enter-y': translateY,
    '--kos-enter-scale': `${MOTION_TOKENS.scale[intensity]}`,
  } as React.CSSProperties;
}

function useVisibilityReveal(
  ids: string[],
  elementRefs: { current: Record<string, HTMLElement | null> },
  options?: {
    rootMargin?: string;
    threshold?: number;
    disabled?: boolean;
    fallbackDelayMs?: number;
  },
) {
  const { rootMargin = '0px 0px -10% 0px', threshold = 0.16, disabled = false, fallbackDelayMs = 1400 } = options ?? {};
  const [visibleIds, setVisibleIds] = useState<Record<string, boolean>>({});
  const idsKey = ids.join('|');

  useEffect(() => {
    if (ids.length === 0) {
      setVisibleIds({});
      return;
    }

    setVisibleIds((prev) => {
      const next: Record<string, boolean> = {};
      for (const id of ids) {
        if (prev[id]) next[id] = true;
      }
      const sameSize = Object.keys(next).length === Object.keys(prev).length;
      const sameValues = sameSize && Object.keys(next).every((key) => prev[key] === next[key]);
      return sameValues ? prev : next;
    });

    if (disabled || typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') {
      setVisibleIds(Object.fromEntries(ids.map((id) => [id, true])));
      return;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        setVisibleIds((prev) => {
          let changed = false;
          const next = { ...prev };

          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const element = entry.target as HTMLElement;
            const id = element.dataset.motionId ?? '';
            if (!id || next[id]) continue;
            next[id] = true;
            changed = true;
            observer.unobserve(element);
          }

          return changed ? next : prev;
        });
      },
      {
        root: null,
        rootMargin,
        threshold,
      },
    );

    const fallbackTimer = window.setTimeout(() => {
      setVisibleIds((prev) => {
        let changed = false;
        const next = { ...prev };

        for (const id of ids) {
          if (next[id]) continue;
          next[id] = true;
          changed = true;
        }

        return changed ? next : prev;
      });
    }, Math.max(0, fallbackDelayMs));

    for (const id of ids) {
      const node = elementRefs.current[id];
      if (!node) continue;
      node.dataset.motionId = id;
      observer.observe(node);
    }

    return () => {
      window.clearTimeout(fallbackTimer);
      observer.disconnect();
    };
  }, [disabled, fallbackDelayMs, idsKey, rootMargin, threshold]);

  return visibleIds;
}

function formatAmountByCurrency(value: number, currency: string) {
  const safe = Number.isFinite(value) ? value : 0;
  const code = (currency || 'COP').trim().toUpperCase();
  const normalized = code === 'SIN MONEDA' ? 'COP' : code;
  if (normalized === 'VES') {
    const formattedNumber = new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
    return `Bs ${formattedNumber}`;
  }
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: normalized,
      maximumFractionDigits: normalized === 'COP' ? 0 : 2,
    }).format(safe);
  } catch {
    return `${safe.toFixed(2)} ${normalized}`;
  }
}

function formatCop(value: number | null | undefined) {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(safeValue);
}

function normalizeFontName(value: string | null | undefined) {
  const font = (value ?? '').trim();
  return font.length > 0 ? font : '';
}

function fontFamilyCssValue(fontName: string, fallback: string) {
  return fontName ? `"${fontName.replace(/"/g, '')}", ${fallback}` : fallback;
}

function borderRadiusByStyle(style: string | null | undefined) {
  if (style === 'pill') return '999px';
  if (style === 'sharp') return '2px';
  return '14px';
}

function normalizeLayoutType(value: string | null | undefined): 'list' | 'grid' | 'compact' {
  const raw = (value ?? '').trim().toLowerCase();
  if (raw === 'compact') return 'compact';
  if (raw === 'grid' || raw === 'cards') return 'grid';
  return 'list';
}

function clampItemsPerRow(value: number | null | undefined, layoutType: 'list' | 'grid' | 'compact') {
  const fallback = layoutType === 'grid' ? 2 : 1;
  const parsed = typeof value === 'number' ? Math.round(value) : fallback;
  return Math.min(3, Math.max(1, parsed));
}

function getGoogleFontsUrl(branding: BrandingConfig | null | undefined) {
  const titleFont = normalizeFontName(branding?.fuente_titulos);
  const bodyFont = normalizeFontName(branding?.fuente_cuerpo);
  if (!titleFont && !bodyFont) {
    return '';
  }

  const safeTitle = (titleFont || 'Montserrat').replace(/\s+/g, '+');
  const safeBody = (bodyFont || 'Roboto').replace(/\s+/g, '+');
  return `https://fonts.googleapis.com/css2?family=${safeTitle}:wght@500;700;800&family=${safeBody}:wght@400;500;600&display=swap`;
}

function safeImageSrc(imageUrl: string | null | undefined, fallbackImageUrl?: string | null) {
  const src = (imageUrl ?? '').trim();
  if (src.length > 0) return src;

  const fallback = (fallbackImageUrl ?? '').trim();
  if (fallback.length > 0) return fallback;

  return defaultProductImage;
}

function comercioInitial(name: string | null | undefined) {
  const clean = (name ?? '').trim();
  return clean.length > 0 ? clean.slice(0, 1).toUpperCase() : 'K';
}

function paymentMethodLabel(method: MetodoPagoRow) {
  return method.nombre?.trim() || method.tipo?.trim() || method.banco?.trim() || 'Metodo de pago';
}

function paymentMethodDetails(method: MetodoPagoRow) {
  return formatPaymentMethodDetails(method);
}

function currencyCodeFromPaymentMethodTipo(tipo: string) {
  if (!tipo.includes('__')) {
    return null;
  }

  const parts = tipo.split('__').map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    if (/^[a-z]{3}$/.test(part)) {
      return part.toUpperCase();
    }
  }

  return null;
}

function paymentMethodCurrency(method: MetodoPagoRow) {
  const explicit = (method.moneda ?? method.currency ?? method.moneda_codigo ?? '')
    .toString()
    .trim();
  if (explicit.length > 0) {
    return explicit.toUpperCase();
  }

  const tipo = (method.tipo ?? '').toString().trim().toLowerCase();
  const currencyFromTipo = currencyCodeFromPaymentMethodTipo(tipo);
  if (currencyFromTipo) {
    return currencyFromTipo;
  }

  const detalles = (method.detalles ?? '').toString().trim();
  if (detalles.startsWith('{') && detalles.endsWith('}')) {
    try {
      const parsed = JSON.parse(detalles) as Record<string, unknown>;
      const detailCurrency =
        (parsed.currency ?? parsed.moneda ?? parsed.currency_code ?? parsed.moneda_codigo ?? '')
          .toString()
          .trim();
      if (detailCurrency.length > 0) {
        return detailCurrency.toUpperCase();
      }
    } catch {
      // Ignore malformed JSON and fallback to default below.
    }
  }

  return 'SIN MONEDA';
}

function paymentMethodCurrencyOrFallback(method: MetodoPagoRow, fallbackCurrency: string) {
  const detectedCurrency = paymentMethodCurrency(method);
  if (detectedCurrency === 'SIN MONEDA') {
    return normalizeCurrencyCode(fallbackCurrency);
  }
  return normalizeCurrencyCode(detectedCurrency);
}

function parseExchangeRate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const raw = (value ?? '').toString().trim().replace(',', '.');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function paymentMethodExchangeRate(method: MetodoPagoRow) {
  const directRate =
    parseExchangeRate(method.exchange_rate) ??
    parseExchangeRate(method.tasa_cambio) ??
    parseExchangeRate(method.rate);
  if (directRate) return directRate;

  const detalles = (method.detalles ?? '').toString().trim();
  if (detalles.startsWith('{') && detalles.endsWith('}')) {
    try {
      const parsed = JSON.parse(detalles) as Record<string, unknown>;
      return (
        parseExchangeRate(parsed.exchange_rate) ??
        parseExchangeRate(parsed.tasa_cambio) ??
        parseExchangeRate(parsed.rate)
      );
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeCurrencyCode(value: string | null | undefined) {
  const code = (value ?? '').trim().toUpperCase();
  if (!code || code === 'SIN MONEDA') return 'COP';
  return code;
}

function pairKey(baseCurrency: string, quoteCurrency: string) {
  return `${normalizeCurrencyCode(baseCurrency)}/${normalizeCurrencyCode(quoteCurrency)}`;
}

function googleRatesFromPayload(payload: MarketRatesRow['payload']) {
  const rates = new Map<string, number>();
  const rawRates = payload?.google_rates;
  if (!rawRates) return rates;

  for (const [key, value] of Object.entries(rawRates)) {
    const parsed = parseExchangeRate(value);
    if (parsed) {
      rates.set(key.trim().toUpperCase(), parsed);
    }
  }

  return rates;
}

function googleRateForPair(baseCurrency: string, quoteCurrency: string, anchors: Map<string, number>) {
  const base = normalizeCurrencyCode(baseCurrency);
  const quote = normalizeCurrencyCode(quoteCurrency);
  if (base === quote) return 1;

  const directRate = anchors.get(pairKey(base, quote)) ?? 0;
  if (directRate > 0) return directRate;

  const usdCop = anchors.get('USD/COP') ?? 0;
  const usdEur = anchors.get('USD/EUR') ?? 0;
  const vesUsd = anchors.get('VES/USD') ?? 0;

  if (base === 'USD' && quote === 'VES' && vesUsd > 0) return 1 / vesUsd;
  if (base === 'VES' && quote === 'USD' && vesUsd > 0) return vesUsd;

  if (base === 'COP' && quote === 'USD' && usdCop > 0) return 1 / usdCop;
  if (base === 'EUR' && quote === 'USD' && usdEur > 0) return 1 / usdEur;
  if (base === 'USD' && quote === 'COP' && usdCop > 0) return usdCop;
  if (base === 'USD' && quote === 'EUR' && usdEur > 0) return usdEur;

  if (base === 'VES' && quote === 'COP' && vesUsd > 0 && usdCop > 0) return vesUsd * usdCop;
  if (base === 'VES' && quote === 'EUR' && vesUsd > 0 && usdEur > 0) return vesUsd * usdEur;
  if (base === 'COP' && quote === 'VES' && vesUsd > 0 && usdCop > 0) {
    const vesCop = vesUsd * usdCop;
    return vesCop > 0 ? 1 / vesCop : 0;
  }
  if (base === 'EUR' && quote === 'VES' && vesUsd > 0 && usdEur > 0) {
    const vesEur = vesUsd * usdEur;
    return vesEur > 0 ? 1 / vesEur : 0;
  }
  if (base === 'COP' && quote === 'EUR' && usdCop > 0 && usdEur > 0) return usdEur / usdCop;
  if (base === 'EUR' && quote === 'COP' && usdCop > 0 && usdEur > 0) return usdCop / usdEur;

  return 0;
}

function isTrackedVesPair(baseCurrency: string, quoteCurrency: string) {
  const base = normalizeCurrencyCode(baseCurrency);
  const quote = normalizeCurrencyCode(quoteCurrency);
  const direct = quote === 'VES' && (base === 'USD' || base === 'EUR');
  const reverse = base === 'VES' && (quote === 'USD' || quote === 'EUR');
  return direct || reverse;
}

function adjustedP2pRateForBuyer(rate: number) {
  return rate > 0 ? rate * 1.006 : 0;
}

function isBcvExchangeSource(source: string) {
  const normalized = (source ?? '').trim().toLowerCase();
  return normalized === 'bcv' || normalized === 'bcv_usd' || normalized === 'bcv_eur';
}

function canonicalizeBcvSource(source: string) {
  const normalized = (source ?? '').trim().toLowerCase();
  if (normalized === 'bcv_eur') return 'bcv_eur';
  if (normalized === 'bcv' || normalized === 'bcv_usd') return 'bcv_usd';
  return normalized;
}

function bcvVesRateForSource(
  source: string,
  marketRates: MarketRatesRow | null | undefined,
) {
  const rates = marketRates?.payload?.bcv_rates;
  const usdRate = parseExchangeRate(rates?.USD) ?? parseExchangeRate(marketRates?.bcv_rate) ?? 0;
  const eurRate = parseExchangeRate(rates?.EUR) ?? 0;
  if (canonicalizeBcvSource(source) === 'bcv_eur') {
    return eurRate > 0 ? eurRate : usdRate;
  }
  return usdRate;
}

function usdToCurrencyRateForSource(source: string, currency: string, marketRates: MarketRatesRow | null | undefined) {
  const normalizedCurrency = normalizeCurrencyCode(currency);
  if (normalizedCurrency === 'USD') return 1;

  const googleRates = googleRatesFromPayload(marketRates?.payload ?? null);
  if (normalizedCurrency === 'VES') {
    const liveRate =
      source === 'p2p_binance'
        ? adjustedP2pRateForBuyer(parseExchangeRate(marketRates?.p2p_binance_rate) ?? 0)
        : parseExchangeRate(marketRates?.bcv_rate) ?? 0;
    if (liveRate > 0) return liveRate;
    return (googleRates.get('VES/USD') ?? 0) > 0 ? 1 / (googleRates.get('VES/USD') ?? 0) : 0;
  }
  if (normalizedCurrency === 'COP') return googleRates.get('USD/COP') ?? 0;
  if (normalizedCurrency === 'EUR') return googleRates.get('USD/EUR') ?? 0;
  return 0;
}

function derivedExchangeRateForCurrency(
  baseCurrency: string,
  quoteCurrency: string,
  source: string,
  marketRates: MarketRatesRow | null | undefined,
  configuredRate?: number | null,
  configuredQuoteCurrency?: string | null,
) {
  const base = normalizeCurrencyCode(baseCurrency);
  const quote = normalizeCurrencyCode(quoteCurrency);
  if (base === quote) return 1;

  if (configuredRate && configuredRate > 0 && quote === normalizeCurrencyCode(configuredQuoteCurrency ?? '')) {
    return configuredRate;
  }

  if (source === 'google') {
    const rate = googleRateForPair(base, quote, googleRatesFromPayload(marketRates?.payload ?? null));
    if (rate > 0) return rate;
  }

  if (isBcvExchangeSource(source) && (quote === 'VES' || base === 'VES')) {
    const vesRate = bcvVesRateForSource(source, marketRates);
    if (vesRate > 0) {
      if (quote === 'VES') return vesRate;
      return 1 / vesRate;
    }
  }

  if ((source === 'p2p_binance' || source === 'google') && isTrackedVesPair(base, quote)) {
    const usdToBase = usdToCurrencyRateForSource(source, base, marketRates);
    const usdToQuote = usdToCurrencyRateForSource(source, quote, marketRates);
    if (usdToBase > 0 && usdToQuote > 0) {
      const derived = usdToQuote / usdToBase;
      if (derived > 0) return derived;
    }
  }

  const googleFallback = googleRateForPair(base, quote, googleRatesFromPayload(marketRates?.payload ?? null));
  if (googleFallback > 0) return googleFallback;

  return 1;
}

function formatTickerRate(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) return '0,00';

  return rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type BrandingCheckoutConfig = {
  currencies: string[];
  exchangeRates: Record<string, number | null>;
  exchangeRateModes: Record<string, string>;
  exchangeRateSources: Record<string, string>;
};

function readBrandingCheckoutConfig(branding?: BrandingConfig | null): BrandingCheckoutConfig {
  const config = branding?.config_negocio ?? {};
  const currencies = new Set<string>();

  for (const listKey of ['checkout_currencies', 'currencies'] as const) {
    const list = config[listKey];
    if (Array.isArray(list)) {
      for (const item of list) {
        currencies.add(normalizeCurrencyCode(item?.toString()));
      }
    }
  }

  const exchangeRates: Record<string, number | null> = {};
  const rawRates = config.exchange_rates ?? {};
  for (const [key, value] of Object.entries(rawRates)) {
    const code = normalizeCurrencyCode(key);
    exchangeRates[code] = parseExchangeRate(value);
    if (code) {
      currencies.add(code);
    }
  }

  const exchangeRateModes: Record<string, string> = {};
  const rawModes = config.exchange_rate_modes ?? {};
  for (const [key, value] of Object.entries(rawModes)) {
    exchangeRateModes[normalizeCurrencyCode(key)] = (value ?? '').toString().trim().toLowerCase();
  }

  const exchangeRateSources: Record<string, string> = {};
  const rawSources = config.exchange_rate_sources ?? {};
  for (const [key, value] of Object.entries(rawSources)) {
    exchangeRateSources[normalizeCurrencyCode(key)] = (value ?? '').toString().trim().toLowerCase();
  }

  return {
    currencies: Array.from(currencies),
    exchangeRates,
    exchangeRateModes,
    exchangeRateSources,
  };
}

function businessCheckoutCurrenciesFromData(
  baseCurrency: string,
  paymentMethodsByCurrency: Array<{ currency: string; methods: MetodoPagoRow[] }>,
  branding: BrandingCheckoutConfig,
  businessQuoteCurrency: string | null,
) {
  const currencies = new Set<string>();

  for (const code of branding.currencies) {
    if (code !== baseCurrency) {
      currencies.add(code);
    }
  }

  for (const code of Object.keys(branding.exchangeRates)) {
    if (code !== baseCurrency) {
      currencies.add(code);
    }
  }

  for (const group of paymentMethodsByCurrency) {
    if (group.currency !== baseCurrency && group.methods.length > 0) {
      currencies.add(group.currency);
    }
  }

  if (businessQuoteCurrency) {
    const quote = normalizeCurrencyCode(businessQuoteCurrency);
    if (quote !== baseCurrency) {
      currencies.add(quote);
    }
  }

  return Array.from(currencies).sort((left, right) => left.localeCompare(right));
}

function resolveTickerExchangeRate(
  currency: string,
  options: {
    baseCurrency: string;
    paymentExchangeRate?: number | null;
    checkoutExchange: {
      exchangeRates: Record<string, number | null>;
      exchangeRateModes: Record<string, string>;
      exchangeRateSources: Record<string, string>;
    };
    businessExchangeRate: number | null | undefined;
    businessQuoteCurrency: string | null;
    businessExchangeSource: string;
    businessExchangeMode: string;
    marketRates: MarketRatesRow | null | undefined;
  },
) {
  const resolved = resolveCheckoutCurrencyRate(currency, {
    baseCurrency: options.baseCurrency,
    paymentExchangeRate: options.paymentExchangeRate,
    checkoutExchange: options.checkoutExchange,
    businessExchangeRate: options.businessExchangeRate,
    businessQuoteCurrency: options.businessQuoteCurrency,
    businessExchangeSource: options.businessExchangeSource,
    businessExchangeMode: options.businessExchangeMode,
    marketRates: options.marketRates,
  });
  if (Number.isFinite(resolved) && resolved > 0 && resolved !== 1) {
    return resolved;
  }
  const live = derivedExchangeRateForCurrency(
    options.baseCurrency,
    currency,
    options.businessExchangeSource,
    options.marketRates,
    options.businessExchangeRate,
    options.businessQuoteCurrency,
  );
  if (Number.isFinite(live) && live > 0 && live !== 1) {
    return live;
  }
  return resolved;
}

function buildConfiguredTickerEntries(
  baseCurrency: string,
  checkoutCurrencies: string[],
  options: {
    paymentMethodsByCurrency: Array<{ currency: string; methods: MetodoPagoRow[]; exchangeRate: number | null }>;
    brandingConfig: BrandingCheckoutConfig;
    businessExchangeRate: number | null | undefined;
    businessQuoteCurrency: string | null;
    businessExchangeSource: string;
    businessExchangeMode: string;
    marketRates: MarketRatesRow | null | undefined;
  },
) {
  const lines: string[] = [];

  for (const currency of checkoutCurrencies) {
    const paymentGroup = options.paymentMethodsByCurrency.find((group) => group.currency === currency);
    const rate = resolveTickerExchangeRate(currency, {
      baseCurrency,
      paymentExchangeRate: paymentGroup?.exchangeRate,
      checkoutExchange: options.brandingConfig,
      businessExchangeRate: options.businessExchangeRate,
      businessQuoteCurrency: options.businessQuoteCurrency,
      businessExchangeSource: options.businessExchangeSource,
      businessExchangeMode: options.businessExchangeMode,
      marketRates: options.marketRates,
    });

    if (!Number.isFinite(rate) || rate <= 0 || rate === 1) {
      continue;
    }

    if (rate < 1) {
      lines.push(`1 ${currency} = ${formatTickerRate(1 / rate)} ${baseCurrency}`);
    } else {
      lines.push(`1 ${baseCurrency} = ${formatTickerRate(rate)} ${currency}`);
    }
  }

  return lines;
}

function convertFromBaseCurrency(amountInBaseCurrency: number, baseCurrency: string, targetCurrency: string, exchangeRate: number) {
  const safeAmount = Number.isFinite(amountInBaseCurrency) ? amountInBaseCurrency : 0;
  const normalizedBaseCurrency = normalizeCurrencyCode(baseCurrency);
  const normalizedTargetCurrency = normalizeCurrencyCode(targetCurrency);
  const safeRate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;
  if (normalizedTargetCurrency === normalizedBaseCurrency) return safeAmount;
  return safeAmount * safeRate;
}

function menuGridClass(layoutType: 'list' | 'grid' | 'compact', itemsPerRow: number) {
  if (layoutType !== 'grid') {
    return layoutType === 'compact' ? 'space-y-2' : 'space-y-4';
  }

  if (itemsPerRow === 3) {
    return 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3';
  }

  return 'grid grid-cols-1 gap-4 md:grid-cols-2';
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

type CategoryVisualTheme = {
  glyph: string;
  accent: string;
  tint: string;
  border: string;
  shadow: string;
};

const DEFAULT_CATEGORY_VISUAL_THEME: CategoryVisualTheme = {
  glyph: '🍽️',
  accent: '#475569',
  tint: 'rgba(71, 85, 105, 0.12)',
  border: 'rgba(71, 85, 105, 0.2)',
  shadow: '0 10px 24px rgba(71, 85, 105, 0.18)',
};

const CATEGORY_VISUAL_RULES: Array<CategoryVisualTheme & { keywords: string[] }> = [
  {
    glyph: '🍔',
    accent: '#DD6B20',
    tint: 'rgba(221, 107, 32, 0.14)',
    border: 'rgba(221, 107, 32, 0.24)',
    shadow: '0 10px 24px rgba(221, 107, 32, 0.22)',
    keywords: ['burger', 'hamburgues', 'smash', 'cheeseburger'],
  },
  {
    glyph: '🌭',
    accent: '#D97706',
    tint: 'rgba(217, 119, 6, 0.14)',
    border: 'rgba(217, 119, 6, 0.24)',
    shadow: '0 10px 24px rgba(217, 119, 6, 0.2)',
    keywords: ['perro', 'hot dog'],
  },
  {
    glyph: '🍕',
    accent: '#DC2626',
    tint: 'rgba(220, 38, 38, 0.13)',
    border: 'rgba(220, 38, 38, 0.23)',
    shadow: '0 10px 24px rgba(220, 38, 38, 0.2)',
    keywords: ['pizza', 'pizzeria', 'pepperoni'],
  },
  {
    glyph: '🍗',
    accent: '#EA580C',
    tint: 'rgba(234, 88, 12, 0.13)',
    border: 'rgba(234, 88, 12, 0.24)',
    shadow: '0 10px 24px rgba(234, 88, 12, 0.2)',
    keywords: ['pollo', 'chicken', 'alita', 'wing', 'tender', 'nugget'],
  },
  {
    glyph: '🥩',
    accent: '#B91C1C',
    tint: 'rgba(185, 28, 28, 0.13)',
    border: 'rgba(185, 28, 28, 0.22)',
    shadow: '0 10px 24px rgba(185, 28, 28, 0.2)',
    keywords: ['beef', 'carne', 'res', 'parrilla', 'steak', 'asado'],
  },
  {
    glyph: '🥤',
    accent: '#2563EB',
    tint: 'rgba(37, 99, 235, 0.12)',
    border: 'rgba(37, 99, 235, 0.22)',
    shadow: '0 10px 24px rgba(37, 99, 235, 0.18)',
    keywords: ['bebida', 'drink', 'refresco', 'soda', 'jugo', 'juice', 'batido', 'malteada'],
  },
  {
    glyph: '☕',
    accent: '#92400E',
    tint: 'rgba(146, 64, 14, 0.14)',
    border: 'rgba(146, 64, 14, 0.22)',
    shadow: '0 10px 24px rgba(146, 64, 14, 0.18)',
    keywords: ['cafe', 'coffee', 'espresso', 'latte', 'te', 'tea'],
  },
  {
    glyph: '🍰',
    accent: '#DB2777',
    tint: 'rgba(219, 39, 119, 0.12)',
    border: 'rgba(219, 39, 119, 0.22)',
    shadow: '0 10px 24px rgba(219, 39, 119, 0.18)',
    keywords: ['postre', 'dessert', 'dulce', 'torta', 'cake', 'helado', 'ice cream', 'brownie'],
  },
  {
    glyph: '🥗',
    accent: '#15803D',
    tint: 'rgba(21, 128, 61, 0.12)',
    border: 'rgba(21, 128, 61, 0.22)',
    shadow: '0 10px 24px rgba(21, 128, 61, 0.18)',
    keywords: ['ensalada', 'salad', 'veg', 'vegetar', 'vegan', 'healthy', 'saludable'],
  },
  {
    glyph: '🍝',
    accent: '#C2410C',
    tint: 'rgba(194, 65, 12, 0.12)',
    border: 'rgba(194, 65, 12, 0.22)',
    shadow: '0 10px 24px rgba(194, 65, 12, 0.18)',
    keywords: ['pasta', 'spaghetti', 'lasagna', 'ravioli'],
  },
  {
    glyph: '🍣',
    accent: '#7C3AED',
    tint: 'rgba(124, 58, 237, 0.12)',
    border: 'rgba(124, 58, 237, 0.22)',
    shadow: '0 10px 24px rgba(124, 58, 237, 0.18)',
    keywords: ['sushi', 'ramen', 'asiat', 'noodle', 'wok', 'teriyaki'],
  },
  {
    glyph: '🌮',
    accent: '#CA8A04',
    tint: 'rgba(202, 138, 4, 0.13)',
    border: 'rgba(202, 138, 4, 0.24)',
    shadow: '0 10px 24px rgba(202, 138, 4, 0.18)',
    keywords: ['taco', 'burrito', 'mex', 'quesadilla', 'nacho'],
  },
  {
    glyph: '🍤',
    accent: '#0891B2',
    tint: 'rgba(8, 145, 178, 0.12)',
    border: 'rgba(8, 145, 178, 0.22)',
    shadow: '0 10px 24px rgba(8, 145, 178, 0.18)',
    keywords: ['marisco', 'seafood', 'pescado', 'fish', 'camaron', 'shrimp', 'ceviche'],
  },
  {
    glyph: '🍳',
    accent: '#EAB308',
    tint: 'rgba(234, 179, 8, 0.14)',
    border: 'rgba(234, 179, 8, 0.24)',
    shadow: '0 10px 24px rgba(234, 179, 8, 0.18)',
    keywords: ['desayuno', 'breakfast', 'brunch', 'waffle', 'panque', 'huevo'],
  },
  {
    glyph: '🍱',
    accent: '#0F766E',
    tint: 'rgba(15, 118, 110, 0.12)',
    border: 'rgba(15, 118, 110, 0.22)',
    shadow: '0 10px 24px rgba(15, 118, 110, 0.18)',
    keywords: ['combo', 'combos', 'promo', 'promocion', 'familiar'],
  },
  {
    glyph: '🥪',
    accent: '#B45309',
    tint: 'rgba(180, 83, 9, 0.12)',
    border: 'rgba(180, 83, 9, 0.22)',
    shadow: '0 10px 24px rgba(180, 83, 9, 0.18)',
    keywords: ['sandwich', 'sanduche', 'wrap', 'arepa', 'empanada', 'pan'],
  },
];

function formatCategoryDisplayName(value: string | null | undefined) {
  const normalized = (value ?? '').trim();
  return normalized ? normalized.toLocaleUpperCase('es-VE') : '';
}

function getAssignedCategoryGlyph(value: string | null | undefined) {
  const icon = (value ?? '').trim();
  if (!icon) return '';
  return /[a-z0-9]/i.test(icon) ? '' : icon;
}

function resolveCategoryVisual(category: Pick<CategoriaRow, 'nombre' | 'icono'>) {
  const keywordSource = normalizeSearchText(`${category.icono ?? ''} ${category.nombre ?? ''}`);
  const matchedRule = CATEGORY_VISUAL_RULES.find((rule) =>
    rule.keywords.some((keyword) => keywordSource.includes(keyword)),
  );
  const glyph = getAssignedCategoryGlyph(category.icono) || matchedRule?.glyph || DEFAULT_CATEGORY_VISUAL_THEME.glyph;

  return {
    glyph,
    accent: matchedRule?.accent || DEFAULT_CATEGORY_VISUAL_THEME.accent,
    tint: matchedRule?.tint || DEFAULT_CATEGORY_VISUAL_THEME.tint,
    border: matchedRule?.border || DEFAULT_CATEGORY_VISUAL_THEME.border,
    shadow: matchedRule?.shadow || DEFAULT_CATEGORY_VISUAL_THEME.shadow,
  };
}

function toNumberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = (value ?? '').toString().trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function currencyAllowsDecimals(currency: string) {
  const code = (currency || '').trim().toUpperCase();
  return code !== 'COP' && code !== 'SIN MONEDA';
}

function parseCashAmountInput(raw: string, currency: string) {
  const allowDecimals = currencyAllowsDecimals(currency);
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.');
  if (!cleaned) return '';
  if (!allowDecimals) {
    return cleaned.replace(/\./g, '').replace(/^0+(?=\d)/, '');
  }
  const [integerPart = '', ...fractionParts] = cleaned.split('.');
  const safeInteger = integerPart.replace(/^0+(?=\d)/, '') || (cleaned.includes('.') ? '0' : '');
  const fraction = fractionParts.join('').slice(0, 2);
  return fraction.length > 0 || cleaned.endsWith('.') ? `${safeInteger}.${fraction}` : safeInteger;
}

function suggestCashTenders(total: number, currency: string) {
  const code = (currency || 'COP').trim().toUpperCase();
  const bills =
    code === 'USD'
      ? [1, 5, 10, 20, 50, 100]
      : code === 'VES'
        ? [20, 50, 100, 200, 500, 1000, 2000]
        : [1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const suggestions = new Set<number>();
  for (const bill of bills) {
    if (bill > total) suggestions.add(bill);
  }
  const step = bills[0] ?? 1;
  const roundedUp = Math.ceil((total + 0.0001) / step) * step;
  if (roundedUp > total) suggestions.add(Number(roundedUp.toFixed(2)));
  return [...suggestions].sort((left, right) => left - right).slice(0, 4);
}

function getBrowserCurrentPoint() {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    return Promise.resolve<DeliveryPoint | null>(null);
  }

  return new Promise<DeliveryPoint | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 },
    );
  });
}

function readOwnerPreviewAccessTokenFromHash() {
  if (typeof window === 'undefined') {
    return '';
  }

  const rawHash = (window.location.hash ?? '').replace(/^#/, '').trim();
  if (!rawHash) {
    return '';
  }

  const params = new URLSearchParams(rawHash);
  const token = (params.get('access_token') ?? '').trim();
  if (token) {
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  }
  return token;
}

export default function PublicMenuPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const commerceIdentifier = (params?.id ?? '').trim();
  const isOwnerPreview = (pathname ?? '').startsWith('/preview/');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDraftMode, setIsDraftMode] = useState(false);
  const [ownerPreviewToken, setOwnerPreviewToken] = useState<string | null>(null);
  const [ownerPreviewTokenReady, setOwnerPreviewTokenReady] = useState(!isOwnerPreview);
  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isCheckoutFooterExpanded, setIsCheckoutFooterExpanded] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientWhatsappCountry, setClientWhatsappCountry] = useState<Country>('VE');
  const [clientWhatsapp, setClientWhatsapp] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutStep, setCheckoutStep] = useState(0);
  const [cashPaymentInput, setCashPaymentInput] = useState('');
  const [needsCashChange, setNeedsCashChange] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('');
  const [themeOverride, setThemeOverride] = useState<MenuThemeMode | null>(null);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [digitalPaymentReference, setDigitalPaymentReference] = useState('');
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<OrderDeliveryMode>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [deliveryPoint, setDeliveryPoint] = useState<DeliveryPoint | null>(null);
  const [deliveryPointSource, setDeliveryPointSource] = useState<DeliveryPointSelectionSource>('none');
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [mapPickerAddress, setMapPickerAddress] = useState('');
  const [isMapPickerLoading, setIsMapPickerLoading] = useState(false);
  const [isMapPickerDragging, setIsMapPickerDragging] = useState(false);
  const [mapPickerError, setMapPickerError] = useState('');
  const [mapPickerProvider, setMapPickerProvider] = useState<'google' | 'leaflet'>('google');
  const [orderNotes, setOrderNotes] = useState('');
  const [kioskFulfillment, setKioskFulfillment] = useState<KioskFulfillment | null>(null);
  const [kioskAddedPrompt, setKioskAddedPrompt] = useState<{ productName: string } | null>(null);
  const [kioskVoucher, setKioskVoucher] = useState<KioskVoucherData | null>(null);
  const [dismissedUpsellIds, setDismissedUpsellIds] = useState<Set<string>>(() => new Set());
  const [addToCartSheet, setAddToCartSheet] = useState<{
    open: boolean;
    suggestions: AddToCartSuggestion[];
  }>({ open: false, suggestions: [] });
  const [productOptionsSheet, setProductOptionsSheet] = useState<{
    open: boolean;
    productId: string | null;
  }>({ open: false, productId: null });
  const upsellAttributionRef = useRef<
    Map<string, { ruleId?: string | null; bundleId?: string | null; surface: UpsellSurface }>
  >(new Map());
  const trackedImpressionsRef = useRef<Set<string>>(new Set());
  const repeatOrderConsumedRef = useRef(false);
  const menuReadyRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [expandedProductImage, setExpandedProductImage] = useState<{
    src: string;
    alt: string;
    title: string;
    description: string;
  } | null>(null);
  const categoryChipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const productCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const categorySectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const stickySearchCardRef = useRef<HTMLDivElement | null>(null);
  const statsCardsRef = useRef<HTMLDivElement | null>(null);
  const mapPickerContainerRef = useRef<HTMLDivElement | null>(null);
  const mapPickerSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mapPickerMapRef = useRef<MapPickerHandle | null>(null);
  const mapPickerMarkerRef = useRef<unknown>(null);
  const mapPickerGeocoderRef = useRef<GoogleGeocoder | null>(null);
  const mapPickerAutocompleteRef = useRef<GoogleAutocomplete | null>(null);
  const mapPickerResolveAddressRef = useRef<((point: DeliveryPoint) => void) | null>(null);
  const shouldReturnToMenuOnEmptyCartRef = useRef(false);
  const userChangedCurrencyRef = useRef(false);
  const checkoutAttemptRef = useRef<CheckoutAttempt | null>(null);
  const [infoSections, setInfoSections] = useState({
    location: true,
    delivery: true,
    contact: true,
    payments: true,
  });
  const [statsCardsVisible, setStatsCardsVisible] = useState(false);
  const [cachedSplashLogoUrl, setCachedSplashLogoUrl] = useState('');
  const [cachedSplashName, setCachedSplashName] = useState('');
  const [isExperienceReady, setIsExperienceReady] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (typeof window === 'undefined' || !commerceIdentifier) return;

    const cachedLogo = window.sessionStorage.getItem(`${splashLogoCacheKeyPrefix}${commerceIdentifier}`) ?? '';
    const cachedName = window.sessionStorage.getItem(`${splashNameCacheKeyPrefix}${commerceIdentifier}`) ?? '';

    setCachedSplashLogoUrl(cachedLogo.trim());
    setCachedSplashName(cachedName.trim());

    if (cachedLogo.trim()) {
      void preloadImageAsset(cachedLogo.trim(), 900);
    }
  }, [commerceIdentifier]);

  useEffect(() => {
    if (typeof window === 'undefined' || !commerceIdentifier) return;
    const saved = window.sessionStorage.getItem(`${kioskFulfillmentStoragePrefix}${commerceIdentifier}`);
    if (!isKioskFulfillment(saved)) return;
    setKioskFulfillment(saved);
    setDeliveryMode(saved === 'delivery' ? 'delivery' : 'pickup');
  }, [commerceIdentifier]);

  useEffect(() => {
    if (typeof window === 'undefined' || !commerceIdentifier) return;
    const savedTheme = window.localStorage.getItem(`${kioskThemeStoragePrefix}${commerceIdentifier}`);
    if (savedTheme === 'dark' || savedTheme === 'light') {
      setThemeOverride(savedTheme);
    }
    const savedCurrency = window.sessionStorage.getItem(`${selectedCurrencyStorageKeyPrefix}${commerceIdentifier}`);
    if (savedCurrency) {
      userChangedCurrencyRef.current = true;
      setSelectedCurrency(normalizeCurrencyCode(savedCurrency));
    }
  }, [commerceIdentifier]);

  useEffect(() => {
    if (!isConfirmOpen) {
      setIsCheckoutFooterExpanded(false);
    }
  }, [isConfirmOpen]);

  useEffect(() => {
    if (!isOwnerPreview) {
      setOwnerPreviewToken(null);
      setOwnerPreviewTokenReady(true);
      return;
    }

    const token = readOwnerPreviewAccessTokenFromHash();
    setOwnerPreviewToken(token || null);
    setOwnerPreviewTokenReady(true);
  }, [isOwnerPreview]);

  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
      if (!ownerPreviewTokenReady) {
        return;
      }

      if (!supabaseUrl || !supabaseAnonKey) {
        setError('Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY.');
        setLoading(false);
        return;
      }

      if (!commerceIdentifier) {
        setError('La URL publica no contiene un slug o id valido.');
        setLoading(false);
        return;
      }

      if (isOwnerPreview && !ownerPreviewToken) {
        setError(
          'Sesion de vista previa invalida. Cierra y vuelve a abrir desde el onboarding.',
        );
        setLoading(false);
        return;
      }

      try {
        if (!menuReadyRef.current) {
          setLoading(true);
        }
        setError(null);

        const encodedIdentifier = encodeURIComponent(commerceIdentifier);
        const requestPath = isOwnerPreview
          ? `/api/menu/${encodedIdentifier}/preview`
          : `/api/menu/${encodedIdentifier}`;
        const requestInit: RequestInit = {
          method: 'GET',
          cache: 'no-store',
          headers: isOwnerPreview
            ? { Authorization: `Bearer ${ownerPreviewToken}` }
            : undefined,
          signal: AbortSignal.timeout(6_000),
        };
        let response: Response | null = null;
        let payload: { error?: string; code?: string; data?: MenuData } = {};

        try {
          try {
            response = await fetch(requestPath, requestInit);
          } catch {
            response = await fetch(`${publicBaseUrl}${requestPath}`, requestInit);
          }
          payload = (await response.json().catch(() => ({}))) as {
            error?: string;
            code?: string;
            data?: MenuData;
          };
        } catch {
          response = null;
        }

        if (!response || !response.ok) {
          if (response && !isOwnerPreview && response.status === 403) {
            const code = (payload.code ?? '').trim();
            if (code === 'MENU_DRAFT_MODE' || code === 'OWNER_EMAIL_NOT_VERIFIED') {
              if (!cancelled) {
                setIsDraftMode(true);
                setMenuData(null);
              }
              return;
            }
          }
          if (!isOwnerPreview && (!response || shouldFallbackToBrowserMenu(response.status))) {
            try {
              const fallback = await loadPublicMenuFromBrowser(commerceIdentifier);
              payload = fallback as unknown as { error?: string; code?: string; data?: MenuData };
              response = { ok: true, status: 200 } as Response;
            } catch {
              const stale = readStalePublicMenu<MenuData>(commerceIdentifier);
              if (stale?.comercio) {
                payload = { data: stale };
                response = { ok: true, status: 200 } as Response;
              } else {
                throw new Error(
                  'Estamos actualizando el menú. Intenta nuevamente en unos segundos.',
                );
              }
            }
          } else {
            throw new Error(
              payload.code === 'MENU_UNAVAILABLE'
                ? 'Estamos actualizando el menú. Intenta nuevamente en unos segundos.'
                : payload.error ?? 'No se pudo cargar el menu.',
            );
          }
        }

        const data = payload.data;
        if (!data?.comercio) {
          throw new Error('No se encontro el comercio para esta URL.');
        }

        const nextCommerceName = (data.comercio.nombre ?? commerceIdentifier).trim();
        const nextLogoUrl = (data.comercio.logo_url ?? '').trim();

        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(`${splashNameCacheKeyPrefix}${commerceIdentifier}`, nextCommerceName);
          if (nextLogoUrl) {
            window.sessionStorage.setItem(`${splashLogoCacheKeyPrefix}${commerceIdentifier}`, nextLogoUrl);
          }
          writeStalePublicMenu(commerceIdentifier, data);
        }

        if (!cancelled) {
          menuReadyRef.current = true;
          setIsDraftMode(false);
          setMenuData(data);
          setCachedSplashName(nextCommerceName);
          setCachedSplashLogoUrl(nextLogoUrl);
          setLoading(false);
          if (nextLogoUrl) {
            void preloadImageAsset(nextLogoUrl, 1200);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const raw = err instanceof Error ? err.message : '';
          const stale = !isOwnerPreview ? readStalePublicMenu<MenuData>(commerceIdentifier) : null;
          if (stale?.comercio) {
            setIsDraftMode(false);
            setMenuData(stale);
            menuReadyRef.current = true;
            setError(null);
          } else {
            const message = /timeout|aborted|signal|unavailable/i.test(raw)
              ? 'Estamos actualizando el menú. Intenta nuevamente en unos segundos.'
              : raw || 'Error cargando menu.';
            setError(message);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMenu();

    return () => {
      cancelled = true;
    };
  }, [
    commerceIdentifier,
    isOwnerPreview,
    ownerPreviewToken,
    ownerPreviewTokenReady,
  ]);

  useEffect(() => {
    if (!menuData?.comercio?.id || isOwnerPreview) return;
    void trackPublicMenuVisit(String(menuData.comercio.slug || menuData.comercio.id), isOwnerPreview);
  }, [menuData?.comercio?.id, menuData?.comercio?.slug, isOwnerPreview]);

  const categoriasConProductos = useMemo(() => {
    if (!menuData) return [];

    return menuData.categorias
      .filter((categoria) => !isServicioAdicionalName(categoria.nombre))
      .map((categoria) => ({
        ...categoria,
        productos: menuData.productos
          .filter((producto) => producto.categoria_id === categoria.id)
          .filter((producto) => !isServicioAdicionalName(producto.nombre)),
      }))
      .filter((categoria) => categoria.productos.length > 0);
  }, [menuData]);

  const categoryByProductId = useMemo(() => {
    const map = new Map<string, CategoriaRow>();
    for (const categoria of categoriasConProductos) {
      for (const producto of categoria.productos) {
        map.set(producto.id, categoria);
      }
    }
    return map;
  }, [categoriasConProductos]);

  // Bundles are synthetic products (`bundle:{id}`) so the existing cart/checkout
  // machinery (increment/decrement, totals, order summary) handles them for free.
  const productById = useMemo(() => {
    const map = new Map<string, ProductoRow>();
    for (const product of menuData?.productos ?? []) {
      map.set(product.id, product);
    }
    for (const bundle of menuData?.bundles ?? []) {
      if (bundle.enabled === false) continue;
      const items = bundle.bundle_items ?? [];
      const coverProduct = items
        .map((item) => map.get(item.product_id))
        .find((product): product is ProductoRow => Boolean((product?.imagen_url ?? '').trim()));
      map.set(`bundle:${bundle.id}`, {
        id: `bundle:${bundle.id}`,
        categoria_id: '',
        nombre: bundle.name,
        descripcion: bundle.description ?? null,
        precio: toNumberOrNull(bundle.bundle_price) ?? 0,
        imagen_url: coverProduct?.imagen_url ?? null,
        disponible: true,
        upsell_badge: null,
        precio_comparacion: null,
        upsell_enabled: false,
      });
    }
    return map;
  }, [menuData]);

  useEffect(() => {
    setCart((prev) => {
      let changed = false;
      const next: Record<string, number> = {};

      for (const [cartKey, quantity] of Object.entries(prev)) {
        const { productId } = parseCartLineKey(cartKey);
        const product = productById.get(productId);
        const unitPrice = product
          ? resolveCartLineUnitPrice(
              product,
              categoryByProductId.get(productId) ?? null,
              parseCartLineKey(cartKey).selection,
            )
          : 0;
        if (!product || unitPrice <= 0 || quantity <= 0) {
          changed = true;
          continue;
        }
        next[cartKey] = quantity;
      }

      return changed ? next : prev;
    });
  }, [categoryByProductId, productById]);

  useEffect(() => {
    if (repeatOrderConsumedRef.current || productById.size === 0) return;
    const payload = consumeRepeatOrder(commerceIdentifier);
    repeatOrderConsumedRef.current = true;
    if (!payload) return;

    const nextCart: Record<string, number> = {};
    for (const item of payload.items) {
      if (!productById.has(item.productId)) continue;
      const key = buildCartLineKey(item.productId, item.selection ?? {});
      nextCart[key] = (nextCart[key] ?? 0) + item.quantity;
    }
    if (Object.keys(nextCart).length === 0) return;

    setCart(nextCart);
    if (payload.fulfillment) {
      setKioskFulfillment(payload.fulfillment);
      setDeliveryMode(payload.fulfillment === 'delivery' ? 'delivery' : 'pickup');
      if (typeof window !== 'undefined' && commerceIdentifier) {
        window.sessionStorage.setItem(
          `${kioskFulfillmentStoragePrefix}${commerceIdentifier}`,
          payload.fulfillment,
        );
      }
    }
  }, [commerceIdentifier, productById]);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([cartKey, quantity]) => {
        const { productId, selection } = parseCartLineKey(cartKey);
        const product = productById.get(productId);
        if (!product || quantity <= 0) return null;
        const category = categoryByProductId.get(productId) ?? null;
        const unitPrice = resolveCartLineUnitPrice(product, category, selection);
        if (unitPrice <= 0) return null;
        return { cartKey, product, category, selection, quantity, unitPrice };
      })
      .filter(Boolean) as Array<{
      cartKey: string;
      product: ProductoRow;
      category: CategoriaRow | null;
      selection: CartLineSelection;
      quantity: number;
      unitPrice: number;
    }>;
  }, [cart, categoryByProductId, productById]);

  const cartCount = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity, 0), [cartItems]);
  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cartItems],
  );

  function getProductCartQuantity(productId: string) {
    return Object.entries(cart).reduce((sum, [cartKey, quantity]) => {
      if (parseCartLineKey(cartKey).productId !== productId) return sum;
      return sum + quantity;
    }, 0);
  }

  const filteredCategorias = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery);
    if (!normalizedQuery) return categoriasConProductos;

    return categoriasConProductos
      .map((categoria) => {
        const normalizedCategoryName = normalizeSearchText(categoria.nombre);
        const productos = categoria.productos.filter((producto) => {
          const haystack = normalizeSearchText(
            `${producto.nombre} ${producto.descripcion ?? ''} ${categoria.nombre}`,
          );
          return haystack.includes(normalizedQuery) || normalizedCategoryName.includes(normalizedQuery);
        });

        return {
          ...categoria,
          productos,
        };
      })
      .filter((categoria) => categoria.productos.length > 0);
  }, [categoriasConProductos, searchQuery]);

  const filteredProductIds = useMemo(
    () => filteredCategorias.flatMap((categoria) => categoria.productos.map((producto) => producto.id)),
    [filteredCategorias],
  );

  const revealedProductIds = useVisibilityReveal(filteredProductIds, productCardRefs, {
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.14,
    disabled: prefersReducedMotion,
  });

  const revealedCategoryIds = useVisibilityReveal(
    filteredCategorias.map((categoria) => categoria.id),
    categorySectionRefs,
    {
      rootMargin: '0px 0px -14% 0px',
      threshold: 0.12,
      disabled: prefersReducedMotion,
    },
  );

  const visibleCategorias = useMemo(
    () =>
      filteredCategorias.map((categoria) => ({
        ...categoria,
        displayName: formatCategoryDisplayName(categoria.nombre),
        visual: resolveCategoryVisual(categoria),
      })),
    [filteredCategorias],
  );

  const heroProduct = useMemo(() => {
    const categorySource = filteredCategorias.length > 0 ? filteredCategorias : categoriasConProductos;
    const firstWithImage = categorySource
      .flatMap((categoria) => categoria.productos)
      .find((producto) => Boolean((producto.imagen_url ?? '').trim()));

    if (firstWithImage) return firstWithImage;

    return categorySource.flatMap((categoria) => categoria.productos)[0] ?? null;
  }, [categoriasConProductos, filteredCategorias]);

  useEffect(() => {
    if (typeof window === 'undefined' || filteredCategorias.length === 0) {
      setStatsCardsVisible(false);
      return;
    }

    if (prefersReducedMotion || typeof window.IntersectionObserver === 'undefined') {
      setStatsCardsVisible(true);
      return;
    }

    const node = statsCardsRef.current;
    if (!node) return;

    const observer = new window.IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setStatsCardsVisible(true);
        observer.disconnect();
      },
      {
        root: null,
        rootMargin: '0px 0px -12% 0px',
        threshold: 0.18,
      },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [filteredCategorias.length, prefersReducedMotion]);

  useEffect(() => {
    if (loading || !menuData) {
      setIsExperienceReady(false);
      return;
    }

    if (prefersReducedMotion) {
      setIsExperienceReady(true);
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setIsExperienceReady(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [loading, menuData, prefersReducedMotion]);

  useEffect(() => {
    if (filteredCategorias.length === 0) {
      setActiveCategoryId(null);
      return;
    }

    setActiveCategoryId((prev) => {
      if (prev && filteredCategorias.some((categoria) => categoria.id === prev)) {
        return prev;
      }
      return filteredCategorias[0].id;
    });
  }, [filteredCategorias]);

  useEffect(() => {
    if (filteredCategorias.length === 0) return;

    let categoryAnchors: Array<{ id: string; top: number }> = [];
    let scrollFrameId = 0;
    let refreshFrameId = 0;

    const updateActiveCategoryFromScroll = () => {
      if (categoryAnchors.length === 0) {
        return;
      }

      const currentScrollTop = window.scrollY + 8;
      let selectedId = categoryAnchors[0].id;

      for (const anchor of categoryAnchors) {
        if (currentScrollTop < anchor.top) {
          break;
        }
        selectedId = anchor.id;
      }

      setActiveCategoryId((currentId) => (currentId === selectedId ? currentId : selectedId));
    };

    const rebuildCategoryAnchors = () => {
      const stickyOffset = getCategoryScrollOffset(stickySearchCardRef.current);

      categoryAnchors = filteredCategorias
        .map((categoria) => {
          const section = categorySectionRefs.current[categoria.id];
          if (!section) {
            return null;
          }

          return {
            id: categoria.id,
            top: Math.max(0, window.scrollY + section.getBoundingClientRect().top - stickyOffset),
          };
        })
        .filter((anchor): anchor is { id: string; top: number } => anchor !== null)
        .sort((left, right) => left.top - right.top);
    };

    const scheduleActiveCategoryUpdate = () => {
      if (scrollFrameId !== 0) {
        return;
      }

      scrollFrameId = window.requestAnimationFrame(() => {
        scrollFrameId = 0;
        updateActiveCategoryFromScroll();
      });
    };

    const scheduleAnchorRefresh = () => {
      if (refreshFrameId !== 0) {
        return;
      }

      refreshFrameId = window.requestAnimationFrame(() => {
        refreshFrameId = 0;
        rebuildCategoryAnchors();
        updateActiveCategoryFromScroll();
      });
    };

    scheduleAnchorRefresh();

    const resizeObserver =
      typeof window.ResizeObserver === 'undefined'
        ? null
        : new window.ResizeObserver(() => {
            scheduleAnchorRefresh();
          });

    if (resizeObserver) {
      if (stickySearchCardRef.current) {
        resizeObserver.observe(stickySearchCardRef.current);
      }

      for (const categoria of filteredCategorias) {
        const section = categorySectionRefs.current[categoria.id];
        if (section) {
          resizeObserver.observe(section);
        }
      }
    }

    window.addEventListener('scroll', scheduleActiveCategoryUpdate, { passive: true });
    window.addEventListener('resize', scheduleAnchorRefresh);

    return () => {
      if (scrollFrameId !== 0) {
        window.cancelAnimationFrame(scrollFrameId);
      }

      if (refreshFrameId !== 0) {
        window.cancelAnimationFrame(refreshFrameId);
      }

      resizeObserver?.disconnect();
      window.removeEventListener('scroll', scheduleActiveCategoryUpdate);
      window.removeEventListener('resize', scheduleAnchorRefresh);
    };
  }, [filteredCategorias]);

  useEffect(() => {
    if (!activeCategoryId) return;
    const chip = categoryChipRefs.current[activeCategoryId];
    if (!chip) return;
    chip.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }, [activeCategoryId, prefersReducedMotion]);

  const comercioNombre = (menuData?.comercio.nombre ?? cachedSplashName ?? commerceIdentifier ?? 'elmenuxfa.com').trim() || 'elmenuxfa.com';
  const comercioLogoUrl = (menuData?.comercio.logo_url ?? cachedSplashLogoUrl ?? '').trim();
  const comercioInitialLetter = comercioInitial(comercioNombre);
  const resolvedComercioId = (menuData?.comercio.id ?? commerceIdentifier).trim();
  const upsellSessionId = useMemo(() => getOrCreateUpsellSessionId(), []);

  function trackUpsell(params: {
    surface: UpsellSurface;
    eventType: 'impression' | 'click' | 'add' | 'dismiss' | 'purchase';
    ruleId?: string | null;
    bundleId?: string | null;
    productId?: string | null;
    unitPrice?: number | null;
    cartAmountBefore?: number | null;
    cartAmountAfter?: number | null;
    orderId?: string | null;
  }) {
    const comercioId = (menuData?.comercio.id ?? '').trim();
    if (isOwnerPreview || !comercioId) return;
    trackUpsellEvent({
      comercioId,
      sessionId: upsellSessionId,
      ...params,
    });
  }
  const resolvedSlug = (menuData?.comercio.slug ?? commerceIdentifier).trim();
  // Public identity uses menu_palette_* + menu_theme_mode (never branding_ia).
  const menuTheme = useMemo(
    () =>
      buildMenuTheme({
        themeMode: themeOverride ?? menuData?.comercio.menu_theme_mode,
        menuPalettePrimary: menuData?.comercio.menu_palette_primary,
        menuPaletteAccent: menuData?.comercio.menu_palette_accent,
        colorPrincipal: menuData?.comercio.color_principal,
      }),
    [
      themeOverride,
      menuData?.comercio.menu_theme_mode,
      menuData?.comercio.menu_palette_primary,
      menuData?.comercio.menu_palette_accent,
      menuData?.comercio.color_principal,
    ],
  );
  const themeMode = normalizeMenuThemeMode(menuTheme.themeMode);
  const layoutType = normalizeLayoutType(menuData?.comercio.menu_layout);
  const itemsPerRow = clampItemsPerRow(undefined, layoutType);
  const showImages = layoutType !== 'compact';
  const borderRadius = borderRadiusByStyle(null);
  const headingFont = normalizeFontName(menuData?.comercio.menu_font) || 'Poppins';

  const googleFontsUrl = useMemo(
    () =>
      getGoogleFontsUrl({
        fuente_titulos: headingFont,
        fuente_cuerpo: 'Inter',
      }),
    [headingFont],
  );

  const containerStyle = useMemo(
    () =>
      ({
        ...menuThemeCssVars(menuTheme),
        '--border-radius': borderRadius,
        '--font-title': fontFamilyCssValue(headingFont, 'Poppins, sans-serif'),
        '--font-body': fontFamilyCssValue('Inter', 'system-ui, sans-serif'),
        color: 'var(--menu-text)',
        fontFamily: 'var(--font-body)',
      }) as React.CSSProperties,
    [menuTheme, borderRadius, headingFont],
  );

  const titleFontStyle = useMemo(() => ({ fontFamily: 'var(--font-title)' }) as React.CSSProperties, []);

  const whatsappNumber = normalizePhone(
    menuData?.comercio.whatsapp ??
      menuData?.comercio.telefono ??
      menuData?.comercio.telefonos ??
      menuData?.comercio.celular,
  );
  const callNumber = normalizePhone(
    menuData?.comercio.telefono ??
      menuData?.comercio.telefonos ??
      menuData?.comercio.celular ??
      menuData?.comercio.whatsapp,
  );
  const receivesOrdersOnWhatsapp = menuData?.comercio.recibe_pedidos_whatsapp !== false;
  const supportsDelivery = menuData?.comercio.permite_delivery === true;
  const normalizedDeliveryAddress = deliveryAddress.trim();
  const normalizedDeliveryReference = deliveryReference.trim();
  const normalizedDeliveryInstructions = deliveryInstructions.trim();
  const normalizedOrderNotes = orderNotes.trim();
  const isDeliveryOrder = supportsDelivery && deliveryMode === 'delivery';
  const comercioAddress = [menuData?.comercio.direccion, menuData?.comercio.ciudad]
    .map((item) => (item ?? '').trim())
    .filter(Boolean)
    .join(', ');
  const businessLat = toNumberOrNull(menuData?.comercio.latitud);
  const businessLng = toNumberOrNull(menuData?.comercio.longitud);
  const hasBusinessCoords = businessLat !== null && businessLng !== null;
  const mapQuery = hasBusinessCoords
    ? `${businessLat},${businessLng}`
    : comercioAddress || `${comercioNombre} ${resolvedSlug}`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
  const mapEmbedUrl = hasBusinessCoords
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${businessLat},${businessLng}`)}&z=16&output=embed`
    : `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=15&output=embed`;
  const deliveryInfo = menuData?.comercio.permite_delivery === true
    ? 'Si, consulta cobertura por WhatsApp'
    : menuData?.comercio.permite_delivery === false
      ? 'No disponible actualmente'
      : 'Consulta disponibilidad por WhatsApp';
  const publicMenuUrl = `${publicBaseUrl}/v/${encodeURIComponent(resolvedSlug)}`;
  const normalizedClientName = clientName.trim();
  const normalizedClientWhatsapp = clientWhatsapp.trim();
  const formattedClientWhatsapp = normalizedClientWhatsapp
    ? (parsePhoneNumber(normalizedClientWhatsapp)?.formatInternational() ?? normalizedClientWhatsapp)
    : '';
  const normalizedClientEmail = clientEmail.trim().toLowerCase();
  const isClientNameValid = normalizedClientName.length >= 3;
  const isClientWhatsappValid = normalizedClientWhatsapp.length > 0 && isValidPhoneNumber(normalizedClientWhatsapp);
  const isClientEmailValid = normalizedClientEmail.length > 0 && emailRegex.test(normalizedClientEmail);
  const deliveryCostBase = toNumberOrNull(menuData?.comercio.costo_envio) ?? 0;
  const deliveryCost = isDeliveryOrder ? Math.max(0, deliveryCostBase) : 0;
  const orderSubtotal = cartTotal;
  const orderGrandTotal = orderSubtotal + deliveryCost;
  const businessBaseCurrency = normalizeCurrencyCode(menuData?.comercio.moneda ?? 'COP');
  const businessQuoteCurrencyRaw = (menuData?.comercio.exchange_rate_quote_currency ?? '').toString().trim();
  const businessQuoteCurrency = businessQuoteCurrencyRaw ? normalizeCurrencyCode(businessQuoteCurrencyRaw) : null;
  const businessExchangeSource = (menuData?.comercio.exchange_rate_source ?? 'google').toString().trim().toLowerCase();
  const businessExchangeMode = (menuData?.comercio.exchange_rate_mode ?? 'auto').toString().trim().toLowerCase();
  const businessExchangeRate =
    parseExchangeRate(menuData?.comercio.exchange_rate_value) ?? parseExchangeRate(menuData?.comercio.tasa_cambio_pesos);
  const checkoutExchangeConfig = useMemo(
    () => ({
      exchangeRates: menuData?.checkoutExchange?.exchangeRates ?? {},
      exchangeRateModes: menuData?.checkoutExchange?.exchangeRateModes ?? {},
      exchangeRateSources: menuData?.checkoutExchange?.exchangeRateSources ?? {},
    }),
    [menuData?.checkoutExchange],
  );
  const brandingCheckoutConfig = useMemo(
    () => ({
      currencies: menuData?.checkoutExchange?.currencies ?? [],
      ...checkoutExchangeConfig,
    }),
    [checkoutExchangeConfig, menuData?.checkoutExchange?.currencies],
  );
  const paymentMethodsByCurrency = useMemo(() => {
    const grouped = new Map<string, { methods: MetodoPagoRow[]; exchangeRate: number | null }>();
    for (const method of menuData?.metodosPago ?? []) {
      const currency = paymentMethodCurrencyOrFallback(method, businessBaseCurrency);
      const entry = grouped.get(currency) ?? { methods: [], exchangeRate: null };
      entry.methods.push(method);
      if (entry.exchangeRate === null) {
        entry.exchangeRate = paymentMethodExchangeRate(method);
      }
      grouped.set(currency, entry);
    }

    if (!grouped.has(businessBaseCurrency)) {
      grouped.set(businessBaseCurrency, { methods: [], exchangeRate: 1 });
    }

    return Array.from(grouped.entries())
      .map(([currency, value]) => ({
      currency,
      methods: value.methods,
      exchangeRate: resolveCheckoutCurrencyRate(currency, {
        baseCurrency: businessBaseCurrency,
        paymentExchangeRate: value.exchangeRate,
        checkoutExchange: checkoutExchangeConfig,
        businessExchangeRate,
        businessQuoteCurrency,
        businessExchangeSource,
        businessExchangeMode,
        marketRates: menuData?.marketRates,
      }),
    }))
      .sort((left, right) => {
        if (left.currency === businessBaseCurrency) return -1;
        if (right.currency === businessBaseCurrency) return 1;
        return left.currency.localeCompare(right.currency);
      });
  }, [
    brandingCheckoutConfig,
    businessBaseCurrency,
    businessExchangeMode,
    businessExchangeRate,
    businessExchangeSource,
    businessQuoteCurrency,
    checkoutExchangeConfig,
    menuData?.marketRates,
    menuData?.metodosPago,
  ]);
  const businessCheckoutCurrencies = useMemo(
    () =>
      businessCheckoutCurrenciesFromData(
        businessBaseCurrency,
        paymentMethodsByCurrency,
        brandingCheckoutConfig,
        businessQuoteCurrency,
      ),
    [brandingCheckoutConfig, businessBaseCurrency, businessQuoteCurrency, paymentMethodsByCurrency],
  );
  const selectedCurrencyGroup =
    paymentMethodsByCurrency.find((group) => group.currency === normalizeCurrencyCode(selectedCurrency)) ?? null;
  const tickerRateEntries = useMemo(
    () =>
      buildConfiguredTickerEntries(businessBaseCurrency, businessCheckoutCurrencies, {
        paymentMethodsByCurrency,
        brandingConfig: brandingCheckoutConfig,
        businessExchangeRate,
        businessQuoteCurrency,
        businessExchangeSource,
        businessExchangeMode,
        marketRates: menuData?.marketRates,
      }),
    [
      brandingCheckoutConfig,
      businessBaseCurrency,
      businessCheckoutCurrencies,
      businessExchangeMode,
      businessExchangeRate,
      businessExchangeSource,
      businessQuoteCurrency,
      menuData?.marketRates,
      paymentMethodsByCurrency,
    ],
  );
  const tickerDisplayEntries = tickerRateEntries;
  const kioskCurrencyOptions = useMemo(() => {
    const codes = new Set<string>([businessBaseCurrency]);
    for (const group of paymentMethodsByCurrency) {
      if (group.currency) codes.add(group.currency);
    }
    for (const code of businessCheckoutCurrencies) {
      if (code) codes.add(code);
    }
    return Array.from(codes).sort((left, right) => {
      if (left === businessBaseCurrency) return -1;
      if (right === businessBaseCurrency) return 1;
      return left.localeCompare(right);
    });
  }, [businessBaseCurrency, businessCheckoutCurrencies, paymentMethodsByCurrency]);
  const activeTopTickerHeightPx = topTickerHeightPx;
  const selectedCurrencyCode = normalizeCurrencyCode(
    selectedCurrency || selectedCurrencyGroup?.currency || businessBaseCurrency,
  );
  const selectedExchangeRate = useMemo(
    () =>
      selectedCurrencyCode === businessBaseCurrency
        ? 1
        : resolveTickerExchangeRate(selectedCurrencyCode, {
            baseCurrency: businessBaseCurrency,
            paymentExchangeRate: selectedCurrencyGroup?.exchangeRate,
            checkoutExchange: checkoutExchangeConfig,
            businessExchangeRate,
            businessQuoteCurrency,
            businessExchangeSource,
            businessExchangeMode,
            marketRates: menuData?.marketRates,
          }),
    [
      businessBaseCurrency,
      businessExchangeMode,
      businessExchangeRate,
      businessExchangeSource,
      businessQuoteCurrency,
      checkoutExchangeConfig,
      menuData?.marketRates,
      selectedCurrencyCode,
      selectedCurrencyGroup?.exchangeRate,
    ],
  );
  const selectedExchangeSource = useMemo(
    () =>
      resolveCheckoutCurrencySource(selectedCurrencyCode, {
        checkoutExchange: checkoutExchangeConfig,
        businessExchangeSource,
      }),
    [businessExchangeSource, checkoutExchangeConfig, selectedCurrencyCode],
  );
  const orderSubtotalConverted = convertFromBaseCurrency(
    orderSubtotal,
    businessBaseCurrency,
    selectedCurrencyCode,
    selectedExchangeRate,
  );
  const deliveryCostConverted = convertFromBaseCurrency(
    deliveryCost,
    businessBaseCurrency,
    selectedCurrencyCode,
    selectedExchangeRate,
  );
  const orderGrandTotalConverted = convertFromBaseCurrency(
    orderGrandTotal,
    businessBaseCurrency,
    selectedCurrencyCode,
    selectedExchangeRate,
  );
  const cartTotalConverted = convertFromBaseCurrency(
    cartTotal,
    businessBaseCurrency,
    selectedCurrencyCode,
    selectedExchangeRate,
  );
  const summaryCategoryCount = filteredCategorias.length;
  const summaryProductCount = categoriasConProductos.reduce((sum, categoria) => sum + categoria.productos.length, 0);
  const statsMotionEnabled = isExperienceReady || statsCardsVisible;
  const animatedCategoryCount = useCountUp(
    summaryCategoryCount,
    statsMotionEnabled,
    prefersReducedMotion ? MOTION_TOKENS.duration.instant : 950,
  );
  const animatedProductCount = useCountUp(
    summaryProductCount,
    statsMotionEnabled,
    prefersReducedMotion ? MOTION_TOKENS.duration.instant : 1250,
  );
  const heroImageSrc = safeImageSrc(heroProduct?.imagen_url, comercioLogoUrl);
  const heroLocation = [menuData?.comercio.ciudad, menuData?.comercio.direccion]
    .map((item) => (item ?? '').trim())
    .filter(Boolean)
    .join(', ');
  const heroSubtitle =
    menuData?.comercio.descripcion?.trim() ||
    (visibleCategorias[0]?.displayName
      ? `Explora ${visibleCategorias[0].displayName} y pide directo desde tu mesa.`
      : 'Explora el menú y arma tu pedido en segundos.');
  const heroBadgeLabel = searchQuery.trim() ? 'Resultados del menú' : 'Disponible hoy';

  const upsellHeroCover = useMemo(
    () => resolveHeroCover(menuData?.productos ?? [], comercioLogoUrl) || null,
    [comercioLogoUrl, menuData?.productos],
  );

  const engineOrderType: EngineOrderType = isDeliveryOrder ? 'delivery' : 'pickup';

  const engineProducts = useMemo(() => {
    const map = new Map<string, EngineProduct>();
    for (const producto of menuData?.productos ?? []) {
      map.set(producto.id, {
        id: producto.id,
        categoria_id: producto.categoria_id,
        nombre: producto.nombre,
        precio: producto.precio,
        disponible: producto.disponible,
        upsell_enabled: producto.upsell_enabled,
        orden: producto.orden,
      });
    }
    return map;
  }, [menuData?.productos]);

  const engineRules: EngineRule[] = useMemo(
    () =>
      (menuData?.upsellRules ?? []).map((rule) => ({
        id: rule.id,
        enabled: rule.enabled,
        trigger_type: rule.trigger_type,
        trigger_product_id: rule.trigger_product_id,
        trigger_category_id: rule.trigger_category_id,
        trigger_min_qty: rule.trigger_min_qty,
        surface: rule.surface,
        priority: rule.priority,
        min_cart_amount: toNumberOrNull(rule.min_cart_amount),
        max_cart_amount: toNumberOrNull(rule.max_cart_amount),
        order_type: rule.order_type,
        max_suggestions: rule.max_suggestions,
        targets: (rule.upsell_rule_targets ?? []).map((target) => ({
          target_type: target.target_type,
          product_id: target.product_id,
          category_id: target.category_id,
          position: target.position,
          enabled: target.enabled,
        })),
      })),
    [menuData?.upsellRules],
  );

  const engineSettings: EngineSettings | null = useMemo(() => {
    const settings = menuData?.upsellSettings;
    if (!settings) return null;
    return {
      enabled: settings.enabled,
      show_add_to_cart: settings.show_add_to_cart,
      show_cart: settings.show_cart,
      show_checkout: settings.show_checkout,
      max_add_suggestions: settings.max_add_suggestions,
      max_cart_suggestions: settings.max_cart_suggestions,
      max_checkout_suggestions: settings.max_checkout_suggestions,
    };
  }, [menuData?.upsellSettings]);

  const cartLinesForEngine = useMemo(
    () =>
      cartItems
        .filter(({ product }) => Boolean(product.categoria_id))
        .map(({ product, quantity }) => ({
          productId: product.id,
          categoryId: product.categoria_id,
          quantity,
        })),
    [cartItems],
  );

  function resolveSuggestions(surface: EngineSurface, justAddedProductId?: string | null) {
    return resolveUpsellSuggestions({
      settings: engineSettings,
      rules: engineRules,
      products: engineProducts,
      cart: cartLinesForEngine,
      cartTotal,
      surface,
      orderType: engineOrderType,
      justAddedProductId,
      dismissedProductIds: dismissedUpsellIds,
    });
  }

  function suggestionsToViewItems(suggestions: { productId: string; ruleId: string }[]) {
    return suggestions
      .map((suggestion) => {
        const product = productById.get(suggestion.productId);
        if (!product) return null;
        return {
          productId: suggestion.productId,
          ruleId: suggestion.ruleId,
          name: product.nombre,
          price: product.precio ?? 0,
          imageUrl: displayProductImage(product.imagen_url, comercioLogoUrl) || null,
        };
      })
      .filter(Boolean) as Array<{ productId: string; ruleId: string; name: string; price: number; imageUrl: string | null }>;
  }

  const cartUpsellSuggestions: CartUpsellSuggestion[] = useMemo(
    () => suggestionsToViewItems(resolveSuggestions('cart')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartLinesForEngine, cartTotal, engineOrderType, engineProducts, engineRules, engineSettings, dismissedUpsellIds, productById, comercioLogoUrl],
  );

  const checkoutUpsellSuggestions: CartUpsellSuggestion[] = useMemo(
    () => suggestionsToViewItems(resolveSuggestions('checkout')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartLinesForEngine, cartTotal, engineOrderType, engineProducts, engineRules, engineSettings, dismissedUpsellIds, productById, comercioLogoUrl],
  );

  const bundleRailItems: BundleRailItem[] = useMemo(() => {
    return (menuData?.bundles ?? [])
      .filter((bundle) => bundle.enabled !== false)
      .map((bundle) => {
        const items = bundle.bundle_items ?? [];
        const normalPrice = items.reduce((sum, item) => {
          const product = menuData?.productos.find((p) => p.id === item.product_id);
          return sum + (product?.precio ?? 0) * item.quantity;
        }, 0);
        const coverProduct = items
          .map((item) => menuData?.productos.find((p) => p.id === item.product_id))
          .find((product) => Boolean((product?.imagen_url ?? '').trim()));
        const itemsLabel = items
          .map((item) => {
            const product = menuData?.productos.find((p) => p.id === item.product_id);
            return `${item.quantity} ${product?.nombre ?? ''}`.trim();
          })
          .filter(Boolean)
          .join(' + ');
        return {
          id: bundle.id,
          name: bundle.name,
          description: bundle.description,
          price: toNumberOrNull(bundle.bundle_price) ?? 0,
          normalPrice,
          imageUrl: displayProductImage(coverProduct?.imagen_url, comercioLogoUrl) || null,
          itemsLabel,
        };
      });
  }, [comercioLogoUrl, menuData?.bundles, menuData?.productos]);

  const deliveryProgress = useMemo(
    () =>
      resolveFreeDeliveryGoal({
        subtotal: cartTotal,
        threshold: toNumberOrNull(menuData?.upsellSettings?.free_delivery_threshold),
        orderType: engineOrderType,
        applicableOrderTypes: menuData?.upsellSettings?.free_delivery_order_types,
      }),
    [cartTotal, engineOrderType, menuData?.upsellSettings],
  );
  const formatUpsellPrice = (amount: number) =>
    formatAmountByCurrency(
      convertFromBaseCurrency(amount, businessBaseCurrency, selectedCurrencyCode, selectedExchangeRate),
      selectedCurrencyCode,
    );
  const upsellGridProducts = useMemo(() => {
    const source = visibleCategorias.flatMap((categoria) =>
      categoria.productos.map((producto) => {
        const requiresConfiguration = productRequiresConfiguration(producto, categoria);
        return {
          ...producto,
          requiresConfiguration,
          priceLabel: formatProductPriceLabel(producto, formatUpsellPrice),
        };
      }),
    );
    // Prefer products of the active category first for the 2-col grid feel.
    if (!activeCategoryId) return source;
    const active = source.filter((p) =>
      visibleCategorias.find((c) => c.id === activeCategoryId)?.productos.some((x) => x.id === p.id),
    );
    return active.length ? active : source;
  }, [activeCategoryId, formatUpsellPrice, visibleCategorias]);
  const checkoutStepTitles = ['Pedido', 'Cliente', 'Entrega', 'Pago'];
  const checkoutFlowSteps = isDeliveryOrder
    ? [
        { id: 0, title: 'Pedido' },
        { id: 1, title: 'Tus datos' },
        { id: 2, title: 'Direccion' },
        { id: 3, title: 'Pago' },
      ]
    : [
        { id: 0, title: 'Pedido' },
        { id: 1, title: 'Tus datos' },
        { id: 3, title: 'Pago' },
      ];
  const selectedMethod = selectedPaymentMethod();
  const selectedPaymentLabel = selectedMethod ? paymentMethodLabel(selectedMethod) : '';
  const isCashPayment = selectedPaymentLabel.toLowerCase().includes('efectivo');
  const isDigitalPayment = Boolean(selectedMethod) && !isCashPayment;
  const paymentReferenceLast4 = normalizePhone(digitalPaymentReference).slice(-4);
  const isPaymentReferenceValid = !isDigitalPayment || /^\d{4}$/.test(paymentReferenceLast4);
  const hasPaymentProof = !isDigitalPayment || paymentProofFile !== null;
  const paymentWithAmount = toNumberOrNull(cashPaymentInput);
  const cashChangeRequired = isDeliveryOrder && isCashPayment && needsCashChange;
  const isCashTenderValid =
    !cashChangeRequired ||
    (paymentWithAmount !== null && paymentWithAmount > orderGrandTotalConverted);
  const changeAmount =
    cashChangeRequired && isCashTenderValid && paymentWithAmount !== null
      ? paymentWithAmount - orderGrandTotalConverted
      : 0;
  const cashTenderSuggestions = cashChangeRequired
    ? suggestCashTenders(orderGrandTotalConverted, selectedCurrencyCode)
    : [];
  const hasDeliveryPoint = !isDeliveryOrder || (deliveryPoint !== null && deliveryPointSource === 'user');
  const isDeliveryAddressValid = !isDeliveryOrder || normalizedDeliveryAddress.length >= 6;
  const isDeliveryReady = isDeliveryAddressValid && hasDeliveryPoint;
  const checkoutStepDescriptions = ['Edita tu pedido', 'Tus datos', 'Entrega', 'Pago'];
  const checkoutProgress = (checkoutStep + 1) / checkoutStepTitles.length;
  const nextStepCtaLabels = ['Continuar', 'Continuar', 'Continuar'];
  const checkoutSummaryItems = useMemo(
    () =>
      cartItems.map(({ cartKey, product, category, selection, quantity, unitPrice: baseUnitPrice }) => {
        const unitPrice = convertFromBaseCurrency(
          baseUnitPrice,
          businessBaseCurrency,
          selectedCurrencyCode,
          selectedExchangeRate,
        );
        const optionSummary = summarizeCartLineSelection(product, selection, category);
        return {
          id: cartKey,
          name: buildOrderLineLabel(product, selection, category),
          description: optionSummary || (product.descripcion ?? '').trim(),
          imageUrl: safeImageSrc(product.imagen_url, comercioLogoUrl),
          quantity,
          canIncrease: baseUnitPrice > 0,
          unitPrice,
          totalPrice: unitPrice * quantity,
        };
      }),
    [
      businessBaseCurrency,
      cartItems,
      comercioLogoUrl,
      selectedCurrencyCode,
      selectedExchangeRate,
    ],
  );
  const checkoutItemsCount = checkoutSummaryItems.reduce((sum, item) => sum + item.quantity, 0);
  const canGoNextFromStep0 = checkoutItemsCount > 0;
  const canGoNextFromStep1 = isClientNameValid && isClientWhatsappValid && isClientEmailValid;
  const canGoNextFromStep2 = isDeliveryReady;
  const scheduleStatus = useMemo(
    () => resolveBusinessScheduleStatus(menuData?.comercio?.horarios),
    [menuData?.comercio?.horarios],
  );
  const scheduleClosed = scheduleStatus.configured && !scheduleStatus.isOpen;
  const kioskOpenCaption =
    scheduleStatus.closesAtLabel === '24 horas'
      ? 'Abierto las 24 horas'
      : scheduleStatus.closesAtLabel
        ? `Abierto hasta las ${scheduleStatus.closesAtLabel}`
        : 'Abierto ahora';
  const kioskClosedCaption = scheduleStatus.nextOpenLabel
    ? `Cerrado · Abrimos ${scheduleStatus.nextOpenLabel}`
    : 'Cerrado ahora';
  const kioskCategories = useMemo(
    () =>
      categoriasConProductos.map((categoria) => {
        const cover =
          categoria.productos
            .map((producto) => displayProductImage(producto.imagen_url, comercioLogoUrl))
            .find(Boolean) ?? null;
        return {
          id: categoria.id,
          name: formatCategoryDisplayName(categoria.nombre),
          glyph: resolveCategoryVisual(categoria).glyph,
          coverUrl: cover,
          productCount: categoria.productos.length,
        };
      }),
    [categoriasConProductos, comercioLogoUrl],
  );
  const kioskProductsByCategory = useMemo(() => {
    const map: Record<string, Array<{
      id: string;
      name: string;
      description: string;
      priceLabel: string;
      imageUrl: string | null;
      available: boolean;
    }>> = {};
    for (const categoria of categoriasConProductos) {
      map[categoria.id] = categoria.productos.map((producto) => ({
        id: producto.id,
        name: producto.nombre,
        description: (producto.descripcion ?? '').trim(),
        priceLabel: formatProductPriceLabel(producto, formatUpsellPrice),
        imageUrl: displayProductImage(producto.imagen_url, comercioLogoUrl),
        available: producto.disponible !== false,
      }));
    }
    return map;
  }, [categoriasConProductos, comercioLogoUrl, formatUpsellPrice]);

  function selectKioskFulfillment(next: KioskFulfillment) {
    if (scheduleClosed) return;
    setKioskFulfillment(next);
    setDeliveryMode(next === 'delivery' ? 'delivery' : 'pickup');
    setSearchQuery('');
    if (typeof window !== 'undefined' && commerceIdentifier) {
      window.sessionStorage.setItem(`${kioskFulfillmentStoragePrefix}${commerceIdentifier}`, next);
    }
  }

  function resetKioskFulfillment() {
    setKioskFulfillment(null);
    setDeliveryMode('pickup');
    setSearchQuery('');
    if (typeof window !== 'undefined' && commerceIdentifier) {
      window.sessionStorage.removeItem(`${kioskFulfillmentStoragePrefix}${commerceIdentifier}`);
    }
  }

  useEffect(() => {
    if (!scheduleClosed) return;
    setKioskFulfillment(null);
    setDeliveryMode('pickup');
    setKioskAddedPrompt(null);
    setIsConfirmOpen(false);
    setProductOptionsSheet({ open: false, productId: null });
    if (typeof window !== 'undefined' && commerceIdentifier) {
      window.sessionStorage.removeItem(`${kioskFulfillmentStoragePrefix}${commerceIdentifier}`);
    }
  }, [scheduleClosed, commerceIdentifier]);

  function handleKioskAddProduct(productId: string) {
    if (scheduleClosed) {
      window.alert(scheduleStatus.caption || 'El restaurante está cerrado actualmente');
      return;
    }
    setProductOptionsSheet({ open: true, productId });
  }

  const canSubmitStep3 =
    ((menuData?.metodosPago.length ?? 0) === 0 ||
      (selectedPaymentMethodId !== null && isPaymentReferenceValid && hasPaymentProof)) &&
    isCashTenderValid;
  const canAdvanceCurrentStep =
    checkoutStep === 0
      ? canGoNextFromStep0
      : checkoutStep === 1
        ? canGoNextFromStep1
        : checkoutStep === 2
          ? canGoNextFromStep2
          : canSubmitStep3;
  const canSubmitCheckout =
    canGoNextFromStep0 &&
    canGoNextFromStep1 &&
    canGoNextFromStep2 &&
    canSubmitStep3 &&
    !scheduleClosed;
  const currentCheckoutStepTitle = checkoutStepTitles[checkoutStep] ?? 'Confirmar pedido';
  const currentCheckoutStepDescription = checkoutStepDescriptions[checkoutStep] ?? checkoutStepDescriptions[0];
  const selectedPaymentSummary = selectedPaymentLabel || 'Por seleccionar';
  const selectedPaymentDetailsSummary = selectedMethod ? paymentMethodDetails(selectedMethod).slice(0, 2).join(' · ') : '';
  const clientSummaryLine = normalizedClientName || 'Agrega tu nombre completo';
  const contactSummaryLine = formattedClientWhatsapp || 'Agrega tu WhatsApp';
  const deliverySummary = isDeliveryOrder
    ? normalizedDeliveryAddress || 'Aun no has definido la direccion de entrega.'
    : 'Retiro en tienda';
  const compactCheckoutSummary = checkoutStep > 0;
  const renderCheckoutSummary = (variant: 'mobile' | 'desktop') => {
    const isDesktop = variant === 'desktop';
    return (
      <aside className={isDesktop ? 'hidden lg:block' : 'mb-4 lg:hidden'}>
        <div
          className={isDesktop
            ? 'sticky top-4 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_65px_rgba(15,23,42,0.12)]'
            : 'overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.10)]'}
        >
          <div className="border-b border-slate-200 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary-color)_11%,white)_0%,white_100%)] px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Tu pedido</p>
                <h4 className="mt-1 text-2xl font-black tracking-[-0.035em] text-slate-950" style={titleFontStyle}>
                  {formatAmountByCurrency(orderGrandTotalConverted, selectedCurrencyCode)}
                </h4>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {checkoutItemsCount} producto{checkoutItemsCount === 1 ? '' : 's'} · {selectedCurrencyCode}
                </p>
              </div>
              {selectedPaymentLabel ? (
                <div className="rounded-full border border-white/70 bg-white px-3 py-2 text-[11px] font-black text-slate-700 shadow-sm">
                  {selectedPaymentSummary}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-black text-slate-700">
                {checkoutItemsCount} item{checkoutItemsCount === 1 ? '' : 's'}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-black text-slate-700">
                {isDeliveryOrder ? 'Delivery' : 'Retiro'}
              </span>
              {normalizedClientName ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-black text-slate-700">
                  {normalizedClientName}
                </span>
              ) : null}
              {selectedPaymentLabel ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-black text-slate-700">
                  {selectedPaymentSummary}
                </span>
              ) : null}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Resumen</p>
                <p className="text-[11px] font-semibold text-slate-500">{checkoutItemsCount} uds</p>
              </div>
              <div className={isDesktop ? 'max-h-[320px] space-y-2 overflow-y-auto pr-1' : 'space-y-2'}>
                {checkoutSummaryItems.map((item) => (
                  <article key={`checkout-summary-${item.id}`} className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-14 w-14 shrink-0 rounded-[18px] border border-slate-200 bg-slate-50 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">{item.name}</p>
                          {!compactCheckoutSummary && item.description ? (
                            <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-5 text-slate-500">{item.description}</p>
                          ) : null}
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-slate-600">
                          x{item.quantity}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
                        <span>{formatAmountByCurrency(item.unitPrice, selectedCurrencyCode)} c/u</span>
                        <span className="text-sm font-black text-slate-900">
                          {formatAmountByCurrency(item.totalPrice, selectedCurrencyCode)}
                        </span>
                      </div>
                      {!compactCheckoutSummary ? (
                        <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1">
                          <button
                            type="button"
                            onClick={() => decrementProduct(item.id)}
                            className="grid h-8 w-8 place-items-center rounded-full bg-white text-base font-black text-slate-700"
                            aria-label={`Reducir cantidad de ${item.name}`}
                          >
                            −
                          </button>
                          <span className="min-w-8 px-2 text-center text-sm font-black text-slate-900">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => incrementCartLine(item.id)}
                            disabled={!item.canIncrease}
                            className="grid h-8 w-8 place-items-center rounded-full bg-white text-base font-black text-slate-700 disabled:opacity-40"
                            aria-label={`Aumentar cantidad de ${item.name}`}
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCart((prev) => {
                            const next = { ...prev };
                            delete next[item.id];
                            return next;
                          })}
                          className="text-[11px] font-black uppercase tracking-[0.08em] text-rose-500"
                        >
                          Eliminar
                        </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Total</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-3">
                  <span>Subtotal</span>
                  <span className="font-semibold">{formatAmountByCurrency(orderSubtotalConverted, selectedCurrencyCode)}</span>
                </div>
                {isDeliveryOrder ? (
                  <div className="flex items-center justify-between gap-3">
                    <span>Costo de envio</span>
                    <span className="font-semibold">{formatAmountByCurrency(deliveryCostConverted, selectedCurrencyCode)}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2.5">
                  <span className="font-semibold text-slate-900">Total</span>
                  <span className="text-base font-black text-slate-950" style={titleFontStyle}>
                    {formatAmountByCurrency(orderGrandTotalConverted, selectedCurrencyCode)}
                  </span>
                </div>
              </div>
              {selectedCurrencyCode !== businessBaseCurrency ? (
                <p className="mt-2 text-[11px] font-semibold text-slate-500">
                  Tasa usada ({exchangeSourceLabel(selectedExchangeSource)}): 1 {businessBaseCurrency} = {formatTickerRate(selectedExchangeRate)} {selectedCurrencyCode}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </aside>
    );
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(checkoutDraftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        clientName?: string;
        clientWhatsapp?: string;
        clientEmail?: string;
        selectedCurrency?: string;
      };

      const savedName = (parsed.clientName ?? '').trim();
      const savedEmail = (parsed.clientEmail ?? '').trim();
      const savedWhatsapp = (parsed.clientWhatsapp ?? '').trim();

      if (savedName && /\s/.test(savedName)) setClientName(savedName);
      if (savedEmail) setClientEmail(savedEmail);

      if (savedWhatsapp) {
        const parsedPhone = parsePhoneNumber(savedWhatsapp);
        if (parsedPhone?.country) {
          setClientWhatsappCountry(parsedPhone.country as Country);
        }
        setClientWhatsapp(savedWhatsapp);
      }
    } catch {
      // Ignore malformed stored checkout draft.
    }
  }, []);

  useEffect(() => {
    if (!isDeliveryOrder || !isCashPayment) {
      setNeedsCashChange(false);
      setCashPaymentInput('');
    }
  }, [isCashPayment, isDeliveryOrder]);

  useEffect(() => {
    if (!isDigitalPayment) {
      setDigitalPaymentReference('');
      setPaymentProofFile(null);
    }
  }, [isDigitalPayment]);

  useEffect(() => {
    if (paymentMethodsByCurrency.length === 0 && kioskCurrencyOptions.length === 0) {
      return;
    }

    const availableCurrencies = new Set(kioskCurrencyOptions);
    const current = normalizeCurrencyCode(selectedCurrency);
    if (current && availableCurrencies.has(current)) {
      return;
    }

    const saved =
      typeof window !== 'undefined' && commerceIdentifier
        ? window.sessionStorage.getItem(`${selectedCurrencyStorageKeyPrefix}${commerceIdentifier}`)
        : null;
    const savedCode = saved ? normalizeCurrencyCode(saved) : '';
    if (savedCode && availableCurrencies.has(savedCode)) {
      userChangedCurrencyRef.current = true;
      setSelectedCurrency(savedCode);
      return;
    }

    const defaultCurrency = availableCurrencies.has(businessBaseCurrency)
      ? businessBaseCurrency
      : kioskCurrencyOptions[0] || businessBaseCurrency;
    setSelectedCurrency(defaultCurrency);
  }, [businessBaseCurrency, commerceIdentifier, kioskCurrencyOptions, paymentMethodsByCurrency.length, selectedCurrency]);

  function selectMenuCurrency(currency: string) {
    const next = normalizeCurrencyCode(currency);
    userChangedCurrencyRef.current = true;
    setSelectedCurrency(next);
    if (typeof window !== 'undefined' && commerceIdentifier) {
      window.sessionStorage.setItem(`${selectedCurrencyStorageKeyPrefix}${commerceIdentifier}`, next);
    }
  }

  function toggleKioskTheme() {
    const next: MenuThemeMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeOverride(next);
    if (typeof window !== 'undefined' && commerceIdentifier) {
      window.localStorage.setItem(`${kioskThemeStoragePrefix}${commerceIdentifier}`, next);
    }
  }

  useEffect(() => {
    if (!isInfoOpen && !isConfirmOpen && !expandedProductImage && !isMapPickerOpen && !isQuickActionsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isInfoOpen, isConfirmOpen, expandedProductImage, isMapPickerOpen, isQuickActionsOpen]);

  useEffect(() => {
    if (isInfoOpen || isConfirmOpen || expandedProductImage || isMapPickerOpen) {
      setIsQuickActionsOpen(false);
    }
  }, [isInfoOpen, isConfirmOpen, expandedProductImage, isMapPickerOpen]);

  useEffect(() => {
    if (cartCount > 0 || !isConfirmOpen) return;
    setCheckoutError(null);
    setCheckoutStep(0);

    if (shouldReturnToMenuOnEmptyCartRef.current) {
      shouldReturnToMenuOnEmptyCartRef.current = false;
      setIsConfirmOpen(false);

      window.setTimeout(() => {
        const target = stickySearchCardRef.current;
        const targetTop = target
          ? window.scrollY + target.getBoundingClientRect().top - (topTickerHeightPx + topAppBarHeightPx + 12)
          : 0;
        window.scrollTo({ top: Math.max(0, targetTop), behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      }, 120);
    }
  }, [cartCount, isConfirmOpen, prefersReducedMotion]);

  useEffect(() => {
    if (!isConfirmOpen || checkoutStep !== 0) return;
    for (const suggestion of cartUpsellSuggestions) {
      const key = `cart:${suggestion.productId}`;
      if (trackedImpressionsRef.current.has(key)) continue;
      trackedImpressionsRef.current.add(key);
      trackUpsell({
        surface: 'cart',
        eventType: 'impression',
        ruleId: suggestion.ruleId,
        productId: suggestion.productId,
        unitPrice: suggestion.price,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartUpsellSuggestions, isConfirmOpen, checkoutStep]);

  useEffect(() => {
    if (!isConfirmOpen || checkoutStep !== 3) return;
    for (const suggestion of checkoutUpsellSuggestions) {
      const key = `checkout:${suggestion.productId}`;
      if (trackedImpressionsRef.current.has(key)) continue;
      trackedImpressionsRef.current.add(key);
      trackUpsell({
        surface: 'checkout',
        eventType: 'impression',
        ruleId: suggestion.ruleId,
        productId: suggestion.productId,
        unitPrice: suggestion.price,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutUpsellSuggestions, isConfirmOpen, checkoutStep]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateScrollTopButton = () => {
      setShowScrollTopButton(window.scrollY > 420);
    };

    updateScrollTopButton();
    window.addEventListener('scroll', updateScrollTopButton, { passive: true });

    return () => {
      window.removeEventListener('scroll', updateScrollTopButton);
    };
  }, []);

  useEffect(() => {
    if (!menuData) return;
    if (!selectedPaymentMethodId && menuData.metodosPago.length > 0) {
      setSelectedPaymentMethodId(menuData.metodosPago[0].id);
    }
  }, [menuData, selectedPaymentMethodId]);

  useEffect(() => {
    if (!selectedCurrencyGroup || selectedCurrencyGroup.methods.length === 0) return;
    if (!selectedPaymentMethodId) {
      setSelectedPaymentMethodId(selectedCurrencyGroup.methods[0].id);
      return;
    }
    const stillAvailable = selectedCurrencyGroup.methods.some((method) => method.id === selectedPaymentMethodId);
    if (!stillAvailable) {
      setSelectedPaymentMethodId(selectedCurrencyGroup.methods[0].id);
    }
  }, [selectedCurrencyGroup, selectedPaymentMethodId]);

  useEffect(() => {
    if (supportsDelivery) return;
    setDeliveryMode('pickup');
  }, [supportsDelivery]);

  useEffect(() => {
    if (!isMapPickerOpen) return;

    let disposed = false;
    let lastResolvedPoint: DeliveryPoint | null = null;

    const shouldResolvePoint = (point: DeliveryPoint) => {
      if (!lastResolvedPoint) return true;
      const latDiff = Math.abs(lastResolvedPoint.lat - point.lat);
      const lngDiff = Math.abs(lastResolvedPoint.lng - point.lng);
      return latDiff > 0.00003 || lngDiff > 0.00003;
    };

    const markResolvedPoint = (point: DeliveryPoint) => {
      lastResolvedPoint = point;
    };

    const cleanupMapRefs = () => {
      if (mapPickerMapRef.current?.remove) {
        mapPickerMapRef.current.remove();
      }
      mapPickerMapRef.current = null;
      mapPickerMarkerRef.current = null;
      mapPickerGeocoderRef.current = null;
      mapPickerAutocompleteRef.current = null;
      mapPickerResolveAddressRef.current = null;
    };

    const resolveInitialPoint = async () => {
      if (deliveryPoint) return deliveryPoint;
      const browserPoint = await getBrowserCurrentPoint();
      if (browserPoint) return browserPoint;
      if (hasBusinessCoords) return { lat: businessLat, lng: businessLng };
      return { lat: 10.4806, lng: -66.9036 };
    };

    const attachLeaflet = async (initialPoint: DeliveryPoint) => {
      try {
        const L = await loadLeafletAssets();
        if (disposed) return;

        if (!L || !mapPickerContainerRef.current) {
          setMapPickerError('No se pudo cargar el mapa en este dispositivo.');
          setIsMapPickerLoading(false);
          return;
        }

        setMapPickerProvider('leaflet');
        mapPickerContainerRef.current.innerHTML = '';

        const map = L.map(mapPickerContainerRef.current, {
          zoomControl: false,
          attributionControl: true,
        }).setView([initialPoint.lat, initialPoint.lng], 16);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);

        mapPickerMapRef.current = map;
        mapPickerMarkerRef.current = null;
        setDeliveryPoint(initialPoint);

        const resolveAddress = async (point: DeliveryPoint) => {
          if (!shouldResolvePoint(point)) {
            setIsMapPickerLoading(false);
            return;
          }
          const address = await reverseGeocodeWithNominatim(point);
          if (disposed) return;
          markResolvedPoint(point);
          setMapPickerAddress(address);
          setIsMapPickerLoading(false);
        };

        mapPickerResolveAddressRef.current = (point: DeliveryPoint) => {
          setIsMapPickerLoading(true);
          void resolveAddress(point);
        };

        const updateFromCenter = () => {
          const center = map.getCenter();
          if (!center) return;
          const point = { lat: center.lat, lng: center.lng };
          setDeliveryPoint(point);
          mapPickerResolveAddressRef.current?.(point);
        };

        map.on('movestart', () => {
          setIsMapPickerDragging(true);
          setIsMapPickerLoading(true);
        });
        map.on('moveend', () => {
          setIsMapPickerDragging(false);
          updateFromCenter();
        });

        if (!normalizedDeliveryAddress) {
          mapPickerResolveAddressRef.current(initialPoint);
        } else {
          setMapPickerAddress(normalizedDeliveryAddress);
          setIsMapPickerLoading(false);
        }
      } catch {
        if (!disposed) {
          setMapPickerError('No se pudo inicializar el mapa de entrega.');
          setIsMapPickerLoading(false);
        }
      }
    };

    async function setupMapPicker() {
      setIsMapPickerLoading(true);
      setMapPickerError('');

      const initialPoint = await resolveInitialPoint();
      if (disposed) return;

      if (preferLeafletMapPicker) {
        await attachLeaflet(initialPoint);
        return;
      }

      try {
        const google = await loadGoogleMapsApi();
        if (disposed) return;

        if (!google?.maps || !mapPickerContainerRef.current) {
          setMapPickerError('Google Maps no disponible. Usando mapa alternativo.');
          await attachLeaflet(initialPoint);
          return;
        }

        setMapPickerProvider('google');

        const map = new google.maps.Map(mapPickerContainerRef.current, {
          center: initialPoint,
          zoom: 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        });

        const geocoder = new google.maps.Geocoder();

        mapPickerMapRef.current = map;
        mapPickerMarkerRef.current = null;
        mapPickerGeocoderRef.current = geocoder;

        const moveToPoint = (point: DeliveryPoint, knownAddress?: string) => {
          setDeliveryPoint(point);
          map.panTo(point);
          map.setZoom(17);
          if (knownAddress && knownAddress.trim().length > 0) {
            setMapPickerAddress(knownAddress.trim());
            setIsMapPickerLoading(false);
            return;
          }
          mapPickerResolveAddressRef.current?.(point);
        };

        const resolveAddress = (point: DeliveryPoint) => {
          if (!shouldResolvePoint(point)) {
            setIsMapPickerLoading(false);
            return;
          }
          geocoder.geocode({ location: point }, (results: GooglePlaceResult[] | null, status: string) => {
            if (disposed) return;
            markResolvedPoint(point);
            if (status === 'OK' && results?.[0]?.formatted_address) {
              setMapPickerAddress(results[0].formatted_address);
            } else {
              setMapPickerAddress('');
            }
            setIsMapPickerLoading(false);
          });
        };

        mapPickerResolveAddressRef.current = (point: DeliveryPoint) => {
          setIsMapPickerLoading(true);
          resolveAddress(point);
        };

        const updateFromCenter = () => {
          const center = map.getCenter();
          if (!center) return;
          const point = { lat: center.lat(), lng: center.lng() };
          setDeliveryPoint(point);
          mapPickerResolveAddressRef.current?.(point);
        };

        map.addListener('dragstart', () => {
          setIsMapPickerDragging(true);
          setIsMapPickerLoading(true);
        });
        map.addListener('idle', () => {
          setIsMapPickerDragging(false);
          updateFromCenter();
        });

        if (mapPickerSearchInputRef.current && google.maps.places?.Autocomplete) {
          const autocomplete = new google.maps.places.Autocomplete(mapPickerSearchInputRef.current, {
            fields: ['geometry', 'formatted_address', 'name'],
          });
          autocomplete.bindTo('bounds', map);
          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            const geometryLocation = place?.geometry?.location;
            if (!geometryLocation) return;
            const point = { lat: geometryLocation.lat(), lng: geometryLocation.lng() };
            const bestAddress = (place.formatted_address ?? place.name ?? '').trim();
            setIsMapPickerLoading(true);
            moveToPoint(point, bestAddress);
          });
          mapPickerAutocompleteRef.current = autocomplete;
        }

        setDeliveryPoint(initialPoint);
        if (!normalizedDeliveryAddress) {
          mapPickerResolveAddressRef.current(initialPoint);
        } else {
          setMapPickerAddress(normalizedDeliveryAddress);
          setIsMapPickerLoading(false);
        }
      } catch {
        if (disposed) return;
        setMapPickerError('Google Maps no disponible. Usando mapa alternativo.');
        await attachLeaflet(initialPoint);
      }
    }

    void setupMapPicker();

    return () => {
      disposed = true;
      cleanupMapRefs();
    };
  }, [
    isMapPickerOpen,
    hasBusinessCoords,
    businessLat,
    businessLng,
    normalizedDeliveryAddress,
  ]);

  function selectedPaymentMethod() {
    if (!menuData) return null;
    return menuData.metodosPago.find((method) => method.id === selectedPaymentMethodId) ?? null;
  }

  function addConfiguredProductToCart(
    productId: string,
    selection: CartLineSelection,
    quantity = 1,
  ) {
    if (scheduleClosed) {
      window.alert('El restaurante está cerrado actualmente');
      return;
    }
    const product = productById.get(productId);
    if (!product) return;

    const category = categoryByProductId.get(productId) ?? null;
    const unitPrice = resolveCartLineUnitPrice(product, category, selection);
    if (unitPrice <= 0) return;

    const cartKey = buildCartLineKey(productId, selection);
    setCart((prev) => ({
      ...prev,
      [cartKey]: (prev[cartKey] ?? 0) + quantity,
    }));
    const comercioKey = String(menuData?.comercio?.slug || menuData?.comercio?.id || '');
    void trackMenuFunnelEvent(comercioKey, 'add_to_cart', { product_id: productId });
  }

  function incrementProduct(productId: string) {
    if (scheduleClosed) {
      window.alert('El restaurante está cerrado actualmente');
      return;
    }
    const product = productById.get(productId);
    const category = categoryByProductId.get(productId) ?? null;
    if (!product) return;

    if (productRequiresConfiguration(product, category)) {
      setProductOptionsSheet({ open: true, productId });
      const comercioKey = String(menuData?.comercio?.slug || menuData?.comercio?.id || '');
      void trackMenuFunnelEvent(comercioKey, 'product_view', { product_id: productId }, productId);
      return;
    }

    if (getProductMinimumPrice(product) <= 0) return;

    const cartKey = buildCartLineKey(productId, {});
    setCart((prev) => ({
      ...prev,
      [cartKey]: (prev[cartKey] ?? 0) + 1,
    }));
    const comercioKey = String(menuData?.comercio?.slug || menuData?.comercio?.id || '');
    void trackMenuFunnelEvent(comercioKey, 'add_to_cart', { product_id: productId });
  }

  function incrementCartLine(cartKey: string) {
    const { productId } = parseCartLineKey(cartKey);
    const product = productById.get(productId);
    const category = categoryByProductId.get(productId) ?? null;
    if (!product) return;

    if (productRequiresConfiguration(product, category)) {
      setProductOptionsSheet({ open: true, productId });
      return;
    }

    setCart((prev) => ({
      ...prev,
      [cartKey]: (prev[cartKey] ?? 0) + 1,
    }));
  }

  function decrementProduct(cartKey: string) {
    setCart((prev) => {
      const current = prev[cartKey] ?? 0;
      if (current <= 1) {
        if (isConfirmOpen && Object.keys(prev).length === 1) {
          shouldReturnToMenuOnEmptyCartRef.current = true;
        }
        const next = { ...prev };
        delete next[cartKey];
        return next;
      }

      return {
        ...prev,
        [cartKey]: current - 1,
      };
    });
  }

  function decrementProductById(productId: string) {
    const matchingKey = Object.keys(cart).find(
      (cartKey) => parseCartLineKey(cartKey).productId === productId,
    );
    if (!matchingKey) return;
    decrementProduct(matchingKey);
  }

  function removeProductFromCart(cartKey: string) {
    setCart((prev) => {
      if (!(cartKey in prev)) return prev;

      if (isConfirmOpen && Object.keys(prev).length === 1) {
        shouldReturnToMenuOnEmptyCartRef.current = true;
      }

      const next = { ...prev };
      delete next[cartKey];
      return next;
    });
  }

  /** Momento 1: fires only on a fresh add (0 -> 1), never on a plain +1 tap. */
  function handleAddToCartFromGrid(productId: string) {
    const product = productById.get(productId);
    const category = categoryByProductId.get(productId) ?? null;
    if (product && productRequiresConfiguration(product, category)) {
      setProductOptionsSheet({ open: true, productId });
      return;
    }

    incrementProduct(productId);
    const suggestions = suggestionsToViewItems(resolveSuggestions('add_to_cart', productId));
    if (suggestions.length === 0) {
      setAddToCartSheet({ open: false, suggestions: [] });
      return;
    }
    for (const suggestion of suggestions) {
      trackUpsell({
        surface: 'add_to_cart',
        eventType: 'impression',
        ruleId: suggestion.ruleId,
        productId: suggestion.productId,
        unitPrice: suggestion.price,
      });
    }
    setAddToCartSheet({ open: true, suggestions });
  }

  function handleAcceptAddToCartSuggestion(suggestion: AddToCartSuggestion) {
    const cartAmountBefore = cartTotal;
    incrementProduct(suggestion.productId);
    upsellAttributionRef.current.set(suggestion.productId, {
      ruleId: suggestion.ruleId,
      surface: 'add_to_cart',
    });
    trackUpsell({
      surface: 'add_to_cart',
      eventType: 'add',
      ruleId: suggestion.ruleId,
      productId: suggestion.productId,
      unitPrice: suggestion.price,
      cartAmountBefore,
      cartAmountAfter: cartAmountBefore + suggestion.price,
    });
    // Never chain another sheet right after accepting — avoids upsell nagging.
    setAddToCartSheet({ open: false, suggestions: [] });
  }

  function handleDismissAddToCartSheet() {
    setAddToCartSheet((prev) => {
      for (const suggestion of prev.suggestions) {
        trackUpsell({
          surface: 'add_to_cart',
          eventType: 'dismiss',
          ruleId: suggestion.ruleId,
          productId: suggestion.productId,
        });
      }
      setDismissedUpsellIds((ids) => {
        const next = new Set(ids);
        for (const suggestion of prev.suggestions) next.add(suggestion.productId);
        return next;
      });
      return { open: false, suggestions: [] };
    });
  }

  /** Momento 2/4: whole-cart suggestions shown inline in the order review / final step. */
  function handleAddCartSuggestion(surface: EngineSurface, suggestion: CartUpsellSuggestion) {
    const cartAmountBefore = cartTotal;
    incrementProduct(suggestion.productId);
    upsellAttributionRef.current.set(suggestion.productId, { ruleId: suggestion.ruleId, surface });
    trackUpsell({
      surface,
      eventType: 'add',
      ruleId: suggestion.ruleId,
      productId: suggestion.productId,
      unitPrice: suggestion.price,
      cartAmountBefore,
      cartAmountAfter: cartAmountBefore + suggestion.price,
    });
  }

  function handleDismissCartSuggestion(surface: EngineSurface, suggestion: CartUpsellSuggestion) {
    trackUpsell({
      surface,
      eventType: 'dismiss',
      ruleId: suggestion.ruleId,
      productId: suggestion.productId,
    });
    setDismissedUpsellIds((ids) => {
      const next = new Set(ids);
      next.add(suggestion.productId);
      return next;
    });
  }

  /** Real bundles: fixed items, fixed price — added as a single synthetic cart line. */
  function handleAddBundle(bundleId: string) {
    const bundleProductId = `bundle:${bundleId}`;
    const bundle = productById.get(bundleProductId);
    if (!bundle) return;
    incrementProduct(bundleProductId);
    upsellAttributionRef.current.set(bundleProductId, { bundleId, surface: 'cart' });
    trackUpsell({
      surface: 'cart',
      eventType: 'add',
      bundleId,
      unitPrice: bundle.precio ?? 0,
    });
  }

  async function shareMenu() {
    const payload = {
      title: comercioNombre,
      text: `Mira el menu de ${comercioNombre}`,
      url: publicMenuUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }

      await navigator.clipboard.writeText(publicMenuUrl);
      setShareMessage('Enlace copiado');
      window.setTimeout(() => setShareMessage(''), 1800);
    } catch {
      setShareMessage('No se pudo compartir');
      window.setTimeout(() => setShareMessage(''), 1800);
    }
  }

  function scrollToCategory(categoryId: string) {
    setActiveCategoryId(categoryId);
    const section = document.getElementById(`categoria-${categoryId}`);
    if (!section) return;

    const scrollOffset = getCategoryScrollOffset(stickySearchCardRef.current);
    const nextTop = window.scrollY + section.getBoundingClientRect().top - scrollOffset;

    window.scrollTo({
      top: Math.max(0, nextTop),
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }

  function toggleInfoSection(section: 'location' | 'delivery' | 'contact' | 'payments') {
    setInfoSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }

  async function persistOrderRequired(
    email: string,
    customerName: string,
    customerWhatsapp: string,
    paymentMethod: MetodoPagoRow | null,
    paymentMeta: {
      currency: string;
      exchangeRate: number;
      exchangeRateSource: string;
      referenceLast4: string;
      proofFile: File | null;
    },
    delivery: {
      mode: OrderDeliveryMode;
      address: string;
      reference: string;
      instructions: string;
      coordinates: DeliveryPoint | null;
    },
  ) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Faltan variables de entorno para guardar tu pedido.');
    }

    const paymentLabel = paymentMethod ? paymentMethodLabel(paymentMethod) : 'No especificado';
    let paymentProofUrl = '';

    if (paymentMeta.proofFile) {
      const permitResponse = await fetch('/api/orders/comprobantes/permit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: resolvedComercioId,
          comercioId: resolvedComercioId,
        }),
      });
      const permitPayload = await permitResponse.json().catch(() => ({}));
      const permit = (permitPayload?.data?.permit ?? '').toString().trim();
      if (!permitResponse.ok || !permit) {
        throw new Error('No se pudo subir el comprobante de pago.');
      }

      const form = new FormData();
      form.append('comercioId', resolvedComercioId);
      form.append('permit', permit);
      form.append('file', paymentMeta.proofFile);
      const uploadResponse = await fetch('/api/orders/comprobantes', {
        method: 'POST',
        body: form,
      });
      const uploadPayload = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) {
        const code = (uploadPayload?.error ?? '').toString();
        throw new Error(
          code === 'File too large.'
            ? 'El comprobante supera el tamano maximo (5 MB).'
            : 'No se pudo subir el comprobante de pago.',
        );
      }
      // Opaque storage ref (storage://comprobantes/...). Not a permanent public URL.
      paymentProofUrl = (uploadPayload?.data?.storageRef ?? uploadPayload?.data?.paymentProofUrl ?? '')
        .toString()
        .trim();
      if (!paymentProofUrl) {
        throw new Error('No se pudo subir el comprobante de pago.');
      }
    }

    const subtotalConverted = convertFromBaseCurrency(
      orderSubtotal,
      businessBaseCurrency,
      paymentMeta.currency,
      paymentMeta.exchangeRate,
    );
    const deliveryConverted = convertFromBaseCurrency(
      deliveryCost,
      businessBaseCurrency,
      paymentMeta.currency,
      paymentMeta.exchangeRate,
    );
    const totalConverted = convertFromBaseCurrency(
      orderGrandTotal,
      businessBaseCurrency,
      paymentMeta.currency,
      paymentMeta.exchangeRate,
    );
    const orderItems = cartItems.map((item) => ({
      product_id: item.product.id,
      nombre: buildOrderLineLabel(item.product, item.selection, item.category),
      cantidad: item.quantity,
      precio: item.unitPrice,
      opciones: item.selection,
    }));

    const detalles = {
      cliente_nombre: customerName,
      cliente_email: email || null,
      telefono_cliente: customerWhatsapp,
      moneda_checkout: normalizeCurrencyCode(paymentMeta.currency),
      tasa_cambio_snapshot: paymentMeta.exchangeRate,
      exchange_rate_source: paymentMeta.exchangeRateSource,
      metodo_pago: paymentMethod
        ? {
            id: paymentMethod.id,
            nombre: paymentLabel,
            datos: paymentMethodDetails(paymentMethod),
          }
        : null,
      referencia_pago: paymentMeta.referenceLast4 || null,
      comprobante_url: paymentProofUrl || null,
      delivery,
      order_notes: [
        kioskFulfillment ? `Tipo: ${FULFILLMENT_LABEL[kioskFulfillment]}` : '',
        normalizedOrderNotes,
      ]
        .filter(Boolean)
        .join('. '),
      pago_con: isCashPayment && paymentWithAmount !== null ? paymentWithAmount : null,
      cambio_de: isCashPayment && changeAmount > 0 ? changeAmount : 0,
      subtotal: orderSubtotal,
      subtotal_moneda_checkout: subtotalConverted,
      costo_delivery: deliveryCost,
      costo_delivery_moneda_checkout: deliveryConverted,
      total: orderGrandTotal,
      total_moneda_checkout: totalConverted,
      items: orderItems,
    };

    const requestBody = {
      comercioId: resolvedComercioId,
      comercioNombre,
      clientName: customerName,
      clientWhatsapp: customerWhatsapp,
      clientEmail: email,
      currency: normalizeCurrencyCode(paymentMeta.currency),
      exchangeRate: paymentMeta.exchangeRate,
      costoDelivery: deliveryCost,
      items: orderItems,
      delivery,
      paymentMethod: paymentMethod
        ? {
            id: paymentMethod.id,
            nombre: paymentLabel,
            datos: paymentMethodDetails(paymentMethod),
          }
        : null,
      paymentReferenceLast4: paymentMeta.referenceLast4 || null,
      paymentProofUrl: paymentProofUrl || null,
      cashPaymentAmount: isCashPayment && paymentWithAmount !== null ? paymentWithAmount : null,
      cashChangeAmount: isCashPayment && changeAmount > 0 ? changeAmount : 0,
      orderNotes: [
        kioskFulfillment ? `Tipo: ${FULFILLMENT_LABEL[kioskFulfillment]}` : '',
        normalizedOrderNotes,
      ]
        .filter(Boolean)
        .join('. '),
      detalles,
    };

    const fingerprint = checkoutAttemptFingerprint({
      comercioId: resolvedComercioId,
      customerName,
      customerWhatsapp,
      customerEmail: email,
      currency: normalizeCurrencyCode(paymentMeta.currency),
      paymentMethodId: paymentMethod?.id?.toString() ?? '',
      paymentReferenceLast4: paymentMeta.referenceLast4 || '',
      notes: requestBody.orderNotes,
      deliveryMode: delivery.mode,
      totalCents: Math.round(orderGrandTotal * 100),
      items: orderItems,
    });
    checkoutAttemptRef.current = resolveCheckoutAttempt(checkoutAttemptRef.current, fingerprint);

    const postOrder = (idempotencyKey: string) =>
      fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': idempotencyKey,
        },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify(requestBody),
      });

    let response = await postOrder(checkoutAttemptRef.current.key);
    let responsePayload = await response.json().catch(() => ({}));

    if (
      response.status === 409 &&
      responsePayload?.error === 'idempotency_key_reuse_with_different_payload'
    ) {
      checkoutAttemptRef.current = {
        key: resolveCheckoutAttempt(null, `${fingerprint}:${Date.now()}`).key,
        fingerprint,
      };
      response = await postOrder(checkoutAttemptRef.current.key);
      responsePayload = await response.json().catch(() => ({}));
    }

    if (!response.ok || !responsePayload?.ok || !responsePayload?.data?.orderId) {
      const validationDetails = Array.isArray(responsePayload?.details)
        ? responsePayload.details
        : [];

      let message = humanizeOrderSubmitError(
        (responsePayload?.error ?? 'No se pudo guardar el pedido.').toString(),
      );
      if (response.status === 400 && validationDetails.length > 0) {
        const fieldMessages = validationDetails.map((detail: ValidationDetail) => {
          const path = (detail?.path ?? '').toString();
          if (path.includes('telefono_cliente')) {
            return 'Por favor verifica tu numero de telefono/WhatsApp.';
          }
          if (path.includes('delivery.address')) {
            return 'La direccion de entrega es obligatoria para pedidos delivery.';
          }
          if (path.includes('delivery.coordinates')) {
            return 'Debes seleccionar el punto de entrega en el mapa.';
          }
          if (path.includes('items')) {
            return 'Tu carrito tiene productos invalidos. Vuelve a revisar el pedido.';
          }
          if (path.includes('moneda_checkout') || path.includes('tasa_cambio_snapshot')) {
            return 'Hubo un problema con la moneda seleccionada. Intenta nuevamente.';
          }
          return (detail?.message ?? '').toString().trim();
        }).filter(Boolean);

        if (fieldMessages.length > 0) {
          message = Array.from(new Set(fieldMessages)).join(' ');
        }
      }
      throw new Error(message);
    }

    const orderId = responsePayload.data.orderId.toString().trim();
    const orderUrl =
      (responsePayload?.data?.trackingUrl ?? `${publicBaseUrl}/orders/${encodeURIComponent(orderId)}`)
        .toString()
        .trim();

    const message =
      `Hola, quiero confirmar este pedido.\n` +
      `Pedido: ${orderId}.\n` +
      `Cliente: ${customerName}.\n` +
      `Telefono: ${customerWhatsapp}.\n` +
      `Tipo de entrega: ${delivery.mode === 'delivery' ? 'Delivery' : 'Retiro en tienda'}.\n` +
      (delivery.mode === 'delivery' ? `Direccion de entrega: ${delivery.address}.\n` : '') +
      (delivery.mode === 'delivery' && delivery.reference
        ? `Referencia: ${delivery.reference}.\n`
        : '') +
      (delivery.mode === 'delivery' && delivery.instructions
        ? `Indicaciones: ${delivery.instructions}.\n`
        : '') +
      (delivery.mode === 'delivery' && delivery.coordinates
        ? `Coordenadas: ${delivery.coordinates.lat.toFixed(6)}, ${delivery.coordinates.lng.toFixed(6)}.\n`
        : '') +
      (normalizedOrderNotes ? `Notas del pedido: ${normalizedOrderNotes}.\n` : '') +
      `Metodo de pago: ${paymentLabel}.\n` +
      (email ? `Correo del cliente: ${email}.\n` : '') +
      `Moneda seleccionada: ${normalizeCurrencyCode(paymentMeta.currency)}.\n` +
      (paymentMeta.exchangeRate > 1
        ? `Tasa aplicada (${exchangeSourceLabel(paymentMeta.exchangeRateSource)}): ${formatTickerRate(paymentMeta.exchangeRate)}.\n`
        : '') +
      (paymentMeta.referenceLast4 ? `Referencia digital: ****${paymentMeta.referenceLast4}.\n` : '') +
      (paymentProofUrl ? `Comprobante: ${paymentProofUrl}.\n` : '') +
      `Subtotal: ${formatAmountByCurrency(subtotalConverted, paymentMeta.currency)}.\n` +
      (deliveryCost > 0 ? `Delivery: ${formatAmountByCurrency(deliveryConverted, paymentMeta.currency)}.\n` : '') +
      (isCashPayment && paymentWithAmount !== null
        ? `Pago con: ${formatAmountByCurrency(paymentWithAmount, paymentMeta.currency)}.\n`
        : '') +
      (isCashPayment && changeAmount > 0
        ? `Cambio: ${formatAmountByCurrency(changeAmount, paymentMeta.currency)}.\n`
        : '') +
      `Total: ${formatAmountByCurrency(totalConverted, paymentMeta.currency)}.\n` +
      `Seguimiento: ${orderUrl}`;

    checkoutAttemptRef.current = null;
    return {
      orderId,
      orderUrl,
      waUrl: whatsappNumber
        ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
        : '',
    };
  }

  function openCheckoutSheet() {
    if (isOwnerPreview) {
      window.alert(
        'Vista previa. Los pedidos estaran disponibles cuando el menu este publicado.',
      );
      return;
    }
    if (scheduleClosed) {
      window.alert(scheduleStatus.caption || 'El restaurante está cerrado actualmente');
      return;
    }
    const comercioKey = String(menuData?.comercio?.slug || menuData?.comercio?.id || '');
    void trackMenuFunnelEvent(comercioKey, 'checkout_started', {}, 'checkout');
    setCheckoutError(null);
    setCheckoutStep(0);
    setIsConfirmOpen(true);
  }

  async function confirmOrder() {
    if (isOwnerPreview) {
      setCheckoutError(
        'Vista previa. Los pedidos no se pueden confirmar aqui.',
      );
      return;
    }
    if (scheduleClosed) {
      setCheckoutError(scheduleStatus.caption);
      return;
    }

    if (
      cartItems.length === 0 ||
      isSubmittingOrder ||
      !isClientNameValid ||
      !isClientWhatsappValid ||
      !isClientEmailValid ||
      !isDeliveryReady ||
      !canSubmitStep3
    ) {
      return;
    }

    const deliveryPayload = {
      mode: isDeliveryOrder ? 'delivery' : 'pickup',
      address: isDeliveryOrder ? normalizedDeliveryAddress : '',
      reference: isDeliveryOrder ? normalizedDeliveryReference : '',
      instructions: isDeliveryOrder ? normalizedDeliveryInstructions : '',
      coordinates: isDeliveryOrder ? deliveryPoint : null,
    } satisfies {
      mode: OrderDeliveryMode;
      address: string;
      reference: string;
      instructions: string;
      coordinates: DeliveryPoint | null;
    };

    setIsSubmittingOrder(true);
    setCheckoutError(null);
    try {
      const persisted = await persistOrderRequired(
        normalizedClientEmail,
        normalizedClientName,
        normalizedClientWhatsapp,
        selectedMethod,
        {
          currency: selectedCurrencyCode,
          exchangeRate: selectedExchangeRate,
          exchangeRateSource: selectedExchangeSource,
          referenceLast4: paymentReferenceLast4,
          proofFile: paymentProofFile,
        },
        deliveryPayload,
      );

      for (const { product, quantity } of cartItems) {
        const attribution = upsellAttributionRef.current.get(product.id);
        if (!attribution) continue;
        trackUpsell({
          surface: attribution.surface,
          eventType: 'purchase',
          ruleId: attribution.ruleId,
          bundleId: attribution.bundleId,
          productId: attribution.bundleId ? null : product.id,
          unitPrice: (product.precio ?? 0) * quantity,
          orderId: persisted.orderId,
        });
      }
      upsellAttributionRef.current.clear();

      if (typeof window !== 'undefined') {
        if (persisted.waUrl) {
          window.sessionStorage.setItem(`order-wa:${persisted.orderId}`, persisted.waUrl);
        }
        window.sessionStorage.setItem(`order-tracking:${persisted.orderId}`, persisted.orderUrl);
        window.localStorage.setItem(
          checkoutDraftStorageKey,
          JSON.stringify({
            clientName: normalizedClientName,
            clientWhatsapp: normalizedClientWhatsapp,
            clientEmail: normalizedClientEmail,
            selectedCurrency: selectedCurrencyCode,
          }),
        );
      }

      const voucherItems = cartItems.map((item) => ({
        name: buildOrderLineLabel(item.product, item.selection, item.category),
        quantity: item.quantity,
        priceLabel: formatAmountByCurrency(
          convertFromBaseCurrency(
            item.unitPrice * item.quantity,
            businessBaseCurrency,
            selectedCurrencyCode,
            selectedExchangeRate,
          ),
          selectedCurrencyCode,
        ),
      }));
      setCart({});
      const comercioKey = String(menuData?.comercio?.slug || menuData?.comercio?.id || '');
      void trackMenuFunnelEvent(comercioKey, 'order_completed', {}, persisted.orderId);
      setClientName('');
      setClientWhatsapp('');
      setClientEmail('');
      setDigitalPaymentReference('');
      setPaymentProofFile(null);
      setDeliveryAddress('');
      setDeliveryReference('');
      setDeliveryInstructions('');
      setDeliveryPoint(null);
      setDeliveryPointSource('none');
      setOrderNotes('');
      setDeliveryMode('pickup');
      setCheckoutStep(0);
      setIsConfirmOpen(false);
      setKioskAddedPrompt(null);
      setKioskVoucher({
        orderId: persisted.orderId,
        orderUrl: persisted.orderUrl,
        fulfillment: kioskFulfillment ?? 'takeaway',
        totalLabel: formatAmountByCurrency(orderGrandTotalConverted, selectedCurrencyCode),
        items: voucherItems,
      });
      return;
    } catch (persistError) {
      const message =
        persistError instanceof Error
          ? persistError.message
          : 'No se pudo guardar tu pedido. Intentalo nuevamente.';
      setCheckoutError(message);
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  function goToNextStep() {
    if (checkoutStep === 0 && !canGoNextFromStep0) {
      setCheckoutError('Agrega al menos un producto para continuar con el pedido.');
      return;
    }
    if (checkoutStep === 1 && !canGoNextFromStep1) {
      setCheckoutError('Completa nombre, WhatsApp y correo valido para continuar.');
      return;
    }
    if (checkoutStep === 2 && !canGoNextFromStep2) {
      setCheckoutError('Completa la direccion y el punto en el mapa para continuar con delivery.');
      return;
    }
    setCheckoutError(null);
    if (checkoutStep === 1 && !isDeliveryOrder) {
      setCheckoutStep(3);
      return;
    }
    setCheckoutStep((prev) => Math.min(3, prev + 1));
  }

  function goToPreviousStep() {
    setCheckoutError(null);
    if (checkoutStep === 3 && !isDeliveryOrder) {
      setCheckoutStep(1);
      return;
    }
    setCheckoutStep((prev) => Math.max(0, prev - 1));
  }

  if (loading) {
    return <PublicMenuSkeletonLoader businessName={comercioNombre} />;
  }

  if (isDraftMode) {
    return (
      <main className="relative flex min-h-screen overflow-hidden bg-[#0c0d12] px-5 py-8 text-white sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute -left-24 top-20 h-72 w-72 rounded-full border border-amber-300/20" />
          <div className="absolute -right-28 bottom-12 h-96 w-96 rounded-full border border-amber-300/15" />
          <div className="absolute left-1/2 top-0 h-full w-px bg-amber-200/10" />
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col">
          <header className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src="/branding/isotipo.png"
                alt="Logo de elmenuxfa"
                className="h-11 w-11 rounded-2xl border border-white/10 bg-amber-300 object-contain p-1.5"
              />
              <div className="min-w-0">
                <p className="truncate text-[10px] font-black uppercase tracking-[0.28em] text-amber-200/80">Menú inteligente</p>
                <p className="truncate text-base font-black text-white sm:text-lg">{comercioNombre}</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-200">
              No disponible
            </span>
          </header>

          <section className="flex flex-1 flex-col items-center justify-center py-14 text-center sm:py-20">
            <div className="relative grid h-44 w-56 place-items-center sm:h-56 sm:w-72">
              <div className="absolute bottom-7 h-8 w-44 rounded-[50%] bg-black/60 blur-xl sm:w-56" />
              <div className="relative z-10 flex h-32 w-44 flex-col items-center justify-center rounded-[42%] border-2 border-white/15 bg-[#20232b] shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:h-40 sm:w-56">
                <Store className="h-12 w-12 text-white/80 sm:h-16 sm:w-16" strokeWidth={1.5} />
                <span className="mt-2 rounded-md bg-amber-300 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-950 sm:text-xs">
                  Menú pausado
                </span>
              </div>
              <span className="absolute right-3 top-1 z-20 grid h-12 w-12 place-items-center rounded-full bg-amber-300 text-2xl font-black text-slate-950 shadow-[0_12px_30px_rgba(251,191,36,0.25)] sm:right-8">
                !
              </span>
            </div>

            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.32em] text-amber-200/75">Estamos haciendo unos ajustes</p>
            <h1 className="mt-4 max-w-2xl text-3xl font-black leading-tight tracking-[-0.04em] text-white sm:text-5xl">
              Este menú no está disponible por ahora
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
              El negocio está terminando de configurar su menú digital. Vuelve a intentarlo en unos minutos.
            </p>

            <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300">
              <span className="h-2 w-2 rounded-full bg-amber-300" />
              Gracias por tu paciencia
            </div>

            <a
              href="https://elmenuxfa.com"
              className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_14px_32px_rgba(251,191,36,0.18)] transition hover:bg-amber-200"
            >
              Volver al inicio
              <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
            </a>
          </section>

          <footer className="border-t border-white/10 pt-5 text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Pide a tu manera · Powered by elmenuxfa.com
          </footer>
        </div>
      </main>
    );
  }

  if (error || !menuData) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-slate-50">
        <div className="w-full max-w-lg rounded-3xl border border-white/20 bg-white/5 p-6 text-center backdrop-blur-sm">
          <p className="text-base text-slate-200">{error ?? 'No se pudo cargar el menu.'}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white"
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  const hasProducts = filteredCategorias.length > 0;

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {googleFontsUrl ? (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={googleFontsUrl} />
          </>
        ) : null}
      </Head>
      <style jsx global>{`
        :root {
          --kos-duration-fast: ${MOTION_TOKENS.duration.fast}ms;
          --kos-duration-base: ${MOTION_TOKENS.duration.base}ms;
          --kos-duration-slow: ${MOTION_TOKENS.duration.slow}ms;
          --kos-duration-hero: ${MOTION_TOKENS.duration.hero}ms;
          --kos-ease-standard: ${MOTION_TOKENS.easing.standard};
          --kos-ease-entrance: ${MOTION_TOKENS.easing.entrance};
          --kos-ease-emphasized: ${MOTION_TOKENS.easing.emphasized};
        }

        @keyframes kosmenuTickerScroll {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-50%, 0, 0);
          }
        }

        @keyframes kosLoaderAura {
          0%,
          100% {
            opacity: 0.48;
            transform: translate3d(0, 0, 0) scale(0.96);
          }
          50% {
            opacity: 0.8;
            transform: translate3d(0, -6px, 0) scale(1.03);
          }
        }

        @keyframes kosLoaderOrbit {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes kosLoaderDot {
          0%,
          100% {
            opacity: 0.32;
            transform: translate3d(0, 0, 0) scale(0.92);
          }
          50% {
            opacity: 1;
            transform: translate3d(0, -4px, 0) scale(1);
          }
        }

        @keyframes kosLoaderBar {
          0% {
            transform: translate3d(-105%, 0, 0) scaleX(0.9);
          }
          100% {
            transform: translate3d(170%, 0, 0) scaleX(1.05);
          }
        }

        @keyframes kosSoftFloat {
          0%,
          100% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(0, -6px, 0);
          }
        }

        @keyframes kosFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes kosSlideInUp {
          from {
            opacity: 0;
            transform: translate3d(0, 24px, 0) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @keyframes kosSlideInRight {
          from {
            opacity: 0;
            transform: translate3d(28px, 0, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes kosScaleIn {
          from {
            opacity: 0;
            transform: translate3d(0, 16px, 0) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @keyframes kosStepPulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.04);
          }
        }

        .kos-motion-enter {
          opacity: 0;
          transform: translate3d(var(--kos-enter-x, 0px), var(--kos-enter-y, 16px), 0)
            scale(var(--kos-enter-scale, 0.985));
          transition-property: transform, opacity;
          transition-duration: var(--kos-enter-duration, var(--kos-duration-slow));
          transition-timing-function: var(--kos-ease-entrance);
          transition-delay: var(--kos-enter-delay, 0ms);
        }

        .kos-motion-enter[data-motion-in='true'] {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }

        .kos-surface-motion {
          transform: translate3d(0, 0, 0);
          transition-property: transform, opacity, background-color, border-color, color;
          transition-duration: var(--kos-duration-base);
          transition-timing-function: var(--kos-ease-standard);
        }

        .kos-pressable {
          transform: translate3d(0, 0, 0);
          touch-action: manipulation;
        }

        .kos-pressable:active {
          transform: scale(0.985);
        }

        .kos-float-subtle {
          animation: kosSoftFloat 6.8s var(--kos-ease-standard) infinite;
        }

        .kos-loader-aura {
          animation: kosLoaderAura 4.4s var(--kos-ease-standard) infinite;
        }

        .kos-loader-orbit {
          animation: kosLoaderOrbit 8s linear infinite;
        }

        .kos-loader-orbit-reverse {
          animation: kosLoaderOrbit 13s linear infinite reverse;
        }

        .kos-loader-dot {
          animation: kosLoaderDot 1.15s var(--kos-ease-standard) infinite;
        }

        .kos-loader-bar::after {
          content: '';
          position: absolute;
          inset: 0;
          width: 42%;
          border-radius: inherit;
          background: linear-gradient(90deg, #d65a1f 0%, #ff9a54 55%, #ffd089 100%);
          animation: kosLoaderBar 1.2s var(--kos-ease-emphasized) infinite;
        }

        .kos-drawer-backdrop,
        .kos-modal-backdrop,
        .checkout-overlay-enter {
          animation: kosFadeIn var(--kos-duration-fast) var(--kos-ease-standard) both;
        }

        .kos-drawer-panel,
        .kos-side-panel-enter {
          animation: kosSlideInRight var(--kos-duration-slow) var(--kos-ease-emphasized) both;
        }

        .kos-sheet-panel,
        .checkout-sheet-enter,
        .checkout-panel-enter,
        .checkout-item-enter {
          animation: kosSlideInUp var(--kos-duration-slow) var(--kos-ease-emphasized) both;
        }

        .kos-image-modal-panel {
          animation: kosScaleIn var(--kos-duration-base) var(--kos-ease-emphasized) both;
        }

        .checkout-step-active {
          animation: kosStepPulse 1.6s var(--kos-ease-standard) 1;
        }

        .checkout-phone-field .PhoneInput {
          display: flex;
          min-height: 3rem;
          align-items: center;
          gap: 0.5rem;
          padding-inline: 0.875rem;
        }

        .checkout-phone-field .PhoneInputInput {
          min-width: 0;
          flex: 1;
          height: 3rem;
          border: 0;
          background: transparent;
          color: var(--menu-text, #0f172a);
          font-size: 0.95rem;
          outline: 0;
        }

        .checkout-phone-field .PhoneInputCountry {
          border-right-color: var(--menu-border);
          background: var(--menu-surface-alt);
        }

        .checkout-phone-field .PhoneInputCountrySelect,
        .checkout-phone-field .PhoneInputCountrySelectArrow {
          color: var(--menu-text-muted);
        }

        main[data-menu-theme] :focus-visible {
          outline: 2px solid var(--menu-primary);
          outline-offset: 2px;
        }

        main[data-menu-theme] .kos-menu-card {
          background: var(--menu-surface);
          border-color: var(--menu-border);
          box-shadow: var(--menu-shadow);
          color: var(--menu-text);
        }

        main[data-menu-theme] .kos-menu-muted {
          color: var(--menu-text-muted);
        }

        main[data-menu-theme] .kos-menu-surface-alt {
          background: var(--menu-surface-alt);
          border-color: var(--menu-border);
          color: var(--menu-text);
        }

        main[data-menu-theme="dark"] button.kos-pressable:hover {
          filter: brightness(1.06);
        }

        @media (hover: hover) and (pointer: fine) {
          .kos-hover-subtle:hover {
            transform: translate3d(0, -4px, 0) scale(1.01);
          }

          .kos-hover-medium:hover {
            transform: translate3d(0, -6px, 0) scale(1.014);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .kos-motion-enter,
          .kos-motion-enter[data-motion-in='true'],
          .kos-surface-motion,
          .kos-float-subtle,
          .kos-loader-aura,
          .kos-loader-orbit,
          .kos-loader-orbit-reverse,
          .kos-loader-dot,
          .kos-drawer-backdrop,
          .kos-drawer-panel,
          .kos-modal-backdrop,
          .kos-side-panel-enter,
          .kos-sheet-panel,
          .kos-image-modal-panel,
          .checkout-overlay-enter,
          .checkout-sheet-enter,
          .checkout-panel-enter,
          .checkout-item-enter,
          .checkout-step-active {
            animation: none !important;
            transition-duration: 1ms !important;
            transition-delay: 0ms !important;
            transform: none !important;
            opacity: 1 !important;
          }

          .kos-loader-bar::after {
            animation: none !important;
            transform: none !important;
            inset: 0;
            width: 100%;
          }
        }
      `}</style>
      <main
        className={`min-h-screen ${isOwnerPreview ? 'pt-12' : ''}`}
        data-menu-theme={themeMode}
        style={{
          ...containerStyle,
          background: 'var(--menu-background)',
          color: 'var(--menu-text)',
        }}
      >
        {isOwnerPreview ? (
          <div className="fixed inset-x-0 top-0 z-[60] border-b border-amber-300/50 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-950 sm:text-sm">
            Vista previa. Este menú aún no está publicado.
          </div>
        ) : null}
        <KioskMenuExperience
          businessName={comercioNombre}
          logoUrl={comercioLogoUrl || null}
          initialLetter={comercioInitialLetter}
          locationLabel={heroLocation || null}
          tagline={menuData?.comercio.descripcion?.trim() || null}
          isOpen={!scheduleClosed}
          openCaption={kioskOpenCaption}
          closedCaption={kioskClosedCaption}
          supportsDelivery={supportsDelivery}
          fulfillment={kioskFulfillment}
          onSelectFulfillment={selectKioskFulfillment}
          onResetFulfillment={resetKioskFulfillment}
          categories={kioskCategories}
          productsByCategory={kioskProductsByCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          cartCount={cartCount}
          cartTotalLabel={formatAmountByCurrency(cartTotalConverted, selectedCurrencyCode)}
          onAddProduct={handleKioskAddProduct}
          onPay={() => {
            setKioskAddedPrompt(null);
            openCheckoutSheet();
          }}
          addedPrompt={scheduleClosed ? null : kioskAddedPrompt}
          onContinueAdding={() => setKioskAddedPrompt(null)}
          onPayFromPrompt={() => {
            setKioskAddedPrompt(null);
            openCheckoutSheet();
          }}
          voucher={kioskVoucher}
          onTrackVoucher={() => {
            if (!kioskVoucher?.orderUrl) return;
            window.location.assign(kioskVoucher.orderUrl);
          }}
          onNewOrder={() => {
            setKioskVoucher(null);
            resetKioskFulfillment();
            setCart({});
          }}
          tickerEntries={tickerDisplayEntries}
          currencies={kioskCurrencyOptions}
          selectedCurrency={selectedCurrencyCode}
          onSelectCurrency={selectMenuCurrency}
          themeMode={themeMode}
          onToggleTheme={toggleKioskTheme}
          stickyOffsetClass={isOwnerPreview ? 'top-12' : 'top-0'}
        />

        <AddToCartUpsellSheet
          open={addToCartSheet.open}
          suggestions={addToCartSheet.suggestions}
          formatPrice={formatUpsellPrice}
          onAdd={handleAcceptAddToCartSuggestion}
          onDismiss={handleDismissAddToCartSheet}
        />

        <ProductOptionsSheet
          open={productOptionsSheet.open && !kioskVoucher}
          product={
            productOptionsSheet.productId
              ? productById.get(productOptionsSheet.productId) ?? null
              : null
          }
          category={
            productOptionsSheet.productId
              ? categoryByProductId.get(productOptionsSheet.productId) ?? null
              : null
          }
          formatPrice={formatUpsellPrice}
          onClose={() => setProductOptionsSheet({ open: false, productId: null })}
          onConfirm={(selection, quantity) => {
            if (!productOptionsSheet.productId) return;
            const addedProduct = productById.get(productOptionsSheet.productId);
            addConfiguredProductToCart(productOptionsSheet.productId, selection, quantity);
            setProductOptionsSheet({ open: false, productId: null });
            setKioskAddedPrompt({
              productName: addedProduct?.nombre ?? 'Producto',
            });
          }}
        />

        {expandedProductImage ? (
          <section
            className="kos-modal-backdrop fixed inset-0 z-[57] bg-black/85 p-4"
            onClick={() => setExpandedProductImage(null)}
          >
            <div className="mx-auto flex h-full max-w-5xl items-center justify-center">
              <div
                className="kos-image-modal-panel w-full max-w-4xl"
                onClick={(event) => event.stopPropagation()}
              >
                <img
                  src={expandedProductImage.src}
                  alt={expandedProductImage.alt}
                  className="max-h-[72vh] w-full rounded-2xl object-contain"
                />
                <div className="mt-3 rounded-2xl bg-black/55 px-4 py-3 text-white">
                  <h3 className="text-base font-black md:text-lg" style={titleFontStyle}>
                    {expandedProductImage.title}
                  </h3>
                  <p className="mt-1 text-sm text-white/90">{expandedProductImage.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedProductImage(null)}
                className="kos-surface-motion kos-pressable absolute right-5 top-5 rounded-full border border-white/30 bg-black/40 px-3 py-1 text-xs font-semibold text-white"
              >
                Cerrar
              </button>
            </div>
          </section>
        ) : null}

        {isInfoOpen ? (
          <section className="kos-modal-backdrop fixed inset-0 z-[58] bg-white">
            <div
              className="kos-side-panel-enter mx-auto h-full max-w-3xl bg-white"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Informacion</p>
                  <h3 className="text-xl font-black text-slate-900" style={titleFontStyle}>{comercioNombre}</h3>
                  <p className="text-xs font-semibold text-slate-500">@{resolvedSlug}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInfoOpen(false)}
                  className="kos-surface-motion kos-pressable rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                >
                  Cerrar
                </button>
              </div>

              <div className="h-[calc(100%-64px)] overflow-y-auto px-4 py-4 pb-24 sm:px-6">
                <div className="space-y-3">
                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => toggleInfoSection('location')}
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Ubicacion</p>
                      <span className={`text-xs text-slate-500 transition ${infoSections.location ? 'rotate-180' : ''}`}>⌃</span>
                    </button>
                    {infoSections.location ? (
                      <div className="border-t border-slate-200 px-3 py-2">
                        <p className="font-semibold text-slate-800">{comercioAddress || 'No registrada'}</p>
                        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <iframe
                            src={mapEmbedUrl}
                            title="Mapa del negocio"
                            className="h-44 w-full"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        </div>
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-slate-700"
                        >
                          Como llegar
                        </a>
                      </div>
                    ) : null}
                  </section>

                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => toggleInfoSection('delivery')}
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Delivery</p>
                      <span className={`text-xs text-slate-500 transition ${infoSections.delivery ? 'rotate-180' : ''}`}>⌃</span>
                    </button>
                    {infoSections.delivery ? (
                      <div className="border-t border-slate-200 px-3 py-2">
                        <p className="font-semibold text-slate-800">{deliveryInfo}</p>
                      </div>
                    ) : null}
                  </section>

                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => toggleInfoSection('contact')}
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Contacto</p>
                      <span className={`text-xs text-slate-500 transition ${infoSections.contact ? 'rotate-180' : ''}`}>⌃</span>
                    </button>
                    {infoSections.contact ? (
                      <div className="space-y-2 border-t border-slate-200 px-3 py-2">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">WhatsApp</p>
                        {!receivesOrdersOnWhatsapp ? (
                          <p className="text-xs font-semibold text-amber-700">Este negocio no recibe pedidos por WhatsApp.</p>
                        ) : null}
                        {whatsappNumber ? (
                          <a
                            href={`https://wa.me/${whatsappNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-black shadow-sm"
                            style={
                              receivesOrdersOnWhatsapp
                                ? {
                                    borderColor: '#86EFAC',
                                    backgroundColor: '#F0FDF4',
                                    color: '#166534',
                                  }
                                : {
                                    borderColor: '#CBD5E1',
                                    backgroundColor: '#F8FAFC',
                                    color: '#475569',
                                  }
                            }
                          >
                            <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
                            <span>+{whatsappNumber}</span>
                          </a>
                        ) : (
                          <p className="font-semibold text-slate-800">No registrado</p>
                        )}
                      </div>
                    ) : null}
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => toggleInfoSection('payments')}
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Metodos de pago</p>
                      <span className={`text-xs text-slate-500 transition ${infoSections.payments ? 'rotate-180' : ''}`}>⌃</span>
                    </button>
                    {infoSections.payments ? (
                      <div className="space-y-1.5 border-t border-slate-200 p-3">
                        {paymentMethodsByCurrency.length > 0 ? (
                          paymentMethodsByCurrency.map((group) => (
                            <div key={`currency-info-${group.currency}`} className="rounded-xl border border-slate-200 bg-white p-2">
                              <p className="px-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{group.currency}</p>
                              {group.currency !== businessBaseCurrency && group.exchangeRate > 0 ? (
                                <p className="px-1 pt-1 text-[11px] font-semibold text-slate-500">
                                  Tasa aplicada ({exchangeSourceLabel(resolveCheckoutCurrencySource(group.currency, {
                                    checkoutExchange: checkoutExchangeConfig,
                                    businessExchangeSource,
                                  }))}): 1 {businessBaseCurrency} = {formatTickerRate(group.exchangeRate)} {group.currency}
                                </p>
                              ) : null}
                              <div className="mt-1 space-y-1.5">
                                {group.methods.map((method) => (
                                  <div key={`info-${method.id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                    <p className="text-sm font-bold text-slate-800">{paymentMethodLabel(method)}</p>
                                    <div className="mt-1 space-y-1 text-xs text-slate-600">
                                      {method.nota || method.descripcion ? (
                                        <p>Nota: {method.nota ?? method.descripcion}</p>
                                      ) : null}
                                      {method.moneda || method.currency ? (
                                        <p>Moneda: {method.moneda ?? method.currency}</p>
                                      ) : null}
                                      {method.tasa_cambio || method.exchange_rate ? (
                                        <p>Tasa de cambio: {method.tasa_cambio ?? method.exchange_rate}</p>
                                      ) : null}
                                      {paymentMethodDetails(method).slice(0, 2).map((detail, index) => (
                                        <p key={`${method.id}-detail-${index}`}>{detail}</p>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm font-semibold text-slate-600">No configurados</p>
                        )}
                      </div>
                    ) : null}
                  </section>
                </div>
              </div>

              <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                <div className="flex items-center gap-2">
                  {callNumber ? (
                    <a
                      href={`tel:+${callNumber}`}
                      className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-center text-xs font-bold uppercase tracking-[0.08em] text-slate-700"
                    >
                      Llamar
                    </a>
                  ) : null}
                  {whatsappNumber ? (
                    <a
                      href={`https://wa.me/${whatsappNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-center text-xs font-black uppercase tracking-[0.08em]"
                      style={
                        receivesOrdersOnWhatsapp
                          ? { backgroundColor: '#16A34A', color: '#FFFFFF' }
                          : { backgroundColor: '#E2E8F0', color: '#64748B' }
                      }
                    >
                      <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
                      {receivesOrdersOnWhatsapp ? 'WhatsApp' : 'WhatsApp sin pedidos'}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void shareMenu()}
                    className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-center text-xs font-bold uppercase tracking-[0.08em] text-slate-700"
                  >
                    Compartir
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {isMapPickerOpen ? (
          <section className="kos-modal-backdrop fixed inset-0 z-[61] bg-[var(--menu-background)] text-[var(--menu-text)]">
            <div className="kos-sheet-panel mx-auto flex h-full max-w-2xl flex-col bg-[var(--menu-background)]">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--menu-border)] bg-[color-mix(in_srgb,var(--menu-background)_88%,var(--menu-surface))] px-4 py-3 backdrop-blur-sm sm:px-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--menu-text-muted)]">Mapa</p>
                  <h3 className="text-xl font-black text-[var(--menu-text)]" style={titleFontStyle}>Punto de entrega</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMapPickerOpen(false)}
                  className="rounded-full border border-[var(--menu-border)] px-3 py-1 text-xs font-semibold text-[var(--menu-text-muted)]"
                >
                  Cerrar
                </button>
              </div>

              <div className="relative flex-1">
                <div className="absolute left-3 right-3 top-3 z-10 flex gap-2 sm:left-6 sm:right-6">
                  <input
                    ref={mapPickerSearchInputRef}
                    type="text"
                    placeholder="Buscar direccion o lugar"
                    defaultValue={deliveryAddress}
                    className="h-10 w-full rounded-xl border border-[var(--menu-border)] bg-[var(--menu-surface)] px-3 text-sm text-[var(--menu-text)] outline-none placeholder:text-[var(--menu-text-muted)]"
                    disabled={mapPickerProvider !== 'google'}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      if (mapPickerProvider !== 'google') return;
                      const query = mapPickerSearchInputRef.current?.value?.trim() ?? '';
                      if (!query) return;
                      const geocoder = mapPickerGeocoderRef.current;
                      const map = mapPickerMapRef.current;
                      if (!geocoder || !map) return;
                      setIsMapPickerLoading(true);
                      geocoder.geocode({ address: query }, (results: GooglePlaceResult[] | null, status: string) => {
                        if (status !== 'OK' || !results?.[0]?.geometry?.location) {
                          setIsMapPickerLoading(false);
                          return;
                        }
                        const location = results[0].geometry.location;
                        const point = { lat: location.lat(), lng: location.lng() };
                        setDeliveryPoint(point);
                        setDeliveryPointSource('user');
                        map.panTo(point);
                        map.setZoom(17);
                        setMapPickerAddress(results[0].formatted_address ?? query);
                        setIsMapPickerLoading(false);
                      });
                    }}
                  />
                  <button
                    type="button"
                    disabled={mapPickerProvider !== 'google'}
                    onClick={() => {
                      if (mapPickerProvider !== 'google') return;
                      const query = mapPickerSearchInputRef.current?.value?.trim() ?? '';
                      if (!query) return;
                      const geocoder = mapPickerGeocoderRef.current;
                      const map = mapPickerMapRef.current;
                      if (!geocoder || !map) return;
                      setIsMapPickerLoading(true);
                      geocoder.geocode({ address: query }, (results: GooglePlaceResult[] | null, status: string) => {
                        if (status !== 'OK' || !results?.[0]?.geometry?.location) {
                          setIsMapPickerLoading(false);
                          return;
                        }
                        const location = results[0].geometry.location;
                        const point = { lat: location.lat(), lng: location.lng() };
                        setDeliveryPoint(point);
                        setDeliveryPointSource('user');
                        map.panTo(point);
                        map.setZoom(17);
                        setMapPickerAddress(results[0].formatted_address ?? query);
                        setIsMapPickerLoading(false);
                      });
                    }}
                    className="rounded-xl border border-[var(--menu-border)] bg-[var(--menu-surface)] px-3 text-xs font-bold uppercase tracking-[0.08em] text-[var(--menu-text)] disabled:opacity-50"
                  >
                    Buscar
                  </button>
                </div>
                <div ref={mapPickerContainerRef} className="h-full w-full bg-slate-100" />
                <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
                  <div
                    className={`-mt-6 text-4xl leading-none transition-[transform] duration-200 ease-out ${
                      isMapPickerDragging
                        ? '-translate-y-3 scale-110 drop-shadow-[0_16px_14px_rgba(15,23,42,0.24)]'
                        : 'translate-y-0 scale-100 drop-shadow-[0_8px_8px_rgba(15,23,42,0.22)]'
                    }`}
                    aria-hidden="true"
                  >
                    📍
                  </div>
                </div>
                {isMapPickerLoading ? (
                  <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full border border-[var(--menu-border)] bg-[var(--menu-surface)] px-3 py-1 text-xs font-semibold text-[var(--menu-text)] shadow-sm">
                    Buscando direccion...
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 border-t border-[var(--menu-border)] bg-[var(--menu-surface)] px-4 py-3 sm:px-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--menu-text-muted)]">Direccion detectada</p>
                <p className="text-sm font-semibold text-[var(--menu-text)]">
                  {mapPickerAddress || 'Mueve el mapa para colocar el pin en el punto exacto.'}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--menu-text-muted)]">
                  Mapa: {mapPickerProvider === 'google' ? 'Google Maps' : 'OpenStreetMap'}
                </p>
                {mapPickerError ? (
                  <p className="text-xs font-semibold text-rose-500">{mapPickerError}</p>
                ) : null}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!navigator.geolocation) return;
                      navigator.geolocation.getCurrentPosition((position) => {
                        const point = {
                          lat: position.coords.latitude,
                          lng: position.coords.longitude,
                        };
                        setDeliveryPoint(point);
                        setDeliveryPointSource('user');
                        const map = mapPickerMapRef.current;
                        if (mapPickerProvider === 'google') {
                          if (map?.panTo) map.panTo(point);
                        } else {
                          if (map?.setView) map.setView([point.lat, point.lng], 16);
                        }
                        mapPickerResolveAddressRef.current?.(point);
                      });
                    }}
                    className="rounded-full border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--menu-text)]"
                  >
                    Mi ubicacion
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (deliveryPoint) {
                        setDeliveryPointSource('user');
                      }
                      if (mapPickerAddress.trim().length > 0) {
                        setDeliveryAddress(mapPickerAddress.trim());
                      }
                      setIsMapPickerOpen(false);
                    }}
                    className="ml-auto rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.08em]"
                    style={{ backgroundColor: 'var(--primary-color)', color: 'var(--text-on-primary)' }}
                  >
                    Confirmar punto
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {isConfirmOpen && !kioskVoucher ? (
          <KioskCheckout
            fulfillment={kioskFulfillment}
            steps={checkoutFlowSteps}
            currentStepId={checkoutStep}
            title={
              checkoutStep === 0
                ? 'Tu pedido'
                : checkoutStep === 1
                  ? 'Tus datos'
                  : checkoutStep === 2
                    ? 'Direccion'
                    : 'Pago'
            }
            subtitle={
              checkoutStep === 0
                ? 'Revisa cantidades. El tipo de pedido ya esta elegido.'
                : checkoutStep === 1
                  ? 'Te avisamos cuando el pedido este listo.'
                  : checkoutStep === 2
                    ? 'Indica a donde enviamos tu pedido.'
                    : 'Elige como vas a pagar.'
            }
            totalLabel={formatAmountByCurrency(orderGrandTotalConverted, selectedCurrencyCode)}
            itemsLabel={`${checkoutItemsCount} unid. · ${selectedCurrencyCode}`}
            error={checkoutError}
            backLabel={checkoutStep === 0 ? 'Seguir pidiendo' : 'Atras'}
            nextLabel={
              isSubmittingOrder
                ? 'Guardando pedido...'
                : checkoutStep === 3
                  ? 'Confirmar pedido'
                  : checkoutStep === 1 && !isDeliveryOrder
                    ? 'Ir a pagar'
                    : checkoutStep === 2
                      ? 'Ir a pagar'
                      : 'Continuar'
            }
            nextDisabled={
              isSubmittingOrder ||
              (checkoutStep === 3 ? !canSubmitCheckout : !canAdvanceCurrentStep)
            }
            submitting={isSubmittingOrder}
            onClose={() => setIsConfirmOpen(false)}
            onBack={checkoutStep === 0 ? () => setIsConfirmOpen(false) : goToPreviousStep}
            onNext={checkoutStep === 3 ? () => void confirmOrder() : goToNextStep}
          >
                  {checkoutStep === 0 ? (
                    <div className="space-y-4">
                      {checkoutSummaryItems.length > 0 ? (
                        <div className="space-y-3">
                          {checkoutSummaryItems.map((item, index) => (
                            <article
                              key={`checkout-step-order-${item.id}`}
                              className="checkout-item-enter rounded-[22px] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)] sm:p-5"
                              style={{ animationDelay: `${index * 50}ms` }}
                            >
                              <div className="flex items-start gap-4">
                                <KioskImage
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="h-20 w-20 shrink-0 rounded-[22px] bg-[var(--menu-surface-alt)]"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-[15px] font-black text-[var(--menu-text)]">{item.name}</p>
                                      {item.description ? (
                                        <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--menu-text-muted)]">{item.description}</p>
                                      ) : null}
                                    </div>
                                    <p className="whitespace-nowrap text-sm font-black text-[var(--menu-text)]">
                                      {formatAmountByCurrency(item.totalPrice, selectedCurrencyCode)}
                                    </p>
                                  </div>

                                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                    <div className="inline-flex items-center rounded-full border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] p-1">
                                      <button
                                        type="button"
                                        onClick={() => decrementProduct(item.id)}
                                        className="grid h-9 w-9 place-items-center rounded-full bg-[var(--menu-surface)] text-base font-black text-[var(--menu-text)]"
                                        aria-label={`Reducir cantidad de ${item.name}`}
                                      >
                                        −
                                      </button>
                                      <span className="min-w-10 px-2 text-center text-sm font-black text-[var(--menu-text)]">{item.quantity}</span>
                                      <button
                                        type="button"
                                        onClick={() => incrementCartLine(item.id)}
                                        disabled={!item.canIncrease}
                                        className="grid h-9 w-9 place-items-center rounded-full bg-[var(--menu-surface)] text-base font-black text-[var(--menu-text)] disabled:opacity-40"
                                        aria-label={`Aumentar cantidad de ${item.name}`}
                                      >
                                        +
                                      </button>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => removeProductFromCart(item.id)}
                                      className="text-sm font-bold text-rose-500"
                                    >
                                      Quitar
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-[var(--menu-border)] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)] sm:p-5">
                          <div className="flex items-start gap-3">
                            <div
                              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] text-white shadow-[0_16px_32px_rgba(15,23,42,0.16)]"
                              style={{ backgroundColor: 'var(--primary-color)' }}
                            >
                              <ShoppingCart className="h-5 w-5" strokeWidth={2.4} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--menu-text-muted)]">Pedido</p>
                              <h6 className="mt-1.5 text-[1.1rem] font-black leading-tight tracking-[-0.03em] text-[var(--menu-text)] sm:text-[1.2rem]" style={titleFontStyle}>
                                Tu carrito está vacío
                              </h6>
                              <p className="mt-2 text-sm leading-5 text-[var(--menu-text-muted)]">
                                Agrega un producto para continuar con tu pedido.
                              </p>

                              <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsConfirmOpen(false);
                                    const target = stickySearchCardRef.current;
                                    const targetTop = target
                                      ? window.scrollY + target.getBoundingClientRect().top - (topTickerHeightPx + topAppBarHeightPx + 12)
                                      : 0;
                                    window.scrollTo({ top: Math.max(0, targetTop), behavior: prefersReducedMotion ? 'auto' : 'smooth' });
                                  }}
                                  className="kos-surface-motion kos-pressable kos-hover-subtle inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black shadow-[0_16px_32px_rgba(15,23,42,0.14)]"
                                  style={{
                                    backgroundColor: 'var(--primary-color)',
                                    color: 'var(--text-on-primary)',
                                  }}
                                >
                                  Empezar a agregar
                                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {checkoutSummaryItems.length > 0 && cartUpsellSuggestions.length > 0 ? (
                        <div className="checkout-item-enter" style={{ animationDelay: '90ms' }}>
                          <CartUpsellSection
                            suggestions={cartUpsellSuggestions}
                            formatPrice={formatUpsellPrice}
                            onAdd={(suggestion) => handleAddCartSuggestion('cart', suggestion)}
                            onDismiss={(suggestion) => handleDismissCartSuggestion('cart', suggestion)}
                          />
                        </div>
                      ) : null}

                      {checkoutSummaryItems.length > 0 ? (
                        <div className="checkout-item-enter rounded-[22px] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)]" style={{ animationDelay: '120ms' }}>
                        <label htmlFor="order-notes" className="block">
                          <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                            <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.4} />
                            Nota para el negocio
                          </span>
                          <textarea
                            id="order-notes"
                            value={orderNotes}
                            onChange={(event) => setOrderNotes(event.target.value)}
                            placeholder="Sin cebolla, tocar timbre, empaquetar aparte"
                            rows={3}
                            className="w-full rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] px-4 py-3 text-sm outline-none"
                          />
                        </label>
                        <p className="mt-2 text-[11px] font-medium text-[var(--menu-text-muted)]">
                          Opcional.
                        </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {checkoutStep === 1 ? (
                    <div className="space-y-4">
                      <div className="checkout-item-enter rounded-[22px] bg-[var(--menu-surface)] px-4 py-3 shadow-[var(--menu-shadow)]">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--menu-text-muted)]">
                          Pedido
                        </p>
                        <p className="mt-1 text-base font-black">
                          {kioskFulfillment ? FULFILLMENT_LABEL[kioskFulfillment] : 'Pedido en local'}
                          {' · '}
                          {checkoutItemsCount} unid.
                        </p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="checkout-item-enter block rounded-[22px] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)]" style={{ animationDelay: '40ms' }}>
                          <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                            <User className="h-3.5 w-3.5" strokeWidth={2.4} />
                            Nombre completo
                          </span>
                          <input
                            id="client-full-name"
                            name="name"
                            type="text"
                            value={clientName}
                            onChange={(event) => setClientName(event.target.value)}
                            placeholder="Maria Fernanda Lopez"
                            autoComplete="name"
                            className="h-12 w-full rounded-2xl border bg-[var(--menu-surface-alt)] px-4 text-sm text-[var(--menu-text)] outline-none placeholder:text-[var(--menu-text-muted)]"
                            style={{
                              borderColor: isClientNameValid || clientName.trim().length === 0 ? 'var(--menu-border)' : '#F43F5E',
                            }}
                            required
                          />
                        </label>

                        <label className="checkout-item-enter block rounded-[22px] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)]" style={{ animationDelay: '90ms' }}>
                          <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                            <Mail className="h-3.5 w-3.5" strokeWidth={2.4} />
                            Correo electronico
                          </span>
                          <input
                            id="client-email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            placeholder="correo@ejemplo.com"
                            value={clientEmail}
                            onChange={(event) => setClientEmail(event.target.value)}
                            className="h-12 w-full rounded-2xl border bg-[var(--menu-surface-alt)] px-4 text-sm text-[var(--menu-text)] outline-none placeholder:text-[var(--menu-text-muted)]"
                            style={{
                              borderColor: isClientEmailValid || clientEmail.trim().length === 0 ? 'var(--menu-border)' : '#F43F5E',
                            }}
                            required
                          />
                          {!isClientEmailValid && clientEmail.trim().length > 0 ? (
                            <p className="mt-2 text-[11px] font-semibold text-rose-500">Ingresa un correo valido.</p>
                          ) : null}
                        </label>
                      </div>

                      <label className="checkout-item-enter block rounded-[22px] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)]" style={{ animationDelay: '140ms' }}>
                        <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                          <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.4} />
                          WhatsApp
                        </span>
                        <div
                          className="checkout-phone-field rounded-2xl border bg-[var(--menu-surface-alt)]"
                          style={{
                            borderColor:
                              isClientWhatsappValid || clientWhatsapp.trim().length === 0 ? 'var(--menu-border)' : '#F43F5E',
                          }}
                        >
                          <PhoneInput
                            international
                            countryCallingCodeEditable={false}
                            defaultCountry={clientWhatsappCountry}
                            country={clientWhatsappCountry}
                            value={clientWhatsapp || undefined}
                            onChange={(value) => setClientWhatsapp(value ?? '')}
                            onCountryChange={(country) => {
                              if (country) setClientWhatsappCountry(country as Country);
                            }}
                            placeholder="Ingresa tu numero"
                            numberInputProps={{
                              required: true,
                              autoComplete: 'tel',
                            }}
                          />
                        </div>
                      </label>
                    </div>
                  ) : null}

                  {checkoutStep === 2 ? (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setIsMapPickerOpen(true)}
                        className="w-full rounded-[22px] bg-[var(--menu-surface)] p-4 text-left shadow-[var(--menu-shadow)]"
                        style={{ boxShadow: isDeliveryAddressValid ? '0 8px 30px rgba(15,23,42,0.06)' : '0 0 0 1px #F43F5E' }}
                      >
                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--menu-text-muted)]">
                          Direccion de entrega
                        </p>
                        <p className="mt-2 text-sm font-semibold">
                          {normalizedDeliveryAddress || 'Toca para marcar la direccion en el mapa'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span
                            className="rounded-full px-2.5 py-1 text-[11px] font-black"
                            style={
                              hasDeliveryPoint
                                ? {
                                    backgroundColor: 'color-mix(in srgb, #10B981 16%, var(--menu-surface))',
                                    color: 'color-mix(in srgb, #059669 70%, var(--menu-text))',
                                  }
                                : {
                                    backgroundColor: 'color-mix(in srgb, #F59E0B 16%, var(--menu-surface))',
                                    color: 'color-mix(in srgb, #D97706 72%, var(--menu-text))',
                                  }
                            }
                          >
                            {hasDeliveryPoint ? 'Punto confirmado' : 'Falta el punto en el mapa'}
                          </span>
                          <span className="rounded-full bg-[var(--menu-surface-alt)] px-2.5 py-1 text-[11px] font-black">
                            Envio {formatAmountByCurrency(deliveryCostConverted, selectedCurrencyCode)}
                          </span>
                        </div>
                      </button>
                      <label className="block rounded-[22px] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)]">
                        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                          Referencia
                        </span>
                        <input
                          type="text"
                          value={deliveryReference}
                          onChange={(event) => setDeliveryReference(event.target.value)}
                          placeholder="Apartamento, porton, piso, torre"
                          className="h-12 w-full rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] px-4 text-sm outline-none"
                        />
                      </label>
                      <label className="block rounded-[22px] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)]">
                        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                          Indicaciones
                        </span>
                        <textarea
                          value={deliveryInstructions}
                          onChange={(event) => setDeliveryInstructions(event.target.value)}
                          placeholder="Tocar timbre, llamar al llegar..."
                          rows={3}
                          className="w-full rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] px-4 py-3 text-sm outline-none"
                        />
                      </label>
                    </div>
                  ) : null}

                  {checkoutStep === 3 ? (
                    <div className="space-y-3">
                      <div className="rounded-[22px] bg-[var(--menu-surface)] px-4 py-3 shadow-[var(--menu-shadow)]">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--menu-text-muted)]">
                          Resumen
                        </p>
                        <p className="mt-1 text-base font-black">
                          {kioskFulfillment ? FULFILLMENT_LABEL[kioskFulfillment] : 'Pedido en local'}
                        </p>
                        <p className="mt-1 text-sm font-medium text-[var(--menu-text-muted)]">
                          {normalizedClientName || 'Cliente'} · {checkoutItemsCount} unid.
                        </p>
                      </div>
                      {checkoutUpsellSuggestions.length > 0 ? (
                        <div className="checkout-item-enter">
                          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--menu-text-muted)]">
                            Antes de terminar
                          </p>
                          <CartUpsellSection
                            suggestions={checkoutUpsellSuggestions}
                            formatPrice={formatUpsellPrice}
                            onAdd={(suggestion) => handleAddCartSuggestion('checkout', suggestion)}
                            onDismiss={(suggestion) => handleDismissCartSuggestion('checkout', suggestion)}
                          />
                        </div>
                      ) : null}

                      <p className="checkout-item-enter text-[11px] font-black uppercase tracking-[0.16em] text-[var(--menu-text-muted)]">
                        Como vas a pagar
                      </p>

                      {selectedCurrencyGroup?.methods.length ? (
                        <div className="space-y-2">
                          {selectedCurrencyGroup.methods.map((method, index) => {
                            const isSelected = selectedPaymentMethodId === method.id;
                            const details = paymentMethodDetails(method);
                            return (
                              <button
                                key={method.id}
                                type="button"
                                onClick={() => setSelectedPaymentMethodId(method.id)}
                                className="checkout-item-enter w-full rounded-[22px] px-4 py-4 text-left shadow-[var(--menu-shadow)]"
                                style={{
                                  ...(isSelected
                                    ? {
                                        boxShadow: '0 0 0 1px var(--menu-primary), var(--menu-shadow)',
                                        backgroundColor: 'color-mix(in srgb, var(--menu-primary) 12%, var(--menu-surface))',
                                      }
                                    : { backgroundColor: 'var(--menu-surface)' }),
                                  animationDelay: `${index * 45}ms`,
                                }}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-bold text-[var(--menu-text)]">{paymentMethodLabel(method)}</p>
                                    {details.length > 0 ? (
                                      <p className="mt-1 text-xs text-[var(--menu-text-muted)]">{details.slice(0, 2).join(' · ')}</p>
                                    ) : null}
                                  </div>
                                  <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${isSelected ? 'bg-emerald-500 text-white' : 'bg-[var(--menu-surface-alt)] text-[var(--menu-text-muted)]'}`}>
                                    {isSelected ? '✓' : ''}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="checkout-item-enter rounded-[22px] bg-[var(--menu-surface)] p-3 text-sm text-[var(--menu-text-muted)] shadow-[var(--menu-shadow)]">
                          Este comercio no tiene metodos de pago configurados.
                        </div>
                      )}

                      {isDeliveryOrder && isCashPayment ? (
                        <div className="checkout-item-enter rounded-[22px] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)]" style={{ animationDelay: '90ms' }}>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--menu-text-muted)]">
                            ¿Necesitas cambio?
                          </p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setNeedsCashChange(false);
                                setCashPaymentInput('');
                              }}
                              className="min-h-11 rounded-[14px] text-sm font-bold"
                              style={
                                !needsCashChange
                                  ? { backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary, #fff)' }
                                  : { backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text-muted)' }
                              }
                            >
                              No, pago exacto
                            </button>
                            <button
                              type="button"
                              onClick={() => setNeedsCashChange(true)}
                              className="min-h-11 rounded-[14px] text-sm font-bold"
                              style={
                                needsCashChange
                                  ? { backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary, #fff)' }
                                  : { backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text-muted)' }
                              }
                            >
                              Sí, necesito cambio
                            </button>
                          </div>

                          {needsCashChange ? (
                            <label className="mt-4 block">
                              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--menu-text-muted)]">
                                ¿Con cuánto vas a pagar?
                              </span>
                              <div
                                className="flex h-12 items-center rounded-xl border bg-[var(--menu-surface-alt)] px-3"
                                style={{
                                  borderColor:
                                    cashPaymentInput && !isCashTenderValid ? '#F43F5E' : 'var(--menu-border)',
                                }}
                              >
                                <span className="pr-2 text-sm font-semibold text-[var(--menu-text-muted)]">
                                  {selectedCurrencyCode}
                                </span>
                                <input
                                  type="text"
                                  inputMode={currencyAllowsDecimals(selectedCurrencyCode) ? 'decimal' : 'numeric'}
                                  value={cashPaymentInput}
                                  onChange={(event) =>
                                    setCashPaymentInput(parseCashAmountInput(event.target.value, selectedCurrencyCode))
                                  }
                                  placeholder={`Mayor a ${formatAmountByCurrency(orderGrandTotalConverted, selectedCurrencyCode)}`}
                                  className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--menu-text)] outline-none placeholder:text-[var(--menu-text-muted)]"
                                />
                              </div>
                              {cashTenderSuggestions.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {cashTenderSuggestions.map((amount) => (
                                    <button
                                      key={amount}
                                      type="button"
                                      onClick={() => setCashPaymentInput(String(amount))}
                                      className="rounded-full bg-[var(--menu-surface-alt)] px-3 py-1.5 text-xs font-bold text-[var(--menu-text-muted)]"
                                    >
                                      {formatAmountByCurrency(amount, selectedCurrencyCode)}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                              {cashPaymentInput && !isCashTenderValid ? (
                                <p className="mt-2 text-xs font-semibold text-rose-500">
                                  El efectivo debe ser mayor al total ({formatAmountByCurrency(orderGrandTotalConverted, selectedCurrencyCode)}).
                                </p>
                              ) : null}
                              {changeAmount > 0 ? (
                                <p
                                  className="mt-2 text-xs font-semibold"
                                  style={{ color: 'color-mix(in srgb, #10B981 72%, var(--menu-text))' }}
                                >
                                  Te devolvemos {formatAmountByCurrency(changeAmount, selectedCurrencyCode)}.
                                </p>
                              ) : null}
                            </label>
                          ) : (
                            <p className="mt-3 text-xs font-medium text-[var(--menu-text-muted)]">
                              El rider llevará el pedido para pago exacto, sin cambio.
                            </p>
                          )}
                        </div>
                      ) : null}

                      {isDigitalPayment ? (
                        <div className="checkout-item-enter space-y-2 rounded-[22px] bg-[var(--menu-surface)] p-3 shadow-[var(--menu-shadow)]" style={{ animationDelay: '120ms' }}>
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--menu-text-muted)]">
                              Referencia (ultimos 4 digitos)
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={4}
                              value={paymentReferenceLast4}
                              onChange={(event) => setDigitalPaymentReference(normalizePhone(event.target.value).slice(0, 4))}
                              placeholder="1234"
                              className="h-11 w-full rounded-xl border bg-[var(--menu-surface-alt)] px-4 text-sm text-[var(--menu-text)] outline-none"
                              style={{ borderColor: isPaymentReferenceValid || !digitalPaymentReference ? 'var(--menu-border)' : '#F43F5E' }}
                              required
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--menu-text-muted)]">
                              Cargar comprobante
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              id="payment-proof-upload"
                              onChange={(event) => {
                                const selected = event.target.files?.[0] ?? null;
                                setPaymentProofFile(selected);
                              }}
                            />
                            <label
                              htmlFor="payment-proof-upload"
                              className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-[var(--menu-border)] bg-[var(--menu-surface-alt)] px-3 text-sm font-semibold text-[var(--menu-text)]"
                            >
                              {paymentProofFile ? `Comprobante: ${paymentProofFile.name}` : 'Seleccionar captura'}
                            </label>
                          </label>
                        </div>
                      ) : null}

                      <div className="checkout-item-enter rounded-[22px] bg-[var(--menu-surface)] px-4 py-3 shadow-[var(--menu-shadow)]" style={{ animationDelay: '150ms' }}>
                        <p className="flex items-center justify-between text-sm text-[var(--menu-text-muted)]">
                          <span>Subtotal</span>
                          <span className="font-semibold">{formatAmountByCurrency(orderSubtotalConverted, selectedCurrencyCode)}</span>
                        </p>
                        {isDeliveryOrder ? (
                          <p className="mt-1 flex items-center justify-between text-sm text-[var(--menu-text-muted)]">
                            <span>Costo de envio</span>
                            <span className="font-semibold">{formatAmountByCurrency(deliveryCostConverted, selectedCurrencyCode)}</span>
                          </p>
                        ) : null}
                        <p className="mt-2 flex items-center justify-between border-t border-[var(--menu-border)] pt-2 text-sm font-semibold text-[var(--menu-text)]">
                          <span>Total en {selectedCurrencyCode}</span>
                          <span style={titleFontStyle}>{formatAmountByCurrency(orderGrandTotalConverted, selectedCurrencyCode)}</span>
                        </p>
                        {selectedCurrencyCode !== businessBaseCurrency ? (
                          <p className="mt-1 text-[11px] font-semibold text-[var(--menu-text-muted)]">
                            Tasa snapshot ({exchangeSourceLabel(selectedExchangeSource)}): {formatTickerRate(selectedExchangeRate)} {selectedCurrencyCode} por 1 {businessBaseCurrency}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
          </KioskCheckout>
        ) : null}

      </main>
    </>
  );
}
