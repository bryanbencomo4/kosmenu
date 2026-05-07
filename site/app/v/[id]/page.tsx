'use client';

import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';
import { ArrowRight, ArrowUp, ChevronDown, Flame, Info, Mail, MapPin, Menu, MessageCircle, Phone, Share2, ShoppingCart, Store, Truck, User, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PhoneInput, { isValidPhoneNumber, parsePhoneNumber } from 'react-phone-number-input';
import type { Country } from 'react-phone-number-input';

type CategoriaRow = {
  id: string;
  nombre: string;
  orden?: number | null;
  icono?: string | null;
};

type ProductoRow = {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion?: string | null;
  precio?: number | null;
  imagen_url?: string | null;
  disponible?: boolean | null;
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
  marketRates?: MarketRatesRow | null;
};

type MarketRatesRow = {
  bcv_rate?: number | string | null;
  p2p_binance_rate?: number | string | null;
  payload?: {
    google_rates?: Record<string, number | string | null> | null;
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
const selectedCurrencyStorageKeyPrefix = 'elmenuxfa:selected-currency:';
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

function normalizeHexColor(value: string | null | undefined, fallback: string) {
  const raw = (value ?? '').trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(raw)) {
    return fallback;
  }
  return raw;
}

function borderRadiusByStyle(style: string | null | undefined) {
  if (style === 'pill') return '999px';
  if (style === 'sharp') return '2px';
  return '14px';
}

function normalizeLayoutType(value: string | null | undefined): 'list' | 'grid' | 'compact' {
  if (value === 'grid' || value === 'compact') return value;
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
  const details: string[] = [];
  if (method.banco) details.push(`Banco: ${method.banco}`);
  if (method.titular) details.push(`Titular: ${method.titular}`);
  if (method.cedula) details.push(`Cedula: ${method.cedula}`);
  if (method.telefono) details.push(`Telefono: ${method.telefono}`);
  if (method.numero) details.push(`Numero: ${method.numero}`);
  if (method.alias) details.push(`Alias: ${method.alias}`);
  if (method.descripcion) details.push(method.descripcion);
  if (method.detalles) details.push(method.detalles);
  return details;
}

function paymentMethodCurrency(method: MetodoPagoRow) {
  const explicit = (method.moneda ?? method.currency ?? method.moneda_codigo ?? '')
    .toString()
    .trim();
  if (explicit.length > 0) {
    return explicit.toUpperCase();
  }

  const tipo = (method.tipo ?? '').toString().trim().toLowerCase();
  if (tipo.includes('__')) {
    const parts = tipo.split('__').map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      if (/^[a-z]{3}$/.test(part)) {
        return part.toUpperCase();
      }
    }
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

  if (base === 'COP' && quote === 'USD' && usdCop > 0) return 1 / usdCop;
  if (base === 'EUR' && quote === 'USD' && usdEur > 0) return 1 / usdEur;
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

  if ((source === 'bcv' || source === 'p2p_binance') && isTrackedVesPair(base, quote)) {
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

function exchangeSourceLabel(source: string | null | undefined) {
  switch ((source ?? '').trim().toLowerCase()) {
    case 'bcv':
      return 'BCV';
    case 'p2p_binance':
      return 'Binance P2P';
    case 'google':
      return 'Google Finance';
    case 'manual':
      return 'Manual';
    default:
      return 'Referencia del negocio';
  }
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

type RubroPreset = {
  id: string;
  heroKicker: string;
  vibeLine: string;
  defaultPrimary: string;
  defaultSecondary: string;
  defaultBackground: string;
  defaultCard: string;
  defaultOnPrimary: string;
  defaultLayout: 'list' | 'grid' | 'compact';
  defaultItemsPerRow: number;
  titleFallbackFont: string;
  bodyFallbackFont: string;
};

const DEFAULT_PRESET: RubroPreset = {
  id: 'general',
  heroKicker: 'Menu publico',
  vibeLine: 'Experiencia digital premium para ordenar en segundos.',
  defaultPrimary: '#0EA5E9',
  defaultSecondary: '#0369A1',
  defaultBackground: '#F4F8FC',
  defaultCard: '#FFFFFF',
  defaultOnPrimary: '#FFFFFF',
  defaultLayout: 'list',
  defaultItemsPerRow: 2,
  titleFallbackFont: 'Montserrat, sans-serif',
  bodyFallbackFont: 'Roboto, sans-serif',
};

const RUBRO_PRESETS: Array<{ keywords: string[]; preset: RubroPreset }> = [
  {
    keywords: ['cafe', 'cafeteria', 'coffee', 'espresso', 'brunch'],
    preset: {
      id: 'cafeteria',
      heroKicker: 'Cafe de especialidad',
      vibeLine: 'Cafe, brunch y reposteria en una carta elegante.',
      defaultPrimary: '#7C3F10',
      defaultSecondary: '#B45309',
      defaultBackground: '#FBF7F1',
      defaultCard: '#FFFCF7',
      defaultOnPrimary: '#FFFFFF',
      defaultLayout: 'grid',
      defaultItemsPerRow: 2,
      titleFallbackFont: 'Playfair Display, serif',
      bodyFallbackFont: 'Source Sans 3, sans-serif',
    },
  },
  {
    keywords: ['sushi', 'ramen', 'japones', 'nikkei', 'asiatico'],
    preset: {
      id: 'japones',
      heroKicker: 'Cocina japonesa',
      vibeLine: 'Presentacion limpia, cortes precisos y sabor intenso.',
      defaultPrimary: '#B91C1C',
      defaultSecondary: '#0F172A',
      defaultBackground: '#F8FAFC',
      defaultCard: '#FFFFFF',
      defaultOnPrimary: '#FFFFFF',
      defaultLayout: 'grid',
      defaultItemsPerRow: 3,
      titleFallbackFont: 'Poppins, sans-serif',
      bodyFallbackFont: 'Inter, sans-serif',
    },
  },
  {
    keywords: ['parrilla', 'bbq', 'steak', 'carne', 'asado', 'burger'],
    preset: {
      id: 'parrilla',
      heroKicker: 'Parrilla y fuego',
      vibeLine: 'Carnes, ahumados y smash classics con caracter.',
      defaultPrimary: '#DC2626',
      defaultSecondary: '#7F1D1D',
      defaultBackground: '#FFF7F6',
      defaultCard: '#FFFFFF',
      defaultOnPrimary: '#FFFFFF',
      defaultLayout: 'list',
      defaultItemsPerRow: 2,
      titleFallbackFont: 'Bebas Neue, sans-serif',
      bodyFallbackFont: 'Work Sans, sans-serif',
    },
  },
  {
    keywords: ['bar', 'coctel', 'cocktail', 'mixologia', 'cerveza', 'tragos'],
    preset: {
      id: 'bar',
      heroKicker: 'Bar y mixologia',
      vibeLine: 'Una carta nocturna para drinks y tapas con estilo.',
      defaultPrimary: '#0F172A',
      defaultSecondary: '#1D4ED8',
      defaultBackground: '#EEF2FF',
      defaultCard: '#FFFFFF',
      defaultOnPrimary: '#FFFFFF',
      defaultLayout: 'compact',
      defaultItemsPerRow: 1,
      titleFallbackFont: 'Space Grotesk, sans-serif',
      bodyFallbackFont: 'DM Sans, sans-serif',
    },
  },
  {
    keywords: ['pasteleria', 'postres', 'bakery', 'panaderia', 'dessert'],
    preset: {
      id: 'bakery',
      heroKicker: 'Panaderia y postres',
      vibeLine: 'Texturas suaves, dulces finos y hornadas del dia.',
      defaultPrimary: '#DB2777',
      defaultSecondary: '#BE185D',
      defaultBackground: '#FFF1F7',
      defaultCard: '#FFFFFF',
      defaultOnPrimary: '#FFFFFF',
      defaultLayout: 'grid',
      defaultItemsPerRow: 2,
      titleFallbackFont: 'Fraunces, serif',
      bodyFallbackFont: 'Manrope, sans-serif',
    },
  },
  {
    keywords: ['vegano', 'vegetariano', 'saludable', 'organic', 'fit'],
    preset: {
      id: 'verde',
      heroKicker: 'Cocina saludable',
      vibeLine: 'Ingredientes frescos, balance real y energia limpia.',
      defaultPrimary: '#15803D',
      defaultSecondary: '#166534',
      defaultBackground: '#F3FAF5',
      defaultCard: '#FFFFFF',
      defaultOnPrimary: '#FFFFFF',
      defaultLayout: 'grid',
      defaultItemsPerRow: 3,
      titleFallbackFont: 'Nunito, sans-serif',
      bodyFallbackFont: 'Nunito Sans, sans-serif',
    },
  },
];

function normalizeTag(value: string | null | undefined) {
  return (value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function detectRubroPreset(moodTags: string[] | null | undefined, searchableText: string) {
  const normalizedText = normalizeTag(searchableText);
  const normalizedTags = (moodTags ?? []).map((tag) => normalizeTag(tag));

  for (const entry of RUBRO_PRESETS) {
    const matched = entry.keywords.some(
      (keyword) => normalizedText.includes(keyword) || normalizedTags.some((tag) => tag.includes(keyword)),
    );
    if (matched) return entry.preset;
  }

  return DEFAULT_PRESET;
}

function pageBackgroundByPreset(presetId: string) {
  if (presetId === 'japones') {
    return 'radial-gradient(circle at 12% 18%, color-mix(in srgb, var(--primary-color) 16%, white) 0%, transparent 31%), linear-gradient(180deg, color-mix(in srgb, var(--secondary-color) 9%, transparent) 0%, transparent 40%), var(--bg-color)';
  }
  if (presetId === 'parrilla') {
    return 'radial-gradient(circle at 10% 0%, color-mix(in srgb, var(--primary-color) 22%, white) 0%, transparent 35%), radial-gradient(circle at 90% 0%, color-mix(in srgb, var(--secondary-color) 15%, white) 0%, transparent 25%), var(--bg-color)';
  }
  if (presetId === 'bar') {
    return 'radial-gradient(circle at 80% 0%, color-mix(in srgb, var(--secondary-color) 26%, white) 0%, transparent 32%), linear-gradient(145deg, color-mix(in srgb, var(--primary-color) 12%, white) 0%, transparent 35%), var(--bg-color)';
  }
  return 'radial-gradient(circle at 12% 18%, color-mix(in srgb, var(--primary-color) 23%, white) 0%, transparent 32%), radial-gradient(circle at 88% 0%, color-mix(in srgb, var(--secondary-color) 18%, white) 0%, transparent 30%), var(--bg-color)';
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

export default function PublicMenuPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const commerceIdentifier = (params?.id ?? '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDraftMode, setIsDraftMode] = useState(false);
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
  const [selectedCurrency, setSelectedCurrency] = useState<string>('');
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
    if (!isConfirmOpen) {
      setIsCheckoutFooterExpanded(false);
    }
  }, [isConfirmOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
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

      try {
        setLoading(true);
        setError(null);

        const encodedIdentifier = encodeURIComponent(commerceIdentifier);
        const response = await fetch(`/api/menu/${encodedIdentifier}`, {
          method: 'GET',
          cache: 'no-store',
        });

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          data?: MenuData;
        };

        if (!response.ok) {
          if (response.status === 403) {
            const code = (payload.code ?? '').trim();
            if (code === 'MENU_DRAFT_MODE' || code === 'OWNER_EMAIL_NOT_VERIFIED') {
              if (!cancelled) {
                setIsDraftMode(true);
                setMenuData(null);
              }
              return;
            }
          }
          throw new Error(payload.error ?? 'No se pudo cargar el menu.');
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
        }

        if (!cancelled) {
          setIsDraftMode(false);
          setMenuData(data);
          setCachedSplashName(nextCommerceName);
          setCachedSplashLogoUrl(nextLogoUrl);
          if (nextLogoUrl) {
            await preloadImageAsset(nextLogoUrl, 1200);
          }
          await new Promise((resolve) => window.setTimeout(resolve, 260));
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Error cargando menu.';
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMenu();

    return () => {
      cancelled = true;
    };
  }, [commerceIdentifier]);

  const categoriasConProductos = useMemo(() => {
    if (!menuData) return [];

    return menuData.categorias
      .map((categoria) => ({
        ...categoria,
        productos: menuData.productos.filter((producto) => producto.categoria_id === categoria.id),
      }))
      .filter((categoria) => categoria.productos.length > 0);
  }, [menuData]);

  const productById = useMemo(() => {
    const map = new Map<string, ProductoRow>();
    for (const product of menuData?.productos ?? []) {
      map.set(product.id, product);
    }
    return map;
  }, [menuData]);

  useEffect(() => {
    setCart((prev) => {
      let changed = false;
      const next: Record<string, number> = {};

      for (const [productId, quantity] of Object.entries(prev)) {
        const product = productById.get(productId);
        if (!product || (product.precio ?? 0) <= 0 || quantity <= 0) {
          changed = true;
          continue;
        }
        next[productId] = quantity;
      }

      return changed ? next : prev;
    });
  }, [productById]);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([productId, quantity]) => {
        const product = productById.get(productId);
        if (!product || quantity <= 0) return null;
        return { product, quantity };
      })
      .filter(Boolean) as Array<{ product: ProductoRow; quantity: number }>;
  }, [cart, productById]);

  const cartCount = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity, 0), [cartItems]);
  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + (item.product.precio ?? 0) * item.quantity, 0),
    [cartItems],
  );

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

    const getActiveCategoryByViewport = () => {
      let selectedId = filteredCategorias[0].id;
      let minDistance = Number.POSITIVE_INFINITY;
      const stickyOffset = getCategoryScrollOffset(stickySearchCardRef.current);

      for (const categoria of filteredCategorias) {
        const section = document.getElementById(`categoria-${categoria.id}`);
        if (!section) continue;
        const distance = Math.abs(section.getBoundingClientRect().top - stickyOffset);
        if (distance < minDistance) {
          minDistance = distance;
          selectedId = categoria.id;
        }
      }

      setActiveCategoryId(selectedId);
    };

    getActiveCategoryByViewport();
    window.addEventListener('scroll', getActiveCategoryByViewport, { passive: true });
    window.addEventListener('resize', getActiveCategoryByViewport);

    return () => {
      window.removeEventListener('scroll', getActiveCategoryByViewport);
      window.removeEventListener('resize', getActiveCategoryByViewport);
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
  const resolvedSlug = (menuData?.comercio.slug ?? commerceIdentifier).trim();
  const branding = menuData?.comercio.branding_ia ?? null;
  const rubroPreset = useMemo(
    () =>
      detectRubroPreset(
        branding?.mood_tags,
        [comercioNombre, branding?.descripcion_visual, menuData?.comercio.descripcion].filter(Boolean).join(' '),
      ),
    [branding?.mood_tags, branding?.descripcion_visual, comercioNombre, menuData?.comercio.descripcion],
  );

  const primaryColor = normalizeHexColor(branding?.color_principal, rubroPreset.defaultPrimary);
  const secondaryColor = normalizeHexColor(branding?.color_secundario, rubroPreset.defaultSecondary);
  const backgroundColor = normalizeHexColor(branding?.colores_personalizados?.background, rubroPreset.defaultBackground);
  const cardSurfaceColor = normalizeHexColor(branding?.colores_personalizados?.card_surface, rubroPreset.defaultCard);
  const textOnPrimaryColor = normalizeHexColor(branding?.colores_personalizados?.text_on_primary, rubroPreset.defaultOnPrimary);
  const layoutType = normalizeLayoutType(branding?.layout_type ?? rubroPreset.defaultLayout);
  const itemsPerRow = clampItemsPerRow(
    branding?.config_visual?.items_per_row ?? rubroPreset.defaultItemsPerRow,
    layoutType,
  );
  const showImages = branding?.config_visual?.show_images ?? layoutType !== 'compact';
  const borderRadius = borderRadiusByStyle(branding?.estilo_botones);

  const googleFontsUrl = useMemo(() => getGoogleFontsUrl(branding), [branding]);

  const containerStyle = useMemo(
    () =>
      ({
        '--primary-color': primaryColor,
        '--secondary-color': secondaryColor,
        '--bg-color': backgroundColor,
        '--card-surface': cardSurfaceColor,
        '--text-on-primary': textOnPrimaryColor,
        '--border-radius': borderRadius,
        '--font-title': fontFamilyCssValue(
          normalizeFontName(branding?.fuente_titulos),
          rubroPreset.titleFallbackFont,
        ),
        '--font-body': fontFamilyCssValue(
          normalizeFontName(branding?.fuente_cuerpo),
          rubroPreset.bodyFallbackFont,
        ),
        fontFamily: 'var(--font-body)',
      }) as React.CSSProperties,
    [
      primaryColor,
      secondaryColor,
      backgroundColor,
      cardSurfaceColor,
      textOnPrimaryColor,
      borderRadius,
      rubroPreset.titleFallbackFont,
      rubroPreset.bodyFallbackFont,
      branding?.fuente_titulos,
      branding?.fuente_cuerpo,
    ],
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
  const businessExchangeRate =
    parseExchangeRate(menuData?.comercio.exchange_rate_value) ?? parseExchangeRate(menuData?.comercio.tasa_cambio_pesos);
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
      exchangeRate:
        value.exchangeRate ??
        derivedExchangeRateForCurrency(
          businessBaseCurrency,
          currency,
          businessExchangeSource,
          menuData?.marketRates,
          businessExchangeRate,
          businessQuoteCurrency,
        ),
    }))
      .sort((left, right) => {
        if (left.currency === businessBaseCurrency) return -1;
        if (right.currency === businessBaseCurrency) return 1;
        return left.currency.localeCompare(right.currency);
      });
  }, [
    businessBaseCurrency,
    businessExchangeRate,
    businessExchangeSource,
    businessQuoteCurrency,
    menuData?.marketRates,
    menuData?.metodosPago,
  ]);
  const selectedCurrencyGroup =
    paymentMethodsByCurrency.find((group) => group.currency === normalizeCurrencyCode(selectedCurrency)) ?? null;
  const businessRateEntries = useMemo(
    () =>
      paymentMethodsByCurrency.filter(
        (group) => group.currency !== businessBaseCurrency && Number.isFinite(group.exchangeRate) && group.exchangeRate > 0,
      ),
    [businessBaseCurrency, paymentMethodsByCurrency],
  );
  const tickerRateEntries = useMemo(() => {
    if (businessRateEntries.length === 0) {
      return [
        `Moneda principal: ${businessBaseCurrency}`,
        `Fuente: ${exchangeSourceLabel(businessExchangeSource)}`,
        `Moneda principal: ${businessBaseCurrency}`,
        `Fuente: ${exchangeSourceLabel(businessExchangeSource)}`,
      ];
    }

    const entries = businessRateEntries.map(
      (group) => `1 ${businessBaseCurrency} = ${group.exchangeRate} ${group.currency}`,
    );
    return [...entries, ...entries];
  }, [businessBaseCurrency, businessExchangeSource, businessRateEntries]);
  const selectedCurrencyCode = normalizeCurrencyCode(
    selectedCurrency || selectedCurrencyGroup?.currency || businessBaseCurrency,
  );
  const selectedExchangeRate =
    selectedCurrencyCode === businessBaseCurrency
      ? 1
      : Number.isFinite(selectedCurrencyGroup?.exchangeRate)
        ? Number(selectedCurrencyGroup?.exchangeRate)
        : 1;
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
  const checkoutStepTitles = ['Pedido', 'Cliente', 'Entrega', 'Pago'];
  const selectedMethod = selectedPaymentMethod();
  const selectedPaymentLabel = selectedMethod ? paymentMethodLabel(selectedMethod) : '';
  const isCashPayment = selectedPaymentLabel.toLowerCase().includes('efectivo');
  const isDigitalPayment = Boolean(selectedMethod) && !isCashPayment;
  const paymentReferenceLast4 = normalizePhone(digitalPaymentReference).slice(-4);
  const isPaymentReferenceValid = !isDigitalPayment || /^\d{4}$/.test(paymentReferenceLast4);
  const hasPaymentProof = !isDigitalPayment || paymentProofFile !== null;
  const paymentWithAmount = toNumberOrNull(cashPaymentInput);
  const changeAmount =
    isCashPayment && paymentWithAmount !== null && paymentWithAmount > orderGrandTotalConverted
      ? paymentWithAmount - orderGrandTotalConverted
      : 0;
  const hasDeliveryPoint = !isDeliveryOrder || (deliveryPoint !== null && deliveryPointSource === 'user');
  const isDeliveryAddressValid = !isDeliveryOrder || normalizedDeliveryAddress.length >= 6;
  const isDeliveryReady = isDeliveryAddressValid && hasDeliveryPoint;
  const checkoutStepDescriptions = ['Edita tu pedido', 'Tus datos', 'Entrega', 'Pago'];
  const checkoutProgress = (checkoutStep + 1) / checkoutStepTitles.length;
  const nextStepCtaLabels = ['Continuar', 'Continuar', 'Continuar'];
  const checkoutSummaryItems = useMemo(
    () =>
      cartItems.map(({ product, quantity }) => {
        const unitPrice = convertFromBaseCurrency(
          product.precio ?? 0,
          businessBaseCurrency,
          selectedCurrencyCode,
          selectedExchangeRate,
        );
        return {
          id: product.id,
          name: product.nombre,
          description: (product.descripcion ?? '').trim(),
          imageUrl: safeImageSrc(product.imagen_url, comercioLogoUrl),
          quantity,
          canIncrease: (product.precio ?? 0) > 0,
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
  const canSubmitStep3 =
    (menuData?.metodosPago.length ?? 0) === 0 ||
    (selectedPaymentMethodId !== null && isPaymentReferenceValid && hasPaymentProof);
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
    canSubmitStep3;
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
                            onClick={() => incrementProduct(item.id)}
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
                  Tasa usada: 1 {businessBaseCurrency} = {selectedExchangeRate} {selectedCurrencyCode}
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
      const savedCurrency = (parsed.selectedCurrency ?? '').trim().toUpperCase();

      if (savedName) setClientName(savedName);
      if (savedEmail) setClientEmail(savedEmail);
      if (savedCurrency) setSelectedCurrency(savedCurrency);

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
    if (!isCashPayment) {
      setCashPaymentInput('');
    }
  }, [isCashPayment]);

  useEffect(() => {
    if (!isDigitalPayment) {
      setDigitalPaymentReference('');
      setPaymentProofFile(null);
    }
  }, [isDigitalPayment]);

  useEffect(() => {
    if (paymentMethodsByCurrency.length === 0) {
      setSelectedCurrency('');
      return;
    }

    const availableCurrencies = new Set(paymentMethodsByCurrency.map((group) => group.currency));
    const hasSelected = availableCurrencies.has(selectedCurrency);
    if (!hasSelected) {
      if (typeof window !== 'undefined') {
        const storedCurrency = (window.localStorage.getItem(`${selectedCurrencyStorageKeyPrefix}${resolvedComercioId}`) ?? '')
          .trim()
          .toUpperCase();
        if (storedCurrency && availableCurrencies.has(storedCurrency)) {
          setSelectedCurrency(storedCurrency);
          return;
        }
      }

      setSelectedCurrency(availableCurrencies.has(businessBaseCurrency) ? businessBaseCurrency : paymentMethodsByCurrency[0].currency);
    }
  }, [businessBaseCurrency, paymentMethodsByCurrency, resolvedComercioId, selectedCurrency]);

  useEffect(() => {
    if (typeof window === 'undefined' || !resolvedComercioId || !selectedCurrencyCode) return;
    window.localStorage.setItem(`${selectedCurrencyStorageKeyPrefix}${resolvedComercioId}`, selectedCurrencyCode);
  }, [resolvedComercioId, selectedCurrencyCode]);

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

  function incrementProduct(productId: string) {
    const product = productById.get(productId);
    if (!product || (product.precio ?? 0) <= 0) return;

    setCart((prev) => ({
      ...prev,
      [productId]: (prev[productId] ?? 0) + 1,
    }));
  }

  function decrementProduct(productId: string) {
    setCart((prev) => {
      const current = prev[productId] ?? 0;
      if (current <= 1) {
        if (isConfirmOpen && Object.keys(prev).length === 1) {
          shouldReturnToMenuOnEmptyCartRef.current = true;
        }
        const next = { ...prev };
        delete next[productId];
        return next;
      }

      return {
        ...prev,
        [productId]: current - 1,
      };
    });
  }

  function removeProductFromCart(productId: string) {
    setCart((prev) => {
      if (!(productId in prev)) return prev;

      if (isConfirmOpen && Object.keys(prev).length === 1) {
        shouldReturnToMenuOnEmptyCartRef.current = true;
      }

      const next = { ...prev };
      delete next[productId];
      return next;
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

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const paymentLabel = paymentMethod ? paymentMethodLabel(paymentMethod) : 'No especificado';
    let paymentProofUrl = '';

    if (paymentMeta.proofFile) {
      const sanitizedFileName = paymentMeta.proofFile.name
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '')
        .toLowerCase();
      const proofUploadKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const storagePath = `${resolvedComercioId}/${proofUploadKey}-${sanitizedFileName || 'comprobante.jpg'}`;
      const { error: uploadError } = await supabase.storage
        .from('comprobantes')
        .upload(storagePath, paymentMeta.proofFile, {
          upsert: false,
          contentType: paymentMeta.proofFile.type || undefined,
        });
      if (uploadError) {
        throw new Error(uploadError.message || 'No se pudo subir el comprobante de pago.');
      }
      const { data: proofPublicData } = supabase.storage.from('comprobantes').getPublicUrl(storagePath);
      paymentProofUrl = proofPublicData?.publicUrl ?? '';
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
      nombre: item.product.nombre,
      cantidad: item.quantity,
      precio: item.product.precio ?? 0,
    }));

    const detalles = {
      cliente_nombre: customerName,
      cliente_email: email || null,
      telefono_cliente: customerWhatsapp,
      moneda_checkout: normalizeCurrencyCode(paymentMeta.currency),
      tasa_cambio_snapshot: paymentMeta.exchangeRate,
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
      order_notes: normalizedOrderNotes,
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

    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
        orderNotes: normalizedOrderNotes,
        detalles,
      }),
    });

    const responsePayload = await response.json().catch(() => ({}));
    if (!response.ok || !responsePayload?.ok || !responsePayload?.data?.orderId) {
      const validationDetails = Array.isArray(responsePayload?.details)
        ? responsePayload.details
        : [];

      let message = responsePayload?.error ?? 'No se pudo guardar el pedido.';
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
      (paymentMeta.exchangeRate > 1 ? `Tasa aplicada: ${paymentMeta.exchangeRate}.\n` : '') +
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

    return {
      orderId,
      orderUrl,
      waUrl: whatsappNumber
        ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
        : '',
    };
  }

  async function confirmOrder() {
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
          referenceLast4: paymentReferenceLast4,
          proofFile: paymentProofFile,
        },
        deliveryPayload,
      );

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

      setCart({});
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
      if (typeof window !== 'undefined') {
        const absoluteTrackingUrl = new URL(
          persisted.orderUrl || `/orders/${encodeURIComponent(persisted.orderId)}`,
          window.location.origin,
        ).toString();
        window.location.assign(absoluteTrackingUrl);
        return;
      }
      router.push(`/orders/${encodeURIComponent(persisted.orderId)}`);
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
    setCheckoutStep((prev) => Math.min(3, prev + 1));
  }

  function goToPreviousStep() {
    setCheckoutError(null);
    setCheckoutStep((prev) => Math.max(0, prev - 1));
  }

  if (loading) {
    return (
      <main
        className="relative min-h-screen overflow-hidden"
        style={{
          background:
            'radial-gradient(circle at 50% 18%, rgba(214,90,31,0.16), transparent 22%), linear-gradient(180deg, #fff8f0 0%, #fffaf5 36%, #ffffff 100%)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="kos-loader-aura absolute left-1/2 top-[12%] h-72 w-72 -translate-x-1/2 rounded-full bg-[rgba(214,90,31,0.12)]" />
          <div className="kos-loader-aura absolute left-[10%] top-[30%] h-28 w-28 rounded-full bg-[rgba(255,194,102,0.20)]" style={{ animationDelay: '220ms' }} />
          <div className="kos-loader-aura absolute bottom-[14%] right-[14%] h-36 w-36 rounded-full bg-[rgba(15,23,42,0.06)]" style={{ animationDelay: '420ms' }} />
          <div className="absolute inset-x-10 top-[22%] h-px bg-gradient-to-r from-transparent via-[rgba(214,90,31,0.18)] to-transparent" />
        </div>

        <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <div className="relative flex h-36 w-36 items-center justify-center sm:h-40 sm:w-40">
            <div className="kos-loader-orbit absolute inset-0 rounded-full border border-[rgba(214,90,31,0.16)]" />
            <div className="kos-loader-orbit-reverse absolute inset-[10px] rounded-full border border-dashed border-[rgba(15,23,42,0.12)]" />
            <div className="absolute inset-[20px] rounded-full bg-white/78 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-md" />

            <div
              className="relative z-[1] grid h-20 w-20 place-items-center rounded-[26px] text-3xl font-black text-white shadow-[0_16px_36px_rgba(15,23,42,0.16)] sm:h-24 sm:w-24 sm:text-4xl"
              style={{ backgroundColor: '#D65A1F' }}
            >
              {comercioInitialLetter}
            </div>

            {comercioLogoUrl ? (
              <img
                src={comercioLogoUrl}
                alt={`Logo de ${comercioNombre}`}
                className="absolute z-10 h-20 w-20 rounded-[26px] object-cover shadow-[0_16px_36px_rgba(15,23,42,0.16)] sm:h-24 sm:w-24"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            ) : null}
          </div>

          <div className="mt-8">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-slate-500">Cargando menu</p>
            <h1 className="mt-4 text-3xl font-black tracking-[-0.05em] text-slate-950 sm:text-5xl" style={titleFontStyle}>
              {comercioNombre}
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm font-medium leading-6 text-slate-500 sm:text-[15px]">
              Preparando la experiencia del menu digital.
            </p>
          </div>

          <div className="mt-8 flex items-center gap-2">
            <span className="kos-loader-dot h-2 w-2 rounded-full bg-[#D65A1F]" />
            <span className="kos-loader-dot h-2 w-2 rounded-full bg-[#F59E0B]" style={{ animationDelay: '140ms' }} />
            <span className="kos-loader-dot h-2 w-2 rounded-full bg-slate-400" style={{ animationDelay: '280ms' }} />
          </div>

          <div className="kos-loader-bar relative mt-6 h-[3px] w-40 overflow-hidden rounded-full bg-slate-200/80" />
        </section>

        <div className="pointer-events-none absolute inset-x-0 bottom-10 z-10 text-center">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-slate-400">elmenuxfa.com</p>
        </div>
      </main>
    );
  }

  if (isDraftMode) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-slate-50">
        <div className="w-full max-w-2xl rounded-3xl border border-amber-300/35 bg-amber-100/10 p-7 text-center backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">Sitio en mantenimiento</p>
          <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Estamos terminando de activar este menu</h1>
          <p className="mt-3 text-sm text-slate-200 sm:text-base">
            El menu publico estara disponible cuando la cuenta propietaria confirme su correo y complete la activacion.
          </p>
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
          color: #0f172a;
          font-size: 0.95rem;
          outline: 0;
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
        className="min-h-screen pt-9 text-slate-900"
        style={{
          ...containerStyle,
          background: pageBackgroundByPreset(rubroPreset.id),
        }}
      >
        <section className="fixed inset-x-0 top-0 z-50 border-b border-slate-900/10 bg-slate-950 text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
          <div className="mx-auto flex h-9 max-w-6xl items-center overflow-hidden px-4 sm:px-6">
            <div className="mr-3 shrink-0 rounded-full bg-white/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/90">
              Divisas
            </div>
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <div
                className="flex min-w-max items-center gap-3 whitespace-nowrap"
                style={{ animation: 'kosmenuTickerScroll 24s linear infinite' }}
              >
                {tickerRateEntries.map((entry, index) => (
                  <div key={`ticker-rate-${index}`} className="flex items-center gap-3">
                    <span className="text-xs font-bold tracking-[0.04em] text-white/95">{entry}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--primary-color)]" />
                  </div>
                ))}
              </div>
            </div>
            <div className="ml-3 shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
              {exchangeSourceLabel(businessExchangeSource)}
            </div>
          </div>
        </section>

        <section
          className="sticky z-40 border-b border-slate-200/90 bg-white/95 backdrop-blur-sm"
          style={{ top: `${topTickerHeightPx}px` }}
        >
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              {comercioLogoUrl ? (
                <img
                  src={comercioLogoUrl}
                  alt={`Logo de ${comercioNombre}`}
                  className="h-9 w-9 shrink-0 rounded-xl border border-slate-200 bg-white object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black text-white"
                  style={{ backgroundColor: 'var(--primary-color)' }}
                >
                  {comercioInitialLetter}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-black tracking-[-0.02em] text-slate-900 sm:text-base" style={titleFontStyle}>
                  {comercioNombre}
                </h1>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                  <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.2} />
                  <p className="truncate">{heroLocation || `@${resolvedSlug}`}</p>
                </div>
              </div>
            </div>
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsQuickActionsOpen((prev) => !prev)}
                aria-expanded={isQuickActionsOpen}
                aria-label="Abrir menu de acciones"
                className="kos-surface-motion kos-pressable kos-hover-subtle inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"
              >
                <Menu className="h-4 w-4" strokeWidth={2.5} />
                <ChevronDown className={`absolute bottom-1 right-1 h-3 w-3 transition-transform duration-200 ${isQuickActionsOpen ? 'rotate-180' : ''}`} strokeWidth={2.4} />
              </button>

              <button
                type="button"
                onClick={() => {
                  setCheckoutError(null);
                  setCheckoutStep(0);
                  setIsConfirmOpen(true);
                }}
                aria-label={cartCount > 0 ? 'Ver pedido' : 'Carrito vacio'}
                className="kos-surface-motion kos-pressable kos-hover-subtle relative inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-slate-800 shadow-sm"
              >
                <ShoppingCart className="h-4 w-4" strokeWidth={2.4} />
                {cartCount > 0 ? (
                  <span
                    className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-black text-white"
                    style={{ backgroundColor: 'var(--primary-color)' }}
                  >
                    {cartCount}
                  </span>
                ) : null}
              </button>

            </div>
          </div>
        </section>

        {isQuickActionsOpen ? (
          <div className="fixed inset-0 z-[72]">
            <button
              type="button"
              aria-label="Cerrar menu de acciones"
              onClick={() => setIsQuickActionsOpen(false)}
              className="kos-drawer-backdrop absolute inset-0 bg-slate-950/38 backdrop-blur-[2px]"
            />

            <aside className="kos-drawer-panel absolute right-0 top-0 flex h-full w-[min(88vw,360px)] flex-col border-l border-white/60 bg-white/96 shadow-[-24px_0_60px_rgba(15,23,42,0.2)] backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Menu</p>
                  <h2 className="mt-1 text-lg font-black tracking-[-0.03em] text-slate-900" style={titleFontStyle}>
                    Acciones rapidas
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQuickActionsOpen(false)}
                  aria-label="Cerrar drawer"
                  className="kos-surface-motion kos-pressable kos-hover-subtle grid h-10 w-10 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"
                >
                  <X className="h-4.5 w-4.5" strokeWidth={2.4} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                  <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Acciones</p>
                  <div className="mt-3 space-y-2">
                    {callNumber ? (
                      <a
                        href={`tel:+${callNumber}`}
                        onClick={() => setIsQuickActionsOpen(false)}
                        className="kos-surface-motion kos-pressable kos-hover-subtle flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700"
                      >
                        <span className="flex items-center gap-2">
                          <Phone className="h-4 w-4" strokeWidth={2.2} />
                          Llamar
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-400" strokeWidth={2.2} />
                      </a>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        setIsQuickActionsOpen(false);
                        void shareMenu();
                      }}
                      className="kos-surface-motion kos-pressable kos-hover-subtle flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700"
                    >
                      <span className="flex items-center gap-2">
                        <Share2 className="h-4 w-4" strokeWidth={2.2} />
                        Compartir
                      </span>
                      <ArrowRight className="h-4 w-4 text-slate-400" strokeWidth={2.2} />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsQuickActionsOpen(false);
                        setIsInfoOpen(true);
                      }}
                      className="kos-surface-motion kos-pressable kos-hover-subtle flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700"
                    >
                      <span className="flex items-center gap-2">
                        <Info className="h-4 w-4" strokeWidth={2.2} />
                        Informacion
                      </span>
                      <ArrowRight className="h-4 w-4 text-slate-400" strokeWidth={2.2} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                  <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Divisa</p>
                  <select
                    value={selectedCurrencyCode}
                    onChange={(event) => setSelectedCurrency(normalizeCurrencyCode(event.target.value))}
                    className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-black uppercase tracking-[0.08em] text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white"
                  >
                    {(paymentMethodsByCurrency.length > 0
                      ? paymentMethodsByCurrency.map((group) => group.currency)
                      : [businessBaseCurrency]
                    ).map((currency) => (
                      <option key={`appbar-currency-${currency}`} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </aside>
          </div>
        ) : null}

        {shareMessage ? (
          <div className="fixed left-1/2 z-[70] -translate-x-1/2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm" style={{ top: `${topTickerHeightPx + topAppBarHeightPx + 8}px` }}>
            {shareMessage}
          </div>
        ) : null}

        <section className="mx-auto mt-4 max-w-6xl px-4 sm:mt-5 sm:px-6">
          <div
            className="kos-motion-enter relative overflow-hidden rounded-[32px] border border-slate-900/8 bg-slate-950 shadow-[0_22px_55px_rgba(15,23,42,0.14)]"
            data-motion-in={isExperienceReady}
            style={revealMotionStyle({ duration: MOTION_TOKENS.duration.hero, intensity: 'medium' })}
          >
            <img
              src={heroImageSrc}
              alt={heroProduct?.nombre || comercioNombre}
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
              onError={(event) => {
                const img = event.currentTarget;
                if (img.src !== defaultProductImage) {
                  img.onerror = null;
                  img.src = defaultProductImage;
                }
              }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.28)_0%,rgba(15,23,42,0.52)_38%,rgba(15,23,42,0.86)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_32%)]" />

            <div className="relative flex min-h-[19rem] flex-col justify-between p-4 sm:min-h-[22rem] sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div
                  className="kos-motion-enter inline-flex items-center gap-2 rounded-full bg-[rgba(239,68,68,0.92)] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-[0_12px_26px_rgba(239,68,68,0.32)]"
                  data-motion-in={isExperienceReady}
                  style={revealMotionStyle({ delay: motionDelay(1), intensity: 'subtle' })}
                >
                  <Flame className="h-3.5 w-3.5" strokeWidth={2.4} />
                  {heroBadgeLabel}
                </div>
                <div
                  className="kos-motion-enter rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-white/92 backdrop-blur-sm"
                  data-motion-in={isExperienceReady}
                  style={revealMotionStyle({ delay: motionDelay(2), intensity: 'subtle', direction: 'left' })}
                >
                  {selectedCurrencyCode}
                </div>
              </div>

              <div className="max-w-[34rem]">
                <h2
                  className="kos-motion-enter max-w-full pb-1 text-[2rem] font-black leading-[0.98] tracking-[-0.05em] text-white sm:text-[2.75rem] md:text-[3.4rem]"
                  data-motion-in={isExperienceReady}
                  style={{
                    ...titleFontStyle,
                    ...revealMotionStyle({ delay: motionDelay(3), duration: MOTION_TOKENS.duration.hero, intensity: 'strong' }),
                    overflowWrap: 'anywhere',
                  }}
                >
                  {comercioNombre}
                </h2>

                <p
                  className="kos-motion-enter mt-3 max-w-xl text-sm font-medium leading-6 text-white/88 sm:text-[15px]"
                  data-motion-in={isExperienceReady}
                  style={{
                    ...revealMotionStyle({ delay: motionDelay(4), intensity: 'medium' }),
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {heroSubtitle}
                </p>

                <div
                  className="kos-motion-enter mt-4 inline-flex w-fit max-w-[17rem] items-start gap-2 rounded-[15px] border border-white/16 bg-[rgba(255,255,255,0.09)] px-2.5 py-2 text-left shadow-[0_10px_22px_rgba(15,23,42,0.12)] backdrop-blur-md"
                  data-motion-in={isExperienceReady}
                  style={revealMotionStyle({ delay: motionDelay(5), intensity: 'subtle' })}
                >
                  <span className="mt-0.5 flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/92">
                    <MapPin className="h-3.5 w-3.5" strokeWidth={2.3} />
                  </span>
                  <span
                    className="block text-[10px] font-semibold leading-[1.28] text-white/84 sm:text-[11px]"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {heroLocation || `@${resolvedSlug}`}
                  </span>
                </div>

                <div ref={statsCardsRef} className="mt-5 max-w-md">
                  <div
                    className="kos-motion-enter kos-float-subtle grid grid-cols-[0.78fr_0.9fr_1.62fr] overflow-hidden rounded-[18px] border border-white/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.07)_100%)] shadow-[0_18px_32px_rgba(15,23,42,0.14)] backdrop-blur-md sm:grid-cols-[0.84fr_0.96fr_1.5fr] sm:rounded-[20px]"
                    data-motion-in={isExperienceReady}
                    style={revealMotionStyle({ delay: motionDelay(6), intensity: 'medium' })}
                  >
                    <div className="flex min-h-[56px] flex-col items-center justify-center px-2.5 py-2 text-center sm:min-h-[64px] sm:px-3">
                      <span className="text-[17px] font-black leading-none text-white sm:text-[18px]">{animatedCategoryCount}</span>
                      <span className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/74 sm:text-[10px]">Categorías</span>
                    </div>

                    <div className="flex min-h-[56px] flex-col items-center justify-center border-l border-white/10 px-2.5 py-2 text-center sm:min-h-[64px] sm:px-3">
                      <span className="text-[17px] font-black leading-none text-white sm:text-[18px]">{animatedProductCount}</span>
                      <span className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/74 sm:text-[10px]">Productos</span>
                    </div>

                    <div className="flex min-h-[56px] items-center justify-center gap-1.5 border-l border-white/10 px-2 py-2 text-center sm:min-h-[64px] sm:gap-2 sm:px-3">
                      <span className="shrink-0 text-white/92">
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          className="h-[clamp(22px,5.6vw,28px)] w-[clamp(22px,5.6vw,28px)]"
                          fill="currentColor"
                        >
                          <path d="M19,7c0-1.1-0.9-2-2-2h-3v2h3v2.65L13.52,14H10V9H6c-2.21,0-4,1.79-4,4v3h2c0,1.66,1.34,3,3,3s3-1.34,3-3h4.48L19,10.35V7z M7,17c-0.55,0-1-0.45-1-1h2C8,16.55,7.55,17,7,17z" />
                          <rect x="5" y="6" width="5" height="2" />
                          <path d="M19,13c-1.66,0-3,1.34-3,3s1.34,3,3,3s3-1.34,3-3S20.66,13,19,13z M19,17c-0.55,0-1-0.45-1-1s0.45-1,1-1s1,0.45,1,1S19.55,17,19,17z" />
                        </svg>
                      </span>
                      <div className="min-w-0 text-left">
                        <p className="text-[clamp(8.5px,2.1vw,11px)] font-black uppercase leading-[1.05] tracking-[0.11em] text-white/95 sm:tracking-[0.13em]">
                          {supportsDelivery ? 'Delivery' : 'Retiro'}
                        </p>
                        <p className="mt-1 text-[clamp(8.5px,2.1vw,11px)] font-black uppercase leading-[1.05] tracking-[0.08em] text-white/74 sm:tracking-[0.11em]">
                          {supportsDelivery ? 'Disponible' : 'En tienda'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            ref={stickySearchCardRef}
            className="kos-motion-enter sticky z-30 mt-4 overflow-visible rounded-[28px] border border-white/70 bg-white/90 p-3 shadow-[0_20px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl md:p-4"
            data-motion-in={isExperienceReady}
            style={{
              ...revealMotionStyle({ delay: motionDelay(4), duration: MOTION_TOKENS.duration.hero, intensity: 'medium' }),
              top: `${stickySearchTopPx}px`,
            }}
          >
            <div className="pointer-events-none absolute inset-x-5 -bottom-4 h-8 rounded-full bg-gradient-to-b from-slate-900/12 via-slate-900/6 to-transparent blur-md" />
            <div className="rounded-[22px] border border-slate-200/90 bg-[color:color-mix(in_srgb,var(--card-surface)_95%,white)] p-3 sm:p-4">
              <div className="relative">
                <div className="relative min-w-0">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Buscar producto..."
                    className="h-12 w-full rounded-2xl border border-slate-200/90 bg-white pl-11 pr-12 text-sm font-semibold text-slate-900 outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
                  />
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                </div>

                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Limpiar busqueda"
                    className="kos-surface-motion kos-pressable absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M6 6l12 12" />
                      <path d="M18 6L6 18" />
                    </svg>
                  </button>
                ) : null}
              </div>

              <div
                className="mt-3 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="flex w-max items-center gap-2 pr-2">
                  {visibleCategorias.map((categoria) => (
                    <button
                      type="button"
                      key={categoria.id}
                      ref={(element) => {
                        categoryChipRefs.current[categoria.id] = element;
                      }}
                      onClick={() => scrollToCategory(categoria.id)}
                      className={`kos-motion-enter kos-surface-motion kos-pressable kos-hover-subtle inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-extrabold uppercase tracking-[0.04em] ${
                        activeCategoryId === categoria.id
                          ? 'text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)]'
                          : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                      data-motion-in={isExperienceReady}
                      style={
                        {
                          ...revealMotionStyle({ delay: motionDelay(categoria.productos.length > 0 ? visibleCategorias.findIndex((item) => item.id === categoria.id) + 5 : 5, 32), intensity: 'subtle' }),
                          ...(activeCategoryId === categoria.id
                            ? {
                                backgroundColor: 'var(--primary-color)',
                                borderColor: 'var(--primary-color)',
                              }
                            : undefined),
                        }
                      }
                    >
                      <span
                        aria-hidden="true"
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[13px]"
                        style={{
                          backgroundColor: activeCategoryId === categoria.id ? 'rgba(255,255,255,0.18)' : categoria.visual.tint,
                          border: `1px solid ${activeCategoryId === categoria.id ? 'rgba(255,255,255,0.22)' : categoria.visual.border}`,
                          boxShadow: activeCategoryId === categoria.id ? 'none' : categoria.visual.shadow,
                        }}
                      >
                        <span className="translate-y-[0.5px]">{categoria.visual.glyph}</span>
                      </span>
                      <span>{categoria.displayName}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {showScrollTopButton ? (
            <div className={`fixed right-4 z-[45] ${cartCount > 0 ? 'bottom-24 sm:bottom-28' : 'bottom-6 sm:bottom-8'}`}>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })}
                aria-label="Volver arriba"
                className="kos-surface-motion kos-pressable kos-hover-subtle flex h-12 w-12 items-center justify-center rounded-full shadow-[0_18px_38px_rgba(15,23,42,0.24)]"
                style={{ backgroundColor: 'var(--primary-color)', color: 'var(--text-on-primary)' }}
              >
                <ArrowUp className="h-5 w-5" strokeWidth={2.6} />
              </button>
            </div>
          ) : null}

          <div className="mt-5 pb-44">
            {!hasProducts ? (
              <div className="rounded-[28px] border border-slate-200/90 bg-white/92 p-8 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                <p className="text-xl font-black text-slate-900" style={titleFontStyle}>
                  {searchQuery.trim() ? 'No encontramos productos con ese termino.' : 'Estamos preparando el menu digital'}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-600">
                  {searchQuery.trim() ? 'Prueba con otro nombre o categoria.' : 'Vuelve en unos minutos para ver todos los productos.'}
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {visibleCategorias.map((categoria) => (
                  <section
                    key={categoria.id}
                    id={`categoria-${categoria.id}`}
                    ref={(element) => {
                      categorySectionRefs.current[categoria.id] = element;
                    }}
                    className="scroll-mt-[12rem]"
                  >
                    <div
                      className="kos-motion-enter mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
                      data-motion-in={isExperienceReady || Boolean(revealedCategoryIds[categoria.id])}
                      style={revealMotionStyle({ intensity: 'medium' })}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg"
                          style={{
                            backgroundColor: categoria.visual.tint,
                            border: `1px solid ${categoria.visual.border}`,
                            boxShadow: categoria.visual.shadow,
                          }}
                        >
                          <span className="translate-y-[0.5px]">{categoria.visual.glyph}</span>
                        </span>
                        <h2 className="min-w-0 flex-1 text-[1.65rem] font-black uppercase tracking-[-0.03em] md:text-[2rem]" style={{ ...titleFontStyle, color: 'var(--secondary-color)' }}>
                          {categoria.displayName}
                        </h2>
                      </div>
                      <span className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-white/84 px-3 py-1.5 text-[10px] font-black uppercase leading-none tracking-[0.08em] text-slate-500 shadow-[0_8px_20px_rgba(15,23,42,0.05)] sm:px-3 sm:py-1 sm:text-[11px] sm:tracking-[0.14em]">
                        {categoria.productos.length} item{categoria.productos.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className={menuGridClass(layoutType, itemsPerRow)}>
                      {categoria.productos.map((producto, productIndex) => {
                        const quantity = cart[producto.id] ?? 0;
                        const isZeroPricedProduct = (producto.precio ?? 0) <= 0;
                        const isProductUnavailable = producto.disponible === false || isZeroPricedProduct;
                        const isProductRevealed = Boolean(revealedProductIds[producto.id]);
                        const convertedPrice = formatAmountByCurrency(
                          convertFromBaseCurrency(
                            producto.precio ?? 0,
                            businessBaseCurrency,
                            selectedCurrencyCode,
                            selectedExchangeRate,
                          ),
                          selectedCurrencyCode,
                        );

                        return (
                          <article
                            key={producto.id}
                            ref={(element) => {
                              productCardRefs.current[producto.id] = element;
                            }}
                            data-product-id={producto.id}
                            className="kos-motion-enter kos-surface-motion kos-pressable kos-hover-subtle overflow-hidden rounded-[28px] border bg-[color:color-mix(in_srgb,var(--card-surface)_94%,white)] shadow-[0_18px_38px_rgba(15,23,42,0.07)]"
                            data-motion-in={isExperienceReady || isProductRevealed}
                            style={{
                              ...revealMotionStyle({
                                delay: motionDelay(productIndex),
                                duration: MOTION_TOKENS.duration.hero,
                                intensity: 'medium',
                              }),
                              borderColor: 'color-mix(in srgb, var(--primary-color) 12%, white)',
                              willChange: isProductRevealed ? 'auto' : 'transform, opacity',
                            }}
                          >
                            <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                              {showImages ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedProductImage({
                                      src: safeImageSrc(producto.imagen_url, comercioLogoUrl),
                                      alt: producto.nombre,
                                      title: producto.nombre,
                                      description: producto.descripcion?.trim() || 'Preparacion recomendada por la casa.',
                                    })
                                  }
                                  className="kos-surface-motion kos-pressable kos-hover-subtle relative h-[8.75rem] w-[8.4rem] shrink-0 overflow-hidden rounded-[22px] bg-slate-100 shadow-[0_14px_26px_rgba(15,23,42,0.14)] sm:h-[10rem] sm:w-[9.5rem]"
                                  aria-label={`Ver imagen grande de ${producto.nombre}`}
                                >
                                  <img
                                    src={safeImageSrc(producto.imagen_url, comercioLogoUrl)}
                                    alt={producto.nombre}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    onError={(event) => {
                                      const img = event.currentTarget;
                                      if (img.src !== defaultProductImage) {
                                        img.onerror = null;
                                        img.src = defaultProductImage;
                                      }
                                    }}
                                  />
                                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
                                  <span className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${isProductUnavailable ? 'bg-slate-900/85 text-white' : 'bg-white/92 text-slate-900'}`}>
                                    {isProductUnavailable ? 'No disponible' : 'Pedir'}
                                  </span>
                                </button>
                              ) : null}

                              <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                                <div>
                                  <h3
                                    className="text-[1.05rem] font-extrabold leading-5 text-slate-900 sm:text-[1.2rem]"
                                    style={{
                                      ...titleFontStyle,
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {producto.nombre}
                                  </h3>

                                  <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-slate-600 sm:text-sm">
                                    {producto.descripcion?.trim() || 'Preparacion recomendada por la casa.'}
                                  </p>
                                </div>

                                <div className="mt-4">
                                  <p className="text-[1.6rem] font-black leading-none tracking-[-0.04em]" style={{ ...titleFontStyle, color: 'var(--primary-color)' }}>
                                    {convertedPrice}
                                  </p>
                                  {selectedCurrencyCode !== businessBaseCurrency ? (
                                    <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                      Base {formatAmountByCurrency(producto.precio ?? 0, businessBaseCurrency)}
                                    </p>
                                  ) : null}

                                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                    {quantity === 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isProductUnavailable) return;
                                          incrementProduct(producto.id);
                                        }}
                                        disabled={isProductUnavailable}
                                        className="kos-surface-motion kos-pressable kos-hover-subtle inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-3 text-sm font-black shadow-[0_16px_28px_rgba(15,23,42,0.14)]"
                                        style={{
                                          minWidth: '9rem',
                                          borderRadius: '18px',
                                          backgroundColor: isProductUnavailable ? '#E2E8F0' : 'var(--primary-color)',
                                          color: isProductUnavailable ? '#64748B' : 'var(--text-on-primary)',
                                          cursor: isProductUnavailable ? 'not-allowed' : 'pointer',
                                          boxShadow: isProductUnavailable ? 'none' : undefined,
                                          opacity: isProductUnavailable ? 0.9 : 1,
                                        }}
                                      >
                                        {isProductUnavailable ? 'No disponible' : 'Agregar'}
                                      </button>
                                    ) : (
                                      <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
                                        <button
                                          type="button"
                                          onClick={() => decrementProduct(producto.id)}
                                          className="kos-surface-motion kos-pressable grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-700"
                                        >
                                          -
                                        </button>
                                        <span className="min-w-8 text-center text-sm font-black text-slate-900">{quantity}</span>
                                        <button
                                          type="button"
                                          onClick={() => incrementProduct(producto.id)}
                                          disabled={isProductUnavailable}
                                          className="kos-surface-motion kos-pressable grid h-9 w-9 place-items-center rounded-xl text-lg font-black"
                                          style={{
                                            backgroundColor: isProductUnavailable ? '#E2E8F0' : 'var(--primary-color)',
                                            color: isProductUnavailable ? '#94A3B8' : 'var(--text-on-primary)',
                                            cursor: isProductUnavailable ? 'not-allowed' : 'pointer',
                                          }}
                                        >
                                          +
                                        </button>
                                      </div>
                                    )}

                                    {quantity > 0 ? (
                                      <span
                                        className="rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em]"
                                        style={{
                                          backgroundColor: 'color-mix(in srgb, var(--primary-color) 12%, white)',
                                          color: 'var(--primary-color)',
                                        }}
                                      >
                                        {quantity} en tu pedido
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </section>

        {cartCount > 0 ? (
          <section
            className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 sm:px-4"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
          >
            <div className="pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-3">
              <div
                className="flex w-full items-center gap-3 rounded-[28px] border border-white/10 px-3.5 py-3.5 text-white shadow-[0_20px_55px_rgba(15,23,42,0.32)]"
                style={{
                  background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary-color) 78%, black) 0%, color-mix(in srgb, var(--secondary-color) 82%, black) 100%)',
                }}
              >
                <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/14 backdrop-blur-sm">
                  <ShoppingCart className="h-5 w-5" strokeWidth={2.4} />
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#FACC15] px-1 text-[10px] font-black text-slate-950">
                    {cartCount}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/70">
                    {cartCount} producto{cartCount === 1 ? '' : 's'}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="truncate text-xl font-black tracking-[-0.03em] text-white" style={titleFontStyle}>
                      {formatAmountByCurrency(cartTotalConverted, selectedCurrencyCode)}
                    </p>
                    <span className="hidden text-xs font-semibold text-white/70 sm:inline">{selectedCurrencyCode}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCheckoutError(null);
                    setCheckoutStep(0);
                    setIsConfirmOpen(true);
                  }}
                  disabled={isSubmittingOrder}
                  className="kos-surface-motion kos-pressable kos-hover-subtle inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#FACC15] px-4 py-3 text-sm font-black text-slate-950 shadow-[0_16px_32px_rgba(250,204,21,0.28)]"
                >
                  {isSubmittingOrder ? 'Procesando...' : 'Ver pedido'}
                  {!isSubmittingOrder ? <ArrowRight className="h-4 w-4" strokeWidth={2.5} /> : null}
                </button>
              </div>
            </div>
          </section>
        ) : null}

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
                                  Tasa aplicada: 1 {businessBaseCurrency} = {group.exchangeRate} {group.currency}
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
          <section className="kos-modal-backdrop fixed inset-0 z-[61] bg-white">
            <div className="kos-sheet-panel mx-auto flex h-full max-w-2xl flex-col bg-white">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Mapa</p>
                  <h3 className="text-xl font-black text-slate-900" style={titleFontStyle}>Punto de entrega</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMapPickerOpen(false)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
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
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none"
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
                    className="rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold uppercase tracking-[0.08em] text-slate-700 disabled:opacity-50"
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
                  <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                    Buscando direccion...
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Direccion detectada</p>
                <p className="text-sm font-semibold text-slate-800">
                  {mapPickerAddress || 'Mueve el mapa para colocar el pin en el punto exacto.'}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
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
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-slate-700"
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

        {isConfirmOpen ? (
          <section className="checkout-overlay-enter fixed inset-0 z-[60] bg-[rgba(241,245,249,0.96)] backdrop-blur-sm">
            <div className="checkout-sheet-enter mx-auto flex h-full max-w-6xl flex-col bg-[#f8fafc]">
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/96 px-4 py-3 backdrop-blur-xl sm:px-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Checkout</p>
                    <h3 className="mt-0.5 text-xl font-black tracking-[-0.03em] text-slate-950" style={titleFontStyle}>Finaliza tu pedido</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsConfirmOpen(false)}
                    className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm"
                    aria-label="Cerrar checkout"
                  >
                    <X className="h-4 w-4" strokeWidth={2.4} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                <div className="mx-auto max-w-3xl">
                  <div className="min-w-0">
                    <div className="checkout-panel-enter rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_16px_42px_rgba(15,23,42,0.08)] sm:p-5">
                      <div className="h-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full origin-left rounded-full transition-transform duration-300"
                          style={{
                            transform: `scaleX(${Math.max(checkoutProgress, 0.08)})`,
                            backgroundColor: 'var(--primary-color)',
                          }}
                        />
                      </div>
                      <div className="mt-4 grid grid-cols-4 items-start">
                        {checkoutStepTitles.map((title, index) => {
                          const isActive = checkoutStep === index;
                          const isDone = index < checkoutStep;
                          return (
                            <div key={`checkout-step-${title}`} className="relative flex min-w-0 justify-center">
                              {index < checkoutStepTitles.length - 1 ? (
                                <div
                                  className="absolute left-1/2 top-[18px] h-[2px] w-full"
                                  style={{ backgroundColor: isDone ? 'var(--primary-color)' : '#CBD5E1' }}
                                />
                              ) : null}
                              <div className="relative z-[1] flex flex-col items-center bg-white px-2">
                                <div
                                  className={`grid h-9 w-9 place-items-center rounded-full border text-sm font-black transition-[transform,background-color,border-color,color] duration-300 ${isActive ? 'checkout-step-active' : ''}`}
                                  style={
                                    isActive
                                      ? {
                                          backgroundColor: 'color-mix(in srgb, var(--primary-color) 14%, white)',
                                          borderColor: 'color-mix(in srgb, var(--primary-color) 48%, white)',
                                          color: 'var(--primary-color)',
                                        }
                                      : isDone
                                        ? { backgroundColor: '#F0FDF4', borderColor: '#86EFAC', color: '#15803D' }
                                        : { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', color: '#94A3B8' }
                                  }
                                >
                                  {isDone ? '✓' : index + 1}
                                </div>
                                <p className={`mt-2 text-center text-[10px] font-black uppercase tracking-[0.12em] ${isActive ? 'text-slate-900' : 'text-slate-400'}`}>
                                  {title}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="checkout-panel-enter mt-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_16px_42px_rgba(15,23,42,0.08)] sm:p-5" style={{ animationDelay: '70ms' }}>
                      <div className="mb-5 border-b border-slate-200 pb-4">
                        <h4 className="text-xl font-black text-slate-950" style={titleFontStyle}>{currentCheckoutStepTitle}</h4>
                      </div>

                      <div key={`checkout-step-panel-${checkoutStep}`} className="checkout-panel-enter sm:px-1">
                  {checkoutStep === 0 ? (
                    <div className="space-y-4">
                      <div className="checkout-item-enter px-1">
                        <h5 className="text-lg font-black text-slate-950" style={titleFontStyle}>Revisa tus productos</h5>
                        <p className="mt-1 text-sm font-medium text-slate-500">Ajusta cantidades o deja una nota.</p>
                      </div>

                      {checkoutSummaryItems.length > 0 ? (
                        <div className="space-y-3">
                          {checkoutSummaryItems.map((item, index) => (
                            <article key={`checkout-step-order-${item.id}`} className="checkout-item-enter rounded-[28px] border border-slate-200 bg-white p-4 sm:p-5" style={{ animationDelay: `${index * 50}ms` }}>
                              <div className="flex items-start gap-4">
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="h-20 w-20 shrink-0 rounded-[22px] bg-slate-100 object-cover"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-[15px] font-black text-slate-950">{item.name}</p>
                                      {item.description ? (
                                        <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{item.description}</p>
                                      ) : null}
                                    </div>
                                    <p className="whitespace-nowrap text-sm font-black text-slate-950">
                                      {formatAmountByCurrency(item.totalPrice, selectedCurrencyCode)}
                                    </p>
                                  </div>

                                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                    <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1">
                                      <button
                                        type="button"
                                        onClick={() => decrementProduct(item.id)}
                                        className="grid h-9 w-9 place-items-center rounded-full bg-white text-base font-black text-slate-700"
                                        aria-label={`Reducir cantidad de ${item.name}`}
                                      >
                                        −
                                      </button>
                                      <span className="min-w-10 px-2 text-center text-sm font-black text-slate-900">{item.quantity}</span>
                                      <button
                                        type="button"
                                        onClick={() => incrementProduct(item.id)}
                                        disabled={!item.canIncrease}
                                        className="grid h-9 w-9 place-items-center rounded-full bg-white text-base font-black text-slate-700 disabled:opacity-40"
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
                        <div className="rounded-[24px] border border-dashed border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] sm:p-5">
                          <div className="flex items-start gap-3">
                            <div
                              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] text-white shadow-[0_16px_32px_rgba(15,23,42,0.16)]"
                              style={{ backgroundColor: 'var(--primary-color)' }}
                            >
                              <ShoppingCart className="h-5 w-5" strokeWidth={2.4} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Pedido</p>
                              <h6 className="mt-1.5 text-[1.1rem] font-black leading-tight tracking-[-0.03em] text-slate-950 sm:text-[1.2rem]" style={titleFontStyle}>
                                Tu carrito está vacío
                              </h6>
                              <p className="mt-2 text-sm leading-5 text-slate-600">
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

                      {checkoutSummaryItems.length > 0 ? (
                        <div className="checkout-item-enter rounded-[24px] border border-slate-200 bg-white p-4" style={{ animationDelay: '120ms' }}>
                        <label htmlFor="order-notes" className="block">
                          <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                            <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.4} />
                            Nota para el negocio
                          </span>
                          <textarea
                            id="order-notes"
                            value={orderNotes}
                            onChange={(event) => setOrderNotes(event.target.value)}
                            placeholder="Sin cebolla, tocar timbre, empaquetar aparte"
                            rows={4}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                          />
                        </label>
                        <p className="mt-2 text-[11px] font-medium text-slate-500">
                          Opcional.
                        </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {checkoutStep === 1 ? (
                    <div className="space-y-4">
                      <div className="checkout-item-enter px-1">
                        <h5 className="text-lg font-black text-slate-950" style={titleFontStyle}>¿Quien recibe el pedido?</h5>
                        <p className="mt-1 text-sm font-medium text-slate-500">Completa los datos para contactarte.</p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="checkout-item-enter block rounded-[24px] border border-slate-200 bg-white p-4" style={{ animationDelay: '40ms' }}>
                          <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                            <User className="h-3.5 w-3.5" strokeWidth={2.4} />
                            Nombre completo
                          </span>
                          <input
                            type="text"
                            value={clientName}
                            onChange={(event) => setClientName(event.target.value)}
                            placeholder="Maria Fernanda Lopez"
                            className="h-12 w-full rounded-2xl border bg-slate-50 px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                            style={{
                              borderColor: isClientNameValid || clientName.trim().length === 0 ? '#E2E8F0' : '#F43F5E',
                            }}
                            required
                          />
                        </label>

                        <label className="checkout-item-enter block rounded-[24px] border border-slate-200 bg-white p-4" style={{ animationDelay: '90ms' }}>
                          <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
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
                            className="h-12 w-full rounded-2xl border bg-slate-50 px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                            style={{
                              borderColor: isClientEmailValid || clientEmail.trim().length === 0 ? '#E2E8F0' : '#F43F5E',
                            }}
                            required
                          />
                          {!isClientEmailValid && clientEmail.trim().length > 0 ? (
                            <p className="mt-2 text-[11px] font-semibold text-rose-500">Ingresa un correo valido.</p>
                          ) : null}
                        </label>
                      </div>

                      <label className="checkout-item-enter block rounded-[24px] border border-slate-200 bg-white p-4" style={{ animationDelay: '140ms' }}>
                        <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                          <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.4} />
                          WhatsApp
                        </span>
                        <div
                          className="checkout-phone-field rounded-2xl border bg-slate-50"
                          style={{
                            borderColor:
                              isClientWhatsappValid || clientWhatsapp.trim().length === 0 ? '#E2E8F0' : '#F43F5E',
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
                    <div className="space-y-4">
                      <div className="checkout-item-enter px-1">
                        <h5 className="text-lg font-black text-slate-950" style={titleFontStyle}>Define la entrega</h5>
                        <p className="mt-1 text-sm font-medium text-slate-500">Elige si retiras en el local o si quieres enviar el pedido a una direccion.</p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setDeliveryMode('pickup')}
                          className="checkout-item-enter rounded-[24px] border p-4 text-left"
                          style={{
                            animationDelay: '40ms',
                            borderColor:
                              !isDeliveryOrder
                                ? 'color-mix(in srgb, var(--primary-color) 42%, white)'
                                : '#E2E8F0',
                            backgroundColor:
                              !isDeliveryOrder
                                ? 'color-mix(in srgb, var(--primary-color) 8%, white)'
                                : '#FFFFFF',
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                <Store className="h-5 w-5" strokeWidth={2.2} />
                              </span>
                              <p className="mt-3 text-base font-black text-slate-950">Retiro en local</p>
                              <p className="mt-1 text-sm leading-5 text-slate-500">Recoges el pedido directamente en el negocio.</p>
                            </div>
                            {!isDeliveryOrder ? (
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-700 shadow-sm">Activo</span>
                            ) : null}
                          </div>
                        </button>

                        <button
                          type="button"
                          disabled={!supportsDelivery}
                          onClick={() => setDeliveryMode('delivery')}
                          className="checkout-item-enter rounded-[24px] border p-4 text-left disabled:cursor-not-allowed disabled:opacity-70"
                          style={{
                            animationDelay: '80ms',
                            borderColor:
                              isDeliveryOrder
                                ? 'color-mix(in srgb, var(--primary-color) 42%, white)'
                                : '#E2E8F0',
                            backgroundColor:
                              isDeliveryOrder
                                ? 'color-mix(in srgb, var(--primary-color) 8%, white)'
                                : '#FFFFFF',
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                <Truck className="h-5 w-5" strokeWidth={2.2} />
                              </span>
                              <p className="mt-3 text-base font-black text-slate-950">Delivery</p>
                              <p className="mt-1 text-sm leading-5 text-slate-500">
                                {supportsDelivery
                                  ? 'Enviamos el pedido a tu ubicacion.'
                                  : 'Este negocio no tiene delivery activo.'}
                              </p>
                            </div>
                            {isDeliveryOrder ? (
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-700 shadow-sm">Activo</span>
                            ) : supportsDelivery ? (
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                                {formatAmountByCurrency(deliveryCostConverted, selectedCurrencyCode)}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </div>

                      {isDeliveryOrder ? (
                        <div className="space-y-3">
                          <button
                            type="button"
                            onClick={() => setIsMapPickerOpen(true)}
                            className="checkout-item-enter w-full rounded-[24px] border bg-white p-4 text-left shadow-sm"
                            style={{
                              animationDelay: '120ms',
                              borderColor: isDeliveryAddressValid ? '#CBD5E1' : '#F43F5E',
                            }}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex min-w-0 gap-3">
                                <span className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                  <MapPin className="h-5 w-5" strokeWidth={2.2} />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Direccion de entrega</p>
                                  <p className={`mt-2 text-sm leading-6 ${normalizedDeliveryAddress ? 'text-slate-900' : 'text-slate-500'}`}>
                                    {normalizedDeliveryAddress || 'Selecciona la direccion exacta en el mapa para continuar'}
                                  </p>
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${hasDeliveryPoint ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                      {hasDeliveryPoint ? 'Punto confirmado' : 'Falta ubicar el punto'}
                                    </span>
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                                      Costo {formatAmountByCurrency(deliveryCostConverted, selectedCurrencyCode)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <span className="shrink-0 text-lg font-black text-slate-300">›</span>
                            </div>
                          </button>

                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="checkout-item-enter block rounded-[24px] border border-slate-200 bg-white p-4" style={{ animationDelay: '160ms' }}>
                              <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                                <MapPin className="h-3.5 w-3.5" strokeWidth={2.4} />
                                Referencia
                              </span>
                              <input
                                type="text"
                                value={deliveryReference}
                                onChange={(event) => setDeliveryReference(event.target.value)}
                                placeholder="Apartamento, porton, piso, torre"
                                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                              />
                              <p className="mt-2 text-[11px] font-medium text-slate-500">Opcional, pero ayuda a ubicarte mas rapido.</p>
                            </label>

                            <div className="checkout-item-enter rounded-[24px] border border-slate-200 bg-white p-4" style={{ animationDelay: '200ms' }}>
                              <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                                <Truck className="h-3.5 w-3.5" strokeWidth={2.4} />
                                Estado
                              </p>
                              <div className="mt-3 space-y-2">
                                <div className={`rounded-2xl px-3 py-2 text-sm font-semibold ${isDeliveryAddressValid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                                  {isDeliveryAddressValid ? 'Direccion valida' : 'Agrega una direccion mas precisa'}
                                </div>
                                <div className={`rounded-2xl px-3 py-2 text-sm font-semibold ${hasDeliveryPoint ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                  {hasDeliveryPoint ? 'Punto en mapa confirmado' : 'Falta marcar el punto en el mapa'}
                                </div>
                              </div>
                            </div>
                          </div>

                          <label className="checkout-item-enter block rounded-[24px] border border-slate-200 bg-white p-4" style={{ animationDelay: '240ms' }}>
                            <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                              <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.4} />
                              Indicaciones para entregar
                            </span>
                            <textarea
                              value={deliveryInstructions}
                              onChange={(event) => setDeliveryInstructions(event.target.value)}
                              placeholder="Ejemplo: tocar timbre, llamar al llegar, dejar en recepcion"
                              rows={3}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                            />
                            <p className="mt-2 text-[11px] font-medium text-slate-500">Opcional.</p>
                          </label>
                        </div>
                      ) : (
                        <div className="checkout-item-enter rounded-[24px] border border-emerald-200 bg-[linear-gradient(180deg,#F0FDF4_0%,#ECFDF5_100%)] p-4" style={{ animationDelay: '120ms' }}>
                          <div className="flex items-start gap-3">
                            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                              <Store className="h-5 w-5" strokeWidth={2.2} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-base font-black text-emerald-900">Retiras en el local</p>
                              <p className="mt-1 text-sm leading-6 text-emerald-800">
                                {comercioAddress || 'Podras retirar directamente en el negocio una vez el pedido este listo.'}
                              </p>
                              <div className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-emerald-700 shadow-sm">
                                Sin costo de entrega
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {checkoutStep === 3 ? (
                    <div className="space-y-3">
                      <p className="checkout-item-enter text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Pago y total final</p>

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
                                className="checkout-item-enter w-full rounded-[22px] border px-4 py-3 text-left shadow-sm"
                                style={{
                                  ...(isSelected
                                    ? {
                                        borderColor: 'color-mix(in srgb, var(--primary-color) 42%, white)',
                                        backgroundColor: 'color-mix(in srgb, var(--primary-color) 10%, white)',
                                      }
                                    : { borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' }),
                                  animationDelay: `${index * 45}ms`,
                                }}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">{paymentMethodLabel(method)}</p>
                                    {details.length > 0 ? (
                                      <p className="mt-1 text-xs text-slate-600">{details.slice(0, 2).join(' · ')}</p>
                                    ) : null}
                                  </div>
                                  <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                    {isSelected ? '✓' : ''}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="checkout-item-enter rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                          Este comercio no tiene metodos de pago configurados.
                        </div>
                      )}

                      {isCashPayment ? (
                        <div className="checkout-item-enter rounded-2xl border border-slate-200 bg-white p-3" style={{ animationDelay: '90ms' }}>
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                              ¿Con cuanto pagaras? (Opcional)
                            </span>
                            <input
                              type="number"
                              min={0}
                              step="100"
                              value={cashPaymentInput}
                              onChange={(event) => setCashPaymentInput(event.target.value)}
                              placeholder="Ejemplo: 100000"
                              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                            />
                          </label>
                          {changeAmount > 0 ? (
                            <p className="mt-2 text-xs font-semibold text-emerald-700">
                              Tu cambio sera de: {formatAmountByCurrency(changeAmount, selectedCurrencyCode)}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {isDigitalPayment ? (
                        <div className="checkout-item-enter space-y-2 rounded-2xl border border-slate-200 bg-white p-3" style={{ animationDelay: '120ms' }}>
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                              Referencia (ultimos 4 digitos)
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={4}
                              value={paymentReferenceLast4}
                              onChange={(event) => setDigitalPaymentReference(normalizePhone(event.target.value).slice(0, 4))}
                              placeholder="1234"
                              className="h-11 w-full rounded-xl border bg-white px-4 text-sm text-slate-900 outline-none"
                              style={{ borderColor: isPaymentReferenceValid || !digitalPaymentReference ? '#CBD5E1' : '#F43F5E' }}
                              required
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
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
                              className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-700"
                            >
                              {paymentProofFile ? `Comprobante: ${paymentProofFile.name}` : 'Seleccionar captura'}
                            </label>
                          </label>
                        </div>
                      ) : null}

                      <div className="checkout-item-enter rounded-2xl border border-slate-200 bg-white px-4 py-3" style={{ animationDelay: '150ms' }}>
                        <p className="flex items-center justify-between text-sm text-slate-700">
                          <span>Subtotal</span>
                          <span className="font-semibold">{formatAmountByCurrency(orderSubtotalConverted, selectedCurrencyCode)}</span>
                        </p>
                        {isDeliveryOrder ? (
                          <p className="mt-1 flex items-center justify-between text-sm text-slate-700">
                            <span>Costo de envio</span>
                            <span className="font-semibold">{formatAmountByCurrency(deliveryCostConverted, selectedCurrencyCode)}</span>
                          </p>
                        ) : null}
                        <p className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold text-slate-900">
                          <span>Total en {selectedCurrencyCode}</span>
                          <span style={titleFontStyle}>{formatAmountByCurrency(orderGrandTotalConverted, selectedCurrencyCode)}</span>
                        </p>
                        {selectedCurrencyCode !== businessBaseCurrency ? (
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            Tasa snapshot usada: {selectedExchangeRate} {selectedCurrencyCode} por 1 {businessBaseCurrency}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                      </div>
                    </div>

                    {checkoutError ? (
                      <div className="mt-4 rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm">
                        {checkoutError}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 bg-white/98 px-4 py-2 backdrop-blur-xl sm:px-6">
                <div className="checkout-panel-enter rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4" style={{ animationDelay: '120ms' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Total</p>
                      <p className="mt-0.5 truncate text-lg font-black tracking-[-0.03em] text-slate-950 sm:text-xl" style={titleFontStyle}>
                        {formatAmountByCurrency(orderGrandTotalConverted, selectedCurrencyCode)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {checkoutItemsCount} unid. · {selectedCurrencyCode}
                      </p>
                    </div>

                    {paymentMethodsByCurrency.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setIsCheckoutFooterExpanded((prev) => !prev)}
                        aria-expanded={isCheckoutFooterExpanded}
                        aria-label={isCheckoutFooterExpanded ? 'Ocultar opciones del checkout' : 'Mostrar opciones del checkout'}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-600"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform duration-300 ${isCheckoutFooterExpanded ? 'rotate-180' : 'rotate-0'}`}
                          strokeWidth={2.4}
                        />
                      </button>
                    ) : null}
                  </div>

                  <div
                    className={`overflow-hidden ${isCheckoutFooterExpanded && paymentMethodsByCurrency.length > 1 ? 'mt-3 opacity-100' : 'hidden opacity-0'}`}
                  >
                    <div className="min-h-0">
                      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Moneda</p>
                        <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {paymentMethodsByCurrency.map((group) => (
                            <button
                              key={`footer-currency-chip-${group.currency}`}
                              type="button"
                              onClick={() => setSelectedCurrency(group.currency)}
                              className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black transition-colors duration-200"
                              style={
                                selectedCurrency === group.currency
                                  ? {
                                      backgroundColor: 'color-mix(in srgb, var(--primary-color) 14%, white)',
                                      color: 'var(--primary-color)',
                                    }
                                  : { backgroundColor: '#F8FAFC', color: '#475569' }
                              }
                            >
                              {group.currency}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 sm:min-w-[300px]">
                    <button
                      type="button"
                      onClick={checkoutStep === 0 ? () => setIsConfirmOpen(false) : goToPreviousStep}
                      disabled={isSubmittingOrder}
                      className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-45"
                    >
                      {checkoutStep === 0 ? 'Seguir viendo' : 'Atras'}
                    </button>

                    {checkoutStep < 3 ? (
                      <button
                        type="button"
                        onClick={goToNextStep}
                        disabled={isSubmittingOrder || !canAdvanceCurrentStep}
                        className="h-11 rounded-2xl px-5 text-sm font-black tracking-[0.01em]"
                        style={
                          isSubmittingOrder || !canAdvanceCurrentStep
                            ? { backgroundColor: '#E2E8F0', color: '#64748B' }
                            : { backgroundColor: 'var(--primary-color)', color: 'var(--text-on-primary)' }
                        }
                      >
                        {nextStepCtaLabels[checkoutStep] ?? 'Siguiente'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void confirmOrder()}
                        disabled={isSubmittingOrder || !canSubmitCheckout}
                        className="h-11 rounded-2xl px-5 text-sm font-black tracking-[0.01em]"
                        style={
                          isSubmittingOrder || !canSubmitCheckout
                            ? { backgroundColor: '#E2E8F0', color: '#64748B' }
                            : { backgroundColor: '#12B886', color: '#FFFFFF', boxShadow: '0 16px 32px rgba(18,184,134,0.28)' }
                        }
                      >
                        {isSubmittingOrder ? 'Guardando pedido...' : 'Confirmar pedido'}
                      </button>
                    )}
                  </div>
                </div>
                {isSubmittingOrder ? (
                  <p className="mt-2 text-center text-xs font-semibold text-slate-500">Estamos guardando tu pedido. No cierres esta ventana.</p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

      </main>
    </>
  );
}
