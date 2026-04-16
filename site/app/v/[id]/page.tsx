// @ts-nocheck
'use client';

import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';
import { ArrowUp, ChevronDown, Info, Menu, MessageCircle, Phone, Share2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type CategoriaRow = {
  id: string;
  nombre: string;
  orden?: number | null;
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
  costo_envio?: number | string | null;
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
};

type MenuData = {
  comercio: ComercioRow;
  categorias: CategoriaRow[];
  productos: ProductoRow[];
  metodosPago: MetodoPagoRow[];
};

type OrderDeliveryMode = 'pickup' | 'delivery';
type DeliveryPoint = { lat: number; lng: number };
type DeliveryPointSelectionSource = 'none' | 'business-default' | 'user';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const publicBaseUrl = 'https://kosmenu.vercel.app';
const checkoutDraftStorageKey = 'elmenuxfa:checkout-customer-v1';
const splashLogoCacheKeyPrefix = 'elmenuxfa:splash-logo:';
const splashNameCacheKeyPrefix = 'elmenuxfa:splash-name:';
const googleMapsJsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';
const preferLeafletMapPicker = false;
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

let googleMapsScriptPromise: Promise<any> | null = null;
let leafletAssetsPromise: Promise<any> | null = null;

function waitForGoogleMapsReady(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }

    const startedAt = Date.now();
    const tick = () => {
      if ((window as any).google?.maps) {
        resolve((window as any).google);
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
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
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
    (window as any)[callbackName] = () => {
      waitForGoogleMapsReady()
        .then((google) => {
          delete (window as any)[callbackName];
          resolve(google);
        })
        .catch((error) => {
          delete (window as any)[callbackName];
          reject(error);
        });
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsJsApiKey)}&libraries=places&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.dataset.kosmenuGoogleMaps = '1';
    script.onerror = (error) => {
      delete (window as any)[callbackName];
      reject(error);
    };
    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
}

function loadLeafletAssets() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if ((window as any).L) return Promise.resolve((window as any).L);
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
      existingScript.addEventListener('load', () => resolve((window as any).L));
      existingScript.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.defer = true;
    script.dataset.kosmenuLeaflet = '1';
    script.onload = () => resolve((window as any).L);
    script.onerror = (error) => reject(error);
    document.head.appendChild(script);
  });

  return leafletAssetsPromise;
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

function formatPhoneInput(digits: string, countryCode: '+58' | '+57' | '+1') {
  const onlyDigits = normalizePhone(digits).slice(0, 10);
  if (!onlyDigits) return '';

  if (countryCode === '+1') {
    const p1 = onlyDigits.slice(0, 3);
    const p2 = onlyDigits.slice(3, 6);
    const p3 = onlyDigits.slice(6, 10);
    if (onlyDigits.length <= 3) return `(${p1}`;
    if (onlyDigits.length <= 6) return `(${p1}) ${p2}`;
    return `(${p1}) ${p2}-${p3}`;
  }

  const p1 = onlyDigits.slice(0, 3);
  const p2 = onlyDigits.slice(3, 6);
  const p3 = onlyDigits.slice(6, 10);
  if (onlyDigits.length <= 3) return p1;
  if (onlyDigits.length <= 6) return `${p1} ${p2}`;
  return `${p1} ${p2} ${p3}`;
}

function formatAmountByCurrency(value: number, currency: string) {
  const safe = Number.isFinite(value) ? value : 0;
  const code = (currency || 'COP').trim().toUpperCase();
  const normalized = code === 'SIN MONEDA' ? 'COP' : code;
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
  const explicit = ((method as any).moneda ?? (method as any).currency ?? (method as any).moneda_codigo ?? '')
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

function parseExchangeRate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const raw = (value ?? '').toString().trim().replace(',', '.');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function paymentMethodExchangeRate(method: MetodoPagoRow) {
  const directRate =
    parseExchangeRate((method as any).exchange_rate) ??
    parseExchangeRate((method as any).tasa_cambio) ??
    parseExchangeRate((method as any).rate);
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

function convertFromCop(amountInCop: number, currency: string, exchangeRate: number) {
  const safeAmount = Number.isFinite(amountInCop) ? amountInCop : 0;
  const normalizedCurrency = normalizeCurrencyCode(currency);
  const safeRate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;
  if (normalizedCurrency === 'COP') return safeAmount;
  return safeAmount / safeRate;
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
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isInfoPanelReady, setIsInfoPanelReady] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientWhatsappCountry, setClientWhatsappCountry] = useState<'+58' | '+57' | '+1'>('+58');
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
  const stickySearchCardRef = useRef<HTMLDivElement | null>(null);
  const mapPickerContainerRef = useRef<HTMLDivElement | null>(null);
  const mapPickerSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mapPickerMapRef = useRef<any>(null);
  const mapPickerMarkerRef = useRef<any>(null);
  const mapPickerGeocoderRef = useRef<any>(null);
  const mapPickerAutocompleteRef = useRef<any>(null);
  const mapPickerResolveAddressRef = useRef<((point: DeliveryPoint) => void) | null>(null);
  const [infoSections, setInfoSections] = useState({
    location: true,
    delivery: true,
    contact: true,
    payments: true,
  });
  const [cachedSplashLogoUrl, setCachedSplashLogoUrl] = useState('');
  const [cachedSplashName, setCachedSplashName] = useState('');

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

    const getStickyCategoryOffset = () => {
      const appBarOffset = 72;
      const stickyHeight = stickySearchCardRef.current?.getBoundingClientRect().height ?? 108;
      return appBarOffset + stickyHeight + 18;
    };

    const getActiveCategoryByViewport = () => {
      let selectedId = filteredCategorias[0].id;
      let minDistance = Number.POSITIVE_INFINITY;
      const stickyOffset = getStickyCategoryOffset();

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
    chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeCategoryId]);

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
  const normalizedClientWhatsappDigits = normalizePhone(clientWhatsapp);
  const normalizedClientWhatsapp = `${clientWhatsappCountry}${normalizedClientWhatsappDigits}`;
  const maskedClientWhatsapp = formatPhoneInput(normalizedClientWhatsappDigits, clientWhatsappCountry);
  const normalizedClientEmail = clientEmail.trim().toLowerCase();
  const isClientNameValid = normalizedClientName.length >= 3;
  const isClientWhatsappValid = normalizedClientWhatsapp.length >= 10;
  const isClientEmailValid = normalizedClientEmail.length === 0 || emailRegex.test(normalizedClientEmail);
  const deliveryCostBase = toNumberOrNull(menuData?.comercio.costo_envio) ?? 0;
  const deliveryCost = isDeliveryOrder ? Math.max(0, deliveryCostBase) : 0;
  const orderSubtotal = cartTotal;
  const orderGrandTotal = orderSubtotal + deliveryCost;
  const paymentMethodsByCurrency = useMemo(() => {
    const grouped = new Map<string, { methods: MetodoPagoRow[]; exchangeRate: number | null }>();
    for (const method of menuData?.metodosPago ?? []) {
      const currency = normalizeCurrencyCode(paymentMethodCurrency(method));
      const entry = grouped.get(currency) ?? { methods: [], exchangeRate: null };
      entry.methods.push(method);
      if (entry.exchangeRate === null) {
        entry.exchangeRate = paymentMethodExchangeRate(method);
      }
      grouped.set(currency, entry);
    }
    return Array.from(grouped.entries()).map(([currency, value]) => ({
      currency,
      methods: value.methods,
      exchangeRate: value.exchangeRate ?? 1,
    }));
  }, [menuData?.metodosPago]);
  const selectedCurrencyGroup =
    paymentMethodsByCurrency.find((group) => group.currency === normalizeCurrencyCode(selectedCurrency)) ?? null;
  const selectedCurrencyCode = normalizeCurrencyCode(selectedCurrency || selectedCurrencyGroup?.currency || 'COP');
  const selectedExchangeRate =
    selectedCurrencyCode === 'COP'
      ? 1
      : Number.isFinite(selectedCurrencyGroup?.exchangeRate)
        ? Math.max(1, Number(selectedCurrencyGroup?.exchangeRate))
        : 1;
  const orderSubtotalConverted = convertFromCop(orderSubtotal, selectedCurrencyCode, selectedExchangeRate);
  const deliveryCostConverted = convertFromCop(deliveryCost, selectedCurrencyCode, selectedExchangeRate);
  const orderGrandTotalConverted = convertFromCop(orderGrandTotal, selectedCurrencyCode, selectedExchangeRate);
  const cartTotalConverted = convertFromCop(cartTotal, selectedCurrencyCode, selectedExchangeRate);
  const checkoutStepTitles = ['Cliente', 'Logistica', 'Pago'];
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
  const canGoNextFromStep1 = isClientNameValid && isClientWhatsappValid && isClientEmailValid;
  const canGoNextFromStep2 = isDeliveryReady;
  const canSubmitStep3 =
    (menuData?.metodosPago.length ?? 0) === 0 ||
    (selectedPaymentMethodId !== null && isPaymentReferenceValid && hasPaymentProof);
  const canSubmitCheckout =
    canGoNextFromStep1 &&
    canGoNextFromStep2 &&
    canSubmitStep3;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(checkoutDraftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        clientName?: string;
        clientWhatsapp?: string;
        clientEmail?: string;
      };

      const savedName = (parsed.clientName ?? '').trim();
      const savedEmail = (parsed.clientEmail ?? '').trim();
      const savedWhatsapp = (parsed.clientWhatsapp ?? '').trim();

      if (savedName) setClientName(savedName);
      if (savedEmail) setClientEmail(savedEmail);

      if (savedWhatsapp) {
        const knownCodes = ['+58', '+57', '+1'];
        const matchedCode = knownCodes.find((code) => savedWhatsapp.startsWith(code));
        if (matchedCode) {
          setClientWhatsappCountry(matchedCode as '+58' | '+57' | '+1');
          setClientWhatsapp(savedWhatsapp.slice(matchedCode.length));
        } else {
          setClientWhatsapp(normalizePhone(savedWhatsapp));
        }
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

    const hasSelected = paymentMethodsByCurrency.some((group) => group.currency === selectedCurrency);
    if (!hasSelected) {
      setSelectedCurrency(paymentMethodsByCurrency[0].currency);
    }
  }, [paymentMethodsByCurrency, selectedCurrency]);

  useEffect(() => {
    if (!isInfoOpen && !isConfirmOpen && !expandedProductImage && !isMapPickerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isInfoOpen, isConfirmOpen, expandedProductImage, isMapPickerOpen]);

  useEffect(() => {
    if (isInfoOpen || isConfirmOpen || expandedProductImage || isMapPickerOpen) {
      setIsQuickActionsOpen(false);
    }
  }, [isInfoOpen, isConfirmOpen, expandedProductImage, isMapPickerOpen]);

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
    if (!isInfoOpen) {
      setIsInfoPanelReady(false);
      return;
    }

    const raf = window.requestAnimationFrame(() => setIsInfoPanelReady(true));
    return () => window.cancelAnimationFrame(raf);
  }, [isInfoOpen]);

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
          geocoder.geocode({ location: point }, (results: any, status: string) => {
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
    setCart((prev) => ({
      ...prev,
      [productId]: (prev[productId] ?? 0) + 1,
    }));
  }

  function decrementProduct(productId: string) {
    setCart((prev) => {
      const current = prev[productId] ?? 0;
      if (current <= 1) {
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

    const appBarOffset = 72;
    const stickyHeight = stickySearchCardRef.current?.getBoundingClientRect().height ?? 108;
    const scrollOffset = appBarOffset + stickyHeight + 18;
    const nextTop = window.scrollY + section.getBoundingClientRect().top - scrollOffset;

    window.scrollTo({
      top: Math.max(0, nextTop),
      behavior: 'smooth',
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
      const storagePath = `${resolvedComercioId}/${orderId}/${Date.now()}-${sanitizedFileName || 'comprobante.jpg'}`;
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

    const subtotalConverted = convertFromCop(orderSubtotal, paymentMeta.currency, paymentMeta.exchangeRate);
    const deliveryConverted = convertFromCop(deliveryCost, paymentMeta.currency, paymentMeta.exchangeRate);
    const totalConverted = convertFromCop(orderGrandTotal, paymentMeta.currency, paymentMeta.exchangeRate);
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
        const fieldMessages = validationDetails.map((detail: any) => {
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
      `Telefono: +${customerWhatsapp}.\n` +
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
    if (checkoutStep === 0 && !canGoNextFromStep1) {
      setCheckoutError('Completa nombre y telefono. Si agregas correo, valida el formato para continuar.');
      return;
    }
    if (checkoutStep === 1 && !canGoNextFromStep2) {
      setCheckoutError('Completa la direccion y el punto en el mapa para continuar con delivery.');
      return;
    }
    setCheckoutError(null);
    setCheckoutStep((prev) => Math.min(2, prev + 1));
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
          <div className="absolute left-1/2 top-[12%] h-72 w-72 -translate-x-1/2 rounded-full bg-[rgba(214,90,31,0.12)] blur-3xl animate-pulse" />
          <div className="absolute left-[10%] top-[30%] h-28 w-28 rounded-full bg-[rgba(255,194,102,0.20)] blur-3xl animate-pulse" />
          <div className="absolute bottom-[14%] right-[14%] h-36 w-36 rounded-full bg-[rgba(15,23,42,0.06)] blur-3xl animate-pulse" />
          <div className="absolute inset-x-10 top-[22%] h-px bg-gradient-to-r from-transparent via-[rgba(214,90,31,0.18)] to-transparent" />
        </div>

        <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <div className="relative flex h-36 w-36 items-center justify-center sm:h-40 sm:w-40">
            <div className="absolute inset-0 rounded-full border border-[rgba(214,90,31,0.16)] animate-[spin_8s_linear_infinite]" />
            <div className="absolute inset-[10px] rounded-full border border-dashed border-[rgba(15,23,42,0.12)] animate-[spin_14s_linear_infinite_reverse]" />
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
            <span className="h-2 w-2 rounded-full bg-[#D65A1F] animate-bounce" />
            <span className="h-2 w-2 rounded-full bg-[#F59E0B] animate-bounce [animation-delay:140ms]" />
            <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:280ms]" />
          </div>

          <div className="mt-6 h-[3px] w-40 overflow-hidden rounded-full bg-slate-200/80">
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-[#D65A1F] via-[#FF9A54] to-[#FFD089] animate-[pulse_1.1s_ease-in-out_infinite]" />
          </div>
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
      {googleFontsUrl ? (
        <Head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={googleFontsUrl} />
        </Head>
      ) : null}
      <main
        className="min-h-screen text-slate-900"
        style={{
          ...containerStyle,
          background: pageBackgroundByPreset(rubroPreset.id),
        }}
      >
        <section className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              {comercioLogoUrl ? (
                <img
                  src={comercioLogoUrl}
                  alt={`Logo de ${comercioNombre}`}
                  className="h-8 w-8 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black text-white"
                  style={{ backgroundColor: 'var(--primary-color)' }}
                >
                  {comercioInitialLetter}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-lg font-black tracking-[-0.01em] text-slate-900 md:text-xl" style={titleFontStyle}>
                  {comercioNombre}
                </h1>
                <p className="truncate text-[11px] font-semibold text-slate-500">@{resolvedSlug}</p>
              </div>
            </div>
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsQuickActionsOpen((prev) => !prev)}
                aria-expanded={isQuickActionsOpen}
                aria-label="Abrir menu de acciones"
                className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-black uppercase tracking-[0.08em] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                style={{
                  borderColor: 'color-mix(in srgb, var(--primary-color) 28%, white)',
                  backgroundColor: 'var(--primary-color)',
                  color: 'var(--text-on-primary)',
                }}
              >
                <Menu className="h-4 w-4" strokeWidth={2.5} />
                <span className="hidden sm:inline">Menu</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isQuickActionsOpen ? 'rotate-180' : ''}`} strokeWidth={2.4} />
              </button>

              {isQuickActionsOpen ? (
                <div className="absolute right-0 top-[calc(100%+10px)] z-[72] w-[min(84vw,280px)] rounded-[24px] border border-white/70 bg-white/96 p-3 shadow-[0_22px_55px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                  <div className="rounded-[20px] border border-slate-200 bg-white p-2.5">
                    <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Acciones</p>
                    <div className="mt-2 space-y-2">
                      {callNumber ? (
                        <a
                          href={`tel:+${callNumber}`}
                          onClick={() => setIsQuickActionsOpen(false)}
                          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                        >
                          <span className="flex items-center gap-2">
                            <Phone className="h-4 w-4" strokeWidth={2.2} />
                            Llamar
                          </span>
                        </a>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => {
                          setIsQuickActionsOpen(false);
                          void shareMenu();
                        }}
                        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                      >
                        <span className="flex items-center gap-2">
                          <Share2 className="h-4 w-4" strokeWidth={2.2} />
                          Compartir
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsQuickActionsOpen(false);
                          setIsInfoOpen(true);
                        }}
                        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                      >
                        <span className="flex items-center gap-2">
                          <Info className="h-4 w-4" strokeWidth={2.2} />
                          Informacion
                        </span>
                      </button>
                    </div>

                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Divisa</p>
                      <select
                        value={selectedCurrencyCode}
                        onChange={(event) => setSelectedCurrency(normalizeCurrencyCode(event.target.value))}
                        className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-[0.08em] text-slate-700 outline-none"
                      >
                        {(paymentMethodsByCurrency.length > 0
                          ? paymentMethodsByCurrency.map((group) => group.currency)
                          : ['COP']
                        ).map((currency) => (
                          <option key={`appbar-currency-${currency}`} value={currency}>
                            {currency}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {shareMessage ? (
          <div className="fixed left-1/2 top-16 z-[70] -translate-x-1/2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
            {shareMessage}
          </div>
        ) : null}

        <section className="mx-auto mt-4 max-w-6xl px-4 sm:mt-5 sm:px-6">
          <div className="relative overflow-hidden rounded-[28px] border border-slate-200/90 bg-[color:color-mix(in_srgb,var(--card-surface)_97%,white)] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] sm:p-5">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1" style={{ backgroundColor: 'var(--primary-color)' }} />
            {comercioLogoUrl ? (
              <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-10">
                <img
                  src={comercioLogoUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute right-[-2rem] top-1/2 h-[120%] w-auto -translate-y-1/2 object-contain blur-3xl md:right-0"
                />
              </div>
            ) : null}

            <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0 flex-1 rounded-[22px] border border-slate-200/90 bg-white/92 px-4 py-4 backdrop-blur-sm sm:px-5">
                <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                  <div className="shrink-0">
                    {comercioLogoUrl ? (
                      <img
                        src={comercioLogoUrl}
                        alt={`Logo de ${comercioNombre}`}
                        className="h-12 w-12 rounded-[14px] border border-slate-200 bg-white object-cover shadow-sm sm:h-14 sm:w-14"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div
                        className="grid h-12 w-12 place-items-center rounded-[14px] text-base font-black text-white shadow-sm sm:h-14 sm:w-14 sm:text-lg"
                        style={{ backgroundColor: 'var(--primary-color)' }}
                      >
                        {comercioInitialLetter}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2
                        className="max-w-full overflow-hidden text-2xl font-black leading-[0.95] tracking-[-0.04em] text-slate-950 sm:text-4xl md:text-5xl"
                      style={{
                        ...titleFontStyle,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {comercioNombre}
                    </h2>

                    {menuData.comercio.descripcion?.trim() ? (
                      <p
                        className="mt-2 max-w-2xl text-sm font-medium leading-5 text-slate-600 sm:text-[15px] sm:leading-6"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {menuData.comercio.descripcion.trim()}
                      </p>
                    ) : null}

                    {comercioAddress ? (
                      <p
                        className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-500"
                        style={{
                          overflowWrap: 'anywhere',
                        }}
                        title={comercioAddress}
                      >
                        {comercioAddress}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:w-[180px] md:shrink-0">
                <div className="rounded-[20px] border border-slate-200/90 bg-white/92 px-4 py-3 text-center backdrop-blur-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 sm:text-[11px]">Categorias</p>
                  <p className="mt-1 text-2xl font-black tracking-[-0.03em] text-slate-950 sm:text-3xl">{filteredCategorias.length}</p>
                </div>
                <div className="rounded-[20px] border border-slate-200/90 bg-white/92 px-4 py-3 text-center backdrop-blur-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 sm:text-[11px]">Productos</p>
                  <p className="mt-1 text-2xl font-black tracking-[-0.03em] text-slate-950 sm:text-3xl">{categoriasConProductos.reduce((sum, categoria) => sum + categoria.productos.length, 0)}</p>
                </div>
              </div>
            </div>
          </div>

          <div
            ref={stickySearchCardRef}
            className="sticky top-[4.55rem] z-30 mt-4 overflow-visible rounded-[28px] border border-white/70 bg-white/90 p-3 shadow-[0_20px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl transition-shadow duration-300 md:p-4 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]"
          >
            <div className="pointer-events-none absolute inset-x-5 -bottom-4 h-8 rounded-full bg-gradient-to-b from-slate-900/12 via-slate-900/6 to-transparent blur-md" />
            <div className="rounded-[22px] border border-slate-200/90 bg-[color:color-mix(in_srgb,var(--card-surface)_95%,white)] p-3 sm:p-4">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar producto o categoria"
                  className="h-12 w-full rounded-2xl border border-slate-200/90 bg-white pl-11 pr-16 text-sm font-semibold text-slate-900 outline-none transition duration-200 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
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
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500 hover:bg-slate-200"
                  >
                    Limpiar
                  </button>
                ) : null}
              </div>

              <div className="mt-3 overflow-x-auto pb-1">
                <div className="flex w-max items-center gap-2">
                  {filteredCategorias.map((categoria) => (
                    <button
                      type="button"
                      key={categoria.id}
                      ref={(element) => {
                        categoryChipRefs.current[categoria.id] = element;
                      }}
                      onClick={() => scrollToCategory(categoria.id)}
                      className={`rounded-full px-4 py-2 text-xs font-extrabold transition-all duration-200 ${
                        activeCategoryId === categoria.id
                          ? 'border border-slate-900 bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)]'
                          : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm'
                      }`}
                    >
                      {categoria.nombre}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {showScrollTopButton ? (
            <div className={`fixed right-4 z-[80] ${cartCount > 0 ? 'bottom-24 sm:bottom-28' : 'bottom-6 sm:bottom-8'}`}>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                aria-label="Volver arriba"
                className="flex h-12 w-12 items-center justify-center rounded-full shadow-[0_18px_38px_rgba(15,23,42,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_44px_rgba(15,23,42,0.28)]"
                style={{ backgroundColor: 'var(--primary-color)', color: 'var(--text-on-primary)' }}
              >
                <ArrowUp className="h-5 w-5" strokeWidth={2.6} />
              </button>
            </div>
          ) : null}

          <div className="mt-5 pb-40">
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
                {filteredCategorias.map((categoria) => (
                  <section key={categoria.id} id={`categoria-${categoria.id}`} className="scroll-mt-[12rem]">
                    <div className="mb-4 flex items-end justify-between gap-3">
                      <h2 className="text-2xl font-black tracking-[-0.02em] md:text-[2rem]" style={{ ...titleFontStyle, color: 'var(--secondary-color)' }}>
                        {categoria.nombre}
                      </h2>
                      <span className="rounded-full border border-slate-200 bg-white/75 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                        {categoria.productos.length} item{categoria.productos.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="space-y-4">
                      {categoria.productos.map((producto) => {
                        const quantity = cart[producto.id] ?? 0;
                        const convertedPrice = formatAmountByCurrency(
                          convertFromCop(producto.precio ?? 0, selectedCurrencyCode, selectedExchangeRate),
                          selectedCurrencyCode,
                        );

                        return (
                          <article
                            key={producto.id}
                            className="overflow-hidden rounded-[28px] border bg-[color:color-mix(in_srgb,var(--card-surface)_94%,white)] shadow-[0_18px_38px_rgba(15,23,42,0.07)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_55px_rgba(15,23,42,0.10)]"
                            style={{ borderColor: 'color-mix(in srgb, var(--primary-color) 12%, white)' }}
                          >
                            <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
                              <div className="min-w-0 flex-1 py-0.5">
                                <h3
                                  className="text-lg font-extrabold leading-6 text-slate-900 sm:text-[22px]"
                                  style={{
                                    ...titleFontStyle,
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {producto.nombre}
                                </h3>

                                <p
                                  className="mt-2 text-sm leading-6 text-slate-600 sm:max-w-[38rem]"
                                  style={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                  }}
                                >
                                  {producto.descripcion?.trim() || 'Preparacion recomendada por la casa.'}
                                </p>

                                <div className="mt-4">
                                  <p className="text-2xl font-black tracking-[-0.03em]" style={{ ...titleFontStyle, color: 'var(--primary-color)' }}>
                                    {convertedPrice}
                                  </p>
                                  {selectedCurrencyCode !== 'COP' ? (
                                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                                      Base {formatAmountByCurrency(producto.precio ?? 0, 'COP')}
                                    </p>
                                  ) : null}
                                </div>

                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                  {quantity === 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => incrementProduct(producto.id)}
                                      className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black shadow-[0_16px_28px_rgba(15,23,42,0.14)] transition-all duration-200 hover:translate-y-[-1px] hover:shadow-[0_20px_34px_rgba(15,23,42,0.18)]"
                                      style={{
                                        borderRadius: '18px',
                                        backgroundColor: 'var(--primary-color)',
                                        color: 'var(--text-on-primary)',
                                      }}
                                    >
                                      <span className="grid h-5 w-5 place-items-center rounded-full bg-white/16 text-base leading-none">+</span>
                                      Agregar
                                    </button>
                                  ) : (
                                    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
                                      <button
                                        type="button"
                                        onClick={() => decrementProduct(producto.id)}
                                        className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-700"
                                      >
                                        -
                                      </button>
                                      <span className="min-w-8 text-center text-sm font-black text-slate-900">{quantity}</span>
                                      <button
                                        type="button"
                                        onClick={() => incrementProduct(producto.id)}
                                        className="grid h-9 w-9 place-items-center rounded-xl text-lg font-black"
                                        style={{ backgroundColor: 'var(--primary-color)', color: 'var(--text-on-primary)' }}
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}

                                  {quantity > 0 ? (
                                    <span className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-white">
                                      {quantity} en tu pedido
                                    </span>
                                  ) : null}
                                </div>
                              </div>

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
                                  className="h-24 w-24 shrink-0 overflow-hidden rounded-[20px] bg-slate-100 shadow-[0_14px_26px_rgba(15,23,42,0.14)] transition-transform duration-300 hover:scale-[1.02] sm:h-[118px] sm:w-[118px] sm:rounded-[22px]"
                                  aria-label={`Ver imagen grande de ${producto.nombre}`}
                                >
                                  <img
                                    src={safeImageSrc(producto.imagen_url, comercioLogoUrl)}
                                    alt={producto.nombre}
                                    className="h-full w-full object-cover"
                                    onError={(event) => {
                                      const img = event.currentTarget;
                                      if (img.src !== defaultProductImage) {
                                        img.onerror = null;
                                        img.src = defaultProductImage;
                                      }
                                    }}
                                  />
                                </button>
                              ) : null}
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
          <section className="fixed inset-x-0 bottom-0 z-50 px-4 py-4">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <div className="flex-1 rounded-[26px] border border-white/70 bg-white/92 px-4 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:px-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  {cartCount} producto{cartCount === 1 ? '' : 's'}
                </p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-2xl font-black tracking-[-0.03em] text-slate-900" style={titleFontStyle}>
                    {formatAmountByCurrency(cartTotalConverted, selectedCurrencyCode)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutError(null);
                      setCheckoutStep(0);
                      setIsConfirmOpen(true);
                    }}
                    disabled={isSubmittingOrder}
                    className="rounded-2xl px-5 py-3 text-sm font-black uppercase tracking-[0.08em] shadow-[0_16px_32px_rgba(15,23,42,0.18)]"
                    style={
                      isSubmittingOrder
                        ? { backgroundColor: '#E2E8F0', color: '#64748B' }
                        : {
                            borderRadius: '18px',
                            backgroundColor: 'var(--primary-color)',
                            color: 'var(--text-on-primary)',
                          }
                    }
                  >
                    {isSubmittingOrder ? 'Procesando...' : 'Ver pedido'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {expandedProductImage ? (
          <section
            className="fixed inset-0 z-[57] bg-black/85 p-4"
            onClick={() => setExpandedProductImage(null)}
          >
            <div className="mx-auto flex h-full max-w-5xl items-center justify-center">
              <div
                className="w-full max-w-4xl"
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
                className="absolute right-5 top-5 rounded-full border border-white/30 bg-black/40 px-3 py-1 text-xs font-semibold text-white"
              >
                Cerrar
              </button>
            </div>
          </section>
        ) : null}

        {isInfoOpen ? (
          <section className="fixed inset-0 z-[58] bg-white">
            <div
              className="mx-auto h-full max-w-3xl bg-white"
              style={{
                opacity: isInfoPanelReady ? 1 : 0,
                transform: isInfoPanelReady ? 'translateX(0)' : 'translateX(18px)',
                transition: 'opacity 220ms ease, transform 220ms ease',
              }}
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
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
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
                              <div className="mt-1 space-y-1.5">
                                {group.methods.map((method) => (
                                  <div key={`info-${method.id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                    <p className="text-sm font-bold text-slate-800">{paymentMethodLabel(method)}</p>
                                    <div className="mt-1 space-y-1 text-xs text-slate-600">
                                      {(method as any).nota || method.descripcion ? (
                                        <p>Nota: {(method as any).nota ?? method.descripcion}</p>
                                      ) : null}
                                      {(method as any).moneda || (method as any).currency ? (
                                        <p>Moneda: {(method as any).moneda ?? (method as any).currency}</p>
                                      ) : null}
                                      {(method as any).tasa_cambio || (method as any).exchange_rate ? (
                                        <p>Tasa de cambio: {(method as any).tasa_cambio ?? (method as any).exchange_rate}</p>
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
          <section className="fixed inset-0 z-[61] bg-white">
            <div className="mx-auto flex h-full max-w-2xl flex-col bg-white">
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
                      geocoder.geocode({ address: query }, (results: any, status: string) => {
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
                      geocoder.geocode({ address: query }, (results: any, status: string) => {
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
                    className={`-mt-6 text-4xl leading-none transition-all duration-200 ease-out ${
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
          <section className="fixed inset-0 z-[60] bg-white">
            <div className="mx-auto h-full max-w-2xl bg-white">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Checkout</p>
                  <h3 className="text-xl font-black text-slate-900" style={titleFontStyle}>Confirmar pedido</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfirmOpen(false)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                >
                  Cerrar
                </button>
              </div>

              <div className="h-[calc(100%-132px)] overflow-hidden px-4 py-4 sm:px-6">
                <div className="grid grid-cols-3 gap-2">
                  {checkoutStepTitles.map((title, index) => {
                    const state = checkoutStep === index ? 'active' : checkoutStep > index ? 'done' : 'pending';
                    return (
                      <div
                        key={`checkout-step-${title}`}
                        className="rounded-2xl border px-3 py-2"
                        style={
                          state === 'active'
                            ? {
                                borderColor: 'color-mix(in srgb, var(--primary-color) 40%, white)',
                                backgroundColor: 'color-mix(in srgb, var(--primary-color) 12%, white)',
                              }
                            : state === 'done'
                              ? { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' }
                              : { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }
                        }
                      >
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Paso {index + 1}</p>
                        <p className="mt-0.5 text-sm font-bold text-slate-900">{title}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 h-[calc(100%-164px)] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {checkoutStep === 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Datos del cliente</p>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Nombre completo
                        </span>
                        <input
                          type="text"
                          value={clientName}
                          onChange={(event) => setClientName(event.target.value)}
                          placeholder="Ejemplo: Maria Fernanda Lopez"
                          className="h-12 w-full rounded-xl border bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                          style={{
                            borderColor: isClientNameValid || clientName.trim().length === 0 ? '#CBD5E1' : '#F43F5E',
                          }}
                          required
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Telefono WhatsApp
                        </span>
                        <div
                          className="flex h-12 overflow-hidden rounded-xl border bg-white"
                          style={{
                            borderColor:
                              isClientWhatsappValid || clientWhatsapp.trim().length === 0 ? '#CBD5E1' : '#F43F5E',
                          }}
                        >
                          <select
                            value={clientWhatsappCountry}
                            onChange={(event) => setClientWhatsappCountry(event.target.value as '+58' | '+57' | '+1')}
                            className="w-28 border-r border-slate-200 bg-slate-50 px-2 text-sm font-semibold text-slate-800 outline-none"
                            aria-label="Codigo de pais"
                          >
                            <option value="+58">🇻🇪 VE +58</option>
                            <option value="+57">🇨🇴 CO +57</option>
                            <option value="+1">🇺🇸 US +1</option>
                          </select>
                          <input
                            type="tel"
                            inputMode="numeric"
                            value={maskedClientWhatsapp}
                            onChange={(event) => setClientWhatsapp(normalizePhone(event.target.value).slice(0, 10))}
                            placeholder={clientWhatsappCountry === '+1' ? '(305) 555-1212' : '412 123 4567'}
                            className="h-full w-full px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                            required
                          />
                        </div>
                        <p className="mt-1 text-[11px] font-medium text-slate-500">
                          Numero final: {normalizedClientWhatsapp || 'Sin completar'}
                        </p>
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Correo del cliente (opcional)
                        </span>
                        <input
                          id="client-email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder="tucorreo@ejemplo.com"
                          value={clientEmail}
                          onChange={(event) => setClientEmail(event.target.value)}
                          className="h-12 w-full rounded-xl border bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                          style={{
                            borderColor: isClientEmailValid || clientEmail.trim().length === 0 ? '#CBD5E1' : '#F43F5E',
                          }}
                        />
                        {clientEmail.trim().length > 0 && !isClientEmailValid ? (
                          <p className="mt-1 text-[11px] font-medium text-rose-500">Ingresa un correo valido o deja el campo vacio.</p>
                        ) : null}
                      </label>
                    </div>
                  ) : null}

                  {checkoutStep === 1 ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Logistica y entrega</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDeliveryMode('pickup')}
                          className="rounded-full px-3 py-1.5 text-xs font-bold"
                          style={
                            deliveryMode === 'pickup'
                              ? {
                                  backgroundColor: 'color-mix(in srgb, var(--primary-color) 14%, white)',
                                  color: 'var(--primary-color)',
                                }
                              : { backgroundColor: '#E2E8F0', color: '#334155' }
                          }
                        >
                          Retiro
                        </button>
                        <button
                          type="button"
                          disabled={!supportsDelivery}
                          onClick={() => setDeliveryMode('delivery')}
                          className="rounded-full px-3 py-1.5 text-xs font-bold"
                          style={
                            !supportsDelivery
                              ? { backgroundColor: '#E2E8F0', color: '#94A3B8' }
                              : deliveryMode === 'delivery'
                                ? {
                                    backgroundColor: 'color-mix(in srgb, var(--primary-color) 14%, white)',
                                    color: 'var(--primary-color)',
                                  }
                                : { backgroundColor: '#E2E8F0', color: '#334155' }
                          }
                        >
                          Delivery
                        </button>
                      </div>

                      {isDeliveryOrder ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setIsMapPickerOpen(true)}
                            className="flex h-11 w-full items-center justify-between rounded-xl border bg-white px-3 text-left text-sm text-slate-900 outline-none"
                            style={{ borderColor: isDeliveryAddressValid ? '#CBD5E1' : '#F43F5E' }}
                          >
                            <span className={`${normalizedDeliveryAddress ? 'text-slate-900' : 'text-slate-500'}`}>
                              {normalizedDeliveryAddress || 'Direccion de entrega'}
                            </span>
                            <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-600">Mapa</span>
                          </button>
                          <input
                            type="text"
                            value={deliveryReference}
                            onChange={(event) => setDeliveryReference(event.target.value)}
                            placeholder="Referencia (opcional)"
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none"
                          />
                          <textarea
                            value={deliveryInstructions}
                            onChange={(event) => setDeliveryInstructions(event.target.value)}
                            placeholder="Indicaciones para entregar (opcional)"
                            rows={2}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                          />
                          {(!isDeliveryAddressValid || !hasDeliveryPoint) ? (
                            <p className="text-xs font-semibold text-rose-500">Ingresa direccion valida y selecciona el punto en el mapa.</p>
                          ) : (
                            <p className="text-xs font-semibold text-emerald-700">Direccion y punto de mapa validados.</p>
                          )}
                        </>
                      ) : (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                          Pedido para retiro en el local.
                        </div>
                      )}
                    </div>
                  ) : null}

                  {checkoutStep === 2 ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Pago y total final</p>

                      {paymentMethodsByCurrency.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {paymentMethodsByCurrency.map((group) => (
                            <button
                              key={`currency-chip-${group.currency}`}
                              type="button"
                              onClick={() => setSelectedCurrency(group.currency)}
                              className="rounded-full px-3 py-1.5 text-xs font-bold"
                              style={
                                selectedCurrency === group.currency
                                  ? {
                                      backgroundColor: 'color-mix(in srgb, var(--primary-color) 14%, white)',
                                      color: 'var(--primary-color)',
                                    }
                                  : { backgroundColor: '#E2E8F0', color: '#334155' }
                              }
                            >
                              {group.currency}
                              {group.currency !== 'COP' && group.exchangeRate > 1 ? ` (1 ${group.currency} = ${group.exchangeRate} COP)` : ''}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {selectedCurrencyGroup?.methods.length ? (
                        <div className="space-y-2">
                          {selectedCurrencyGroup.methods.map((method) => {
                            const isSelected = selectedPaymentMethodId === method.id;
                            const details = paymentMethodDetails(method);
                            return (
                              <button
                                key={method.id}
                                type="button"
                                onClick={() => setSelectedPaymentMethodId(method.id)}
                                className="w-full rounded-2xl border p-3 text-left"
                                style={
                                  isSelected
                                    ? {
                                        borderColor: 'color-mix(in srgb, var(--primary-color) 42%, white)',
                                        backgroundColor: 'color-mix(in srgb, var(--primary-color) 10%, white)',
                                      }
                                    : { borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' }
                                }
                              >
                                <p className="text-sm font-bold text-slate-900">{paymentMethodLabel(method)}</p>
                                {details.length > 0 ? (
                                  <p className="mt-1 text-xs text-slate-600">{details.slice(0, 2).join(' · ')}</p>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                          Este comercio no tiene metodos de pago configurados.
                        </div>
                      )}

                      {isCashPayment ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
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
                        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
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

                      <div>
                        <label htmlFor="order-notes" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Notas del pedido
                        </label>
                        <textarea
                          id="order-notes"
                          value={orderNotes}
                          onChange={(event) => setOrderNotes(event.target.value)}
                          placeholder="Ejemplo: sin cebolla, tocar timbre"
                          rows={2}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none"
                        />
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
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
                        {selectedCurrencyCode !== 'COP' ? (
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            Tasa snapshot usada: {selectedExchangeRate} COP por 1 {selectedCurrencyCode}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                {checkoutError ? (
                  <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {checkoutError}
                  </div>
                ) : null}
              </div>

              <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goToPreviousStep}
                    disabled={checkoutStep === 0 || isSubmittingOrder}
                    className="h-11 min-w-28 rounded-full border border-slate-300 px-4 text-sm font-bold text-slate-700 disabled:opacity-45"
                  >
                    Anterior
                  </button>

                  {checkoutStep < 2 ? (
                    <button
                      type="button"
                      onClick={goToNextStep}
                      disabled={isSubmittingOrder}
                      className="h-11 flex-1 rounded-full px-5 text-sm font-black uppercase tracking-[0.08em]"
                      style={{ backgroundColor: 'var(--primary-color)', color: 'var(--text-on-primary)' }}
                    >
                      Siguiente
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void confirmOrder()}
                      disabled={isSubmittingOrder || !canSubmitCheckout}
                      className="h-11 flex-1 rounded-full px-5 text-sm font-black uppercase tracking-[0.08em]"
                      style={
                        isSubmittingOrder || !canSubmitCheckout
                          ? { backgroundColor: '#E2E8F0', color: '#64748B' }
                          : { backgroundColor: '#FF7A00', color: '#FFFFFF' }
                      }
                    >
                      {isSubmittingOrder ? 'Guardando pedido...' : 'Confirmar pedido'}
                    </button>
                  )}
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
