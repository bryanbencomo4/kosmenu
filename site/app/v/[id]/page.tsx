// @ts-nocheck
'use client';

import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const publicBaseUrl = 'https://kosmenu.vercel.app';
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
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return uuidRegex.test(value);
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
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

function orderIdFrom(comercioId: string) {
  const safeComercioId = comercioId.trim() || 'kosmenu';
  return `${safeComercioId}-${Date.now()}`;
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
  const parsed = Number((value ?? '').toString().trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export default function PublicMenuPage() {
  const params = useParams<{ id: string }>();
  const commerceIdentifier = (params?.id ?? '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isInfoPanelReady, setIsInfoPanelReady] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [expandedProductImage, setExpandedProductImage] = useState<{
    src: string;
    alt: string;
    title: string;
    description: string;
  } | null>(null);
  const categoryChipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [infoSections, setInfoSections] = useState({
    location: true,
    delivery: true,
    contact: true,
    payments: true,
  });

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

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false },
          global: {
            fetch: (input, init) =>
              fetch(input, {
                ...init,
                cache: 'no-store',
              }),
          },
        });

        const comercioQuery = supabase.from('comercios').select('*').limit(1);
        const { data: comercios, error: comercioError } = isUuid(commerceIdentifier)
          ? await comercioQuery.eq('id', commerceIdentifier).returns<ComercioRow[]>()
          : await comercioQuery.eq('slug', commerceIdentifier).returns<ComercioRow[]>();

        if (comercioError) throw new Error(comercioError.message);

        const comercio = (comercios ?? [])[0] ?? null;
        if (!comercio) {
          throw new Error('No se encontro el comercio para esta URL.');
        }

        const resolvedComercioId = comercio.id;

        const [categoriasResult, productosResult, metodosPagoResult] = await Promise.all([
          supabase
            .from('categorias')
            .select('*')
            .eq('comercio_id', resolvedComercioId)
            .order('orden', { ascending: true })
            .returns<CategoriaRow[]>(),
          supabase
            .from('productos')
            .select('*')
            .eq('comercio_id', resolvedComercioId)
            .order('nombre', { ascending: true })
            .returns<ProductoRow[]>(),
          supabase
            .from('metodos_pago')
            .select('*')
            .eq('comercio_id', resolvedComercioId)
            .returns<MetodoPagoRow[]>(),
        ]);

        if (categoriasResult.error) throw new Error(categoriasResult.error.message);
        if (productosResult.error) throw new Error(productosResult.error.message);
        if (metodosPagoResult.error) throw new Error(metodosPagoResult.error.message);

        const productos = (productosResult.data ?? []).filter((producto) => {
          if (typeof producto.disponible === 'boolean') return producto.disponible;
          return true;
        });

        if (!cancelled) {
          setMenuData({
            comercio,
            categorias: categoriasResult.data ?? [],
            productos,
            metodosPago: metodosPagoResult.data ?? [],
          });
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

    const getActiveCategoryByViewport = () => {
      let selectedId = filteredCategorias[0].id;
      let minDistance = Number.POSITIVE_INFINITY;

      for (const categoria of filteredCategorias) {
        const section = document.getElementById(`categoria-${categoria.id}`);
        if (!section) continue;
        const distance = Math.abs(section.getBoundingClientRect().top - 188);
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

  const comercioNombre = (menuData?.comercio.nombre ?? 'elmenuxfa.com').trim();
  const comercioLogoUrl = (menuData?.comercio.logo_url ?? '').trim();
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
  const canOrderViaWhatsapp = receivesOrdersOnWhatsapp && whatsappNumber.length > 0;
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
  const normalizedClientEmail = clientEmail.trim().toLowerCase();
  const isClientEmailValid = emailRegex.test(normalizedClientEmail);

  const paymentMethodsByCurrency = useMemo(() => {
    const grouped = new Map<string, MetodoPagoRow[]>();
    for (const method of menuData?.metodosPago ?? []) {
      const currency = paymentMethodCurrency(method);
      const list = grouped.get(currency) ?? [];
      list.push(method);
      grouped.set(currency, list);
    }
    return Array.from(grouped.entries()).map(([currency, methods]) => ({ currency, methods }));
  }, [menuData?.metodosPago]);

  useEffect(() => {
    if (!isInfoOpen && !isConfirmOpen && !expandedProductImage) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isInfoOpen, isConfirmOpen, expandedProductImage]);

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
    if (selectedPaymentMethodId) return;

    if (menuData.metodosPago.length > 0) {
      setSelectedPaymentMethodId(menuData.metodosPago[0].id);
    }
  }, [menuData, selectedPaymentMethodId]);

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
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function toggleInfoSection(section: 'location' | 'delivery' | 'contact' | 'payments') {
    setInfoSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }

  async function persistOrderOptional(orderId: string, email: string, paymentMethod: MetodoPagoRow | null) {
    if (!supabaseUrl || !supabaseAnonKey) return;

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      });

      const detalles = {
        order_id: orderId,
        cliente_email: email,
        metodo_pago: paymentMethod
          ? {
              id: paymentMethod.id,
              nombre: paymentMethodLabel(paymentMethod),
              datos: paymentMethodDetails(paymentMethod),
            }
          : null,
        items: cartItems.map((item) => ({
          product_id: item.product.id,
          nombre: item.product.nombre,
          cantidad: item.quantity,
          precio: item.product.precio ?? 0,
        })),
        total: cartTotal,
      };

      const payload = {
        comercio_id: resolvedComercioId,
        estado: 'pendiente',
        total: cartTotal,
        detalles,
        cliente_email: email,
      };

      let { error: insertError } = await supabase.from('pedidos').insert(payload);

      if (insertError?.message?.toLowerCase().includes('cliente_email')) {
        const fallbackPayload = {
          comercio_id: resolvedComercioId,
          estado: 'pendiente',
          total: cartTotal,
          detalles,
        };
        const fallbackResult = await supabase.from('pedidos').insert(fallbackPayload);
        insertError = fallbackResult.error;
      }

      if (insertError) {
        console.warn('No se pudo guardar pedido en Supabase (opcional):', insertError.message);
      }
    } catch (persistError) {
      console.warn('Persistencia opcional de pedido fallo:', persistError);
    }
  }

  async function confirmOrder() {
    if (!canOrderViaWhatsapp || cartItems.length === 0 || isSubmittingOrder || !isClientEmailValid) return;

    const selectedMethod = selectedPaymentMethod();

    setIsSubmittingOrder(true);
    try {
      const orderId = orderIdFrom(resolvedComercioId);
      await persistOrderOptional(orderId, normalizedClientEmail, selectedMethod);

      const orderUrl = `${publicBaseUrl}/orders/${encodeURIComponent(orderId)}`;
      const paymentLabel = selectedMethod ? paymentMethodLabel(selectedMethod) : 'No especificado';
      const message =
        `Hola, quiero hacer este pedido.\n` +
        `Metodo de pago: ${paymentLabel}.\n` +
        `Correo del cliente: ${normalizedClientEmail}.\n` +
        `Adjunto el comprobante en este chat.\n` +
        `Detalle del pedido: ${orderUrl}`;
      const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

      try {
        await fetch('/api/send-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clientEmail: normalizedClientEmail,
            comercioNombre,
            orderId,
            orderTrackingUrl: orderUrl,
          }),
        });
      } catch (sendEmailError) {
        console.warn('No se pudo enviar email de respaldo:', sendEmailError);
      }

      window.open(waUrl, '_blank', 'noopener,noreferrer');
      setCart({});
      setClientEmail('');
      setIsConfirmOpen(false);
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-50">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-slate-500 border-t-white" />
          <p className="mt-4 text-sm tracking-[0.14em] text-slate-300">CARGANDO MENU PUBLICO</p>
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void shareMenu()}
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-300 bg-white text-slate-600"
                aria-label="Compartir menu"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="5" r="2.5" />
                  <circle cx="6" cy="12" r="2.5" />
                  <circle cx="18" cy="19" r="2.5" />
                  <path d="M8.2 11l7.6-4.2M8.2 13l7.6 4.2" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setIsInfoOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-300 bg-white text-slate-600"
                aria-label="Informacion del negocio"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 10v6" />
                  <circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {shareMessage ? (
          <div className="fixed left-1/2 top-16 z-[70] -translate-x-1/2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
            {shareMessage}
          </div>
        ) : null}

        <section className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
          <div className="sticky top-14 z-30 space-y-2 rounded-2xl border border-slate-200/90 bg-white/95 p-2 shadow-sm backdrop-blur-md md:p-3">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100"
                >
                  Limpiar
                </button>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <div className="flex w-max items-center gap-2">
                {filteredCategorias.map((categoria) => (
                  <button
                    type="button"
                    key={categoria.id}
                    ref={(element) => {
                      categoryChipRefs.current[categoria.id] = element;
                    }}
                    onClick={() => scrollToCategory(categoria.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      activeCategoryId === categoria.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {categoria.nombre} ({categoria.productos.length})
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 pb-40">
            {!hasProducts ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <p className="text-xl font-black" style={titleFontStyle}>
                  {searchQuery.trim() ? 'No encontramos productos con ese termino.' : 'Estamos preparando el menu digital'}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {searchQuery.trim() ? 'Prueba con otro nombre o categoria.' : 'Vuelve en unos minutos para ver todos los productos.'}
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {filteredCategorias.map((categoria) => (
                  <section key={categoria.id} id={`categoria-${categoria.id}`} className="scroll-mt-32">
                    <div className="mb-3">
                      <h2 className="text-xl font-black md:text-2xl" style={{ ...titleFontStyle, color: 'var(--secondary-color)' }}>
                        {categoria.nombre}
                      </h2>
                    </div>

                    <div className="space-y-3">
                      {categoria.productos.map((producto) => {
                        const quantity = cart[producto.id] ?? 0;

                        return (
                          <article
                            key={producto.id}
                            className="overflow-hidden rounded-2xl border border-slate-200 bg-[var(--card-surface)]"
                          >
                            <div className="flex gap-3 p-3">
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
                                  className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100"
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

                              <div className="min-w-0 flex-1 py-0.5">
                                <h3
                                  className="text-base font-extrabold leading-6"
                                  style={titleFontStyle}
                                >
                                  {producto.nombre}
                                </h3>

                                <p className="mt-1.5 text-sm leading-5 text-slate-600">
                                  {producto.descripcion?.trim() || 'Preparacion recomendada por la casa.'}
                                </p>

                                <div className="mt-3 flex items-center justify-between gap-3">
                                  <span
                                    className="shrink-0 rounded-full px-3 py-1 text-xs font-extrabold"
                                    style={{
                                      borderRadius: 'var(--border-radius)',
                                      backgroundColor: 'color-mix(in srgb, var(--primary-color) 18%, white)',
                                      color: 'var(--primary-color)',
                                    }}
                                  >
                                    {formatCop(producto.precio)}
                                  </span>

                                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1">
                                    <button
                                      type="button"
                                      onClick={() => decrementProduct(producto.id)}
                                      className="h-8 w-8 rounded-full border border-slate-200 bg-white text-base font-bold text-slate-700"
                                    >
                                      -
                                    </button>
                                    <span className="min-w-7 text-center text-sm font-black">{quantity}</span>
                                    <button
                                      type="button"
                                      onClick={() => incrementProduct(producto.id)}
                                      className="h-8 w-8 rounded-full text-base font-bold"
                                      style={{ backgroundColor: 'var(--primary-color)', color: 'var(--text-on-primary)' }}
                                    >
                                      +
                                    </button>
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
          <section className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/92 px-4 py-3 backdrop-blur-xl">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {cartCount} producto{cartCount === 1 ? '' : 's'}
                </p>
                <p className="text-2xl font-black" style={titleFontStyle}>
                  {formatCop(cartTotal)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmOpen(true)}
                disabled={!canOrderViaWhatsapp || isSubmittingOrder}
                className="rounded-full px-6 py-3 text-sm font-black uppercase tracking-[0.08em]"
                style={
                  !canOrderViaWhatsapp || isSubmittingOrder
                    ? { backgroundColor: '#E2E8F0', color: '#64748B' }
                    : {
                        borderRadius: 'var(--border-radius)',
                        backgroundColor: 'var(--primary-color)',
                        color: 'var(--text-on-primary)',
                      }
                }
              >
                {isSubmittingOrder
                  ? 'Procesando...'
                  : !receivesOrdersOnWhatsapp
                    ? 'Pedidos por WhatsApp desactivados'
                    : 'Confirmar pedido'}
              </button>
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
                            className="inline-flex font-semibold text-slate-900 underline underline-offset-2"
                          >
                            +{whatsappNumber}
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
                      className="flex-1 rounded-full px-4 py-2.5 text-center text-xs font-bold uppercase tracking-[0.08em]"
                      style={
                        receivesOrdersOnWhatsapp
                          ? { backgroundColor: 'var(--primary-color)', color: 'var(--text-on-primary)' }
                          : { backgroundColor: '#E2E8F0', color: '#64748B' }
                      }
                    >
                      {receivesOrdersOnWhatsapp ? 'WhatsApp' : 'WhatsApp (sin pedidos)'}
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

              <div className="h-[calc(100%-132px)] overflow-y-auto px-4 py-4 sm:px-6">
                <p className="text-sm text-slate-600">
                  {receivesOrdersOnWhatsapp
                    ? 'Selecciona metodo de pago y confirma tu pedido por WhatsApp.'
                    : 'Este negocio tiene desactivados los pedidos por WhatsApp actualmente.'}
                </p>

                <div className="mt-4 space-y-2">
                  {menuData.metodosPago.length > 0 ? (
                    paymentMethodsByCurrency.map((group) => (
                      <div key={`checkout-currency-${group.currency}`} className="space-y-2">
                        <p className="px-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{group.currency}</p>
                        {group.methods.map((method) => {
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
                                  : { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }
                              }
                            >
                              <p className="text-sm font-bold text-slate-900">{paymentMethodLabel(method)}</p>
                              {details.length > 0 ? (
                                <div className="mt-1 space-y-1">
                                  {details.slice(0, 3).map((detail, index) => (
                                    <p key={`${method.id}-${index}`} className="text-xs text-slate-600">{detail}</p>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-1 text-xs text-slate-500">Sin datos adicionales.</p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                      Este comercio no tiene metodos de pago configurados. El pedido se enviara sin metodo seleccionado.
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Resumen</p>
                  <div className="mt-2 space-y-1">
                    {cartItems.slice(0, 4).map((item) => (
                      <p key={item.product.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                        <span className="truncate">{item.quantity} x {item.product.nombre}</span>
                        <span className="font-semibold">{formatCop((item.product.precio ?? 0) * item.quantity)}</span>
                      </p>
                    ))}
                  </div>
                  {cartItems.length > 4 ? (
                    <p className="mt-1 text-xs text-slate-500">+ {cartItems.length - 4} productos adicionales</p>
                  ) : null}
                </div>

                <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total</span>
                  <strong className="text-xl font-black" style={titleFontStyle}>{formatCop(cartTotal)}</strong>
                </div>

                <div className="mt-4">
                  <label htmlFor="client-email" className="mb-2 block text-sm font-semibold text-slate-700">
                    Correo del cliente
                  </label>
                  <input
                    id="client-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="tucorreo@ejemplo.com"
                    value={clientEmail}
                    onChange={(event) => setClientEmail(event.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2"
                    style={{
                      borderColor: isClientEmailValid || clientEmail.trim().length === 0 ? '#CBD5E1' : '#F43F5E',
                      boxShadow: 'none',
                    }}
                  />
                  <p className="mt-2 text-xs text-slate-500">Recibiras por correo el enlace de seguimiento del pedido.</p>
                  {clientEmail.trim().length > 0 && !isClientEmailValid ? (
                    <p className="mt-1 text-xs font-semibold text-rose-500">Ingresa un correo valido para continuar.</p>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                <button
                  type="button"
                  onClick={() => void confirmOrder()}
                  disabled={isSubmittingOrder || !isClientEmailValid || !canOrderViaWhatsapp}
                  className="w-full rounded-full px-5 py-3 text-sm font-black uppercase tracking-[0.08em]"
                  style={
                    isSubmittingOrder || !isClientEmailValid || !canOrderViaWhatsapp
                      ? { backgroundColor: '#E2E8F0', color: '#64748B' }
                      : {
                          borderRadius: 'var(--border-radius)',
                          backgroundColor: 'var(--primary-color)',
                          color: 'var(--text-on-primary)',
                        }
                  }
                >
                  {isSubmittingOrder
                    ? 'Procesando...'
                    : !receivesOrdersOnWhatsapp
                      ? 'Pedidos por WhatsApp desactivados'
                      : 'Enviar pedido por WhatsApp'}
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}
