'use client';

import Head from 'next/head';
import { ArrowRight, ArrowUp, Banknote, Bitcoin, Building2, Camera, Check, ChevronDown, CreditCard, Facebook, Flame, ImageIcon, Info, Instagram, Mail, MapPin, Menu, MessageCircle, Music2, Phone, Share2, ShoppingCart, Smartphone, Store, Truck, User, Wallet, X, Youtube } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  MENU_IMAGE_WIDTH,
  optimizeMenuImageUrl,
  resolveCategoryCover,
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
import { ProductImageLightbox } from './_components/ProductImageLightbox';
import { KioskMenuExperience } from './_components/kiosk/KioskMenuExperience';
import { KioskCheckout } from './_components/kiosk/KioskCheckout';
import { DeliveryNoteField } from './_components/kiosk/DeliveryNoteField';
import { KioskImage } from './_components/kiosk/KioskImage';
import {
  KioskCatalogReady,
  type CatalogReadyItem,
} from './_components/kiosk/KioskCatalogReady';
import { FULFILLMENT_LABEL, type KioskFulfillment, type KioskVoucherData } from './_components/kiosk/kiosk-types';
import {
  parseKioskHomeConfig,
  shouldForceCatalogModeFromQuery,
} from '../../_lib/kiosk-home-config';
import { foldSearchText } from '../../_lib/search-text';
import { useLockBodyScroll } from '../../_lib/use-lock-body-scroll';
import { parseDeliveryConfig, pointInPolygon, quoteDeliveryFee } from '../../_lib/delivery-config';
import {
  cashTenderValidity,
  currencyAllowsDecimals,
  currencyPrefix,
  describeCashBills,
  formatCashAmountDisplay,
  formatCashAmountInputValue,
  parseCashAmount,
  parseCashAmountInput,
  snapCashAmountUp,
  suggestCashTenders,
  toCashAmountCanonical,
} from '../../_lib/cash-tender';
import { CartUpsellSection, type CartUpsellSuggestion } from './_components/upsell/CartUpsellSection';
import { PreCheckoutUpsellSheet } from './_components/upsell/PreCheckoutUpsellSheet';
import {
  resolvePreCheckoutSuggestions,
  shouldShowPreCheckoutUpsell,
} from '../../_lib/pre-checkout-upsell';
import type { BundleRailItem } from './_components/upsell/BundleRail';
import {
  formatPaymentMethodDetails,
  isCashPaymentMethodLabel,
  parsePaymentMethodFields,
  paymentMethodIconKindFromText,
  paymentMethodLabelFromRow,
} from '../../_lib/payment-method-display';
import { PaymentCopyFields } from './_components/PaymentCopyFields';
import {
  convertAmountBetweenCurrencies,
  exchangeSourceLabel,
  parseExchangeRateAdjustment,
  resolveCheckoutCurrencyRate,
  resolveCheckoutCurrencySource,
  type ExchangeRateAdjustment,
} from '../../_lib/checkout-exchange-rate';
import { venezuelaOperatingStateLabels } from '../../_lib/venezuela-states';
import {
  buildCartLineKey,
  buildOrderLineLabel,
  formatProductPriceLabel,
  cartBadgeQuantity,
  formatWeightLabel,
  getProductOptionsSummary,
  getProductMinimumPrice,
  getWeightSaleConfig,
  isServicioAdicionalName,
  isSoldByWeight,
  normalizeWeightKg,
  parseCartLineKey,
  productRequiresConfiguration,
  productRequiresOptionSheet,
  resolveCombinedUnitPrice,
  parseProductPersonalization,
  validateCustomizationSelection,
  summarizeCartLineSelection,
  validateOptionGroupSelection,
  type CartLineSelection,
} from '../../_lib/menu-product-options';
import { consumeRepeatOrder } from '../../_lib/repeat-order';
import { buildClientOrderSummary } from '../../_lib/whatsapp-order-format';
import { normalizeOrderManagementMode } from '../../_lib/order-management-mode';
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
import { prepareComprobanteFile } from '../../_lib/prepare-comprobante-file';
import {
  readCachedCheckoutCustomer,
  writeCachedCheckoutCustomer,
} from '../../_lib/checkout-customer-cache';
import {
  DEFAULT_INSTRUCTION_SUGGESTIONS,
  DEFAULT_REFERENCE_SUGGESTIONS,
  deliveryNoteSuggestions,
  readDeliveryNotesCache,
  rememberDeliveryNote,
  type DeliveryNotesCache,
} from '../../_lib/delivery-notes-cache';
import {
  clearCachedCheckoutCart,
  readCachedCheckoutCart,
  writeCachedCheckoutCart,
  type CachedCheckoutCart,
} from '../../_lib/checkout-cart-cache';
import { AbandonedCartResumeDialog } from './_components/AbandonedCartResumeDialog';

type CategoriaRow = {
  id: string;
  nombre: string;
  orden?: number | null;
  icono?: string | null;
  imagen_url?: string | null;
  opciones_menu?: unknown;
  rol?: string | null;
  tipo_upselling?: string | null;
};

type ProductoRow = {
  id: string;
  comercio_id?: string;
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

function menuLinePrice(product: ProductoRow, category: CategoriaRow | null, selection: CartLineSelection, products: Map<string, ProductoRow>, categories: Map<string, CategoriaRow>) {
  const partner = selection.combinacion ? products.get(selection.combinacion.productId) : null;
  return resolveCombinedUnitPrice(product, category, selection, partner, partner ? categories.get(partner.id) : null);
}

function menuLineInvalid(product: ProductoRow, selection: CartLineSelection, products: Map<string, ProductoRow>) {
  const config = parseProductPersonalization(product.opciones_menu);
  if (!config && !selection.combinacion && !selection.exclusionesIds?.length) return validateOptionGroupSelection(product, selection).length > 0;
  if (validateCustomizationSelection(product, selection).length) return true;
  if (!selection.combinacion) return false;
  const partner = products.get(selection.combinacion.productId);
  return !partner || partner.disponible === false || partner.id === product.id ||
    !config?.combinacion?.productosCompatibles.includes(partner.id) ||
    (product.comercio_id != null && partner.comercio_id !== product.comercio_id) ||
    validateCustomizationSelection(partner, selection.combinacion.seleccion).length > 0;
}

function menuLineLabel(product: ProductoRow, selection: CartLineSelection, category: CategoriaRow | null, products: Map<string, ProductoRow>) {
  const partner = selection.combinacion ? products.get(selection.combinacion.productId) : null;
  return buildOrderLineLabel(product, selection, category, partner);
}

function menuLineSummary(product: ProductoRow, selection: CartLineSelection, category: CategoriaRow | null, products: Map<string, ProductoRow>, categories: Map<string, CategoriaRow>) {
  const partner = selection.combinacion ? products.get(selection.combinacion.productId) : null;
  return summarizeCartLineSelection(product, selection, category, partner, partner ? categories.get(partner.id) : null);
}

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
    exchange_rate_adjustments?: Record<string, unknown> | null;
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
  rating_average?: number | string | null;
  rating_count?: number | string | null;
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
  social_links?: Record<string, string | null> | null;
  inicio_menu?: unknown;
  delivery_tarifas?: unknown;
  direccion?: string | null;
  ciudad?: string | null;
  negocio_virtual?: boolean | null;
  estados_operacion?: string[] | null;
  zona_operacion?: string | null;
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
    exchangeRateAdjustments?: Record<string, ExchangeRateAdjustment>;
  } | null;
  marketRates?: MarketRatesRow | null;
  upsellSettings?: UpsellSettingsRow | null;
  upsellRules?: UpsellRuleRow[] | null;
  bundles?: BundleRow[] | null;
  preCheckoutUpsell?: {
    activo?: boolean;
    tipos?: string[];
    max_productos?: number;
    categorias?: Array<{ id?: string; tipo?: string }>;
    reglas?: Array<{
      categoria_id?: string | null;
      categoria_origen?: string | null;
      sugerir_tipos?: string[];
    }>;
  } | null;
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
const appBaseUrl = (process.env.NEXT_PUBLIC_APP_SITE_URL ?? 'https://app.elmenuxfa.com').replace(/\/$/, '');
const kioskVoucherStorageKeyPrefix = 'elmenuxfa:order-success:';
const splashLogoCacheKeyPrefix = 'elmenuxfa:splash-logo:';
const splashNameCacheKeyPrefix = 'elmenuxfa:splash-name:';
const kioskFulfillmentStoragePrefix = 'elmenuxfa-kiosk-fulfillment:';

function isKioskFulfillment(value: string | null | undefined): value is KioskFulfillment {
  return value === 'dine_in' || value === 'takeaway' || value === 'delivery';
}
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
    request: {
      location?: DeliveryPoint;
      address?: string;
      componentRestrictions?: { country: string };
      region?: string;
    },
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
      Autocomplete?: new (
        input: HTMLInputElement,
        options: {
          fields: string[];
          componentRestrictions?: { country: string };
        },
      ) => GoogleAutocomplete;
    };
  };
};

/** Bias/restrict all public-menu map search to Venezuela. */
const GOOGLE_MAPS_VE_COUNTRY = 've' as const;

type LeafletCenter = {
  lat: number;
  lng: number;
};

type LeafletMapHandle = {
  setView(coords: [number, number], zoom: number): LeafletMapHandle;
  getCenter(): LeafletCenter | null;
  fitBounds?(bounds: unknown, options?: Record<string, unknown>): void;
  on(event: string, handler: () => void): void;
  remove(): void;
};

type LeafletTileLayer = {
  addTo(map: LeafletMapHandle): void;
};

type LeafletPolygon = {
  addTo(map: LeafletMapHandle): void;
};

type LeafletApi = {
  map(element: HTMLElement, options: Record<string, unknown>): LeafletMapHandle;
  tileLayer(url: string, options: Record<string, unknown>): LeafletTileLayer;
  polygon?(
    latlngs: Array<[number, number]>,
    options?: Record<string, unknown>,
  ): LeafletPolygon;
  latLngBounds?(latlngs: Array<[number, number]>): unknown;
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

function normalizeSocialUrl(value: string | null | undefined) {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
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

function safeImageSrc(
  imageUrl: string | null | undefined,
  fallbackImageUrl?: string | null,
  width: number = MENU_IMAGE_WIDTH.tile,
) {
  const src = (imageUrl ?? '').trim();
  if (src.length > 0) return optimizeMenuImageUrl(src, width);

  const fallback = (fallbackImageUrl ?? '').trim();
  if (fallback.length > 0) return optimizeMenuImageUrl(fallback, width);

  return defaultProductImage;
}

function comercioInitial(name: string | null | undefined) {
  const clean = (name ?? '').trim();
  return clean.length > 0 ? clean.slice(0, 1).toUpperCase() : 'K';
}

function paymentMethodLabel(method: MetodoPagoRow) {
  return paymentMethodLabelFromRow(method);
}

function isCashPaymentMethod(method: MetodoPagoRow) {
  return isCashPaymentMethodLabel(paymentMethodLabel(method));
}

function PaymentMethodGlyph({
  method,
  label,
}: {
  method?: MetodoPagoRow | null;
  label?: string | null;
}) {
  const kind = paymentMethodIconKindFromText(
    label,
    method?.nombre,
    method?.tipo,
    method?.banco,
  );
  const className = 'h-4 w-4 shrink-0';
  if (kind === 'cash') return <Banknote className={className} aria-hidden />;
  if (kind === 'pago_movil') return <Smartphone className={className} aria-hidden />;
  if (kind === 'binance') return <Bitcoin className={className} aria-hidden />;
  if (kind === 'transfer') return <Building2 className={className} aria-hidden />;
  if (kind === 'card') return <CreditCard className={className} aria-hidden />;
  return <Wallet className={className} aria-hidden />;
}

function paymentMethodDetails(method: MetodoPagoRow) {
  return formatPaymentMethodDetails(method);
}

function paymentMethodCopyModel(method: MetodoPagoRow) {
  return parsePaymentMethodFields(method);
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
  const direct = quote === 'VES' && (base === 'USD' || base === 'EUR' || base === 'COP');
  const reverse = base === 'VES' && (quote === 'USD' || quote === 'EUR' || quote === 'COP');
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
    // BCV EUR is VES per 1 EUR. Do not multiply by USD/EUR — that made
    // BCV EUR collapse to nearly the same value as BCV USD.
    const liveRate =
      source === 'p2p_binance'
        ? adjustedP2pRateForBuyer(parseExchangeRate(marketRates?.p2p_binance_rate) ?? 0)
        : bcvVesRateForSource(source, marketRates);
    if (liveRate > 0) return liveRate;
    return (googleRates.get('VES/USD') ?? 0) > 0 ? 1 / (googleRates.get('VES/USD') ?? 0) : 0;
  }
  if (normalizedCurrency === 'COP') return googleRates.get('USD/COP') ?? 0;
  if (normalizedCurrency === 'EUR') return googleRates.get('USD/EUR') ?? 0;
  return 0;
}

/** Official BCV EUR (VES/EUR) for tracked VES pairs; never cross via USD/EUR. */
function bcvEurRateForPair(
  baseCurrency: string,
  quoteCurrency: string,
  marketRates: MarketRatesRow | null | undefined,
) {
  const eurVes = parseExchangeRate(marketRates?.payload?.bcv_rates?.EUR) ?? 0;
  if (eurVes <= 0) return 0;

  const base = normalizeCurrencyCode(baseCurrency);
  const quote = normalizeCurrencyCode(quoteCurrency);
  if (base === quote) return 1;

  if (base === 'EUR' && quote === 'VES') return eurVes;
  if (base === 'VES' && quote === 'EUR') return 1 / eurVes;
  if (base === 'USD' && quote === 'VES') return eurVes;
  if (base === 'VES' && quote === 'USD') return 1 / eurVes;

  const googleRates = googleRatesFromPayload(marketRates?.payload ?? null);
  const usdCop = googleRates.get('USD/COP') ?? 0;
  if (usdCop <= 0) return 0;
  if (base === 'COP' && quote === 'VES') return eurVes / usdCop;
  if (base === 'VES' && quote === 'COP') return usdCop / eurVes;
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

  if (canonicalizeBcvSource(source) === 'bcv_eur' && isTrackedVesPair(base, quote)) {
    const eurDerived = bcvEurRateForPair(base, quote, marketRates);
    if (eurDerived > 0) return eurDerived;
  }

  if (
    (isBcvExchangeSource(source) || source === 'p2p_binance' || source === 'google') &&
    isTrackedVesPair(base, quote)
  ) {
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
  exchangeRateAdjustments: Record<string, ExchangeRateAdjustment>;
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

  const exchangeRateAdjustments: Record<string, ExchangeRateAdjustment> = {};
  for (const [key, value] of Object.entries(config.exchange_rate_adjustments ?? {})) {
    const adjustment = parseExchangeRateAdjustment(value);
    if (adjustment) exchangeRateAdjustments[normalizeCurrencyCode(key)] = adjustment;
  }

  return {
    currencies: Array.from(currencies),
    exchangeRates,
    exchangeRateModes,
    exchangeRateSources,
    exchangeRateAdjustments,
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
      exchangeRateAdjustments?: Record<string, ExchangeRateAdjustment>;
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
  return foldSearchText(value);
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
  const [isPreCheckoutUpsellOpen, setIsPreCheckoutUpsellOpen] = useState(false);
  const [isCheckoutFooterExpanded, setIsCheckoutFooterExpanded] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const searchParams = useSearchParams();
  const isAssistedMode = (searchParams.get('mode') ?? '').trim().toLowerCase() === 'assisted';
  const catalogFromUrl = shouldForceCatalogModeFromQuery({
    catalogo: searchParams.get('catalogo'),
    modo: searchParams.get('modo'),
  });
  const [clientName, setClientName] = useState('');
  const [clientWhatsappCountry, setClientWhatsappCountry] = useState<Country>('VE');
  const [clientWhatsapp, setClientWhatsapp] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [wantOrderEmail, setWantOrderEmail] = useState(true);
  const [clientTable, setClientTable] = useState('');
  const [payLater, setPayLater] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isOrderReviewOpen, setIsOrderReviewOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(0);
  const [cashPaymentInput, setCashPaymentInput] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('');
  const [themeOverride, setThemeOverride] = useState<MenuThemeMode | null>(null);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofBusy, setPaymentProofBusy] = useState(false);
  const [paymentProofError, setPaymentProofError] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<OrderDeliveryMode>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [deliveryPoint, setDeliveryPoint] = useState<DeliveryPoint | null>(null);
  const [deliveryPointSource, setDeliveryPointSource] = useState<DeliveryPointSelectionSource>('none');
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [mapPickerAddress, setMapPickerAddress] = useState('');
  const [isMapPickerLoading, setIsMapPickerLoading] = useState(false);
  const [isMapCanvasReady, setIsMapCanvasReady] = useState(false);
  const [mapLoadSlow, setMapLoadSlow] = useState(false);
  const [mapPickerNonce, setMapPickerNonce] = useState(0);
  const [isMapPickerDragging, setIsMapPickerDragging] = useState(false);
  const [deliveryNoteMemory, setDeliveryNoteMemory] = useState<DeliveryNotesCache>({
    reference: '',
    instructions: '',
    references: [],
    instructionsHistory: [],
  });
  const [mapPickerError, setMapPickerError] = useState('');
  const [mapPickerProvider, setMapPickerProvider] = useState<'google' | 'leaflet'>('google');
  const [orderNotes, setOrderNotes] = useState('');
  const [kioskFulfillment, setKioskFulfillment] = useState<KioskFulfillment | null>(null);
  const [catalogMode, setCatalogMode] = useState(false);
  const [catalogReady, setCatalogReady] = useState<{
    items: CatalogReadyItem[];
    itemCount: number;
    totalLabel: string;
  } | null>(null);
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
  const cartHydratedRef = useRef(false);
  const leaveGuardArmedRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [cartCacheReady, setCartCacheReady] = useState(false);
  const [abandonedCartPrompt, setAbandonedCartPrompt] = useState<CachedCheckoutCart | null>(null);
  const menuReadyRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [expandedProductImage, setExpandedProductImage] = useState<{
    src: string;
    previewSrc: string | null;
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
  const orderSubmitLockRef = useRef(false);
  /** True once the upsell sheet has seen a non-empty cart (avoids closing on the add→open race). */
  const preCheckoutHadCartRef = useRef(false);
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
    // Waiters skip the home picker and go straight to categories (comer aquí).
    if (isAssistedMode) {
      setKioskFulfillment('dine_in');
      setDeliveryMode('pickup');
      setCatalogMode(false);
      window.sessionStorage.setItem(
        `${kioskFulfillmentStoragePrefix}${commerceIdentifier}`,
        'dine_in',
      );
      return;
    }
    // Mesa QR with ?catalogo=1 starts in catalog-only mode (no WhatsApp send).
    if (catalogFromUrl) {
      return;
    }
    const saved = window.sessionStorage.getItem(`${kioskFulfillmentStoragePrefix}${commerceIdentifier}`);
    if (!isKioskFulfillment(saved)) return;
    setKioskFulfillment(saved);
    setDeliveryMode(saved === 'delivery' ? 'delivery' : 'pickup');
  }, [commerceIdentifier, isAssistedMode, catalogFromUrl]);

  useEffect(() => {
    if (typeof window === 'undefined' || !commerceIdentifier) return;
    if (isAssistedMode || !catalogFromUrl) return;
    if (!menuData) return;
    const catalogEnabled = parseKioskHomeConfig(menuData.comercio.inicio_menu).catalogo;
    if (!catalogEnabled) return;
    setCatalogMode(true);
    setKioskFulfillment(null);
    setDeliveryMode('pickup');
    setKioskAddedPrompt(null);
    setIsConfirmOpen(false);
    setIsPreCheckoutUpsellOpen(false);
    window.sessionStorage.removeItem(`${kioskFulfillmentStoragePrefix}${commerceIdentifier}`);
  }, [commerceIdentifier, isAssistedMode, catalogFromUrl, menuData]);

  useEffect(() => {
    if (typeof window === 'undefined' || !commerceIdentifier) return;
    const storageKey = `${kioskVoucherStorageKeyPrefix}${commerceIdentifier}`;
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(storageKey);
    } catch {
      return;
    }
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Partial<KioskVoucherData>;
      if (
        typeof parsed.orderId !== 'string' ||
        !parsed.orderId.trim() ||
        typeof parsed.orderUrl !== 'string' ||
        !parsed.orderUrl.trim() ||
        !isKioskFulfillment(parsed.fulfillment) ||
        typeof parsed.totalLabel !== 'string' ||
        !Array.isArray(parsed.items)
      ) {
        window.sessionStorage.removeItem(storageKey);
        return;
      }

      setKioskVoucher({
        managementMode: normalizeOrderManagementMode(parsed.managementMode),
        orderId: parsed.orderId,
        orderUrl: parsed.orderUrl,
        whatsappUrl: typeof parsed.whatsappUrl === 'string' ? parsed.whatsappUrl : '',
        fulfillment: parsed.fulfillment,
        totalLabel: parsed.totalLabel,
        items: parsed.items,
      });
      setKioskFulfillment(parsed.fulfillment);
      setDeliveryMode(parsed.fulfillment === 'delivery' ? 'delivery' : 'pickup');
    } catch {
      window.sessionStorage.removeItem(storageKey);
    }
  }, [commerceIdentifier]);

  useEffect(() => {
    if (typeof window === 'undefined' || !commerceIdentifier) return;
    const savedTheme = window.localStorage.getItem(`${kioskThemeStoragePrefix}${commerceIdentifier}`);
    if (savedTheme === 'dark' || savedTheme === 'light') {
      setThemeOverride(savedTheme);
    }
  }, [commerceIdentifier]);

  useEffect(() => {
    setSelectedCurrency('');
  }, [commerceIdentifier]);

  useEffect(() => {
    if (!isConfirmOpen) {
      setIsCheckoutFooterExpanded(false);
      setIsOrderReviewOpen(false);
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
        const { productId, selection } = parseCartLineKey(cartKey);
        const product = productById.get(productId);
        const unitPrice = product
          ? menuLinePrice(
              product,
              categoryByProductId.get(productId) ?? null,
              selection,
              productById,
              categoryByProductId,
            )
          : 0;
        // Lines whose option groups changed since they were added (e.g. an
        // option was removed) can no longer be ordered as-is.
        const optionsInvalid =
          product != null && menuLineInvalid(product, selection, productById);
        if (!product || unitPrice <= 0 || quantity <= 0 || optionsInvalid) {
          changed = true;
          continue;
        }
        next[cartKey] = quantity;
      }

      return changed ? next : prev;
    });
  }, [categoryByProductId, productById]);

  useEffect(() => {
    if (cartHydratedRef.current || productById.size === 0) return;
    cartHydratedRef.current = true;

    const applyCartItems = (
      items: Array<{ productId: string; quantity: number; selection?: CartLineSelection }>,
      fulfillment?: KioskFulfillment | null,
    ) => {
      const nextCart: Record<string, number> = {};
      for (const item of items) {
        if (!productById.has(item.productId)) continue;
        const key = buildCartLineKey(item.productId, item.selection ?? {});
        nextCart[key] = (nextCart[key] ?? 0) + item.quantity;
      }
      if (Object.keys(nextCart).length === 0) return false;
      setCart(nextCart);
      if (fulfillment) {
        setKioskFulfillment(fulfillment);
        setDeliveryMode(fulfillment === 'delivery' ? 'delivery' : 'pickup');
        if (typeof window !== 'undefined' && commerceIdentifier) {
          window.sessionStorage.setItem(
            `${kioskFulfillmentStoragePrefix}${commerceIdentifier}`,
            fulfillment,
          );
        }
      }
      return true;
    };

    if (!repeatOrderConsumedRef.current) {
      repeatOrderConsumedRef.current = true;
      const payload = consumeRepeatOrder(commerceIdentifier);
      if (payload && applyCartItems(payload.items, payload.fulfillment ?? null)) {
        setCartCacheReady(true);
        return;
      }
    }

    const cachedCart = readCachedCheckoutCart(commerceIdentifier);
    if (cachedCart) {
      const hasValidItems = cachedCart.items.some((item) => {
        if (!productById.has(item.productId)) return false;
        const product = productById.get(item.productId);
        if (!product) return false;
        const selection = item.selection ?? {};
        if (menuLineInvalid(product, selection, productById)) return false;
        const unitPrice = menuLinePrice(
          product,
          categoryByProductId.get(item.productId) ?? null,
          selection,
          productById,
          categoryByProductId,
        );
        return unitPrice > 0;
      });
      if (hasValidItems) {
        setAbandonedCartPrompt(cachedCart);
      } else {
        clearCachedCheckoutCart(commerceIdentifier);
      }
    }
    setCartCacheReady(true);
  }, [categoryByProductId, commerceIdentifier, productById]);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([cartKey, quantity]) => {
        const { productId, selection } = parseCartLineKey(cartKey);
        const product = productById.get(productId);
        if (!product || quantity <= 0) return null;
        const category = categoryByProductId.get(productId) ?? null;
        const unitPrice = menuLinePrice(product, category, selection, productById, categoryByProductId);
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

  const cartCount = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + cartBadgeQuantity(item.product, item.quantity),
        0,
      ),
    [cartItems],
  );
  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cartItems],
  );

  useEffect(() => {
    if (!commerceIdentifier || !cartCacheReady || abandonedCartPrompt) return;
    if (kioskVoucher) {
      clearCachedCheckoutCart(commerceIdentifier);
      return;
    }
    if (cartItems.length === 0) {
      clearCachedCheckoutCart(commerceIdentifier);
      return;
    }
    writeCachedCheckoutCart(commerceIdentifier, {
      items: cartItems.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        selection: item.selection,
      })),
      fulfillment: kioskFulfillment,
    });
  }, [abandonedCartPrompt, cartCacheReady, cartItems, commerceIdentifier, kioskFulfillment, kioskVoucher]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasActiveCart = cartCount > 0 && !kioskVoucher;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasActiveCart || allowLeaveRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);

    if (hasActiveCart && !leaveGuardArmedRef.current) {
      window.history.pushState({ elmenuxfaCartGuard: true }, '');
      leaveGuardArmedRef.current = true;
    }
    if (!hasActiveCart) {
      leaveGuardArmedRef.current = false;
    }

    const onPopState = () => {
      if (allowLeaveRef.current) {
        allowLeaveRef.current = false;
        leaveGuardArmedRef.current = false;
        return;
      }

      // Prefer closing nested UI layers before asking to abandon the purchase.
      if (isMapPickerOpen) {
        window.history.pushState({ elmenuxfaCartGuard: true }, '');
        leaveGuardArmedRef.current = true;
        setIsMapPickerOpen(false);
        return;
      }
      if (productOptionsSheet.open) {
        window.history.pushState({ elmenuxfaCartGuard: true }, '');
        leaveGuardArmedRef.current = true;
        setProductOptionsSheet({ open: false, productId: null });
        return;
      }
      if (isPreCheckoutUpsellOpen) {
        window.history.pushState({ elmenuxfaCartGuard: true }, '');
        leaveGuardArmedRef.current = true;
        setIsPreCheckoutUpsellOpen(false);
        return;
      }
      if (isConfirmOpen) {
        window.history.pushState({ elmenuxfaCartGuard: true }, '');
        leaveGuardArmedRef.current = true;
        if (checkoutStep > 0) {
          if (checkoutStep === 3 && deliveryMode !== 'delivery') {
            setCheckoutStep(1);
          } else {
            setCheckoutStep((prev) => Math.max(0, prev - 1));
          }
        } else {
          setIsConfirmOpen(false);
        }
        return;
      }

      if (!hasActiveCart) {
        leaveGuardArmedRef.current = false;
        return;
      }

      window.history.pushState({ elmenuxfaCartGuard: true }, '');
      leaveGuardArmedRef.current = true;
      setLeaveConfirmOpen(true);
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [
    cartCount,
    checkoutStep,
    deliveryMode,
    isConfirmOpen,
    isMapPickerOpen,
    isPreCheckoutUpsellOpen,
    kioskVoucher,
    productOptionsSheet.open,
  ]);

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
  const socialLinks = Object.entries(menuData?.comercio.social_links ?? {})
    .map(([network, value]) => ({ network, href: normalizeSocialUrl(value) }))
    .filter((item) => item.href);
  const kioskHomeConfig = parseKioskHomeConfig(menuData?.comercio.inicio_menu);
  const catalogUrlLocked = catalogFromUrl && kioskHomeConfig.catalogo && !isAssistedMode;
  const supportsDelivery = menuData?.comercio.permite_delivery === true;
  const normalizedDeliveryAddress = deliveryAddress.trim();
  const normalizedDeliveryReference = deliveryReference.trim();
  const normalizedDeliveryInstructions = deliveryInstructions.trim();
  const normalizedOrderNotes = orderNotes.trim();
  // Align with home/badge choice; deliveryMode alone can lag while menuData loads.
  const isDeliveryOrder =
    supportsDelivery && (kioskFulfillment === 'delivery' || deliveryMode === 'delivery');
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
  const normalizedClientTable = clientTable.trim();
  const isClientNameValid = normalizedClientName.length >= 3;
  const isClientTableValid = !isAssistedMode || normalizedClientTable.length > 0;
  const isClientWhatsappValid = isAssistedMode
    ? normalizedClientWhatsapp.length === 0 ||
      isValidPhoneNumber(normalizedClientWhatsapp) ||
      normalizePhone(normalizedClientWhatsapp).length >= 10
    : normalizedClientWhatsapp.length > 0 && isValidPhoneNumber(normalizedClientWhatsapp);
  const isClientEmailValid = isAssistedMode || !wantOrderEmail
    ? normalizedClientEmail.length === 0 || emailRegex.test(normalizedClientEmail)
    : normalizedClientEmail.length > 0 && emailRegex.test(normalizedClientEmail);
  const clientEmailForOrder =
    isAssistedMode || wantOrderEmail ? normalizedClientEmail : '';
  const orderSubtotal = cartTotal;
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
      exchangeRateAdjustments: menuData?.checkoutExchange?.exchangeRateAdjustments ?? {},
    }),
    [menuData?.checkoutExchange],
  );
  const deliveryTariffCurrency = normalizeCurrencyCode(
    parseDeliveryConfig(menuData?.comercio.delivery_tarifas).currency || businessBaseCurrency,
  );
  const deliveryQuote = quoteDeliveryFee({
    config: menuData?.comercio.delivery_tarifas,
    isDelivery: isDeliveryOrder,
    subtotal: cartTotal,
    origin: hasBusinessCoords && businessLat != null && businessLng != null
      ? { lat: businessLat, lng: businessLng }
      : null,
    destination: deliveryPoint,
    fallbackFee: toNumberOrNull(menuData?.comercio.costo_envio) ?? 0,
    convertToBase: (amount) =>
      convertAmountBetweenCurrencies(amount, deliveryTariffCurrency, businessBaseCurrency, {
        baseCurrency: businessBaseCurrency,
        checkoutExchange: checkoutExchangeConfig,
        businessExchangeRate,
        businessQuoteCurrency,
        businessExchangeSource,
        businessExchangeMode,
        marketRates: menuData?.marketRates,
      }),
  });
  const deliveryCost = deliveryQuote.fee;
  const orderGrandTotal = orderSubtotal + deliveryCost;
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
  const publicPaymentGroups = useMemo(
    () =>
      paymentMethodsByCurrency
        .filter((group) => group.methods.length > 0)
        .map((group) => ({
          currency: group.currency,
          methods: group.methods.map((method) => {
            const parsed = paymentMethodCopyModel(method);
            return {
              id: method.id,
              label: paymentMethodLabel(method),
              details: paymentMethodDetails(method).join(' · '),
              fields: parsed.fields,
              note: parsed.note,
            };
          }),
        })),
    [paymentMethodsByCurrency],
  );
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
  const selectedCurrencyForLookup = selectedCurrency.trim()
    ? normalizeCurrencyCode(selectedCurrency)
    : businessBaseCurrency;
  const selectedCurrencyGroup =
    paymentMethodsByCurrency.find((group) => group.currency === selectedCurrencyForLookup) ?? null;
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
  const showEngineDeliveryLine = isDeliveryOrder && deliveryQuote.applied;
  const deliveryOutOfZoneAllowed = Boolean(deliveryQuote.outOfZone && !deliveryQuote.blocked);
  const deliveryAreaZonesForMap = useMemo(() => {
    if (!isDeliveryOrder) return [];
    const cfg = parseDeliveryConfig(menuData?.comercio.delivery_tarifas);
    if (cfg.pricingType !== 'area_zones') return [];
    return cfg.areaZones.filter((zone) => zone.polygon.length >= 3);
  }, [isDeliveryOrder, menuData?.comercio.delivery_tarifas]);
  const matchedDeliveryAreaZone = useMemo(() => {
    if (!deliveryPoint || deliveryAreaZonesForMap.length === 0) return null;
    return (
      deliveryAreaZonesForMap.find((zone) =>
        pointInPolygon(deliveryPoint, zone.polygon),
      ) ?? null
    );
  }, [deliveryPoint, deliveryAreaZonesForMap]);
  const mapPickerDeliveryCostLabel =
    isDeliveryOrder && deliveryPoint && !deliveryQuote.blocked && !deliveryOutOfZoneAllowed
      ? deliveryQuote.free
        ? 'Gratis'
        : formatAmountByCurrency(deliveryCostConverted, selectedCurrencyCode)
      : null;
  const deliveryLineLabel = !isDeliveryOrder
    ? null
    : showEngineDeliveryLine
      ? 'Delivery'
      : 'Costo de envio';
  const deliveryLineValue = !isDeliveryOrder
    ? null
    : deliveryOutOfZoneAllowed
      ? 'A acordar'
      : showEngineDeliveryLine && deliveryQuote.free
        ? 'Gratis 🎉'
        : formatAmountByCurrency(deliveryCostConverted, selectedCurrencyCode);
  const deliveryDistanceLabel = (() => {
    const km = deliveryQuote.distanceKm;
    if (!isDeliveryOrder || km == null || !Number.isFinite(km)) return null;
    const rounded = Math.round(km * 10) / 10;
    const text = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1).replace('.', ',');
    return `${text} km`;
  })();
  const deliveryPriceWithDistance = deliveryLineValue
    ? [deliveryLineValue, deliveryDistanceLabel].filter(Boolean).join(' · ')
    : null;
  const deliveryOutOfZoneNotice =
    'Tu ubicación está fuera de las zonas de cobertura. Puedes continuar con el pedido: el costo de envío lo confirmará el negocio y no está incluido en este total.';
  const deliveryEngineNote = showEngineDeliveryLine
    ? [
        deliveryOutOfZoneAllowed ? deliveryOutOfZoneNotice : '',
        deliveryQuote.blockReason ?? '',
        typeof deliveryQuote.snapshot?.custom_message === 'string'
          ? deliveryQuote.snapshot.custom_message
          : '',
      ]
        .filter(Boolean)
        .join(' ')
    : '';
  const cartTotalConverted = convertFromBaseCurrency(
    cartTotal,
    businessBaseCurrency,
    selectedCurrencyCode,
    selectedExchangeRate,
  );

  const abandonedCartPreview = useMemo(() => {
    if (!abandonedCartPrompt) {
      return {
        items: [] as Array<{
          id: string;
          name: string;
          quantity: number;
          imageUrl: string | null;
          lineTotalLabel: string;
        }>,
        itemCount: 0,
        totalLabel: formatAmountByCurrency(0, selectedCurrencyCode),
        fulfillmentLabel: null as string | null,
        savedLabel: null as string | null,
      };
    }

    let totalBase = 0;
    let itemCount = 0;
    const items: Array<{
      id: string;
      name: string;
      quantity: number;
      imageUrl: string | null;
      lineTotalLabel: string;
    }> = [];

    for (const [index, line] of abandonedCartPrompt.items.entries()) {
      const product = productById.get(line.productId);
      if (!product) continue;
      const selection = line.selection ?? {};
      if (menuLineInvalid(product, selection, productById)) continue;
      const category = categoryByProductId.get(line.productId) ?? null;
      const unitPrice = menuLinePrice(product, category, selection, productById, categoryByProductId);
      if (unitPrice <= 0) continue;
      const lineTotal = unitPrice * line.quantity;
      totalBase += lineTotal;
      itemCount += cartBadgeQuantity(product, line.quantity);
      const lineTotalConverted = convertFromBaseCurrency(
        lineTotal,
        businessBaseCurrency,
        selectedCurrencyCode,
        selectedExchangeRate,
      );
      items.push({
        id: `${line.productId}-${index}`,
        name: menuLineLabel(product, selection, category, productById),
        quantity: line.quantity,
        imageUrl: displayProductImage(product.imagen_url) || null,
        lineTotalLabel: formatAmountByCurrency(lineTotalConverted, selectedCurrencyCode),
      });
    }

    const totalConverted = convertFromBaseCurrency(
      totalBase,
      businessBaseCurrency,
      selectedCurrencyCode,
      selectedExchangeRate,
    );

    let savedLabel: string | null = null;
    if (abandonedCartPrompt.savedAt) {
      const savedAtMs = Date.parse(abandonedCartPrompt.savedAt);
      if (Number.isFinite(savedAtMs)) {
        const minutes = Math.max(0, Math.round((Date.now() - savedAtMs) / 60000));
        if (minutes < 1) savedLabel = 'Guardado hace un momento';
        else if (minutes < 60) savedLabel = `Guardado hace ${minutes} min`;
        else if (minutes < 60 * 24) {
          const hours = Math.round(minutes / 60);
          savedLabel = hours === 1 ? 'Guardado hace 1 h' : `Guardado hace ${hours} h`;
        } else {
          const days = Math.round(minutes / (60 * 24));
          savedLabel = days === 1 ? 'Guardado ayer' : `Guardado hace ${days} días`;
        }
      }
    }

    return {
      items,
      itemCount,
      totalLabel: formatAmountByCurrency(totalConverted, selectedCurrencyCode),
      fulfillmentLabel: abandonedCartPrompt.fulfillment
        ? FULFILLMENT_LABEL[abandonedCartPrompt.fulfillment]
        : null,
      savedLabel,
    };
  }, [
    abandonedCartPrompt,
    businessBaseCurrency,
    categoryByProductId,
    productById,
    selectedCurrencyCode,
    selectedExchangeRate,
  ]);

  useEffect(() => {
    if (!abandonedCartPrompt || abandonedCartPreview.itemCount > 0) return;
    clearCachedCheckoutCart(commerceIdentifier);
    setAbandonedCartPrompt(null);
  }, [abandonedCartPreview.itemCount, abandonedCartPrompt, commerceIdentifier]);

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
  const heroImageSrc = safeImageSrc(heroProduct?.imagen_url, comercioLogoUrl, 1200);
  const heroLocation = menuData?.comercio.negocio_virtual
    ? ''
    : [menuData?.comercio.ciudad, menuData?.comercio.direccion]
        .map((item) => (item ?? '').trim())
        .filter(Boolean)
        .join(', ');
  const operatingStateLabels = menuData?.comercio.negocio_virtual
    ? venezuelaOperatingStateLabels(menuData.comercio.estados_operacion)
    : [];
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

  const preCheckoutSuggestionGroups = useMemo(
    () =>
      resolvePreCheckoutSuggestions({
        config: menuData?.preCheckoutUpsell ?? { upselling: false },
        categories: menuData?.categorias ?? [],
        products: menuData?.productos ?? [],
        cart: cartItems.map((item) => ({
          productId: item.product.id,
          categoryId: item.product.categoria_id,
        })),
      }).map((group) => {
        const products = group.products.map((product) => {
          const fullProduct = productById.get(product.id);
          const category = categoryByProductId.get(product.id) ?? null;
          return {
            ...product,
            imagen_url: displayProductImage(product.imagen_url, comercioLogoUrl, 280),
            quantity: getProductCartQuantity(product.id),
            precio: fullProduct ? getProductMinimumPrice(fullProduct) : product.precio,
            hasOptions: fullProduct
              ? productRequiresConfiguration(fullProduct, category)
              : false,
          };
        });
        const categoryProducts = (menuData?.productos ?? [])
          .filter((product) => product.categoria_id === group.categoryId && product.disponible !== false)
          .slice()
          .sort((left, right) => (left.orden ?? Number.MAX_SAFE_INTEGER) - (right.orden ?? Number.MAX_SAFE_INTEGER))
          .flatMap((product) => {
            const category = categoryByProductId.get(product.id) ?? null;
            const precio = getProductMinimumPrice(product);
            if (precio <= 0) return [];
            return [{
              id: product.id,
              nombre: product.nombre,
              precio,
              imagen_url: displayProductImage(product.imagen_url, comercioLogoUrl, 280),
              quantity: getProductCartQuantity(product.id),
              hasOptions: productRequiresConfiguration(product, category),
            }];
          });
        return {
          ...group,
          products,
          categoryProducts,
        };
      }),
    [cart, cartItems, categoryByProductId, comercioLogoUrl, menuData?.categorias, menuData?.preCheckoutUpsell, menuData?.productos, productById],
  );
  const preCheckoutUpsellActive = Boolean(menuData?.preCheckoutUpsell?.activo);

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
          imageUrl:
            displayProductImage(product.imagen_url, comercioLogoUrl, MENU_IMAGE_WIDTH.thumb) || null,
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
          imageUrl:
            displayProductImage(coverProduct?.imagen_url, comercioLogoUrl, MENU_IMAGE_WIDTH.tile) ||
            null,
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
  const clientStepTitle = isAssistedMode ? 'Datos del cliente' : 'Tus datos';
  const checkoutFlowSteps = isDeliveryOrder
    ? [
        { id: 0, title: 'Pedido' },
        { id: 1, title: clientStepTitle },
        { id: 2, title: 'Direccion' },
        { id: 3, title: 'Pago' },
      ]
    : [
        { id: 0, title: 'Pedido' },
        { id: 1, title: clientStepTitle },
        { id: 3, title: 'Pago' },
      ];
  const checkoutFulfillmentOptions: KioskFulfillment[] = [];
  if (!isAssistedMode && !catalogUrlLocked) {
    if (kioskHomeConfig.comerAqui) checkoutFulfillmentOptions.push('dine_in');
    if (kioskHomeConfig.paraLlevar) checkoutFulfillmentOptions.push('takeaway');
    if (kioskHomeConfig.delivery && supportsDelivery) checkoutFulfillmentOptions.push('delivery');
  }
  const selectedMethod = selectedPaymentMethod();
  const selectedPaymentLabel = selectedMethod ? paymentMethodLabel(selectedMethod) : '';
  const isCashPayment = selectedPaymentLabel.toLowerCase().includes('efectivo');
  const isDigitalPayment = Boolean(selectedMethod) && !isCashPayment;
  const hasPaymentProof = !isDigitalPayment || paymentProofFile !== null;
  const paymentWithAmount = isCashPayment
    ? parseCashAmount(cashPaymentInput, selectedCurrencyCode)
    : null;
  const cashTender = cashTenderValidity(paymentWithAmount, orderGrandTotalConverted, selectedCurrencyCode);
  const isCashTenderValid = !isCashPayment || cashTender.valid;
  const changeAmount = isCashPayment && cashTender.valid ? cashTender.change : 0;
  const cashTenderSuggestions = isCashPayment
    ? suggestCashTenders(orderGrandTotalConverted, selectedCurrencyCode)
    : [];
  const hasDeliveryPoint = !isDeliveryOrder || (deliveryPoint !== null && deliveryPointSource === 'user');
  const isDeliveryAddressValid = !isDeliveryOrder || normalizedDeliveryAddress.length >= 6;
  const isDeliveryReferenceValid = !isDeliveryOrder || normalizedDeliveryReference.length >= 3;
  const isDeliveryReady = isDeliveryAddressValid && hasDeliveryPoint && isDeliveryReferenceValid;
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
        const optionSummary = menuLineSummary(product, selection, category, productById, categoryByProductId);
        const soldByWeight = isSoldByWeight(product);
        const weight = getWeightSaleConfig(product);
        return {
          id: cartKey,
          name: menuLineLabel(product, selection, category, productById),
          description: optionSummary || (selection.combinacion ? '' : (product.descripcion ?? '').trim()),
          imageUrl: safeImageSrc(product.imagen_url, comercioLogoUrl, MENU_IMAGE_WIDTH.thumb),
          imageSourceUrl: (product.imagen_url ?? '').trim() || null,
          quantity,
          soldByWeight,
          canIncrease:
            baseUnitPrice > 0 &&
            (!weight || quantity + weight.paso <= weight.maximo + 1e-9),
          unitPrice,
          totalPrice: unitPrice * quantity,
        };
      }),
    [
      businessBaseCurrency,
      cartItems,
      comercioLogoUrl,
      productById,
      selectedCurrencyCode,
      selectedExchangeRate,
    ],
  );
  const checkoutItemsCount = useMemo(
    () =>
      checkoutSummaryItems.reduce(
        (sum, item) => sum + (item.soldByWeight ? 1 : item.quantity),
        0,
      ),
    [checkoutSummaryItems],
  );
  const canGoNextFromStep0 = checkoutSummaryItems.length > 0;
  const canGoNextFromStep1 =
    isClientNameValid &&
    isClientTableValid &&
    isClientWhatsappValid;
  const canGoNextFromStep2 = isDeliveryReady && !deliveryQuote.blocked;
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
        const customCover = (categoria.imagen_url ?? '').trim();
        const firstProductCover =
          categoria.productos.find((product) => {
            const url = (product.imagen_url ?? '').trim();
            return Boolean(url) && url !== (comercioLogoUrl ?? '').trim();
          })?.imagen_url ?? null;
        const coverSource = customCover || firstProductCover;
        return {
          id: categoria.id,
          name: formatCategoryDisplayName(categoria.nombre),
          glyph: resolveCategoryVisual(categoria).glyph,
          coverUrl: resolveCategoryCover(
            categoria.imagen_url,
            categoria.productos,
            comercioLogoUrl,
            MENU_IMAGE_WIDTH.tile,
          ),
          coverSourceUrl: coverSource,
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
      imageSourceUrl: string | null;
      available: boolean;
      optionsSummary: string | null;
    }>> = {};
    for (const categoria of categoriasConProductos) {
      map[categoria.id] = categoria.productos.map((producto) => ({
        id: producto.id,
        name: producto.nombre,
        description: (producto.descripcion ?? '').trim(),
        priceLabel: formatProductPriceLabel(producto, formatUpsellPrice),
        // List tiles ~124 CSS px @2–3x → cold card WebP (360w) for sharpness.
        imageUrl: displayProductImage(producto.imagen_url, comercioLogoUrl, MENU_IMAGE_WIDTH.tile),
        imageSourceUrl: (producto.imagen_url ?? '').trim() || null,
        available: producto.disponible !== false,
        optionsSummary: getProductOptionsSummary(producto),
      }));
    }
    return map;
  }, [categoriasConProductos, comercioLogoUrl, formatUpsellPrice]);

  function selectKioskFulfillment(next: KioskFulfillment) {
    if (scheduleClosed) return;
    // Mesa QR (?catalogo=1) stays catalog-only; do not open WhatsApp checkout paths.
    if (catalogUrlLocked) return;
    // Waiters only serve dine-in at the table.
    const resolved = isAssistedMode ? 'dine_in' : next;
    setKioskFulfillment(resolved);
    setDeliveryMode(resolved === 'delivery' ? 'delivery' : 'pickup');
    setSearchQuery('');
    if (typeof window !== 'undefined' && commerceIdentifier) {
      window.sessionStorage.setItem(`${kioskFulfillmentStoragePrefix}${commerceIdentifier}`, resolved);
    }
  }

  function resetKioskFulfillment() {
    if (isAssistedMode) {
      setKioskFulfillment('dine_in');
      setDeliveryMode('pickup');
      setSearchQuery('');
      return;
    }
    if (catalogUrlLocked) {
      setCatalogMode(true);
      setKioskFulfillment(null);
      setDeliveryMode('pickup');
      setSearchQuery('');
      return;
    }
    setKioskFulfillment(null);
    setDeliveryMode('pickup');
    setSearchQuery('');
    if (typeof window !== 'undefined' && commerceIdentifier) {
      window.sessionStorage.removeItem(`${kioskFulfillmentStoragePrefix}${commerceIdentifier}`);
    }
  }

  useEffect(() => {
    if (!scheduleClosed) return;
    if (isAssistedMode) {
      setKioskFulfillment('dine_in');
      setDeliveryMode('pickup');
      return;
    }
    setKioskFulfillment(null);
    setDeliveryMode('pickup');
    setKioskAddedPrompt(null);
    setIsConfirmOpen(false);
    // Keep product detail open for browse-only viewing while closed.
    if (typeof window !== 'undefined' && commerceIdentifier) {
      window.sessionStorage.removeItem(`${kioskFulfillmentStoragePrefix}${commerceIdentifier}`);
    }
  }, [scheduleClosed, commerceIdentifier, isAssistedMode]);

  function enterCatalogMode() {
    if (!kioskHomeConfig.catalogo) return;
    if (isAssistedMode) return;
    setCatalogMode(true);
    setKioskFulfillment(null);
    setDeliveryMode('pickup');
    setKioskAddedPrompt(null);
    setIsConfirmOpen(false);
    setIsPreCheckoutUpsellOpen(false);
    if (typeof window !== 'undefined' && commerceIdentifier) {
      window.sessionStorage.removeItem(`${kioskFulfillmentStoragePrefix}${commerceIdentifier}`);
    }
  }

  function leaveCatalogMode() {
    // Mesa QR catalog links must not fall back into WhatsApp checkout.
    if (catalogUrlLocked) {
      setIsPreCheckoutUpsellOpen(false);
      setKioskAddedPrompt(null);
      setCatalogMode(true);
      return;
    }
    setCatalogMode(false);
    setIsPreCheckoutUpsellOpen(false);
    setKioskAddedPrompt(null);
  }

  function openCatalogSummary() {
    if (!catalogMode || cartCount <= 0) return;
    setKioskAddedPrompt(null);
    setCatalogReady(null);
    setIsPreCheckoutUpsellOpen(true);
  }

  function finishCatalogOrder() {
    if (!catalogMode || cartCount <= 0) return;
    setCatalogReady({
      items: cartItems.map((item) => ({
        name: menuLineLabel(item.product, item.selection, item.category, productById),
        quantity: item.quantity,
        priceLabel: formatUpsellPrice(item.unitPrice * item.quantity),
      })),
      itemCount: cartCount,
      totalLabel: formatUpsellPrice(cartTotal),
    });
    setIsPreCheckoutUpsellOpen(false);
    setKioskAddedPrompt(null);
  }

  function startNewCatalogOrder() {
    setCatalogReady(null);
    setCart({});
    setIsPreCheckoutUpsellOpen(false);
    setKioskAddedPrompt(null);
    setIsConfirmOpen(false);
  }

  function handleKioskAddProduct(productId: string) {
    // Always allow opening product details (including when closed / browse-only).
    // Ordering is gated by ProductOptionsSheet `canAdd`.
    if (catalogMode && !kioskHomeConfig.catalogo) return;
    setProductOptionsSheet({ open: true, productId });
  }

  const canSubmitStep3 =
    (isAssistedMode && payLater) ||
    (((menuData?.metodosPago.length ?? 0) === 0 ||
      (selectedPaymentMethodId !== null && hasPaymentProof)) &&
      isCashTenderValid);
  const canAdvanceCurrentStep =
    checkoutStep === 0
      ? canGoNextFromStep0
      : checkoutStep === 1
        ? canGoNextFromStep1
        : checkoutStep === 2
          ? canGoNextFromStep2
          : canSubmitStep3;
  const canReadyForReview =
    canGoNextFromStep0 &&
    canGoNextFromStep1 &&
    canGoNextFromStep2 &&
    canSubmitStep3 &&
    !scheduleClosed;
  const canSubmitCheckout = canReadyForReview && isClientEmailValid;
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
                <p className="text-[11px] font-semibold text-slate-500">
                  {checkoutItemsCount} {checkoutItemsCount === 1 ? 'ítem' : 'ítems'}
                </p>
              </div>
              <div className={isDesktop ? 'max-h-[320px] space-y-2 overflow-y-auto pr-1' : 'space-y-2'}>
                {checkoutSummaryItems.map((item) => (
                  <article key={`checkout-summary-${item.id}`} className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      loading="lazy"
                      decoding="async"
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
                          {item.soldByWeight
                            ? formatWeightLabel(item.quantity)
                            : `x${item.quantity}`}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
                        <span>
                          {item.soldByWeight
                            ? `${formatAmountByCurrency(item.unitPrice, selectedCurrencyCode)} / kg`
                            : `${formatAmountByCurrency(item.unitPrice, selectedCurrencyCode)} c/u`}
                        </span>
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
                          <span className="min-w-10 px-2 text-center text-sm font-black text-slate-900">
                            {item.soldByWeight
                              ? formatWeightLabel(item.quantity)
                              : item.quantity}
                          </span>
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
                {isDeliveryOrder && deliveryLineLabel ? (
                  <div className="flex items-center justify-between gap-3">
                    <span>{deliveryLineLabel}</span>
                    <span className="font-semibold">{deliveryPriceWithDistance}</span>
                  </div>
                ) : null}
                {deliveryEngineNote ? (
                  <p className="text-[11px] font-semibold text-slate-500">{deliveryEngineNote}</p>
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
    const cached = readCachedCheckoutCustomer();
    if (!cached) return;

    if (cached.clientName.length >= 3) setClientName(cached.clientName);
    if (cached.clientEmail) setClientEmail(cached.clientEmail);
    setWantOrderEmail(cached.wantOrderEmail);

    if (cached.clientWhatsapp) {
      const parsedPhone = parsePhoneNumber(cached.clientWhatsapp);
      if (parsedPhone?.country) {
        setClientWhatsappCountry(parsedPhone.country as Country);
      }
      setClientWhatsapp(cached.clientWhatsapp);
    }
  }, []);

  useEffect(() => {
    const cached = readDeliveryNotesCache();
    setDeliveryNoteMemory(cached);
    if (cached.reference) setDeliveryReference(cached.reference);
    if (cached.instructions) setDeliveryInstructions(cached.instructions);
  }, []);

  useEffect(() => {
    if (!isMapPickerOpen || isMapCanvasReady || mapPickerError) {
      setMapLoadSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setMapLoadSlow(true), 6000);
    return () => window.clearTimeout(timer);
  }, [isMapPickerOpen, isMapCanvasReady, mapPickerError, mapPickerNonce]);

  useEffect(() => {
    if (!isDigitalPayment) {
      setPaymentProofFile(null);
      setPaymentProofError('');
      setPaymentProofBusy(false);
    }
  }, [isDigitalPayment]);

  async function handlePaymentProofSelected(file: File | null) {
    setPaymentProofError('');
    if (!file) {
      setPaymentProofFile(null);
      return;
    }
    setPaymentProofBusy(true);
    try {
      const prepared = await prepareComprobanteFile(file);
      setPaymentProofFile(prepared);
    } catch (error) {
      setPaymentProofFile(null);
      setPaymentProofError(
        error instanceof Error
          ? error.message
          : 'Ese comprobante no se pudo cargar. Prueba otra foto en JPEG o PNG.',
      );
    } finally {
      setPaymentProofBusy(false);
    }
  }

  useEffect(() => {
    if (paymentMethodsByCurrency.length === 0 && kioskCurrencyOptions.length === 0) {
      return;
    }

    const availableCurrencies = new Set(kioskCurrencyOptions);
    const current = selectedCurrency.trim() ? normalizeCurrencyCode(selectedCurrency) : '';
    if (current && availableCurrencies.has(current)) {
      return;
    }

    const defaultCurrency = availableCurrencies.has(businessBaseCurrency)
      ? businessBaseCurrency
      : kioskCurrencyOptions[0] || businessBaseCurrency;
    setSelectedCurrency(defaultCurrency);
  }, [businessBaseCurrency, commerceIdentifier, kioskCurrencyOptions, paymentMethodsByCurrency.length, selectedCurrency]);

  function selectMenuCurrency(currency: string) {
    const next = normalizeCurrencyCode(currency);
    setSelectedCurrency(next);
  }

  function toggleKioskTheme() {
    const next: MenuThemeMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeOverride(next);
    if (typeof window !== 'undefined' && commerceIdentifier) {
      window.localStorage.setItem(`${kioskThemeStoragePrefix}${commerceIdentifier}`, next);
    }
  }

  useLockBodyScroll(Boolean(
    isInfoOpen ||
      expandedProductImage ||
      isMapPickerOpen ||
      isQuickActionsOpen ||
      Boolean(abandonedCartPrompt) ||
      leaveConfirmOpen,
  ));

  useEffect(() => {
    if (isInfoOpen || isConfirmOpen || expandedProductImage || isMapPickerOpen) {
      setIsQuickActionsOpen(false);
    }
  }, [isInfoOpen, isConfirmOpen, expandedProductImage, isMapPickerOpen]);

  useEffect(() => {
    if (!isPreCheckoutUpsellOpen) {
      preCheckoutHadCartRef.current = false;
      return;
    }
    if (cartCount > 0) {
      preCheckoutHadCartRef.current = true;
      return;
    }
    // Only auto-close after the sheet actually had items — not on the brief
    // frame where we open right after add and React hasn't committed cart yet.
    if (preCheckoutHadCartRef.current) {
      setIsPreCheckoutUpsellOpen(false);
    }
  }, [cartCount, isPreCheckoutUpsellOpen]);

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

  // Keep payment methods collapsed until the customer picks one, so the full
  // list is visible at first glance. Only clear a selection that no longer
  // exists for the active currency.
  useEffect(() => {
    if (!selectedCurrencyGroup || !selectedPaymentMethodId) return;
    const stillAvailable = selectedCurrencyGroup.methods.some(
      (method) => method.id === selectedPaymentMethodId,
    );
    if (!stillAvailable) {
      setSelectedPaymentMethodId(null);
    }
  }, [selectedCurrencyGroup, selectedPaymentMethodId]);

  useEffect(() => {
    setCashPaymentInput('');
  }, [selectedPaymentMethodId, selectedCurrencyCode]);

  useEffect(() => {
    if (!supportsDelivery) {
      setDeliveryMode('pickup');
      return;
    }
    // Keep mode in sync when menu finishes loading after a Delivery home choice.
    setDeliveryMode(kioskFulfillment === 'delivery' ? 'delivery' : 'pickup');
  }, [supportsDelivery, kioskFulfillment]);

  useEffect(() => {
    if (!isMapPickerOpen) return;

    let disposed = false;
    setIsMapCanvasReady(false);
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

    const resolveInitialPoint = async (): Promise<{
      point: DeliveryPoint;
      fromGps: boolean;
    }> => {
      if (deliveryPoint) return { point: deliveryPoint, fromGps: false };
      const browserPoint = await getBrowserCurrentPoint();
      if (browserPoint) return { point: browserPoint, fromGps: true };
      if (hasBusinessCoords && businessLat != null && businessLng != null) {
        return { point: { lat: businessLat, lng: businessLng }, fromGps: false };
      }
      return { point: { lat: 10.4806, lng: -66.9036 }, fromGps: false };
    };

    const attachLeaflet = async (initialPoint: DeliveryPoint, fromGps: boolean) => {
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
        }).setView([initialPoint.lat, initialPoint.lng], fromGps ? 15 : 16);

        const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);
        tiles.on('load', () => {
          if (!disposed) setIsMapCanvasReady(true);
        });

        const coverageBounds: Array<[number, number]> = [];
        if (L.polygon) {
          for (const zone of deliveryAreaZonesForMap) {
            const ring = zone.polygon.map(
              ([lat, lng]) => [lat, lng] as [number, number],
            );
            for (const point of ring) coverageBounds.push(point);
            L.polygon(ring, {
              color: '#059669',
              weight: 1,
              fillColor: '#10B981',
              fillOpacity: 0.18,
            }).addTo(map);
          }
        }
        // Keep GPS/user pin in view; only fit all zones when we don't have a location yet.
        if (!fromGps && coverageBounds.length >= 2 && L.latLngBounds && map.fitBounds) {
          try {
            map.fitBounds(L.latLngBounds(coverageBounds), { padding: [28, 28], maxZoom: 13 });
          } catch {
            // Keep initial view if bounds fail.
          }
        } else {
          map.setView([initialPoint.lat, initialPoint.lng], fromGps ? 15 : 16);
        }

        mapPickerMapRef.current = map;
        mapPickerMarkerRef.current = null;
        setDeliveryPoint(initialPoint);
        if (fromGps) setDeliveryPointSource('user');

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

      const { point: initialPoint, fromGps } = await resolveInitialPoint();
      if (disposed) return;

      if (preferLeafletMapPicker) {
        await attachLeaflet(initialPoint, fromGps);
        return;
      }

      try {
        const google = await loadGoogleMapsApi();
        if (disposed) return;

        if (!google?.maps || !mapPickerContainerRef.current) {
          setMapPickerError('Google Maps no disponible. Usando mapa alternativo.');
          await attachLeaflet(initialPoint, fromGps);
          return;
        }

        setMapPickerProvider('google');

        const map = new google.maps.Map(mapPickerContainerRef.current, {
          center: initialPoint,
          zoom: fromGps ? 15 : 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        });

        const geocoder = new google.maps.Geocoder();
        let skipNextIdle = false;
        let loadingWatchdog: ReturnType<typeof setTimeout> | null = null;

        const clearLoadingSoon = () => {
          if (loadingWatchdog) clearTimeout(loadingWatchdog);
          loadingWatchdog = setTimeout(() => {
            if (!disposed) setIsMapPickerLoading(false);
          }, 2500);
        };

        // Area-zone polygons only (interval circles were reverted — too buggy).
        try {
          const mapsApi = google.maps as typeof google.maps & {
            LatLngBounds: new () => { extend: (point: DeliveryPoint) => void };
            Polygon: new (opts: Record<string, unknown>) => unknown;
          };
          const coverageBounds = new mapsApi.LatLngBounds();
          let drewCoverage = false;
          for (const zone of deliveryAreaZonesForMap) {
            const path = zone.polygon.map(([lat, lng]) => ({ lat, lng }));
            if (path.length < 3) continue;
            new mapsApi.Polygon({
              paths: path,
              strokeColor: '#059669',
              strokeOpacity: 0.9,
              strokeWeight: 1.5,
              fillColor: '#10B981',
              fillOpacity: 0.16,
              map,
              clickable: false,
            });
            for (const point of path) coverageBounds.extend(point);
            drewCoverage = true;
          }
          if (drewCoverage && typeof map.fitBounds === 'function' && !fromGps) {
            // No GPS yet: show all zones. With GPS, stay on the user pin.
            skipNextIdle = true;
            map.fitBounds(coverageBounds, 36);
          } else if (fromGps) {
            skipNextIdle = true;
            map.setCenter(initialPoint);
            map.setZoom(15);
          }
        } catch (coverageError) {
          console.warn('[delivery-map] coverage overlay failed', coverageError);
        }

        try {
          const mapsEvent = (google.maps as { event?: { trigger?: (t: unknown, e: string) => void } }).event;
          mapsEvent?.trigger?.(map, 'resize');
        } catch {
          // ignore
        }

        mapPickerMapRef.current = map;
        mapPickerMarkerRef.current = null;
        mapPickerGeocoderRef.current = geocoder;
        map.addListener('tilesloaded', () => {
          if (!disposed) setIsMapCanvasReady(true);
        });

        const moveToPoint = (point: DeliveryPoint, knownAddress?: string) => {
          skipNextIdle = true;
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
          setIsMapPickerLoading(true);
          clearLoadingSoon();
          let settled = false;
          const finish = (address: string) => {
            if (settled || disposed) return;
            settled = true;
            markResolvedPoint(point);
            setMapPickerAddress(address);
            setIsMapPickerLoading(false);
          };
          try {
            geocoder.geocode({ location: point }, (results: GooglePlaceResult[] | null, status: string) => {
              finish(
                status === 'OK' && results?.[0]?.formatted_address
                  ? results[0].formatted_address
                  : '',
              );
            });
          } catch {
            finish('');
          }
        };

        mapPickerResolveAddressRef.current = (point: DeliveryPoint) => {
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
        });
        map.addListener('idle', () => {
          setIsMapPickerDragging(false);
          if (skipNextIdle) {
            skipNextIdle = false;
            return;
          }
          updateFromCenter();
        });

        if (mapPickerSearchInputRef.current && google.maps.places?.Autocomplete) {
          const autocomplete = new google.maps.places.Autocomplete(mapPickerSearchInputRef.current, {
            fields: ['geometry', 'formatted_address', 'name'],
            componentRestrictions: { country: GOOGLE_MAPS_VE_COUNTRY },
          });
          autocomplete.bindTo('bounds', map);
          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            const geometryLocation = place?.geometry?.location;
            if (!geometryLocation) return;
            const point = { lat: geometryLocation.lat(), lng: geometryLocation.lng() };
            const bestAddress = (place.formatted_address ?? place.name ?? '').trim();
            moveToPoint(point, bestAddress);
          });
          mapPickerAutocompleteRef.current = autocomplete;
        }

        setDeliveryPoint(initialPoint);
        if (fromGps) setDeliveryPointSource('user');
        if (!normalizedDeliveryAddress) {
          mapPickerResolveAddressRef.current(initialPoint);
        } else {
          setMapPickerAddress(normalizedDeliveryAddress);
          setIsMapPickerLoading(false);
        }
      } catch {
        if (disposed) return;
        setMapPickerError('Google Maps no disponible. Usando mapa alternativo.');
        await attachLeaflet(initialPoint, fromGps);
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
    deliveryAreaZonesForMap,
    mapPickerNonce,
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
    if (scheduleClosed && !catalogMode) {
      window.alert('El restaurante está cerrado actualmente');
      return;
    }
    const product = productById.get(productId);
    if (!product) return;

    const category = categoryByProductId.get(productId) ?? null;
    if (menuLineInvalid(product, selection, productById)) return;
    const unitPrice = menuLinePrice(product, category, selection, productById, categoryByProductId);
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
    if (scheduleClosed && !catalogMode) {
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

    const weight = getWeightSaleConfig(product);
    if (weight) {
      setCart((prev) => {
        const current = prev[cartKey] ?? 0;
        const nextQty = normalizeWeightKg(current + weight.paso, weight);
        return { ...prev, [cartKey]: nextQty };
      });
      return;
    }

    if (productRequiresOptionSheet(product, category)) {
      setProductOptionsSheet({ open: true, productId });
      return;
    }

    setCart((prev) => ({
      ...prev,
      [cartKey]: (prev[cartKey] ?? 0) + 1,
    }));
  }

  function decrementProduct(cartKey: string) {
    const { productId } = parseCartLineKey(cartKey);
    const product = productById.get(productId);
    const weight = product ? getWeightSaleConfig(product) : null;

    setCart((prev) => {
      const current = prev[cartKey] ?? 0;
      const removeThreshold = weight ? weight.minimo + 1e-9 : 1;
      if (current <= removeThreshold) {
        if (isConfirmOpen && Object.keys(prev).length === 1) {
          shouldReturnToMenuOnEmptyCartRef.current = true;
        }
        const next = { ...prev };
        delete next[cartKey];
        return next;
      }

      const nextQty = weight
        ? normalizeWeightKg(current - weight.paso, weight)
        : current - 1;

      return {
        ...prev,
        [cartKey]: nextQty,
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
      fee_pending?: true;
      coordinates: DeliveryPoint | null;
    },
  ) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Faltan variables de entorno para guardar tu pedido.');
    }

    const paymentLabel = paymentMethod
      ? paymentMethodLabel(paymentMethod)
      : isAssistedMode && payLater
        ? 'Pagar despues'
        : 'No especificado';
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
            : code === 'MIME type not allowed.'
              ? 'Ese comprobante no se pudo cargar. Usa una foto JPEG o PNG.'
              : 'Ese comprobante no se pudo cargar. Intentalo de nuevo.',
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
    const orderItems = cartItems.map((item) => {
      const byWeight = isSoldByWeight(item.product);
      return {
        product_id: item.product.id,
        nombre: menuLineLabel(item.product, item.selection, item.category, productById),
        cantidad: item.quantity,
        precio: item.unitPrice,
        opciones: item.selection,
        ...(byWeight ? { unidad: 'kg' as const, venta_por_peso: true as const } : {}),
      };
    });

    const assistedOrderNotes = [
      kioskFulfillment ? `Tipo: ${FULFILLMENT_LABEL[kioskFulfillment]}` : '',
      isAssistedMode && normalizedClientTable ? `Mesa: ${normalizedClientTable}` : '',
      isAssistedMode && payLater ? 'Pago: despues' : '',
      normalizedOrderNotes,
    ]
      .filter(Boolean)
      .join('. ');

    const detalles = {
      cliente_nombre: customerName,
      cliente_email: email || null,
      telefono_cliente: customerWhatsapp,
      mesa: isAssistedMode ? normalizedClientTable || null : null,
      order_source: isAssistedMode ? 'assisted_waiter' : null,
      moneda_checkout: normalizeCurrencyCode(paymentMeta.currency),
      tasa_cambio_snapshot: paymentMeta.exchangeRate,
      exchange_rate_source: paymentMeta.exchangeRateSource,
      metodo_pago: paymentMethod
        ? {
            id: paymentMethod.id,
            nombre: paymentLabel,
            datos: paymentMethodDetails(paymentMethod),
          }
        : isAssistedMode && payLater
          ? { nombre: 'Pagar despues', datos: [] as string[] }
          : null,
      referencia_pago: paymentMeta.referenceLast4 || null,
      comprobante_url: paymentProofUrl || null,
      delivery,
      order_notes: assistedOrderNotes,
      pago_con: isCashPayment && isCashTenderValid && paymentWithAmount !== null ? paymentWithAmount : null,
      cambio_de: isCashPayment && isCashTenderValid ? changeAmount : 0,
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
      mesa: isAssistedMode ? normalizedClientTable : undefined,
      assisted: isAssistedMode || undefined,
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
        : isAssistedMode && payLater
          ? { nombre: 'Pagar despues', datos: [] as string[] }
          : null,
      paymentReferenceLast4: paymentMeta.referenceLast4 || null,
      paymentProofUrl: paymentProofUrl || null,
      cashPaymentAmount: isCashPayment && isCashTenderValid && paymentWithAmount !== null ? paymentWithAmount : null,
      cashChangeAmount: isCashPayment && isCashTenderValid ? changeAmount : 0,
      orderNotes: assistedOrderNotes,
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
        (responsePayload?.message ?? responsePayload?.error ?? 'No se pudo guardar el pedido.').toString(),
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
    let smartOrderUrl = `${appBaseUrl}/orders/view/${encodeURIComponent(orderId)}?fallback=${encodeURIComponent(orderUrl)}`;
    try {
      const parsedOrderUrl = new URL(orderUrl);
      const shortCodeMatch = parsedOrderUrl.pathname.match(/^\/o\/([A-Za-z0-9_-]{10})$/);
      if (shortCodeMatch) {
        smartOrderUrl = `${appBaseUrl}/orders/view/${encodeURIComponent(orderId)}?shortCode=${encodeURIComponent(shortCodeMatch[1])}`;
      }
    } catch {
      // Keep the full fallback URL when the tracking URL is not absolute.
    }

    const detailedMessage = responsePayload?.data?.merchantWhatsappText;
    const customizationTotalCheckout = typeof responsePayload?.data?.customizationTotalCheckout === 'number' &&
      Number.isFinite(responsePayload.data.customizationTotalCheckout)
      ? responsePayload.data.customizationTotalCheckout as number : undefined;
    const message = typeof detailedMessage === 'string' && detailedMessage.trim()
      ? detailedMessage
      : buildClientOrderSummary({
          orderId,
          customerName,
          customerWhatsapp,
          deliveryMode: delivery.mode,
          paymentLabel,
          totalLabel: formatAmountByCurrency(customizationTotalCheckout ?? totalConverted, paymentMeta.currency),
          appOrderUrl: smartOrderUrl,
          managementMode: normalizeOrderManagementMode(responsePayload?.data?.managementMode),
        });

    return {
      orderId,
      orderUrl,
      managementMode: normalizeOrderManagementMode(responsePayload?.data?.managementMode),
      customizationTotalCheckout,
      waUrl: whatsappNumber
        ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
        : '',
    };
  }

  function proceedToCheckoutSheet() {
    if (catalogMode || cartCount <= 0) return;
    const comercioKey = String(menuData?.comercio?.slug || menuData?.comercio?.id || '');
    void trackMenuFunnelEvent(comercioKey, 'checkout_started', {}, 'checkout');
    setCheckoutError(null);
    setCheckoutStep(0);
    setIsPreCheckoutUpsellOpen(false);
    setIsConfirmOpen(true);
  }

  function cartLinesForPreCheckoutUpsell(
    extra?: { productId: string; categoryId?: string | null },
  ) {
    const lines = cartItems.map((item) => ({
      productId: item.product.id,
      categoryId: item.product.categoria_id,
    }));
    if (!extra?.productId) return lines;
    if (lines.some((line) => line.productId === extra.productId)) return lines;
    return [
      ...lines,
      { productId: extra.productId, categoryId: extra.categoryId ?? null },
    ];
  }

  function tryOpenPreCheckoutUpsellAfterAdd(productId: string) {
    if (catalogMode || scheduleClosed || kioskVoucher) return false;
    if (!preCheckoutUpsellActive) return false;
    const product = productById.get(productId);
    const shouldShow = shouldShowPreCheckoutUpsell({
      config: menuData?.preCheckoutUpsell ?? { upselling: false },
      categories: menuData?.categorias ?? [],
      products: menuData?.productos ?? [],
      cart: cartLinesForPreCheckoutUpsell({
        productId,
        categoryId: product?.categoria_id,
      }),
    });
    if (!shouldShow) return false;
    setKioskAddedPrompt(null);
    setIsPreCheckoutUpsellOpen(true);
    return true;
  }

  function openCheckoutSheet() {
    if (catalogMode) return;
    if (kioskVoucher) return;
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
    if (!kioskFulfillment) {
      return;
    }
    if (
      shouldShowPreCheckoutUpsell({
        config: menuData?.preCheckoutUpsell ?? { upselling: false },
        categories: menuData?.categorias ?? [],
        products: menuData?.productos ?? [],
        cart: cartLinesForPreCheckoutUpsell(),
      })
    ) {
      setIsPreCheckoutUpsellOpen(true);
      return;
    }
    proceedToCheckoutSheet();
  }

  function openOrderReview() {
    if (scheduleClosed) {
      setCheckoutError(scheduleStatus.caption || 'El restaurante está cerrado actualmente');
      return;
    }
    if (!canReadyForReview) {
      setCheckoutError('Completa el pago para revisar tu pedido.');
      return;
    }
    setCheckoutError(null);
    setIsOrderReviewOpen(true);
  }

  async function confirmOrder() {
    if (catalogMode) return;
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
      orderSubmitLockRef.current ||
      kioskVoucher !== null ||
      !isClientNameValid ||
      !isClientTableValid ||
      !isClientWhatsappValid ||
      !isDeliveryReady ||
      !canSubmitStep3
    ) {
      return;
    }
    if (!isClientEmailValid) {
      setCheckoutError(
        wantOrderEmail
          ? 'Escribe un correo válido para el resumen, o desactiva esa opción.'
          : 'Revisa tus datos para confirmar el pedido.',
      );
      return;
    }

    const outOfZoneInstruction =
      'Delivery fuera de zona de cobertura: el costo de envío queda pendiente de confirmación con el cliente y no está incluido en el total del checkout.';
    const deliveryInstructionsForOrder = isDeliveryOrder
      ? [
          normalizedDeliveryInstructions,
          deliveryOutOfZoneAllowed ? outOfZoneInstruction : '',
        ]
          .filter(Boolean)
          .join('\n\n')
      : '';
    const deliveryPayload = {
      mode: isDeliveryOrder ? 'delivery' : 'pickup',
      address: isDeliveryOrder ? normalizedDeliveryAddress : '',
      reference: isDeliveryOrder ? normalizedDeliveryReference : '',
      instructions: deliveryInstructionsForOrder,
      ...(isDeliveryOrder && deliveryOutOfZoneAllowed ? { fee_pending: true as const } : {}),
      coordinates: isDeliveryOrder ? deliveryPoint : null,
    } satisfies {
      mode: OrderDeliveryMode;
      address: string;
      reference: string;
      instructions: string;
      fee_pending?: true;
      coordinates: DeliveryPoint | null;
    };

    orderSubmitLockRef.current = true;
    setIsSubmittingOrder(true);
    setCheckoutError(null);
    try {
      const persisted = await persistOrderRequired(
        clientEmailForOrder,
        normalizedClientName,
        normalizedClientWhatsapp,
        isAssistedMode && payLater ? null : selectedMethod,
        {
          currency: selectedCurrencyCode,
          exchangeRate: selectedExchangeRate,
          exchangeRateSource: selectedExchangeSource,
          // Referencia opcional: se envía vacía; el comprobante es lo que valida el pago.
          referenceLast4: '',
          proofFile: isAssistedMode && payLater ? null : paymentProofFile,
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
        try {
          if (persisted.waUrl) {
            window.sessionStorage.setItem(`order-wa:${persisted.orderId}`, persisted.waUrl);
          }
          window.sessionStorage.setItem(`order-tracking:${persisted.orderId}`, persisted.orderUrl);
        } catch {
          // The submitted voucher is kept in memory even if browser storage is blocked.
        }
        writeCachedCheckoutCustomer({
          clientName: normalizedClientName,
          clientWhatsapp: normalizedClientWhatsapp,
          clientEmail: normalizedClientEmail,
          wantOrderEmail,
          selectedCurrency: selectedCurrencyCode,
        });
      }

      const voucherItems = cartItems.map((item) => ({
        name: menuLineLabel(item.product, item.selection, item.category, productById),
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
      const voucher: KioskVoucherData = {
        managementMode: persisted.managementMode,
        orderId: persisted.orderId,
        orderUrl: persisted.orderUrl,
        whatsappUrl: persisted.waUrl,
        fulfillment: kioskFulfillment ?? 'takeaway',
        totalLabel: formatAmountByCurrency(persisted.customizationTotalCheckout ?? orderGrandTotalConverted, selectedCurrencyCode),
        items: voucherItems,
      };
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(
            `${kioskVoucherStorageKeyPrefix}${commerceIdentifier}`,
            JSON.stringify(voucher),
          );
        } catch {
          // The in-memory voucher still prevents a duplicate submit until navigation.
        }
      }
      setCart({});
      clearCachedCheckoutCart(commerceIdentifier);
      const comercioKey = String(menuData?.comercio?.slug || menuData?.comercio?.id || '');
      void trackMenuFunnelEvent(comercioKey, 'order_completed', {}, persisted.orderId);
      setClientName('');
      setClientWhatsapp('');
      setClientEmail('');
      setClientTable('');
      setPayLater(false);
      setPaymentProofFile(null);
      setPaymentProofError('');
      setPaymentProofBusy(false);
      if (normalizedDeliveryReference) rememberDeliveryNote('reference', normalizedDeliveryReference);
      if (normalizedDeliveryInstructions) rememberDeliveryNote('instructions', normalizedDeliveryInstructions);
      setDeliveryAddress('');
      setDeliveryReference('');
      setDeliveryInstructions('');
      setDeliveryPoint(null);
      setDeliveryPointSource('none');
      setOrderNotes('');
      setDeliveryMode('pickup');
      setCheckoutStep(0);
      setIsOrderReviewOpen(false);
      setIsConfirmOpen(false);
      setKioskAddedPrompt(null);
      setKioskVoucher(voucher);
      return;
    } catch (persistError) {
      orderSubmitLockRef.current = false;
      const message =
        persistError instanceof Error
          ? persistError.message
          : 'No se pudo guardar tu pedido. Intentalo nuevamente.';
      setCheckoutError(message);
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  function applyRestoredCart(
    items: Array<{ productId: string; quantity: number; selection?: CartLineSelection }>,
    fulfillment?: KioskFulfillment | null,
  ) {
    const nextCart: Record<string, number> = {};
    for (const item of items) {
      if (!productById.has(item.productId)) continue;
      const product = productById.get(item.productId);
      if (!product) continue;
      const selection = item.selection ?? {};
      if (menuLineInvalid(product, selection, productById)) continue;
      const unitPrice = menuLinePrice(
        product,
        categoryByProductId.get(item.productId) ?? null,
        selection,
        productById,
        categoryByProductId,
      );
      if (unitPrice <= 0) continue;
      const key = buildCartLineKey(item.productId, selection);
      nextCart[key] = (nextCart[key] ?? 0) + item.quantity;
    }
    if (Object.keys(nextCart).length === 0) return false;
    setCart(nextCart);
    if (fulfillment) {
      setKioskFulfillment(fulfillment);
      setDeliveryMode(fulfillment === 'delivery' ? 'delivery' : 'pickup');
      if (typeof window !== 'undefined' && commerceIdentifier) {
        window.sessionStorage.setItem(
          `${kioskFulfillmentStoragePrefix}${commerceIdentifier}`,
          fulfillment,
        );
      }
    }
    return true;
  }

  function resumeAbandonedCart() {
    if (scheduleClosed) {
      window.alert(scheduleStatus.caption || 'El restaurante está cerrado actualmente');
      return;
    }
    const pending = abandonedCartPrompt;
    if (!pending) return;
    const restored = applyRestoredCart(pending.items, pending.fulfillment ?? null);
    setAbandonedCartPrompt(null);
    if (!restored) {
      clearCachedCheckoutCart(commerceIdentifier);
      return;
    }
    setCheckoutStep(0);
    setIsConfirmOpen(true);
  }

  function startFreshAfterAbandonedCart() {
    setAbandonedCartPrompt(null);
    setCart({});
    clearCachedCheckoutCart(commerceIdentifier);
    setCheckoutStep(0);
    setIsConfirmOpen(false);
  }

  function cancelLeavePurchase() {
    setLeaveConfirmOpen(false);
  }

  function confirmLeavePurchase() {
    allowLeaveRef.current = true;
    leaveGuardArmedRef.current = false;
    setLeaveConfirmOpen(false);
    setIsConfirmOpen(false);
    if (typeof window === 'undefined') return;
    // Pop the guard entry, then leave the menu page.
    window.history.back();
    window.setTimeout(() => {
      allowLeaveRef.current = true;
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.assign(publicBaseUrl);
      }
    }, 0);
  }

  function goToNextStep() {
    if (scheduleClosed) {
      setCheckoutError(scheduleStatus.caption || 'El restaurante está cerrado actualmente');
      return;
    }
    if (checkoutStep === 0 && !canGoNextFromStep0) {
      setCheckoutError('Agrega al menos un producto para continuar con el pedido.');
      return;
    }
    if (checkoutStep === 1 && !canGoNextFromStep1) {
      setCheckoutError(
        isAssistedMode
          ? 'Completa nombre y mesa para continuar.'
          : 'Completa tu nombre y WhatsApp para continuar.',
      );
      return;
    }
    if (checkoutStep === 2 && !canGoNextFromStep2) {
      if (!hasDeliveryPoint || !isDeliveryAddressValid) {
        setCheckoutError('Marca el punto en el mapa para continuar con delivery.');
      } else if (!isDeliveryReferenceValid) {
        setCheckoutError('Indica el punto de referencia (por ejemplo: al frente de, torre o piso).');
      } else {
        setCheckoutError('Revisa la dirección de entrega para continuar.');
      }
      return;
    }
    if (checkoutStep === 2) {
      if (normalizedDeliveryReference) {
        setDeliveryNoteMemory(rememberDeliveryNote('reference', normalizedDeliveryReference));
      }
      if (normalizedDeliveryInstructions) {
        setDeliveryNoteMemory(rememberDeliveryNote('instructions', normalizedDeliveryInstructions));
      }
    }
    setCheckoutError(null);
    if (checkoutStep === 1 && canGoNextFromStep1) {
      // Cache as soon as "Tus datos" is completed so the next visit is prefilled
      // even if payment is abandoned; last successful order overwrites this later.
      writeCachedCheckoutCustomer({
        clientName: normalizedClientName,
        clientWhatsapp: normalizedClientWhatsapp,
        clientEmail: normalizedClientEmail,
        wantOrderEmail,
        selectedCurrency: selectedCurrencyCode,
      });
    }
    if (checkoutStep === 1 && !isDeliveryOrder) {
      setCheckoutStep(3);
      return;
    }
    setCheckoutStep((prev) => Math.min(3, prev + 1));
  }

  function persistDeliveryNote(field: 'reference' | 'instructions', value: string) {
    setDeliveryNoteMemory(rememberDeliveryNote(field, value));
  }

  function changeCheckoutFulfillment(next: KioskFulfillment) {
    if (next === kioskFulfillment || scheduleClosed || isAssistedMode || catalogUrlLocked) return;
    const leavingDelivery = isDeliveryOrder && next !== 'delivery';
    const enteringDelivery = !isDeliveryOrder && next === 'delivery';
    selectKioskFulfillment(next);
    setCheckoutError(null);
    if (leavingDelivery && checkoutStep === 2) setCheckoutStep(3);
    if (enteringDelivery && checkoutStep === 3) setCheckoutStep(2);
  }

  function retryMapPicker() {
    setMapPickerError('');
    setIsMapCanvasReady(false);
    setMapLoadSlow(false);
    setMapPickerNonce((current) => current + 1);
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
        {supabaseUrl ? (
          <>
            <link rel="preconnect" href={supabaseUrl} crossOrigin="" />
            <link rel="dns-prefetch" href={supabaseUrl} />
          </>
        ) : null}
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
        className={`min-h-[100svh] min-h-[100dvh] ${isOwnerPreview ? 'pt-12' : ''}`}
        data-menu-theme={themeMode}
        style={{
          ...containerStyle,
          background: 'var(--menu-background)',
          color: 'var(--menu-text)',
          colorScheme: themeMode,
          minHeight: '-webkit-fill-available',
        }}
      >
        {isOwnerPreview ? (
          <div className="fixed inset-x-0 top-0 z-[60] border-b border-amber-300/50 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-950 sm:text-sm">
            Vista previa. Este menú aún no está publicado.
          </div>
        ) : null}
        {catalogReady ? (
          <KioskCatalogReady
            businessName={comercioNombre}
            logoUrl={comercioLogoUrl || null}
            initialLetter={comercioInitialLetter}
            items={catalogReady.items}
            itemCount={catalogReady.itemCount}
            totalLabel={catalogReady.totalLabel}
            paymentGroups={publicPaymentGroups}
            selectedPaymentCurrency={selectedCurrencyCode}
            onSelectPaymentCurrency={selectMenuCurrency}
            onNewOrder={startNewCatalogOrder}
          />
        ) : (
        <KioskMenuExperience
          businessName={comercioNombre}
          logoUrl={comercioLogoUrl || null}
          ratingAverage={toNumberOrNull(menuData.comercio.rating_average) ?? 0}
          ratingCount={toNumberOrNull(menuData.comercio.rating_count) ?? 0}
          initialLetter={comercioInitialLetter}
          locationLabel={heroLocation || null}
          operatingStateLabels={operatingStateLabels}
          socialLinks={socialLinks}
          tagline={menuData?.comercio.descripcion?.trim() || null}
          isOpen={!scheduleClosed}
          openCaption={kioskOpenCaption}
          closedCaption={kioskClosedCaption}
          supportsDelivery={supportsDelivery}
          homeConfig={kioskHomeConfig}
          paymentGroups={publicPaymentGroups}
          fulfillment={kioskFulfillment}
          catalogMode={catalogMode}
          catalogOnlySession={catalogUrlLocked}
          assistedMode={isAssistedMode}
          onSelectFulfillment={selectKioskFulfillment}
          onResetFulfillment={resetKioskFulfillment}
          onEnterCatalog={enterCatalogMode}
          onLeaveCatalog={leaveCatalogMode}
          categories={kioskCategories}
          productsByCategory={kioskProductsByCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          cartCount={cartCount}
          cartTotalLabel={formatAmountByCurrency(cartTotalConverted, selectedCurrencyCode)}
          onAddProduct={handleKioskAddProduct}
          payCtaLabel={catalogMode ? 'Ver pedido' : preCheckoutUpsellActive ? 'Siguiente' : 'Ir a pagar'}
          onPay={() => {
            setKioskAddedPrompt(null);
            if (catalogMode) {
              openCatalogSummary();
              return;
            }
            openCheckoutSheet();
          }}
          addedPrompt={scheduleClosed || preCheckoutUpsellActive || catalogMode ? null : kioskAddedPrompt}
          onContinueAdding={() => setKioskAddedPrompt(null)}
          onPayFromPrompt={() => {
            setKioskAddedPrompt(null);
            if (catalogMode) {
              openCatalogSummary();
              return;
            }
            openCheckoutSheet();
          }}
          voucher={kioskVoucher}
          onTrackVoucher={() => {
            if (!kioskVoucher?.orderUrl) return;
            window.location.assign(kioskVoucher.orderUrl);
          }}
          onNewOrder={() => {
            try {
              window.sessionStorage.removeItem(
                `${kioskVoucherStorageKeyPrefix}${commerceIdentifier}`,
              );
            } catch {
              // Continue to a fresh cart even when session storage is unavailable.
            }
            checkoutAttemptRef.current = null;
            orderSubmitLockRef.current = false;
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
        )}

        <PreCheckoutUpsellSheet
          open={isPreCheckoutUpsellOpen}
          cartItems={cartItems.map((item) => ({
            id: item.cartKey,
            name: menuLineLabel(item.product, item.selection, item.category, productById),
            detail: menuLineSummary(item.product, item.selection, item.category, productById, categoryByProductId) || null,
            quantity: item.quantity,
            priceLabel: formatUpsellPrice(item.unitPrice * item.quantity),
            imageUrl: displayProductImage(item.product.imagen_url, comercioLogoUrl, 160),
          }))}
          cartCount={cartCount}
          cartTotalLabel={formatUpsellPrice(cartTotal)}
          groups={preCheckoutSuggestionGroups}
          formatPrice={formatUpsellPrice}
          onIncrement={incrementProduct}
          onDecrement={decrementProductById}
          onRemove={removeProductFromCart}
          onKeepShopping={() => setIsPreCheckoutUpsellOpen(false)}
          onContinue={() => {
            if (catalogMode) {
              setIsPreCheckoutUpsellOpen(false);
              return;
            }
            proceedToCheckoutSheet();
          }}
          onCatalogReady={finishCatalogOrder}
          canConfigure={catalogMode || !scheduleClosed}
          catalogMode={catalogMode}
          paymentGroups={publicPaymentGroups}
          selectedPaymentCurrency={selectedCurrencyCode}
          onSelectPaymentCurrency={selectMenuCurrency}
          resolveConfigurableProduct={(productId) => {
            const product = productById.get(productId);
            if (!product) return null;
            const category = categoryByProductId.get(productId) ?? null;
            return {
              id: product.id,
              nombre: product.nombre,
              descripcion: product.descripcion,
              precio: product.precio,
              opciones_menu: product.opciones_menu,
              imagen_url: displayProductImage(product.imagen_url, comercioLogoUrl, 280),
              category: category
                ? { nombre: category.nombre, opciones_menu: category.opciones_menu }
                : null,
            };
          }}
          onConfirmConfigured={(productId, selection, quantity) => {
            addConfiguredProductToCart(productId, selection, quantity);
          }}
        />

        <AddToCartUpsellSheet
          open={addToCartSheet.open}
          suggestions={addToCartSheet.suggestions}
          formatPrice={formatUpsellPrice}
          onAdd={handleAcceptAddToCartSuggestion}
          onDismiss={handleDismissAddToCartSheet}
        />

        <ProductOptionsSheet
          compatibleProducts={productOptionsSheet.open
            ? (parseProductPersonalization(productById.get(productOptionsSheet.productId ?? '')?.opciones_menu)?.combinacion?.productosCompatibles ?? []).flatMap((id) => {
                const entry = productById.get(id);
                return entry && entry.disponible !== false ? [{ ...entry, category: categoryByProductId.get(id) ?? null }] : [];
              })
            : []}
          open={productOptionsSheet.open && !kioskVoucher}
          canAdd={
            !scheduleClosed &&
            (catalogMode || Boolean(kioskFulfillment)) &&
            productById.get(productOptionsSheet.productId ?? '')?.disponible !== false
          }
          product={
            productOptionsSheet.productId
              ? productById.get(productOptionsSheet.productId) ?? null
              : null
          }
          imageUrl={
            productOptionsSheet.productId
              ? displayProductImage(
                  productById.get(productOptionsSheet.productId)?.imagen_url,
                  comercioLogoUrl,
                  MENU_IMAGE_WIDTH.sheet,
                )
              : null
          }
          imageSourceUrl={
            productOptionsSheet.productId
              ? productById.get(productOptionsSheet.productId)?.imagen_url?.trim() || null
              : null
          }
          imagePreviewUrl={
            productOptionsSheet.productId
              ? displayProductImage(
                  productById.get(productOptionsSheet.productId)?.imagen_url,
                  comercioLogoUrl,
                  MENU_IMAGE_WIDTH.tile,
                )
              : null
          }
          category={
            productOptionsSheet.productId
              ? categoryByProductId.get(productOptionsSheet.productId) ?? null
              : null
          }
          formatPrice={formatUpsellPrice}
          onClose={() => setProductOptionsSheet({ open: false, productId: null })}
          onExpandImage={() => {
            const productId = productOptionsSheet.productId;
            if (!productId) return;
            const product = productById.get(productId);
            if (!product) return;
            const previewSrc = displayProductImage(
              product.imagen_url,
              comercioLogoUrl,
              MENU_IMAGE_WIDTH.sheet,
            );
            const src = displayProductImage(
              product.imagen_url,
              comercioLogoUrl,
              MENU_IMAGE_WIDTH.lightbox,
            );
            if (!src) return;
            setExpandedProductImage({
              src,
              previewSrc,
              alt: product.nombre,
              title: product.nombre,
              description: (product.descripcion ?? '').trim(),
            });
          }}
          onConfirm={(selection, quantity) => {
            if (!productOptionsSheet.productId) return;
            const productId = productOptionsSheet.productId;
            const addedProduct = productById.get(productId);
            addConfiguredProductToCart(productId, selection, quantity);
            setProductOptionsSheet({ open: false, productId: null });
            if (tryOpenPreCheckoutUpsellAfterAdd(productId)) {
              return;
            }
            if (!catalogMode && !scheduleClosed) {
              setKioskAddedPrompt({
                productName: addedProduct?.nombre ?? 'Producto',
              });
            }
          }}
        />

        {expandedProductImage ? (
          <ProductImageLightbox
            src={expandedProductImage.src}
            previewSrc={expandedProductImage.previewSrc}
            alt={expandedProductImage.alt}
            title={expandedProductImage.title}
            description={expandedProductImage.description}
            titleFontStyle={titleFontStyle}
            onClose={() => setExpandedProductImage(null)}
          />
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

              <div data-sheet-scroll className="h-[calc(100%-64px)] overflow-y-auto overscroll-contain px-4 py-4 pb-24 sm:px-6">
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
                        {socialLinks.length > 0 ? (
                          <div className="pt-2">
                            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Redes sociales</p>
                            <div className="flex flex-wrap gap-2">
                              {socialLinks.map(({ network, href }) => {
                                const Icon = network === 'instagram'
                                  ? Instagram
                                  : network === 'facebook'
                                    ? Facebook
                                    : network === 'youtube'
                                      ? Youtube
                                      : Music2;
                                const label = network === 'instagram'
                                  ? 'Instagram'
                                  : network === 'facebook'
                                    ? 'Facebook'
                                    : network === 'youtube'
                                      ? 'YouTube'
                                      : 'TikTok';
                                return (
                                  <a
                                    key={`${network}-${href}`}
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={label}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-[var(--primary-color)] hover:text-[var(--primary-color)]"
                                  >
                                    <Icon className="h-4 w-4" strokeWidth={2.2} />
                                    {label}
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
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
                                    <div className="mt-1 text-xs text-slate-600">
                                      {method.moneda || method.currency ? (
                                        <p>Moneda: {method.moneda ?? method.currency}</p>
                                      ) : null}
                                      {method.tasa_cambio || method.exchange_rate ? (
                                        <p>Tasa de cambio: {method.tasa_cambio ?? method.exchange_rate}</p>
                                      ) : null}
                                      {(() => {
                                        const parsed = paymentMethodCopyModel(method);
                                        return (
                                          <>
                                            <PaymentCopyFields
                                              fields={parsed.fields}
                                              note={parsed.note}
                                              dense
                                              mode={isCashPaymentMethod(method) ? 'info' : 'copy'}
                                            />
                                          </>
                                        );
                                      })()}
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
                      geocoder.geocode(
                        {
                          address: query,
                          componentRestrictions: { country: GOOGLE_MAPS_VE_COUNTRY },
                          region: GOOGLE_MAPS_VE_COUNTRY,
                        },
                        (results: GooglePlaceResult[] | null, status: string) => {
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
                      geocoder.geocode(
                        {
                          address: query,
                          componentRestrictions: { country: GOOGLE_MAPS_VE_COUNTRY },
                          region: GOOGLE_MAPS_VE_COUNTRY,
                        },
                        (results: GooglePlaceResult[] | null, status: string) => {
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
                <div ref={mapPickerContainerRef} className="h-full w-full bg-[#e7e5e4]" />
                {!isMapCanvasReady ? (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#e7e5e4] px-6 text-center">
                    {mapPickerError ? (
                      <p className="max-w-xs text-sm font-bold text-slate-800">{mapPickerError}</p>
                    ) : (
                      <>
                        <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
                        <p className="max-w-xs text-sm font-bold leading-5 text-slate-900">
                          Ten paciencia, esto puede demorar un momento
                        </p>
                      </>
                    )}
                    {mapPickerError || mapLoadSlow ? (
                      <button
                        type="button"
                        onClick={retryMapPicker}
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-white"
                      >
                        Reintentar
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <div className={`pointer-events-none absolute inset-0 z-[5] flex items-center justify-center ${isMapCanvasReady ? '' : 'hidden'}`}>
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
                {isMapCanvasReady && isMapPickerLoading ? (
                  <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full border border-[var(--menu-border)] bg-[var(--menu-surface)] px-3 py-1 text-xs font-semibold text-[var(--menu-text)] shadow-sm">
                    Buscando direccion...
                  </div>
                ) : null}
                {deliveryAreaZonesForMap.length > 0 ? (
                  <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full bg-[color-mix(in_srgb,#10B981_18%,var(--menu-surface))] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[color-mix(in_srgb,#047857_80%,var(--menu-text))] shadow-sm">
                    Zonas de entrega
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 border-t border-[var(--menu-border)] bg-[var(--menu-surface)] px-4 py-3 sm:px-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--menu-text-muted)]">Direccion detectada</p>
                <p className="text-sm font-semibold text-[var(--menu-text)]">
                  {mapPickerAddress || 'Mueve el mapa para colocar el pin en el punto exacto.'}
                </p>
                {mapPickerDeliveryCostLabel ? (
                  <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-800/80">
                      Costo de delivery
                    </p>
                    <p className="mt-0.5 text-lg font-black tracking-tight text-emerald-950">
                      {[mapPickerDeliveryCostLabel, deliveryDistanceLabel].filter(Boolean).join(' · ')}
                    </p>
                    {matchedDeliveryAreaZone?.name ? (
                      <p className="mt-0.5 text-[12px] font-medium text-emerald-900/75">
                        Zona: {matchedDeliveryAreaZone.name}
                      </p>
                    ) : null}
                  </div>
                ) : deliveryOutOfZoneAllowed ? (
                  <div className="rounded-2xl border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-[12px] font-medium leading-snug text-amber-950">
                    {deliveryOutOfZoneNotice}
                  </div>
                ) : deliveryQuote.blocked ? (
                  <div className="rounded-2xl border border-rose-200/80 bg-rose-50 px-3 py-2.5 text-[12px] font-medium leading-snug text-rose-900">
                    {deliveryQuote.blockReason ||
                      'Esta ubicación está fuera de las zonas de entrega. Elige un punto dentro del área sombreada para continuar.'}
                  </div>
                ) : deliveryAreaZonesForMap.length > 0 ? (
                  <p className="text-[12px] font-medium text-[var(--menu-text-muted)]">
                    Las áreas en verde son las zonas donde este negocio hace delivery.
                  </p>
                ) : null}
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
                      if (!navigator.geolocation) {
                        setMapPickerError('Tu navegador no permite usar la ubicación GPS.');
                        return;
                      }
                      setMapPickerError('');
                      setIsMapPickerLoading(true);
                      navigator.geolocation.getCurrentPosition(
                        (position) => {
                          const point = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                          };
                          setDeliveryPoint(point);
                          setDeliveryPointSource('user');
                          const map = mapPickerMapRef.current;
                          if (mapPickerProvider === 'google') {
                            if (map?.panTo) map.panTo(point);
                            if (map?.setZoom) map.setZoom(15);
                          } else if (map?.setView) {
                            map.setView([point.lat, point.lng], 15);
                          }
                          mapPickerResolveAddressRef.current?.(point);
                        },
                        () => {
                          setIsMapPickerLoading(false);
                          setMapPickerError(
                            'No pudimos obtener tu GPS. Activa la ubicación del navegador e inténtalo de nuevo.',
                          );
                        },
                        { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
                      );
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
            fulfillmentOptions={checkoutFulfillmentOptions}
            onFulfillmentChange={changeCheckoutFulfillment}
            steps={checkoutFlowSteps}
            currentStepId={checkoutStep}
            title={
              checkoutStep === 0
                ? isAssistedMode
                  ? 'Pedido en mesa'
                  : 'Tu pedido'
                : checkoutStep === 1
                  ? clientStepTitle
                  : checkoutStep === 2
                    ? 'Direccion'
                    : 'Pago'
            }
            subtitle={
              checkoutStep === 0
                ? isAssistedMode
                  ? 'Revisa el pedido antes de enviarlo a cocina.'
                  : 'Revisa cantidades y confirma cómo quieres tu pedido.'
                : checkoutStep === 1
                  ? isAssistedMode
                    ? 'Nombre, mesa y contacto opcional para el resumen.'
                    : 'Te avisamos por WhatsApp cuando esté listo.'
                  : checkoutStep === 2
                    ? 'Indica dónde enviamos el pedido.'
                    : isAssistedMode
                      ? 'Pagar ahora o dejar el pago para después.'
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
                  ? 'Listo'
                  : checkoutStep === 1 && !isDeliveryOrder
                    ? 'Ir a pagar'
                    : checkoutStep === 2
                      ? 'Ir a pagar'
                      : 'Continuar'
            }
            nextDisabled={
              isSubmittingOrder ||
              scheduleClosed ||
              (checkoutStep === 3 ? !canReadyForReview : !canAdvanceCurrentStep)
            }
            submitting={isSubmittingOrder}
            onClose={() => {
              setIsOrderReviewOpen(false);
              setIsConfirmOpen(false);
            }}
            onBack={
              checkoutStep === 0
                ? () => {
                    setIsOrderReviewOpen(false);
                    setIsConfirmOpen(false);
                  }
                : () => {
                    setIsOrderReviewOpen(false);
                    goToPreviousStep();
                  }
            }
            onNext={checkoutStep === 3 ? openOrderReview : goToNextStep}
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
                                  sourceUrl={item.imageSourceUrl || item.imageUrl}
                                  displayWidth={160}
                                  alt={item.name}
                                  fit="cover"
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

                      {checkoutSummaryItems.length > 0 && cartUpsellSuggestions.length > 0 && !preCheckoutUpsellActive ? (
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
                          {isAssistedMode
                            ? 'Comer aquí'
                            : kioskFulfillment
                              ? FULFILLMENT_LABEL[kioskFulfillment]
                              : 'Pedido en local'}
                          {' · '}
                          {checkoutItemsCount} unid.
                          {isAssistedMode && normalizedClientTable
                            ? ` · Mesa ${normalizedClientTable}`
                            : ''}
                        </p>
                      </div>

                      {isAssistedMode ? (
                        <div className="grid gap-3">
                          <label className="checkout-item-enter block rounded-[22px] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)]">
                            <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                              <User className="h-3.5 w-3.5" strokeWidth={2.4} />
                              Nombre del cliente
                            </span>
                            <input
                              id="client-full-name"
                              name="name"
                              type="text"
                              value={clientName}
                              onChange={(event) => setClientName(event.target.value)}
                              placeholder="Nombre del cliente"
                              autoComplete="name"
                              className="h-12 w-full rounded-2xl border bg-[var(--menu-surface-alt)] px-4 text-sm text-[var(--menu-text)] outline-none placeholder:text-[var(--menu-text-muted)]"
                              style={{
                                borderColor:
                                  isClientNameValid || clientName.trim().length === 0
                                    ? 'var(--menu-border)'
                                    : '#F43F5E',
                              }}
                              required
                            />
                          </label>
                          <label className="checkout-item-enter block rounded-[22px] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)]">
                            <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                              Número de mesa
                            </span>
                            <input
                              id="client-table"
                              name="table"
                              type="text"
                              value={clientTable}
                              onChange={(event) => setClientTable(event.target.value)}
                              placeholder="Ej. 12"
                              className="h-12 w-full rounded-2xl border bg-[var(--menu-surface-alt)] px-4 text-sm text-[var(--menu-text)] outline-none placeholder:text-[var(--menu-text-muted)]"
                              style={{
                                borderColor:
                                  isClientTableValid || clientTable.trim().length === 0
                                    ? 'var(--menu-border)'
                                    : '#F43F5E',
                              }}
                              required
                            />
                          </label>
                          <label className="checkout-item-enter block rounded-[22px] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)]">
                            <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                              <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.4} />
                              WhatsApp o correo (opcional)
                            </span>
                            <input
                              id="client-contact-optional"
                              type="text"
                              inputMode="email"
                              value={clientEmail || clientWhatsapp}
                              onChange={(event) => {
                                const value = event.target.value.trim();
                                if (value.includes('@')) {
                                  setClientEmail(value);
                                  setClientWhatsapp('');
                                } else {
                                  setClientWhatsapp(value);
                                  setClientEmail('');
                                }
                              }}
                              placeholder="Para enviar el resumen del pedido"
                              className="h-12 w-full rounded-2xl border bg-[var(--menu-surface-alt)] px-4 text-sm text-[var(--menu-text)] outline-none placeholder:text-[var(--menu-text-muted)]"
                              style={{ borderColor: 'var(--menu-border)' }}
                            />
                            <p className="mt-2 text-[11px] font-medium text-[var(--menu-text-muted)]">
                              Opcional. Si lo dejas vacío, el pedido igual se registra.
                            </p>
                          </label>
                        </div>
                      ) : (
                      <div className="grid gap-3">
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
                      )}
                    </div>
                  ) : null}

                  {checkoutStep === 2 ? (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => {
                          setIsMapCanvasReady(false);
                          setMapLoadSlow(false);
                          setMapPickerError('');
                          setIsMapPickerOpen(true);
                        }}
                        className="w-full rounded-[22px] p-4 text-left"
                        style={
                          hasDeliveryPoint
                            ? {
                                backgroundColor: 'var(--menu-surface)',
                                boxShadow: 'var(--menu-shadow)',
                              }
                            : {
                                backgroundColor: 'color-mix(in srgb, var(--menu-primary) 12%, var(--menu-surface))',
                                boxShadow: '0 0 0 2px var(--menu-primary)',
                              }
                        }
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
                            style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
                          >
                            <MapPin className="h-6 w-6" strokeWidth={2.4} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-[var(--menu-text-muted)]">
                              {hasDeliveryPoint ? 'Punto en el mapa' : 'Paso necesario'}
                            </span>
                            <span className="mt-1 block text-sm font-bold text-[var(--menu-text)]">
                              {hasDeliveryPoint
                                ? normalizedDeliveryAddress || 'Punto listo'
                                : 'Marca en el mapa dónde te llevamos el pedido'}
                            </span>
                            <span className="mt-1 block text-[12px] font-semibold text-[var(--menu-text-muted)]">
                              {hasDeliveryPoint ? 'Toca para cambiar el punto' : 'Sin este punto no podemos enviar el pedido.'}
                            </span>
                          </span>
                        </div>
                        {deliveryLineLabel ? (
                          <span className="mt-3 inline-flex rounded-full bg-[var(--menu-surface-alt)] px-2.5 py-1 text-[11px] font-black text-[var(--menu-text)]">
                            {deliveryQuote.free
                              ? ['Delivery gratis 🎉', deliveryDistanceLabel].filter(Boolean).join(' · ')
                              : `${deliveryLineLabel} ${deliveryPriceWithDistance}`}
                          </span>
                        ) : null}
                      </button>
                      {deliveryQuote.blocked ? (
                        <p className="text-sm font-semibold text-rose-500">{deliveryQuote.blockReason}</p>
                      ) : deliveryOutOfZoneAllowed ? (
                        <div className="rounded-2xl border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-[12px] font-medium leading-snug text-amber-950">
                          {deliveryOutOfZoneNotice}
                        </div>
                      ) : deliveryEngineNote ? (
                        <p className="text-[12px] font-semibold text-[var(--menu-text-muted)]">{deliveryEngineNote}</p>
                      ) : null}
                      <DeliveryNoteField
                        id="delivery-reference"
                        label="Punto de referencia"
                        value={deliveryReference}
                        placeholder="Al frente de la panadería, torre, piso"
                        suggestions={deliveryNoteSuggestions(deliveryNoteMemory.references, DEFAULT_REFERENCE_SUGGESTIONS)}
                        prefixes={DEFAULT_REFERENCE_SUGGESTIONS}
                        required
                        onChange={setDeliveryReference}
                        onRemember={(value) => persistDeliveryNote('reference', value)}
                      />
                      <DeliveryNoteField
                        id="delivery-instructions"
                        label="Indicaciones"
                        value={deliveryInstructions}
                        placeholder="Tocar timbre, llamar al llegar..."
                        suggestions={deliveryNoteSuggestions(
                          deliveryNoteMemory.instructionsHistory,
                          DEFAULT_INSTRUCTION_SUGGESTIONS,
                        )}
                        multiline
                        onChange={setDeliveryInstructions}
                        onRemember={(value) => persistDeliveryNote('instructions', value)}
                      />
                    </div>
                  ) : null}

                  {checkoutStep === 3 ? (
                    <div className="space-y-3">
                      {isAssistedMode ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setPayLater(false)}
                            className="min-h-11 flex-1 rounded-xl px-3 text-sm font-bold"
                            style={
                              !payLater
                                ? {
                                    backgroundColor: 'var(--menu-primary)',
                                    color: 'var(--menu-on-primary, #fff)',
                                  }
                                : {
                                    backgroundColor: 'var(--menu-surface)',
                                    color: 'var(--menu-text)',
                                    boxShadow: 'var(--menu-shadow)',
                                  }
                            }
                          >
                            Pagar ahora
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPayLater(true);
                              setSelectedPaymentMethodId(null);
                            }}
                            className="min-h-11 flex-1 rounded-xl px-3 text-sm font-bold"
                            style={
                              payLater
                                ? {
                                    backgroundColor: 'var(--menu-primary)',
                                    color: 'var(--menu-on-primary, #fff)',
                                  }
                                : {
                                    backgroundColor: 'var(--menu-surface)',
                                    color: 'var(--menu-text)',
                                    boxShadow: 'var(--menu-shadow)',
                                  }
                            }
                          >
                            Pagar después
                          </button>
                        </div>
                      ) : null}
                      {isAssistedMode && payLater ? (
                        <div className="rounded-[22px] bg-[var(--menu-surface)] p-4 text-sm font-medium text-[var(--menu-text-muted)] shadow-[var(--menu-shadow)]">
                          El pedido se registra sin cobrar ahora. Puedes cobrar en mesa después.
                        </div>
                      ) : null}
                      {(!isAssistedMode || !payLater) && checkoutUpsellSuggestions.length > 0 && !preCheckoutUpsellActive ? (
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

                      {(!isAssistedMode || !payLater) ? (
                      <p className="checkout-item-enter text-[11px] font-black uppercase tracking-[0.16em] text-[var(--menu-text-muted)]">
                        Como vas a pagar
                      </p>
                      ) : null}

                      {(!isAssistedMode || !payLater) && kioskCurrencyOptions.length > 1 ? (
                        <div
                          className="checkout-item-enter rounded-[18px] bg-[var(--menu-surface)] p-3 shadow-[var(--menu-shadow)]"
                          role="group"
                          aria-label="Moneda de pago"
                        >
                          <p className="mb-2 text-xs font-semibold text-[var(--menu-text-muted)]">
                            Moneda de pago
                          </p>
                          <div className="flex gap-2">
                            {kioskCurrencyOptions.map((currency) => {
                              const isSelected = selectedCurrencyCode === currency;
                              return (
                                <button
                                  key={`checkout-currency-${currency}`}
                                  type="button"
                                  aria-pressed={isSelected}
                                  onClick={() => selectMenuCurrency(currency)}
                                  className="min-h-10 flex-1 rounded-xl px-3 text-sm font-bold transition-colors"
                                  style={
                                    isSelected
                                      ? {
                                          backgroundColor: 'var(--menu-primary)',
                                          color: 'var(--menu-on-primary, #fff)',
                                        }
                                      : {
                                          backgroundColor: 'var(--menu-surface-alt)',
                                          color: 'var(--menu-text-muted)',
                                        }
                                  }
                                >
                                  {currency === 'VES' ? 'Bs (VES)' : currency}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {(!isAssistedMode || !payLater) ? (
                      selectedCurrencyGroup?.methods.length ? (
                        <div className="space-y-2">
                          {selectedCurrencyGroup.methods.map((method, index) => {
                            const isSelected = selectedPaymentMethodId === method.id;
                            const parsed = paymentMethodCopyModel(method);
                            const methodIsCash = isCashPaymentMethod(method);
                            return (
                              <div
                                key={method.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedPaymentMethodId(method.id)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setSelectedPaymentMethodId(method.id);
                                  }
                                }}
                                className="checkout-item-enter w-full cursor-pointer rounded-[22px] px-4 py-4 text-left shadow-[var(--menu-shadow)]"
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
                                  <div className="flex min-w-0 items-center gap-2.5">
                                    <span
                                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                                      style={{
                                        backgroundColor: isSelected
                                          ? 'color-mix(in srgb, var(--menu-primary) 18%, var(--menu-surface))'
                                          : 'var(--menu-surface-alt)',
                                        color: isSelected ? 'var(--menu-primary)' : 'var(--menu-text-muted)',
                                      }}
                                    >
                                      <PaymentMethodGlyph method={method} />
                                    </span>
                                    <p className="text-sm font-bold text-[var(--menu-text)]">
                                      {paymentMethodLabel(method)}
                                    </p>
                                  </div>
                                  <span
                                    className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${
                                      isSelected
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-[var(--menu-surface-alt)] text-[var(--menu-text-muted)]'
                                    }`}
                                  >
                                    {isSelected ? '✓' : ''}
                                  </span>
                                </div>
                                {isSelected ? (
                                  <div
                                    className="mt-3 space-y-3"
                                    onClick={(event) => event.stopPropagation()}
                                    onKeyDown={(event) => event.stopPropagation()}
                                  >
                                    <PaymentCopyFields
                                      fields={parsed.fields}
                                      note={parsed.note}
                                      dense
                                      mode={methodIsCash ? 'info' : 'copy'}
                                    />
                                    {methodIsCash ? (
                                      <div
                                        className="overflow-hidden rounded-2xl border"
                                        style={{
                                          borderColor:
                                            cashPaymentInput && !isCashTenderValid
                                              ? '#F43F5E'
                                              : 'var(--menu-border)',
                                          backgroundColor:
                                            'color-mix(in srgb, var(--menu-text) 4%, var(--menu-surface))',
                                        }}
                                      >
                                        <div className="flex items-end justify-between gap-3 px-3.5 pb-1 pt-3">
                                          <div className="min-w-0">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                                              ¿Con cuánto pagas?
                                            </p>
                                            <p className="mt-0.5 text-xs text-[var(--menu-text-muted)]">
                                              Total{' '}
                                              <span className="font-semibold text-[var(--menu-text)]">
                                                {formatAmountByCurrency(
                                                  orderGrandTotalConverted,
                                                  selectedCurrencyCode,
                                                )}
                                              </span>
                                            </p>
                                          </div>
                                          {isCashTenderValid && paymentWithAmount !== null ? (
                                            <p
                                              className="shrink-0 text-xs font-bold"
                                              style={{
                                                color:
                                                  changeAmount > 0
                                                    ? 'color-mix(in srgb, #10B981 78%, var(--menu-text))'
                                                    : 'var(--menu-text)',
                                              }}
                                            >
                                              {changeAmount > 0
                                                ? `Cambio ${formatAmountByCurrency(changeAmount, selectedCurrencyCode)}`
                                                : 'Exacto'}
                                            </p>
                                          ) : null}
                                        </div>

                                        <label className="block px-2.5 pb-2.5 pt-1">
                                          <div
                                            className="flex items-center gap-2 rounded-2xl px-3.5 py-3"
                                            style={{
                                              backgroundColor: 'var(--menu-surface-alt)',
                                              boxShadow:
                                                'inset 0 0 0 1px color-mix(in srgb, var(--menu-text) 10%, transparent)',
                                            }}
                                          >
                                            <span className="text-lg font-black tabular-nums text-[var(--menu-text-muted)]">
                                              {currencyPrefix(selectedCurrencyCode)}
                                            </span>
                                            <input
                                              type="text"
                                              inputMode={
                                                currencyAllowsDecimals(selectedCurrencyCode)
                                                  ? 'decimal'
                                                  : 'numeric'
                                              }
                                              autoComplete="transaction-amount"
                                              enterKeyHint="done"
                                              value={formatCashAmountInputValue(
                                                cashPaymentInput,
                                                selectedCurrencyCode,
                                              )}
                                              onChange={(event) => {
                                                setCashPaymentInput(
                                                  parseCashAmountInput(
                                                    event.target.value,
                                                    selectedCurrencyCode,
                                                  ),
                                                );
                                              }}
                                              onBlur={() => {
                                                const amount = parseCashAmount(
                                                  cashPaymentInput,
                                                  selectedCurrencyCode,
                                                );
                                                if (amount == null || amount <= 0) {
                                                  setCashPaymentInput('');
                                                  return;
                                                }
                                                const makeable = snapCashAmountUp(
                                                  amount,
                                                  selectedCurrencyCode,
                                                );
                                                setCashPaymentInput(
                                                  toCashAmountCanonical(
                                                    makeable,
                                                    selectedCurrencyCode,
                                                  ),
                                                );
                                              }}
                                              placeholder={
                                                cashTenderSuggestions[0] != null
                                                  ? formatCashAmountDisplay(
                                                      cashTenderSuggestions[0],
                                                      selectedCurrencyCode,
                                                    )
                                                  : formatCashAmountDisplay(
                                                      orderGrandTotalConverted,
                                                      selectedCurrencyCode,
                                                    )
                                              }
                                              className="h-8 min-w-0 flex-1 bg-transparent text-[1.65rem] font-black leading-none tabular-nums tracking-tight text-[var(--menu-text)] outline-none placeholder:font-bold placeholder:text-[var(--menu-text-muted)] placeholder:opacity-45"
                                              aria-label="Monto con el que vas a pagar"
                                              aria-required
                                              aria-invalid={
                                                cashPaymentInput ? !isCashTenderValid : undefined
                                              }
                                            />
                                          </div>
                                        </label>

                                        {cashTenderSuggestions.length > 0 ? (
                                          <div className="flex gap-1.5 overflow-x-auto px-2.5 pb-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                            {cashTenderSuggestions.map((amount) => {
                                              const selected =
                                                paymentWithAmount !== null &&
                                                Math.abs(paymentWithAmount - amount) < 0.001;
                                              return (
                                                <button
                                                  key={amount}
                                                  type="button"
                                                  onClick={() =>
                                                    setCashPaymentInput(
                                                      toCashAmountCanonical(
                                                        amount,
                                                        selectedCurrencyCode,
                                                      ),
                                                    )
                                                  }
                                                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold tabular-nums transition"
                                                  style={
                                                    selected
                                                      ? {
                                                          backgroundColor: 'var(--menu-primary)',
                                                          color: 'var(--menu-on-primary)',
                                                        }
                                                      : {
                                                          backgroundColor: 'var(--menu-surface-alt)',
                                                          color: 'var(--menu-text-muted)',
                                                          boxShadow:
                                                            'inset 0 0 0 1px var(--menu-border)',
                                                        }
                                                  }
                                                >
                                                  {formatCashAmountDisplay(
                                                    amount,
                                                    selectedCurrencyCode,
                                                  )}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        ) : null}

                                        {!cashPaymentInput ? null : cashTender.reason === 'bills' ? (
                                          <p className="border-t px-3.5 py-2 text-[11px] font-semibold text-rose-500" style={{ borderColor: 'var(--menu-border)' }}>
                                            Se ajustará al billete posible al salir del campo (
                                            {describeCashBills(selectedCurrencyCode)}).
                                          </p>
                                        ) : !isCashTenderValid ? (
                                          <p className="border-t px-3.5 py-2 text-[11px] font-semibold text-rose-500" style={{ borderColor: 'var(--menu-border)' }}>
                                            Debe ser igual o mayor al total.
                                          </p>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <div className="space-y-2.5">
                                        <div className="flex items-center gap-2 pt-0.5">
                                          <div
                                            className="h-px min-w-0 flex-1"
                                            style={{ backgroundColor: 'var(--menu-border)' }}
                                          />
                                          <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--menu-text-muted)]">
                                            Después de pagar
                                          </p>
                                          <div
                                            className="h-px min-w-0 flex-1"
                                            style={{ backgroundColor: 'var(--menu-border)' }}
                                          />
                                        </div>

                                        <div
                                          className="overflow-hidden rounded-2xl border"
                                          style={{
                                            borderColor: 'var(--menu-border)',
                                            backgroundColor:
                                              'color-mix(in srgb, var(--menu-text) 4%, var(--menu-surface))',
                                          }}
                                        >
                                          <div className="flex items-center gap-3 px-3 py-2.5">
                                            <div className="min-w-0 flex-1">
                                              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                                                Comprobante
                                              </p>
                                              <p className="mt-0.5 truncate text-xs leading-4 text-[var(--menu-text-muted)]">
                                                {paymentProofBusy
                                                  ? 'Preparando…'
                                                  : paymentProofFile
                                                    ? paymentProofFile.name
                                                    : 'Foto del pago'}
                                              </p>
                                              {paymentProofError ? (
                                                <p className="mt-0.5 text-[11px] font-semibold text-[#F43F5E]">
                                                  {paymentProofError}
                                                </p>
                                              ) : null}
                                            </div>
                                            <input
                                              type="file"
                                              accept="image/*"
                                              className="hidden"
                                              id="payment-proof-gallery"
                                              disabled={paymentProofBusy}
                                              onChange={(event) => {
                                                const selected = event.target.files?.[0] ?? null;
                                                void handlePaymentProofSelected(selected);
                                                event.target.value = '';
                                              }}
                                            />
                                            <input
                                              type="file"
                                              accept="image/*"
                                              capture="environment"
                                              className="hidden"
                                              id="payment-proof-camera"
                                              disabled={paymentProofBusy}
                                              onChange={(event) => {
                                                const selected = event.target.files?.[0] ?? null;
                                                void handlePaymentProofSelected(selected);
                                                event.target.value = '';
                                              }}
                                            />
                                            <div className="flex shrink-0 items-center gap-1.5">
                                              {paymentProofFile ? (
                                                <span
                                                  className="grid h-10 w-10 place-items-center rounded-xl"
                                                  style={{
                                                    backgroundColor:
                                                      'color-mix(in srgb, #10B981 18%, var(--menu-surface))',
                                                    color: '#10B981',
                                                  }}
                                                  title="Comprobante listo"
                                                  aria-hidden
                                                >
                                                  <Check className="h-4 w-4" strokeWidth={2.5} />
                                                </span>
                                              ) : null}
                                              <label
                                                htmlFor="payment-proof-gallery"
                                                aria-label="Subir comprobante desde galería"
                                                aria-disabled={paymentProofBusy || undefined}
                                                className={`grid h-10 w-10 cursor-pointer place-items-center rounded-xl border border-dashed text-[var(--menu-text)] ${
                                                  paymentProofBusy
                                                    ? 'pointer-events-none opacity-60'
                                                    : ''
                                                }`}
                                                style={{
                                                  borderColor: 'var(--menu-border)',
                                                  backgroundColor: 'var(--menu-surface-alt)',
                                                }}
                                              >
                                                <ImageIcon className="h-4 w-4" aria-hidden />
                                              </label>
                                              <label
                                                htmlFor="payment-proof-camera"
                                                aria-label="Tomar foto del comprobante"
                                                aria-disabled={paymentProofBusy || undefined}
                                                className={`grid h-10 w-10 cursor-pointer place-items-center rounded-xl border border-dashed text-[var(--menu-text)] ${
                                                  paymentProofBusy
                                                    ? 'pointer-events-none opacity-60'
                                                    : ''
                                                }`}
                                                style={{
                                                  borderColor: 'var(--menu-border)',
                                                  backgroundColor: 'var(--menu-surface-alt)',
                                                }}
                                              >
                                                <Camera className="h-4 w-4" aria-hidden />
                                              </label>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="checkout-item-enter rounded-[22px] bg-[var(--menu-surface)] p-3 text-sm text-[var(--menu-text-muted)] shadow-[var(--menu-shadow)]">
                          Este comercio no tiene metodos de pago configurados.
                        </div>
                      )
                      ) : null}

                      <div className="checkout-item-enter rounded-[22px] bg-[var(--menu-surface)] px-4 py-3 shadow-[var(--menu-shadow)]" style={{ animationDelay: '150ms' }}>
                        <p className="flex items-center justify-between text-sm text-[var(--menu-text-muted)]">
                          <span>Subtotal</span>
                          <span className="font-semibold">{formatAmountByCurrency(orderSubtotalConverted, selectedCurrencyCode)}</span>
                        </p>
                        {isDeliveryOrder && deliveryLineLabel ? (
                          <p className="mt-1 flex items-center justify-between text-sm text-[var(--menu-text-muted)]">
                            <span>{deliveryLineLabel}</span>
                            <span className="font-semibold">{deliveryPriceWithDistance}</span>
                          </p>
                        ) : null}
                        <p className="mt-2 flex items-center justify-between border-t border-[var(--menu-border)] pt-2 text-sm font-semibold text-[var(--menu-text)]">
                          <span>Total en {selectedCurrencyCode}</span>
                          <span style={titleFontStyle}>{formatAmountByCurrency(orderGrandTotalConverted, selectedCurrencyCode)}</span>
                        </p>
                        {isCashPayment && isCashTenderValid && paymentWithAmount !== null ? (
                          <>
                            <p className="mt-1 flex items-center justify-between text-sm text-[var(--menu-text-muted)]">
                              <span>Paga con</span>
                              <span className="font-semibold">{formatAmountByCurrency(paymentWithAmount, selectedCurrencyCode)}</span>
                            </p>
                            <p className="mt-1 flex items-center justify-between text-sm font-bold text-[var(--menu-text)]">
                              <span>Cambio</span>
                              <span>{formatAmountByCurrency(changeAmount, selectedCurrencyCode)}</span>
                            </p>
                          </>
                        ) : null}
                        {selectedCurrencyCode !== businessBaseCurrency ? (
                          <p className="mt-1 text-[11px] font-semibold text-[var(--menu-text-muted)]">
                            Tasa de cambio: {formatTickerRate(selectedExchangeRate)} {selectedCurrencyCode} por 1 {businessBaseCurrency}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
          </KioskCheckout>
        ) : null}

        {isConfirmOpen && isOrderReviewOpen && !kioskVoucher ? (
          <div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-8 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-review-title"
            onClick={() => {
              if (!isSubmittingOrder) setIsOrderReviewOpen(false);
            }}
          >
            <div
              className="flex max-h-[min(92vh,720px)] w-full max-w-[420px] flex-col overflow-hidden rounded-[28px] bg-[var(--menu-surface)] shadow-[0_24px_64px_rgba(15,23,42,0.35)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="shrink-0 border-b px-5 pb-3 pt-4" style={{ borderColor: 'var(--menu-border)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--menu-text-muted)]">
                      Revisa tu pedido
                    </p>
                    <h3
                      id="order-review-title"
                      className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--menu-text)]"
                      style={titleFontStyle}
                    >
                      ¿Todo correcto?
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isSubmittingOrder) setIsOrderReviewOpen(false);
                    }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--menu-surface-alt)] text-[var(--menu-text-muted)]"
                    aria-label="Cerrar revisión"
                    disabled={isSubmittingOrder}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {!isAssistedMode && checkoutFulfillmentOptions.length > 1 ? (
                  <div
                    className="mt-3 grid gap-1 rounded-xl p-1"
                    role="radiogroup"
                    aria-label="Tipo de pedido"
                    style={{
                      gridTemplateColumns: `repeat(${checkoutFulfillmentOptions.length}, minmax(0, 1fr))`,
                      backgroundColor: 'color-mix(in srgb, var(--menu-text) 6%, var(--menu-surface-alt))',
                    }}
                  >
                    {checkoutFulfillmentOptions.map((option) => {
                      const selected = kioskFulfillment === option;
                      return (
                        <button
                          key={`review-fulfillment-${option}`}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={isSubmittingOrder}
                          onClick={() => changeCheckoutFulfillment(option)}
                          className="min-h-8 truncate rounded-lg px-1.5 text-[10px] font-bold leading-none tracking-[-0.01em]"
                          style={
                            selected
                              ? {
                                  backgroundColor: 'var(--menu-primary)',
                                  color: 'var(--menu-on-primary)',
                                }
                              : {
                                  backgroundColor: 'transparent',
                                  color: 'var(--menu-text-muted)',
                                }
                          }
                        >
                          {FULFILLMENT_LABEL[option]}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-xs font-semibold text-[var(--menu-text-muted)]">
                    {isAssistedMode
                      ? `Comer aquí${normalizedClientTable ? ` · Mesa ${normalizedClientTable}` : ''}`
                      : kioskFulfillment
                        ? FULFILLMENT_LABEL[kioskFulfillment]
                        : 'Pedido en local'}
                  </p>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
                <ul className="space-y-2.5">
                  {checkoutSummaryItems.map((item) => (
                    <li
                      key={`review-item-${item.id}`}
                      className="flex items-baseline justify-between gap-3 border-b border-dashed pb-2.5 last:border-b-0 last:pb-0"
                      style={{ borderColor: 'var(--menu-border)' }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--menu-text)]">{item.name}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-[var(--menu-text-muted)]">
                          {item.soldByWeight
                            ? formatWeightLabel(item.quantity)
                            : `×${item.quantity}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--menu-text)]">
                        {formatAmountByCurrency(item.totalPrice, selectedCurrencyCode)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-3 text-[var(--menu-text-muted)]">
                    <span>Subtotal</span>
                    <span className="font-semibold tabular-nums">
                      {formatAmountByCurrency(orderSubtotalConverted, selectedCurrencyCode)}
                    </span>
                  </div>
                  {isDeliveryOrder && deliveryLineLabel ? (
                    <div className="flex items-center justify-between gap-3 text-[var(--menu-text-muted)]">
                      <span>{deliveryLineLabel}</span>
                      <span className="font-semibold tabular-nums">{deliveryPriceWithDistance}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3 border-t pt-2 text-[var(--menu-text)]" style={{ borderColor: 'var(--menu-border)' }}>
                    <span className="font-bold">Total</span>
                    <span className="text-base font-black tabular-nums" style={titleFontStyle}>
                      {formatAmountByCurrency(orderGrandTotalConverted, selectedCurrencyCode)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-1 text-xs font-medium text-[var(--menu-text-muted)]">
                  <p>
                    {normalizedClientName || 'Cliente'}
                    {!isAssistedMode && formattedClientWhatsapp ? ` · ${formattedClientWhatsapp}` : ''}
                  </p>
                  {isDeliveryOrder && normalizedDeliveryAddress ? (
                    <p className="line-clamp-2">{normalizedDeliveryAddress}</p>
                  ) : null}
                  {selectedPaymentLabel ? <p>Pago: {selectedPaymentSummary}</p> : null}
                </div>

                {!isAssistedMode ? (
                  <div
                    className="mt-4 rounded-2xl px-3 py-3"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--menu-text) 4%, var(--menu-surface-alt))',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                          <Mail className="h-3.5 w-3.5" strokeWidth={2.4} />
                          Resumen por correo
                        </p>
                        <p className="mt-1 text-xs leading-4 text-[var(--menu-text-muted)]">
                          Te llega el detalle y podrás dejar tu opinión.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={wantOrderEmail}
                        aria-label="Recibir resumen por correo"
                        disabled={isSubmittingOrder}
                        onClick={() => {
                          const next = !wantOrderEmail;
                          setWantOrderEmail(next);
                          writeCachedCheckoutCustomer({
                            clientName: normalizedClientName,
                            clientWhatsapp: normalizedClientWhatsapp,
                            clientEmail: normalizedClientEmail,
                            wantOrderEmail: next,
                            selectedCurrency: selectedCurrencyCode,
                          });
                        }}
                        className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
                        style={{
                          backgroundColor: wantOrderEmail
                            ? 'var(--menu-primary)'
                            : 'color-mix(in srgb, var(--menu-text) 18%, var(--menu-surface))',
                        }}
                      >
                        <span
                          className="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform"
                          style={{
                            transform: wantOrderEmail ? 'translateX(1.25rem)' : 'translateX(0)',
                          }}
                        />
                      </button>
                    </div>
                    {wantOrderEmail ? (
                      <label className="mt-3 block">
                        <span className="sr-only">Correo electronico</span>
                        <input
                          id="client-email-review"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder="tu@correo.com"
                          value={clientEmail}
                          disabled={isSubmittingOrder}
                          onChange={(event) => setClientEmail(event.target.value)}
                          className="h-11 w-full rounded-xl border bg-[var(--menu-surface)] px-3 text-sm text-[var(--menu-text)] outline-none placeholder:text-[var(--menu-text-muted)]"
                          style={{
                            borderColor:
                              isClientEmailValid || clientEmail.trim().length === 0
                                ? 'var(--menu-border)'
                                : '#F43F5E',
                          }}
                        />
                        {!isClientEmailValid && clientEmail.trim().length > 0 ? (
                          <p className="mt-2 text-[11px] font-semibold text-rose-500">
                            Revisa que el correo esté bien escrito.
                          </p>
                        ) : null}
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {checkoutError ? (
                  <div
                    className="mt-3 rounded-2xl px-3 py-2.5 text-sm font-semibold"
                    style={{
                      backgroundColor: 'color-mix(in srgb, #F43F5E 16%, var(--menu-surface))',
                      color: 'color-mix(in srgb, #E11D48 72%, var(--menu-text))',
                    }}
                  >
                    {checkoutError}
                  </div>
                ) : null}
              </div>

              <div
                className="shrink-0 grid grid-cols-[auto_1fr] gap-2 border-t px-5 py-3"
                style={{ borderColor: 'var(--menu-border)' }}
              >
                <button
                  type="button"
                  onClick={() => setIsOrderReviewOpen(false)}
                  disabled={isSubmittingOrder}
                  className="inline-flex min-h-12 items-center justify-center rounded-[16px] bg-[var(--menu-surface-alt)] px-4 text-sm font-bold text-[var(--menu-text-muted)] disabled:opacity-45"
                >
                  Atras
                </button>
                <button
                  type="button"
                  onClick={() => void confirmOrder()}
                  disabled={isSubmittingOrder || !canSubmitCheckout}
                  className="min-h-12 rounded-[16px] text-sm font-bold disabled:opacity-45"
                  style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
                >
                  {isSubmittingOrder ? 'Guardando pedido...' : 'Confirmar pedido'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <AbandonedCartResumeDialog
          open={Boolean(abandonedCartPrompt) && abandonedCartPreview.itemCount > 0}
          businessName={comercioNombre}
          itemCount={abandonedCartPreview.itemCount}
          totalLabel={abandonedCartPreview.totalLabel}
          fulfillmentLabel={abandonedCartPreview.fulfillmentLabel}
          savedLabel={abandonedCartPreview.savedLabel}
          items={abandonedCartPreview.items}
          titleFontStyle={titleFontStyle}
          resumeBlockedReason={
            scheduleClosed
              ? scheduleStatus.caption || 'El restaurante está cerrado actualmente. No puedes continuar el pedido ahora.'
              : null
          }
          onResume={resumeAbandonedCart}
          onStartFresh={startFreshAfterAbandonedCart}
        />

        {leaveConfirmOpen ? (
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-6 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-purchase-title"
            onClick={cancelLeavePurchase}
          >
            <div
              className="w-full max-w-md rounded-[28px] bg-[var(--menu-surface)] p-5 shadow-[0_24px_64px_rgba(15,23,42,0.35)]"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--menu-text-muted)]">
                Pedido en curso
              </p>
              <h3
                id="leave-purchase-title"
                className="mt-2 text-xl font-black tracking-[-0.03em] text-[var(--menu-text)]"
                style={titleFontStyle}
              >
                ¿Seguro que deseas abandonar la compra?
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--menu-text-muted)]">
                Si sales ahora, guardaremos tu carrito en este teléfono para cuando vuelvas.
              </p>
              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={cancelLeavePurchase}
                  className="min-h-12 rounded-2xl px-4 py-3 text-sm font-black shadow-[0_12px_28px_rgba(15,23,42,0.12)]"
                  style={{
                    backgroundColor: 'var(--primary-color)',
                    color: 'var(--text-on-primary)',
                  }}
                >
                  Seguir comprando
                </button>
                <button
                  type="button"
                  onClick={confirmLeavePurchase}
                  className="min-h-12 rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] px-4 py-3 text-sm font-bold text-[var(--menu-text)]"
                >
                  Sí, abandonar
                </button>
              </div>
            </div>
          </div>
        ) : null}

      </main>
    </>
  );
}
