'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Heart,
  LoaderCircle,
  MapPin,
  Menu,
  Navigation,
  Search,
  SlidersHorizontal,
  Star,
  Store,
  Users,
  X,
} from 'lucide-react';
import { Caveat, Manrope } from 'next/font/google';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  DIRECTORY_CATEGORY_CHIPS,
  DIRECTORY_REGIONS,
} from '../../app/api/_lib/public-directory-geo';
import { appSignupHref, businessBenefitsHref } from '../../app/_lib/public-site-config';
import { ClientesDirectoryMap } from './ClientesDirectoryMap';

const body = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

const script = Caveat({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const FAVORITES_KEY = 'elmenuxfa_clientes_favorites_v1';
const AUDIENCE_GATE_KEY = 'elmenuxfa_clientes_audience_gate_v1';
const BENEFITS_HREF = businessBenefitsHref;
const RADIUS_OPTIONS = [5, 10, 25, 50] as const;
const PAGE_SIZE = 12;
const SEARCH_PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 220;

type DirectoryBusiness = {
  id: string;
  slug: string;
  nombre: string;
  logoUrl: string | null;
  coverUrl: string | null;
  categoria: string | null;
  direccion: string | null;
  ratingAverage: number;
  ratingCount: number;
  promovido: boolean;
  distanceKm: number | null;
  lat: number | null;
  lng: number | null;
  menuUrl: string;
  matchedDish?: string | null;
  matchScore?: number;
};

type CategoryChip = { id: string; label: string; glyph: string };

type DirectoryPayload = {
  results?: DirectoryBusiness[];
  promoted?: DirectoryBusiness[];
  topRated?: DirectoryBusiness[];
  total?: number;
  regions?: string[];
  categories?: CategoryChip[];
};

type SortMode = 'smart' | 'near' | 'rated';

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

function readFavorites(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

function writeFavorites(ids: Set<string>) {
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]));
}

function readUrlState() {
  if (typeof window === 'undefined') {
    return { q: '', region: '', category: '', sort: 'smart' as SortMode, fav: false };
  }
  const params = new URLSearchParams(window.location.search);
  const sortRaw = (params.get('sort') ?? 'smart').toLowerCase();
  const sort: SortMode =
    sortRaw === 'near' || sortRaw === 'rated' || sortRaw === 'smart' ? sortRaw : 'smart';
  return {
    q: (params.get('q') ?? '').slice(0, 80),
    region: (params.get('region') ?? '').slice(0, 60),
    category: (params.get('category') ?? '').slice(0, 40),
    sort,
    fav: params.get('fav') === '1',
  };
}

function syncUrlState(state: {
  q: string;
  region: string;
  category: string;
  sort: SortMode;
  fav: boolean;
}) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  if (state.q.trim()) params.set('q', state.q.trim());
  if (state.region.trim()) params.set('region', state.region.trim());
  if (state.category.trim()) params.set('category', state.category.trim());
  if (state.sort !== 'smart') params.set('sort', state.sort);
  if (state.fav) params.set('fav', '1');
  const next = params.toString();
  const path = `${window.location.pathname}${next ? `?${next}` : ''}`;
  window.history.replaceState(null, '', path);
}

function sortBusinesses(list: DirectoryBusiness[], mode: SortMode) {
  const copy = [...list];
  if (mode === 'near') {
    return copy.sort((a, b) => {
      const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
  }
  if (mode === 'rated') {
    return copy.sort((a, b) => {
      if (b.ratingAverage !== a.ratingAverage) return b.ratingAverage - a.ratingAverage;
      if (b.ratingCount !== a.ratingCount) return b.ratingCount - a.ratingCount;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
  }
  return copy;
}

function RestaurantCard({
  business,
  compact = false,
  favorite,
  selected,
  onToggleFavorite,
  onSelect,
  onShowOnMap,
}: {
  business: DirectoryBusiness;
  compact?: boolean;
  favorite: boolean;
  selected?: boolean;
  onToggleFavorite: (id: string) => void;
  onSelect?: (id: string) => void;
  onShowOnMap?: (id: string) => void;
}) {
  const cover = business.coverUrl;
  const logo = business.logoUrl;
  // Prefer cover photo; fall back to logo. Avoid tiny nested logo boxes.
  const image = cover || logo;
  const isLogoOnly = Boolean(image) && (!cover || cover === logo);
  // Dense horizontal row on mobile always; tall cards only on sm+ when not compact.
  const forceRow = compact;
  const thumbBg = isLogoOnly
    ? 'bg-white'
    : 'bg-[linear-gradient(145deg,#f5f3ff,#eef2ff)]';

  return (
    <article
      className={`group relative rounded-2xl bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(109,40,217,0.12)] ${
        selected
          ? 'border-2 border-[#6D28D9] shadow-[0_14px_32px_rgba(109,40,217,0.16)]'
          : business.promovido
            ? 'border-2 border-[#6D28D9] shadow-[0_10px_28px_rgba(109,40,217,0.12)]'
            : 'border border-slate-100'
      } ${forceRow ? 'flex gap-2.5 p-2.5' : 'flex gap-2.5 p-2.5 sm:block sm:gap-0 sm:p-0'}`}
    >
      <Link
        href={business.menuUrl}
        className={
          forceRow
            ? `relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-xl ring-1 ring-slate-100 ${thumbBg}`
            : `relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-xl ring-1 ring-slate-100 sm:h-auto sm:w-full sm:rounded-none sm:rounded-t-[14px] sm:aspect-[16/10] sm:ring-0 ${thumbBg}`
        }
        onClick={() => onSelect?.(business.id)}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className={
              isLogoOnly
                ? forceRow
                  ? 'h-full w-full scale-110 object-cover'
                  : 'h-full w-full object-cover sm:object-contain sm:p-6 sm:scale-100'
                : 'h-full w-full object-cover'
            }
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center bg-[#f5f3ff] text-violet-300">
            <Store className="h-6 w-6" />
          </div>
        )}
        {business.promovido ? (
          <span className="absolute left-1 top-1 rounded-full bg-[#6D28D9] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white sm:left-2 sm:top-2 sm:px-2.5 sm:py-1 sm:text-[10px]">
            Promo
          </span>
        ) : null}
      </Link>
      {!forceRow ? (
        <button
          type="button"
          aria-label={favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          onClick={(event) => {
            event.preventDefault();
            onToggleFavorite(business.id);
          }}
          className={`absolute right-2 top-2 z-10 hidden h-9 w-9 place-items-center rounded-full shadow transition sm:grid ${
            favorite ? 'bg-[#6D28D9] text-white' : 'bg-white/95 text-slate-400 hover:text-[#6D28D9]'
          }`}
        >
          <Heart className={`h-4 w-4 ${favorite ? 'fill-current' : ''}`} />
        </button>
      ) : null}
      <div className={`min-w-0 flex-1 ${forceRow ? 'flex flex-col justify-center' : 'sm:p-4'}`}>
        <div className="flex items-start justify-between gap-1.5">
          <Link
            href={business.menuUrl}
            onClick={() => onSelect?.(business.id)}
            className="line-clamp-1 text-[14px] font-extrabold leading-snug text-slate-900 hover:text-[#6D28D9] sm:line-clamp-2 sm:text-[15px]"
          >
            {business.nombre}
          </Link>
          <button
            type="button"
            aria-label={favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
            onClick={() => onToggleFavorite(business.id)}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
              forceRow ? '' : 'sm:hidden'
            } ${favorite ? 'bg-violet-100 text-[#6D28D9]' : 'bg-slate-50 text-slate-400'}`}
          >
            <Heart className={`h-3.5 w-3.5 ${favorite ? 'fill-current' : ''}`} />
          </button>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 sm:mt-1 sm:flex-wrap sm:gap-x-1.5 sm:text-[12px]">
          {business.ratingCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 font-semibold text-slate-700">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {business.ratingAverage.toFixed(1)}
            </span>
          ) : (
            <span className="hidden text-slate-400 sm:inline">Sin calificaciones</span>
          )}
          {business.categoria ? (
            <span className="min-w-0 truncate">
              <span className="text-slate-300 sm:hidden">· </span>
              <span className="hidden sm:inline">· </span>
              {business.categoria}
            </span>
          ) : null}
          {business.distanceKm != null ? (
            <span className="shrink-0 font-semibold text-[#6D28D9]">· {business.distanceKm} km</span>
          ) : null}
        </div>
        {business.matchedDish ? (
          <p className="mt-0.5 truncate text-[11px] font-semibold text-violet-700 sm:mt-1 sm:text-[12px]">
            Sirve: {business.matchedDish}
          </p>
        ) : business.direccion ? (
          <p className="mt-0.5 hidden truncate text-[11px] text-slate-400 sm:mt-1 sm:block sm:text-[12px]">
            {business.direccion}
          </p>
        ) : null}
        <div className="mt-1.5 flex items-center gap-3 sm:mt-2">
          {onSelect || onShowOnMap ? (
            <button
              type="button"
              onClick={() => (onShowOnMap ?? onSelect)?.(business.id)}
              className="hidden text-[11px] font-bold text-slate-500 hover:text-[#6D28D9] sm:inline sm:text-[12px]"
            >
              Ver en mapa
            </button>
          ) : null}
          <Link
            href={business.menuUrl}
            className="inline-flex items-center gap-1 text-[12px] font-bold text-[#6D28D9] sm:ml-auto sm:text-[12px]"
          >
            Ver menú <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function ResultSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex gap-3 overflow-hidden rounded-2xl bg-white p-3 ring-1 ring-slate-100 sm:block sm:p-0"
        >
          <div className="h-[4.5rem] w-[4.5rem] shrink-0 animate-pulse rounded-xl bg-slate-100 sm:aspect-[16/10] sm:h-auto sm:w-full sm:rounded-none" />
          <div className="min-w-0 flex-1 space-y-2 py-1 sm:p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ClientesDiscoveryPage() {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('');
  const [category, setCategory] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('smart');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [urlReady, setUrlReady] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'ready' | 'denied'>('idle');
  const [radiusKm, setRadiusKm] = useState<(typeof RADIUS_OPTIONS)[number] | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [audienceGateOpen, setAudienceGateOpen] = useState(false);
  const [audienceDontShowAgain, setAudienceDontShowAgain] = useState(false);
  const [draftQuery, setDraftQuery] = useState('');
  const [draftRegion, setDraftRegion] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [draftSort, setDraftSort] = useState<SortMode>('smart');
  const [draftRadiusKm, setDraftRadiusKm] = useState<(typeof RADIUS_OPTIONS)[number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DirectoryPayload>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const resultsRef = useRef<HTMLElement | null>(null);
  const promoCarouselRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedOnce = useRef(false);
  const geoAskedRef = useRef(false);

  const scrollPromoCarousel = useCallback((direction: -1 | 1) => {
    const el = promoCarouselRef.current;
    if (!el) return;
    const step = Math.min(320, Math.max(240, Math.round(el.clientWidth * 0.72)));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  }, []);

  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const headerSearchRef = useRef<HTMLInputElement | null>(null);
  const heroSearchRef = useRef<HTMLDivElement | null>(null);
  const infiniteSentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const filteredResultsLengthRef = useRef(0);
  const pendingHeaderFocusRef = useRef(false);
  const [searchMode, setSearchMode] = useState(false);
  const [showSearchMap, setShowSearchMap] = useState(false);

  const requestLocation = useCallback((opts?: { switchToNear?: boolean; forcePrompt?: boolean }) => {
    if (!navigator.geolocation) {
      setGeoStatus('denied');
      return;
    }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGeoStatus('ready');
        // Only flip sort when explicitly requested — never override an active text search.
        if (opts?.switchToNear) setSortMode('near');
      },
      () => setGeoStatus('denied'),
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: opts?.forcePrompt ? 0 : 120000,
      },
    );
  }, []);

  useEffect(() => {
    const fromUrl = readUrlState();
    setQuery(fromUrl.q);
    setRegion(fromUrl.region);
    setCategory(fromUrl.category);
    setSortMode(fromUrl.sort);
    setFavoritesOnly(fromUrl.fav);
    setFavorites(readFavorites());
    setUrlReady(true);
    if (!geoAskedRef.current) {
      geoAskedRef.current = true;
      // Ask for location on first visit; use near only when not already searching.
      requestLocation({
        switchToNear: fromUrl.sort !== 'rated' && !fromUrl.q.trim(),
        forcePrompt: true,
      });
    }
  }, [requestLocation]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(AUDIENCE_GATE_KEY) === '1') return;
    } catch {
      // ignore storage errors
    }
    const timer = window.setTimeout(() => setAudienceGateOpen(true), 2000);
    return () => window.clearTimeout(timer);
  }, []);

  const dismissAudienceGate = useCallback(
    (opts?: { persist?: boolean; goToBenefits?: boolean }) => {
      const persist = opts?.persist ?? (audienceDontShowAgain || Boolean(opts?.goToBenefits));
      if (persist) {
        try {
          window.localStorage.setItem(AUDIENCE_GATE_KEY, '1');
        } catch {
          // ignore storage errors
        }
      }
      setAudienceGateOpen(false);
      if (opts?.goToBenefits) {
        window.location.assign(BENEFITS_HREF);
      }
    },
    [audienceDontShowAgain],
  );

  const isSearching = debouncedQuery.trim().length > 0;
  const pageSize = searchMode || isSearching ? SEARCH_PAGE_SIZE : PAGE_SIZE;

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [category, coords, debouncedQuery, favoritesOnly, pageSize, radiusKm, region, sortMode]);

  const scrollToResults = useCallback(() => {
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const enterSearchMode = useCallback(
    (opts?: { query?: string; focus?: boolean }) => {
      if (opts?.query != null) {
        setQuery(opts.query.slice(0, 80));
        if (opts.query.trim().length >= 2) setSortMode('smart');
      }
      setSortMode((mode) => (mode === 'near' || mode === 'rated' ? mode : 'smart'));
      setSearchMode(true);
      setMobileNavOpen(false);
      setShowSearchMap(false);
      pendingHeaderFocusRef.current = opts?.focus !== false;
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    },
    [],
  );

  const exitSearchMode = useCallback(() => {
    setSearchMode(false);
    setQuery('');
    setShowSearchMap(false);
    pendingHeaderFocusRef.current = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const commitSearch = useCallback(() => {
    enterSearchMode({ focus: true });
  }, [enterSearchMode]);

  useEffect(() => {
    if (!urlReady) return;
    if (readUrlState().q.trim()) {
      setSearchMode(true);
    }
  }, [urlReady]);

  useEffect(() => {
    if (!searchMode || !pendingHeaderFocusRef.current) return;
    pendingHeaderFocusRef.current = false;
    const timer = window.setTimeout(() => {
      const input = headerSearchRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch {
        // Some mobile browsers reject setSelectionRange on search-like fields.
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [searchMode]);

  useEffect(() => {
    if (!searchMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exitSearchMode();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exitSearchMode, searchMode]);

  useEffect(() => {
    if (!urlReady) return;
    syncUrlState({
      q: debouncedQuery,
      region,
      category,
      sort: sortMode,
      fav: favoritesOnly,
    });
  }, [category, debouncedQuery, favoritesOnly, region, sortMode, urlReady]);

  useEffect(() => {
    if (!urlReady) return;

    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    const run = async () => {
      if (hasLoadedOnce.current) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const trimmed = debouncedQuery.trim();
        const params = new URLSearchParams({
          mode: 'clientes',
          limit: trimmed ? '120' : '60',
        });
        if (trimmed) params.set('q', trimmed);
        if (region.trim()) params.set('region', region.trim());
        if (category.trim()) params.set('category', category.trim());
        if (coords) {
          params.set('lat', String(coords.lat));
          params.set('lng', String(coords.lng));
        }
        const response = await fetch(`/api/comercios/directory?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const json = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: DirectoryPayload;
          error?: string;
        };
        if (!response.ok) throw new Error(json.error ?? 'No se pudo cargar el directorio.');
        startTransition(() => {
          setPayload(json.data ?? {});
          hasLoadedOnce.current = true;
        });
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Error de carga');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void run();
    return () => {
      controller.abort();
    };
  }, [category, coords, debouncedQuery, region, urlReady]);

  const results = payload.results ?? [];
  const promoted = payload.promoted ?? results.filter((item) => item.promovido);
  const topRated = payload.topRated ?? [];
  const regions =
    payload.regions && payload.regions.length > 0
      ? payload.regions
      : [...DIRECTORY_REGIONS];
  const categories =
    payload.categories && payload.categories.length > 0
      ? payload.categories
      : DIRECTORY_CATEGORY_CHIPS.map((chip) => ({ ...chip }));

  const heroSlides = useMemo(() => {
    const seen = new Set<string>();
    const slides: DirectoryBusiness[] = [];
    for (const item of [...promoted, ...topRated, ...results]) {
      if (seen.has(item.id)) continue;
      if (!(item.coverUrl || item.logoUrl)) continue;
      seen.add(item.id);
      slides.push(item);
      if (slides.length >= 6) break;
    }
    return slides;
  }, [promoted, results, topRated]);

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const timer = window.setInterval(() => {
      setHeroIndex((index) => (index + 1) % heroSlides.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [heroSlides.length]);

  const filteredResults = useMemo(() => {
    let list = results;
    if (radiusKm != null && coords) {
      list = list.filter(
        (item) => item.distanceKm != null && item.distanceKm <= radiusKm,
      );
    }
    if (favoritesOnly) {
      list = list.filter((item) => favorites.has(item.id));
    }
    // While searching, keep server relevance order (smart) unless user forces near/rated.
    return sortBusinesses(list, sortMode);
  }, [coords, favorites, favoritesOnly, radiusKm, results, sortMode]);

  filteredResultsLengthRef.current = filteredResults.length;

  useEffect(() => {
    if (filteredResults.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredResults.some((item) => item.id === selectedId)) {
      setSelectedId(filteredResults[0]?.id ?? null);
    }
  }, [filteredResults, selectedId]);

  useEffect(() => {
    const node = infiniteSentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((count) => {
          const total = filteredResultsLengthRef.current;
          if (count >= total) return count;
          const step = debouncedQuery.trim() ? SEARCH_PAGE_SIZE : PAGE_SIZE;
          return Math.min(count + step, total);
        });
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [debouncedQuery, filteredResults.length, loading]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeFavorites(next);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setQuery('');
    setRegion('');
    setCategory('');
    setFavoritesOnly(false);
    setRadiusKm(null);
    setSortMode(coords ? 'near' : 'smart');
  }, [coords]);

  const openSearchModal = useCallback(() => {
    setDraftQuery(query);
    setDraftRegion(region);
    setDraftCategory(category);
    setDraftSort(sortMode);
    setDraftRadiusKm(radiusKm);
    setSearchModalOpen(true);
  }, [category, query, radiusKm, region, sortMode]);

  const applySearchModal = useCallback(() => {
    setQuery(draftQuery);
    setRegion(draftRegion);
    setCategory(draftCategory);
    setSortMode(draftSort);
    setRadiusKm(draftRadiusKm);
    setSearchModalOpen(false);
    enterSearchMode({ focus: true });
  }, [draftCategory, draftQuery, draftRadiusKm, draftRegion, draftSort, enterSearchMode]);

  const visibleResults = useMemo(
    () => filteredResults.slice(0, visibleCount),
    [filteredResults, visibleCount],
  );
  const hasMoreResults = visibleCount < filteredResults.length;

  const hasActiveFilters = Boolean(
    query.trim() || region.trim() || category.trim() || favoritesOnly || radiusKm != null,
  );

  const statusLine = useMemo(() => {
    if (loading && !hasLoadedOnce.current) return 'Buscando restaurantes...';
    const count = filteredResults.length;
    const parts = [`${count} lugar${count === 1 ? '' : 'es'}`];
    if (debouncedQuery.trim()) {
      parts.push('relevancia · menú · cercanía · rating');
    } else if (sortMode === 'near' && coords) {
      parts.push('ordenados por cercanía');
    } else if (sortMode === 'rated') {
      parts.push('mejor calificados primero');
    } else {
      parts.push('prioridad promocionados + relevancia');
    }
    if (region) parts.push(`en ${region}`);
    if (category) {
      const chip = categories.find((item) => item.id === category);
      if (chip) parts.push(chip.label.toLowerCase());
    }
    if (radiusKm != null) parts.push(`≤ ${radiusKm} km`);
    if (favoritesOnly) parts.push('solo favoritos');
    if (refreshing) parts.push('actualizando');
    return parts.join(' · ');
  }, [
    categories,
    category,
    coords,
    debouncedQuery,
    favoritesOnly,
    filteredResults.length,
    loading,
    radiusKm,
    refreshing,
    region,
    sortMode,
  ]);

  const activeCategoryLabel =
    categories.find((item) => item.id === category)?.label ?? category;

  const hero = heroSlides[heroIndex] ?? heroSlides[0] ?? null;

  const updateSearchQuery = useCallback((nextRaw: string) => {
    const next = nextRaw.slice(0, 80);
    setQuery(next);
    if (next.trim().length >= 2) setSortMode('smart');
  }, []);

  const locationLabel = region || (geoStatus === 'ready' ? 'Cerca de ti' : 'Tu zona');
  const searchStatusText =
    query.trim().length === 0
      ? null
      : refreshing || query.trim() !== debouncedQuery.trim()
        ? 'Buscando…'
        : filteredResults.length === 0 && hasLoadedOnce.current
          ? 'Sin resultados'
          : `${filteredResults.length} resultado${filteredResults.length === 1 ? '' : 's'}`;

  return (
    <div className={`${body.className} min-h-screen bg-[#FAFAFC] text-slate-900`}>
      <header
        className={`sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90 ${
          searchMode
            ? 'border-slate-200 shadow-[0_8px_30px_rgba(15,23,42,0.06)]'
            : 'border-slate-200/70'
        }`}
      >
        <div
          className={`mx-auto flex max-w-6xl items-center gap-2 px-3 transition-all duration-300 sm:px-4 ${
            searchMode ? 'h-[3.75rem] sm:h-[4.25rem]' : 'h-14 sm:h-16'
          }`}
        >
          {searchMode ? (
            <button
              type="button"
              onClick={exitSearchMode}
              aria-label="Volver"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <Link
              href="/"
              className="flex min-w-0 shrink-0 items-center gap-2 text-[15px] font-extrabold tracking-tight sm:text-base"
              aria-label="elmenuxfa.com"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/branding/isotipo.png" alt="" className="h-8 w-8 shrink-0 rounded-lg" />
              <span className="hidden truncate sm:inline">
                elmenuxfa<span className="text-[#6D28D9]">.com</span>
              </span>
            </Link>
          )}

          {searchMode ? (
            <form
              className="min-w-0 flex-1 animate-[fadeSlide_220ms_ease-out]"
              onSubmit={(event) => {
                event.preventDefault();
                headerSearchRef.current?.blur();
              }}
            >
              <div className="flex items-center gap-1.5 rounded-full bg-slate-50 py-1 pl-3.5 pr-1 ring-1 ring-slate-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#6D28D9]/40">
                <Search className="h-4 w-4 shrink-0 text-[#6D28D9]" />
                <input
                  ref={headerSearchRef}
                  value={query}
                  onChange={(event) => updateSearchQuery(event.target.value)}
                  placeholder="Busca platillo o restaurante"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  className="w-full min-w-0 bg-transparent py-2.5 text-[15px] font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"
                  aria-label="Buscar platillo o restaurante"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Limpiar búsqueda"
                    onClick={() => {
                      setQuery('');
                      headerSearchRef.current?.focus({ preventScroll: true });
                    }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-200/70 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={openSearchModal}
                  className="mr-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#6D28D9] text-white shadow-sm shadow-violet-500/25 sm:hidden"
                  aria-label="Filtros"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={openSearchModal}
                  className="mr-0.5 hidden shrink-0 items-center gap-1.5 rounded-full bg-[#6D28D9] px-3 py-2 text-xs font-bold text-white shadow-sm shadow-violet-500/25 sm:inline-flex"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="max-w-[7.5rem] truncate">{locationLabel}</span>
                </button>
              </div>
            </form>
          ) : (
            <>
              <nav className="mx-auto hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
                <a href="#promocionados" className="hover:text-[#6D28D9]">
                  Promocionados
                </a>
                <a href="#resultados" className="hover:text-[#6D28D9]">
                  Explorar
                </a>
                <a href="#regiones" className="hover:text-[#6D28D9]">
                  Regiones
                </a>
              </nav>
              <button
                type="button"
                onClick={() => enterSearchMode({ focus: true })}
                className="mx-1.5 flex min-w-0 flex-1 items-center gap-2 rounded-full bg-slate-100 py-2 pl-3 pr-3 text-left ring-1 ring-slate-200/80 transition active:scale-[0.99] sm:hidden"
              >
                <Search className="h-4 w-4 shrink-0 text-[#6D28D9]" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-500">
                  ¿Qué se te antoja?
                </span>
              </button>
              <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={() => requestLocation({ switchToNear: true })}
                  className={`hidden items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold sm:inline-flex ${
                    geoStatus === 'ready'
                      ? 'bg-violet-100 text-[#6D28D9]'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#6D28D9]" />
                  {geoStatus === 'ready'
                    ? 'Cerca de ti'
                    : geoStatus === 'loading'
                      ? 'Ubicando...'
                      : geoStatus === 'denied'
                        ? 'Sin ubicación'
                        : 'Ubicarme'}
                </button>
                <button
                  type="button"
                  onClick={() => setFavoritesOnly((value) => !value)}
                  className={`hidden h-9 w-9 place-items-center rounded-full sm:grid ${
                    favoritesOnly ? 'bg-[#6D28D9] text-white' : 'bg-violet-100 text-[#6D28D9]'
                  }`}
                  aria-label="Ver favoritos"
                  title="Favoritos"
                >
                  <Heart className={`h-4 w-4 ${favoritesOnly || favorites.size > 0 ? 'fill-current' : ''}`} />
                </button>
                <button
                  type="button"
                  className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700 md:hidden"
                  onClick={() => setMobileNavOpen((open) => !open)}
                  aria-label="Menú"
                >
                  {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </button>
              </div>
            </>
          )}
        </div>
        {searchMode ? (
          <div className="border-t border-slate-100 px-3 py-2 sm:px-4">
            <div className="mx-auto flex max-w-6xl items-center gap-2">
              <p className="hidden min-w-0 truncate text-[12px] font-medium text-slate-500 sm:block">
                {searchStatusText
                  ? `${searchStatusText}${region ? ` · ${region}` : ''}${category ? ` · ${activeCategoryLabel}` : ''}`
                  : 'Escribe para ver restaurantes y platillos'}
              </p>
              <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-none sm:justify-end [&::-webkit-scrollbar]:hidden">
                {searchStatusText ? (
                  <span className="shrink-0 self-center text-[11px] font-semibold text-slate-500 sm:hidden">
                    {searchStatusText}
                  </span>
                ) : null}
                {(
                  [
                    ['burger', 'Burger'],
                    ['pizza', 'Pizza'],
                    ['café', 'Café'],
                    ['arepa', 'Arepa'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => enterSearchMode({ query: value, focus: true })}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${
                      query.trim().toLowerCase() === value
                        ? 'bg-[#6D28D9] text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {!searchMode && mobileNavOpen ? (
          <div className="border-t border-slate-100 px-4 py-3 md:hidden">
            <div className="flex flex-col gap-2 text-sm font-semibold text-slate-600">
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  enterSearchMode({ focus: true });
                }}
                className="text-left font-bold text-[#6D28D9]"
              >
                Buscar
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  requestLocation({ switchToNear: true, forcePrompt: true });
                }}
                className="inline-flex items-center gap-2 text-left"
              >
                <MapPin className="h-4 w-4 text-[#6D28D9]" />
                {geoStatus === 'ready' ? 'Ubicación activa' : 'Usar mi ubicación'}
              </button>
              <a href="#promocionados" onClick={() => setMobileNavOpen(false)}>
                Promocionados
              </a>
              <a href="#resultados" onClick={() => setMobileNavOpen(false)}>
                Explorar
              </a>
              <a href="#para-negocios" onClick={() => setMobileNavOpen(false)}>
                Registra tu restaurante
              </a>
            </div>
          </div>
        ) : null}
      </header>

      <main>
        {geoStatus === 'denied' ? (
          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2.5 sm:px-4">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-amber-900">
                Activa tu ubicación para ordenar por cercanía y ver qué hay cerca de ti.
              </p>
              <button
                type="button"
                onClick={() => requestLocation({ switchToNear: true, forcePrompt: true })}
                className="rounded-full bg-amber-900 px-3 py-1.5 text-xs font-bold text-white"
              >
                Permitir ubicación
              </button>
            </div>
          </div>
        ) : null}

        {!searchMode ? (
        <>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(109,40,217,0.16),transparent_34%),linear-gradient(180deg,#fff,#fafafc)]" />
          <div className="relative mx-auto grid max-w-6xl gap-5 px-3 pb-6 pt-5 sm:gap-8 sm:px-4 sm:pb-10 sm:pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-14">
            <div>
              <h1 className="max-w-xl font-[var(--font-display)] text-[1.75rem] font-black leading-[1.08] tracking-[-0.04em] text-[#0F172A] sm:text-4xl md:text-[3.35rem] md:leading-[1.02]">
                Tu próxima{' '}
                <span className="text-[#6D28D9]">comida</span>
                <br className="hidden sm:block" />{' '}
                está aquí
              </h1>
              <p className="mt-2 hidden max-w-lg text-slate-600 sm:mt-3 sm:block sm:text-base md:text-lg">
                Busca por antojo, región o cercanía. Los promocionados los elige el restaurante; los
                destacados salen de las notas reales de sus clientes.
              </p>
              <div ref={heroSearchRef} className="mt-4 sm:mt-6">
                {/* Mobile: Airbnb-style single search pill */}
                <button
                  type="button"
                  onClick={() => enterSearchMode({ focus: true })}
                  className="group flex w-full items-center gap-3 rounded-full bg-white py-2.5 pl-4 pr-2 text-left shadow-[0_12px_40px_rgba(15,23,42,0.12)] ring-1 ring-black/5 transition active:scale-[0.99] sm:hidden"
                >
                  <Search className="h-5 w-5 shrink-0 text-[#6D28D9]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-slate-900">
                      ¿Qué se te antoja?
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 truncate text-[12px] font-medium text-slate-500">
                      <MapPin className="h-3 w-3 shrink-0 text-[#6D28D9]" />
                      {locationLabel}
                      <span className="text-slate-300">·</span>
                      Burger, pizza…
                    </span>
                  </span>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#6D28D9] text-white shadow-md shadow-violet-500/30">
                    <Search className="h-4 w-4" />
                  </span>
                </button>

                {/* Desktop/tablet: expanded search card */}
                <button
                  type="button"
                  onClick={() => enterSearchMode({ focus: true })}
                  className="group hidden w-full rounded-[28px] bg-white p-2 text-left shadow-[0_20px_60px_rgba(15,23,42,0.12)] ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-[0_22px_70px_rgba(109,40,217,0.18)] hover:ring-[#6D28D9]/30 sm:block"
                >
                  <div className="flex flex-col sm:flex-row sm:items-stretch">
                    <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-[22px] px-4 py-3 sm:rounded-none sm:rounded-l-[22px]">
                      <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                        Qué buscas
                      </span>
                      <span className="flex items-center gap-2 text-[15px] font-semibold text-slate-400">
                        <Search className="h-4 w-4 shrink-0 text-[#6D28D9]" />
                        <span className="truncate">Burger, pizza, café, restaurante…</span>
                      </span>
                    </span>
                    <span className="mx-3 hidden w-px bg-slate-200 sm:block" />
                    <span className="flex min-w-0 flex-[0.85] flex-col justify-center gap-0.5 rounded-[22px] border-t border-slate-100 px-4 py-3 sm:border-t-0 sm:rounded-none">
                      <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                        Dónde
                      </span>
                      <span className="flex items-center gap-2 truncate text-[15px] font-semibold text-slate-900">
                        <MapPin className="h-4 w-4 shrink-0 text-[#6D28D9]" />
                        <span className="truncate">{locationLabel}</span>
                      </span>
                    </span>
                    <span className="flex items-center p-1 sm:pl-2">
                      <span className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#6D28D9] px-6 text-sm font-bold text-white shadow-lg shadow-violet-500/25 sm:w-auto sm:px-7">
                        <Search className="h-4 w-4" />
                        Buscar
                      </span>
                    </span>
                  </div>
                </button>

                <div className="mt-3 flex items-center justify-between gap-2 px-0.5 sm:mt-3 sm:px-1">
                  <div className="flex min-w-0 gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {(
                      [
                        ['burger', 'Burger'],
                        ['pizza', 'Pizza'],
                        ['café', 'Café'],
                        ['arepa', 'Arepa'],
                        ['sushi', 'Sushi'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => enterSearchMode({ query: value, focus: true })}
                        className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 ring-1 ring-slate-200 transition hover:ring-violet-200 sm:px-3.5 sm:py-2 sm:text-xs"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      enterSearchMode({ focus: false });
                      openSearchModal();
                    }}
                    aria-label="Filtros"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-slate-600 ring-1 ring-slate-200 sm:hidden"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      enterSearchMode({ focus: false });
                      openSearchModal();
                    }}
                    className="hidden shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200 sm:inline-flex"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Filtros
                  </button>
                </div>
                {geoStatus !== 'ready' ? (
                  <button
                    type="button"
                    onClick={() => {
                      requestLocation({ switchToNear: true, forcePrompt: true });
                    }}
                    className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#6D28D9] sm:mt-3"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    {geoStatus === 'loading' ? 'Obteniendo ubicación…' : 'Usar mi ubicación'}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-[22px] bg-slate-900 shadow-xl sm:rounded-[32px] sm:shadow-2xl">
              {hero ? (
                <Link href={hero.menuUrl} className="block h-full min-h-[200px] sm:min-h-[300px] lg:min-h-[360px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={hero.id}
                    src={hero.coverUrl || hero.logoUrl || '/branding/full_logo.png'}
                    alt=""
                    className="h-full min-h-[200px] w-full object-cover opacity-90 transition duration-700 sm:min-h-[300px] lg:min-h-[360px]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3.5 text-white sm:p-6">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-violet-200 sm:text-xs">
                      {hero.promovido ? 'Sitio promocionado' : 'Recomendado'}
                    </p>
                    <p className="mt-0.5 font-[var(--font-display)] text-lg font-black tracking-tight sm:mt-1 sm:text-2xl">
                      {hero.nombre}
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/80 sm:mt-1 sm:text-sm">
                      {hero.ratingCount > 0
                        ? `★ ${hero.ratingAverage.toFixed(1)} · ${hero.ratingCount} opiniones`
                        : hero.categoria || 'Menú digital'}
                      {hero.distanceKm != null ? ` · ${hero.distanceKm} km` : ''}
                    </p>
                    <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#6D28D9] sm:mt-3">
                      Ver menú <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              ) : (
                <div className="grid min-h-[200px] place-items-center text-violet-200 sm:min-h-[300px] lg:min-h-[360px]">
                  <Store className="h-12 w-12" />
                </div>
              )}
              <p
                className={`${script.className} pointer-events-none absolute right-3 top-3 hidden text-2xl text-white/90 sm:right-6 sm:top-6 sm:block sm:text-3xl`}
              >
                Apoyemos el talento local ♥
              </p>
              {heroSlides.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Anterior"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setHeroIndex((index) => (index - 1 + heroSlides.length) % heroSlides.length);
                    }}
                    className="absolute left-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-slate-800 shadow-lg hover:bg-white sm:left-3 sm:h-10 sm:w-10"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Siguiente"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setHeroIndex((index) => (index + 1) % heroSlides.length);
                    }}
                    className="absolute right-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-slate-800 shadow-lg hover:bg-white sm:right-3 sm:h-10 sm:w-10"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-3 right-3 z-10 flex gap-1.5 sm:bottom-4 sm:right-6">
                    {heroSlides.map((slide, index) => (
                      <button
                        key={slide.id}
                        type="button"
                        aria-label={`Ver ${slide.nombre}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setHeroIndex(index);
                        }}
                        className={`h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${
                          index === heroIndex ? 'bg-white' : 'bg-white/40'
                        }`}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <section className="pb-4 sm:pb-6">
          <div className="mx-auto max-w-6xl sm:px-4">
            <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-2 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4 sm:pb-2 [&::-webkit-scrollbar]:hidden">
              <div className="w-3 shrink-0 sm:w-0" aria-hidden />
              {categories.map((chip) => {
                const active = category === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      setCategory(active ? '' : chip.id);
                      scrollToResults();
                    }}
                    className={`flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 sm:w-[5.25rem] sm:gap-2 ${
                      active ? 'text-[#6D28D9]' : 'text-slate-600'
                    }`}
                  >
                    <span
                      className={`grid h-12 w-12 place-items-center rounded-full text-lg shadow-sm ring-1 transition sm:h-16 sm:w-16 sm:text-2xl ${
                        active ? 'bg-violet-100 ring-violet-300' : 'bg-white ring-slate-100'
                      }`}
                    >
                      {chip.glyph}
                    </span>
                    <span className="w-full px-0.5 text-center text-[10px] font-bold leading-tight sm:text-[11px]">
                      {chip.label}
                    </span>
                  </button>
                );
              })}
              <div className="w-3 shrink-0 sm:w-0" aria-hidden />
            </div>
          </div>
        </section>

        {hasActiveFilters ? (
          <section className="mx-auto max-w-6xl px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-100">
              <span className="text-xs font-bold text-slate-500">Activo:</span>
              {query.trim() ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-[#6D28D9]"
                >
                  {`"${query.trim()}"`} <X className="h-3 w-3" />
                </button>
              ) : null}
              {region ? (
                <button
                  type="button"
                  onClick={() => setRegion('')}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-[#6D28D9]"
                >
                  {region} <X className="h-3 w-3" />
                </button>
              ) : null}
              {category ? (
                <button
                  type="button"
                  onClick={() => setCategory('')}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-[#6D28D9]"
                >
                  {activeCategoryLabel} <X className="h-3 w-3" />
                </button>
              ) : null}
              {sortMode !== 'smart' ? (
                <button
                  type="button"
                  onClick={() => setSortMode('smart')}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-[#6D28D9]"
                >
                  {sortMode === 'near' ? 'Cercanía' : 'Calificación'} <X className="h-3 w-3" />
                </button>
              ) : null}
              {radiusKm != null ? (
                <button
                  type="button"
                  onClick={() => setRadiusKm(null)}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-[#6D28D9]"
                >
                  ≤ {radiusKm} km <X className="h-3 w-3" />
                </button>
              ) : null}
              {favoritesOnly ? (
                <button
                  type="button"
                  onClick={() => setFavoritesOnly(false)}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-[#6D28D9]"
                >
                  Favoritos <X className="h-3 w-3" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto text-xs font-bold text-slate-500 hover:text-[#6D28D9]"
              >
                Limpiar todo
              </button>
            </div>
          </section>
        ) : null}

        {!hasActiveFilters ? (
          <section id="promocionados" className="mx-auto max-w-6xl px-3 pb-8 sm:px-4 sm:pb-10">
            <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4">
              <div className="min-w-0">
                <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Sitios promocionados</h2>
                <p className="hidden text-sm text-slate-500 sm:block">
                  Prioridad manual desde el panel del restaurante.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {promoted.length > 1 ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Anterior promocionado"
                      onClick={() => scrollPromoCarousel(-1)}
                      className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Siguiente promocionado"
                      onClick={() => scrollPromoCarousel(1)}
                      className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
                <a href="#resultados" className="inline-flex items-center gap-1 text-sm font-bold text-[#6D28D9]">
                  Ver todos <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
            {loading ? (
              <ResultSkeleton />
            ) : promoted.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-100">
                Aún no hay sitios promocionados. Los restaurantes pueden activarlo en Configuración → Operación.
              </p>
            ) : (
              <div
                ref={promoCarouselRef}
                className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-1 pb-2 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden"
              >
                {promoted.slice(0, 8).map((business) => (
                  <div
                    key={business.id}
                    className="w-[min(86vw,288px)] shrink-0 snap-start sm:w-[280px]"
                  >
                    <RestaurantCard
                      business={business}
                      favorite={favorites.has(business.id)}
                      selected={selectedId === business.id}
                      onToggleFavorite={toggleFavorite}
                      onSelect={setSelectedId}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
        </>
        ) : null}

        <section
          id="resultados"
          ref={resultsRef}
          className={`mx-auto max-w-6xl px-3 pb-10 sm:px-4 sm:pb-12 ${
            searchMode
              ? 'scroll-mt-[8.5rem] animate-[fadeSlide_220ms_ease-out] pt-3 sm:scroll-mt-32 sm:pt-4'
              : 'scroll-mt-28 sm:scroll-mt-24'
          }`}
        >
          <div className="mb-3 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                {searchMode ? (query.trim() ? 'Resultados' : 'Explorar lugares') : hasActiveFilters ? 'Resultados' : 'Explorar'}
              </h2>
              <p className="mt-1 flex items-start gap-2 text-[12px] leading-snug text-slate-500 sm:text-sm">
                {refreshing ? <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" /> : null}
                <span className="break-words">{statusLine}</span>
              </p>
            </div>
            <div className="flex w-full items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:w-auto [&::-webkit-scrollbar]:hidden">
              {(
                [
                  ['smart', 'Para ti'],
                  ['near', 'Cercanos'],
                  ['rated', 'Top rating'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (mode === 'near' && !coords) {
                      requestLocation({ switchToNear: true });
                      return;
                    }
                    setSortMode(mode);
                  }}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                    sortMode === mode
                      ? 'bg-[#6D28D9] text-white'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
              {filteredResults.length > 0 ? (
                <button
                  type="button"
                  id="search-map-toggle"
                  onClick={() => setShowSearchMap((value) => !value)}
                  className={`ml-auto shrink-0 rounded-full px-3 py-1.5 text-xs font-bold sm:hidden ${
                    showSearchMap
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200'
                  }`}
                >
                  {showSearchMap ? 'Ocultar mapa' : 'Ver mapa'}
                </button>
              ) : null}
            </div>
          </div>

          <div
            className={`grid gap-4 lg:gap-6 ${
              searchMode ? 'lg:grid-cols-1' : 'lg:grid-cols-[1.05fr_0.95fr]'
            }`}
          >
            <div
              className={`order-1 transition-opacity duration-200 ${
                refreshing ? 'opacity-70' : 'opacity-100'
              } ${searchMode ? '' : 'lg:order-2'}`}
            >
              {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}
              {loading && !hasLoadedOnce.current ? (
                <ResultSkeleton />
              ) : filteredResults.length === 0 ? (
                <div className="rounded-[22px] bg-white p-6 text-center ring-1 ring-slate-100 sm:p-8">
                  <p className="text-lg font-extrabold text-slate-900">
                    {searchMode && !query.trim() ? 'Empieza a escribir' : 'Nada por aquí todavía'}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    {searchMode && !query.trim()
                      ? 'Busca un platillo o restaurante para ver todos los resultados relacionados.'
                      : 'Prueba otra región, quita el filtro de categoría o amplía el radio.'}
                  </p>
                  {!searchMode ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="mt-4 rounded-2xl bg-[#6D28D9] px-4 py-2.5 text-sm font-bold text-white"
                    >
                      Limpiar filtros
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div
                    className={`grid gap-2.5 ${
                      searchMode
                        ? 'grid-cols-1 sm:grid-cols-2 sm:gap-4'
                        : 'grid-cols-1 sm:grid-cols-2 sm:gap-4'
                    }`}
                  >
                    {visibleResults.map((business) => (
                      <div key={business.id} id={`biz-${business.id}`}>
                        <RestaurantCard
                          business={business}
                          compact
                          favorite={favorites.has(business.id)}
                          selected={selectedId === business.id}
                          onToggleFavorite={toggleFavorite}
                          onSelect={setSelectedId}
                          onShowOnMap={(id) => {
                            setSelectedId(id);
                            setShowSearchMap(true);
                            window.requestAnimationFrame(() => {
                              document
                                .getElementById('explore-map-panel')
                                ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <p className="text-xs text-slate-500">
                      Mostrando {visibleResults.length} de {filteredResults.length}
                    </p>
                    {hasMoreResults ? (
                      <div
                        ref={infiniteSentinelRef}
                        className="flex w-full flex-col items-center gap-2 py-3"
                        aria-hidden
                      >
                        <LoaderCircle className="h-5 w-5 animate-spin text-[#6D28D9]" />
                        <span className="text-[11px] font-semibold text-slate-400">
                          Desplaza para ver más
                        </span>
                      </div>
                    ) : filteredResults.length > pageSize ? (
                      <p className="text-[11px] font-semibold text-slate-400">Fin de resultados</p>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            {filteredResults.length > 0 ? (
              <div
                id="explore-map-panel"
                className={`order-2 ${showSearchMap ? 'block' : 'hidden sm:block'} ${
                  searchMode ? '' : 'lg:order-1'
                }`}
              >
                <div className="mb-2 flex items-center justify-between sm:mb-3">
                  <h3 className="text-base font-extrabold tracking-tight sm:text-lg">Mapa</h3>
                  <button
                    type="button"
                    onClick={() => requestLocation({ switchToNear: true })}
                    className="text-[11px] font-bold text-[#6D28D9] sm:text-xs"
                  >
                    {geoStatus === 'ready' ? 'Actualizar' : 'Ubicarme'}
                  </button>
                </div>
                <ClientesDirectoryMap
                  businesses={filteredResults}
                  selectedId={selectedId}
                  userCoords={coords}
                  onSelect={(id) => {
                    setSelectedId(id);
                    const el = document.getElementById(`biz-${id}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                />
              </div>
            ) : null}
          </div>
        </section>

        {!searchMode && !hasActiveFilters && topRated.length > 0 ? (
          <section className="mx-auto max-w-6xl px-3 pb-10 sm:px-4 sm:pb-12">
            <div className="mb-3 sm:mb-4">
              <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Mejor calificados</h2>
              <p className="text-sm text-slate-500">Ordenados por la puntuación de sus clientes.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {topRated.slice(0, 6).map((business) => (
                <RestaurantCard
                  key={`rated-${business.id}`}
                  business={business}
                  favorite={favorites.has(business.id)}
                  selected={selectedId === business.id}
                  onToggleFavorite={toggleFavorite}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setSortMode('rated');
                    scrollToResults();
                  }}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!searchMode ? (
        <>
        <section id="regiones" className="mx-auto max-w-6xl scroll-mt-20 px-3 pb-10 sm:px-4 sm:pb-14">
          <div className="overflow-hidden rounded-[24px] bg-white shadow-sm ring-1 ring-slate-100 sm:rounded-[28px]">
            <div className="relative overflow-hidden bg-[linear-gradient(160deg,#4c1d95,#6d28d9_55%,#a78bfa)] px-5 py-5 sm:px-8 sm:py-7">
              <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:14px_14px]" />
              <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xl font-extrabold text-white sm:text-2xl">Explora por región</p>
                  <p className="mt-1 max-w-md text-sm text-violet-100">
                    Elige tu zona y te mostramos los menús disponibles ahí.
                  </p>
                </div>
                {region ? (
                  <button
                    type="button"
                    onClick={() => {
                      scrollToResults();
                    }}
                    className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#6D28D9]"
                  >
                    Ver {filteredResults.length} en {region}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="p-4 sm:p-6">
              <div className="flex flex-wrap gap-2">
                {regions.map((item) => {
                  const active = region === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setRegion(active ? '' : item);
                        scrollToResults();
                      }}
                      className={`rounded-full px-3.5 py-2 text-[13px] font-bold ring-1 transition sm:px-4 sm:text-sm ${
                        active
                          ? 'bg-[#6D28D9] text-white ring-[#6D28D9]'
                          : 'bg-slate-50 text-slate-700 ring-slate-200 hover:bg-violet-50'
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
              {region ? (
                <p className="mt-3 text-xs text-slate-500 sm:text-sm">
                  Filtrando por <span className="font-bold text-[#6D28D9]">{region}</span>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => setRegion('')}
                    className="font-bold text-slate-700 underline-offset-2 hover:underline"
                  >
                    Quitar filtro
                  </button>
                </p>
              ) : (
                <p className="mt-3 text-xs text-slate-500 sm:text-sm">
                  Tip: también puedes usar “Cerca de mí” si estás en la zona.
                </p>
              )}
            </div>
          </div>
        </section>

        <section id="para-negocios" className="mx-auto max-w-6xl px-3 py-6 sm:px-4 sm:py-12">
          <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(160deg,#f7f4ff_0%,#faf8ff_42%,#ffffff_100%)] p-5 shadow-[0_18px_50px_rgba(109,40,217,0.08)] ring-1 ring-violet-100/80 sm:rounded-[32px] sm:p-8 lg:p-10">
            {/* Soft purple glow behind illustration — matches design blobs */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-6 top-2 h-40 w-40 rounded-full bg-[#ddd6fe]/70 blur-2xl sm:right-8 sm:top-6 sm:h-56 sm:w-56 lg:right-16 lg:top-10 lg:h-72 lg:w-72"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute right-10 top-20 h-28 w-28 rounded-full bg-[#ede9fe]/80 blur-xl sm:right-24 sm:top-28 sm:h-40 sm:w-40 lg:right-36 lg:h-48 lg:w-48"
            />

            <div className="relative lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-10">
              <div className="min-w-0">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#EDE9FE] text-[#6D28D9]">
                  <Store className="h-5 w-5" />
                </div>

                {/* Mobile/tablet: title + image side by side like the mock */}
                <div className="mt-4 grid grid-cols-[1fr_auto] items-start gap-x-1 gap-y-3 lg:block lg:gap-0">
                  <h3 className="min-w-0 font-[var(--font-display)] text-[1.55rem] font-black leading-[1.12] tracking-[-0.035em] text-slate-900 sm:text-[2rem] lg:max-w-xl lg:text-[2.4rem]">
                    Haz crecer tu restaurante en{' '}
                    <span className="text-slate-900">
                      elmenuxfa<span className="text-[#6D28D9]">.com</span>
                    </span>
                  </h3>

                  <div className="relative -mr-1 -mt-2 h-[8.5rem] w-[8.5rem] shrink-0 lg:hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/branding/negocio-restaurant.png"
                      alt=""
                      className="relative z-[1] h-full w-full object-contain drop-shadow-[0_12px_24px_rgba(109,40,217,0.18)]"
                    />
                  </div>

                  <p className="col-start-1 max-w-md text-[13px] leading-relaxed text-slate-500 sm:text-base lg:mt-3 lg:max-w-lg">
                    Crea tu menú digital, aparece en el directorio y recibe nuevos pedidos desde un
                    solo lugar.
                  </p>
                </div>

                <ul className="mt-5 space-y-3.5 sm:mt-7">
                  {(
                    [
                      [ClipboardList, 'Crea y publica tu menú fácilmente'],
                      [Users, 'Aparece ante más clientes'],
                      [BarChart3, 'Activa promociones y recibe pedidos'],
                    ] as const
                  ).map(([Icon, label]) => (
                    <li
                      key={label}
                      className="flex items-center gap-3 text-[13px] font-semibold text-slate-700 sm:text-[15px]"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EDE9FE] text-[#6D28D9]">
                        <Icon className="h-4 w-4" />
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center sm:gap-5">
                  <Link
                    href={appSignupHref}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#6D28D9] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(109,40,217,0.28)] transition hover:bg-[#5b21b6] sm:h-[3.25rem] sm:w-auto sm:min-w-[15rem] sm:px-7 sm:text-[15px]"
                  >
                    Registrar mi restaurante
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                <Link
                  href={BENEFITS_HREF}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6D28D9]"
                >
                  Ver beneficios
                  <ArrowRight className="h-4 w-4" />
                </Link>
                </div>
              </div>

              {/* Desktop illustration */}
              <div className="relative hidden min-h-[20rem] items-center justify-center lg:flex">
                <div
                  aria-hidden
                  className="absolute h-64 w-64 rounded-full bg-[#ddd6fe]/55 blur-3xl"
                />
                <div
                  aria-hidden
                  className="absolute h-40 w-40 translate-x-6 translate-y-4 rounded-full bg-[#ede9fe]/70 blur-2xl"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/negocio-restaurant.png"
                  alt=""
                  className="relative z-[1] h-[17.5rem] w-[17.5rem] object-contain drop-shadow-[0_20px_40px_rgba(109,40,217,0.2)] xl:h-[19rem] xl:w-[19rem]"
                />
              </div>
            </div>
          </div>
        </section>
        </>
        ) : null}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-3 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div>
            <p className="font-extrabold text-slate-800">
              elmenuxfa<span className="text-[#6D28D9]">.com</span>
            </p>
            <p className="mt-1">© {new Date().getFullYear()} · descubrimiento de menús</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-semibold sm:gap-x-4">
            <a href="#resultados" className="hover:text-[#6D28D9]">
              Explorar
            </a>
            <a href="#regiones" className="hover:text-[#6D28D9]">
              Regiones
            </a>
            <a href="#para-negocios" className="hover:text-[#6D28D9]">
              Negocios
            </a>
            <Link href={BENEFITS_HREF} className="text-[#6D28D9]">
              Soy restaurante
            </Link>
          </div>
        </div>
      </footer>

      {audienceGateOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 cursor-default"
            onClick={() => dismissAudienceGate()}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="audience-gate-title"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]"
          >
            <div className="relative overflow-hidden bg-[linear-gradient(160deg,#f5f3ff_0%,#faf8ff_50%,#ffffff_100%)] px-5 pb-2 pt-5 sm:px-7 sm:pt-7">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[#ddd6fe]/70 blur-2xl"
              />
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => dismissAudienceGate()}
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-slate-500 ring-1 ring-slate-100 sm:right-4 sm:top-4"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#EDE9FE] text-[#6D28D9]">
                    <Store className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6D28D9]">
                    elmenuxfa.com
                  </p>
                  <h2
                    id="audience-gate-title"
                    className="mt-1 font-[var(--font-display)] text-[1.45rem] font-black leading-[1.15] tracking-[-0.03em] text-slate-900 sm:text-[1.7rem]"
                  >
                    ¿Tienes un restaurante?
                  </h2>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/negocio-restaurant.png"
                  alt=""
                  className="relative z-[1] h-24 w-24 shrink-0 object-contain sm:h-28 sm:w-28"
                />
              </div>
              <p className="relative mt-2 max-w-sm text-sm leading-relaxed text-slate-600 sm:text-[15px]">
                Si eres dueño o trabajas en uno, te mostramos cómo publicar tu menú digital y aparecer
                ante más clientes.
              </p>
            </div>

            <div className="space-y-3 px-5 py-5 sm:px-7 sm:pb-7">
              <button
                type="button"
                onClick={() => dismissAudienceGate({ goToBenefits: true })}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#6D28D9] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(109,40,217,0.28)] transition hover:bg-[#5b21b6]"
              >
                Sí, soy un restaurante
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => dismissAudienceGate()}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-100 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
              >
                No, solo quiero explorar
              </button>

              <label className="flex cursor-pointer items-center gap-2.5 pt-1 text-sm text-slate-500">
                <input
                  type="checkbox"
                  checked={audienceDontShowAgain}
                  onChange={(event) => setAudienceDontShowAgain(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#6D28D9] focus:ring-[#6D28D9]"
                />
                <span className="font-medium">No mostrar más</span>
              </label>
            </div>
          </div>
        </div>
      ) : null}

      {searchModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Cerrar filtros"
            className="absolute inset-0 cursor-default"
            onClick={() => setSearchModalOpen(false)}
          />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-[24px]">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-base font-extrabold text-slate-900">Buscar y filtrar</p>
                <p className="text-xs text-slate-500">Ajusta antojo, zona y orden</p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setSearchModalOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-5 overflow-y-auto px-4 py-4">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  ¿Qué se te antoja?
                </span>
                <span className="mt-1.5 flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-3 ring-1 ring-slate-200 focus-within:ring-[#6D28D9]">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    autoFocus
                    value={draftQuery}
                    onChange={(event) => setDraftQuery(event.target.value)}
                    placeholder="burger, pizza, café..."
                    className="w-full bg-transparent text-sm font-medium outline-none"
                  />
                </span>
              </label>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Región</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftRegion('')}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      !draftRegion
                        ? 'bg-[#6D28D9] text-white'
                        : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'
                    }`}
                  >
                    Todas
                  </button>
                  {regions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setDraftRegion(item)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                        draftRegion === item
                          ? 'bg-[#6D28D9] text-white'
                          : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Categoría</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftCategory('')}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      !draftCategory
                        ? 'bg-[#6D28D9] text-white'
                        : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'
                    }`}
                  >
                    Todas
                  </button>
                  {categories.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setDraftCategory(chip.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                        draftCategory === chip.id
                          ? 'bg-[#6D28D9] text-white'
                          : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'
                      }`}
                    >
                      {chip.glyph} {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Ordenar</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ['smart', 'Para ti'],
                      ['near', 'Cercanos'],
                      ['rated', 'Mejor rating'],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        if (mode === 'near' && !coords) {
                          requestLocation({ switchToNear: true, forcePrompt: true });
                        }
                        setDraftSort(mode);
                      }}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                        draftSort === mode
                          ? 'bg-[#6D28D9] text-white'
                          : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Radio máximo
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftRadiusKm(null)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      draftRadiusKm == null
                        ? 'bg-[#6D28D9] text-white'
                        : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'
                    }`}
                  >
                    Sin límite
                  </button>
                  {RADIUS_OPTIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={!coords}
                      onClick={() => {
                        setDraftRadiusKm(value);
                        setDraftSort('near');
                      }}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-40 ${
                        draftRadiusKm === value
                          ? 'bg-[#6D28D9] text-white'
                          : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'
                      }`}
                    >
                      {value} km
                    </button>
                  ))}
                </div>
                {!coords ? (
                  <button
                    type="button"
                    onClick={() => requestLocation({ switchToNear: true, forcePrompt: true })}
                    className="mt-2 text-xs font-bold text-[#6D28D9]"
                  >
                    Activar ubicación para usar el radio
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setDraftQuery('');
                  setDraftRegion('');
                  setDraftCategory('');
                  setDraftSort(coords ? 'near' : 'smart');
                  setDraftRadiusKm(null);
                }}
                className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={applySearchModal}
                className="flex-1 rounded-2xl bg-[#6D28D9] px-4 py-3 text-sm font-bold text-white"
              >
                Ver resultados
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
