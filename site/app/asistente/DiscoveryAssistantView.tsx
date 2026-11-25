'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import {
  buildDiscoveryChatUrl,
  canOfferDiscoveryChatLink,
} from '../_lib/discovery-assistant';
import { BUSINESS_ASSISTANT_CANONICAL_APP_PATH } from '../_lib/business-assistant';
import { detectCommercialIntentFromText } from '../_lib/commercial-intent';
import { alignDiscoveryRestaurantsToReplyText } from '../api/asistente/_lib/align-restaurants';
import {
  DIRECTORY_CATEGORY_CHIPS,
  DIRECTORY_REGIONS,
  DISCOVERY_CATEGORY_INITIAL,
  type DirectoryCategoryStat,
} from '../api/_lib/public-directory-geo';
import { formatChatText } from '../v/[id]/_components/chat/chat-format';
import {
  chatThemeVars,
  loadStoredChatTheme,
  resolvePreferredChatTheme,
  saveChatTheme,
  type ChatThemeMode,
} from '../v/[id]/_components/chat/chat-theme';
import type { ChatSharedLocation } from '../v/[id]/_components/chat/chat-types';
import { ChatHeader } from '../v/[id]/_components/chat/ChatHeader';
import { ChatHorizontalScroller } from '../v/[id]/_components/chat/ChatHorizontalScroller';
import { ChatReceiptTicks } from '../v/[id]/_components/chat/ChatReceiptTicks';
import {
  playChatSound,
  prefetchChatSounds,
  unlockChatSounds,
} from '../v/[id]/_components/chat/chat-sound-manager';
import {
  humanLocalReplyMs,
  humanTypingMinMs,
  sleep,
} from '../v/[id]/_components/chat/chat-timing';
import type {
  ChatFilePayload,
  ChatVoicePayload,
} from '../v/[id]/_components/chat/ChatComposer';
import { ChatCategoryCarousel } from '../v/[id]/_components/chat/ChatCategoryCarousel';
import { ChatVoiceNote } from '../v/[id]/_components/chat/ChatVoiceNote';
import type { ChatCatalogCategory } from '../v/[id]/_components/chat/chat-types';
import { DiscoveryComposer } from './DiscoveryComposer';
import { buildFairDiscoveryProducts } from './discovery-products';
import { DiscoveryProductCarousel } from './DiscoveryProductCarousel';
import {
  DiscoveryRestaurantCarousel,
  type DiscoveryUiRestaurant,
} from './DiscoveryRestaurantCarousel';

const PAGE_SIZE = 24;
const SESSION_KEY = 'elmenuxfa:discovery-assistant-session-v1';
/** Same doodle asset as restaurant chatbot WhatsApp shell. */
const CHAT_DOODLE_URL = '/chat/doodle-pattern.png';
const BRAND_NAME = 'elmenuxfa.com';
const BRAND_AVATAR = '/branding/elmenuxfa-avatar.png';
const WELCOME_HELLO = '¡Hola! 👋 Bienvenido a *elmenuxfa.com*.';
const WELCOME_PROMPT =
  '¿Qué se te antoja hoy? 🍕🍔🌮\nEscribe, manda una nota de voz 🎤 o comparte tu ubicación 📍';

type ChipAction =
  | { kind: 'category'; id: string; label: string }
  | { kind: 'query'; q: string; label: string }
  | { kind: 'near'; label: string }
  | { kind: 'focus'; label: string };

const QUICK_CHIPS: ChipAction[] = [
  { kind: 'category', id: 'pizzas', label: 'Pizzas' },
  { kind: 'category', id: 'hamburguesas', label: 'Hamburguesas' },
  { kind: 'query', q: 'pollo', label: 'Pollo' },
  { kind: 'near', label: 'Cerca de mí' },
  { kind: 'focus', label: 'Buscar' },
];

type ThreadMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  restaurants?: DiscoveryUiRestaurant[];
  /** Buy-first dish cards for a category (fair across restaurants). */
  products?: ReturnType<typeof buildFairDiscoveryProducts>;
  /** When true, restaurant carousel stays collapsed behind “Ver menús”. */
  menusCollapsed?: boolean;
  /** Portrait category tiles (same ChatCategoryCarousel as restaurant chat). */
  categories?: ChatCatalogCategory[];
  hasMore?: boolean;
  searchKey?: string;
  createdAt?: number;
  /** WhatsApp voice bubble (same as restaurant chatbot). */
  voiceUrl?: string | null;
  voiceDurationMs?: number;
  voicePending?: boolean;
  imageUrl?: string | null;
  imageName?: string | null;
};

/** Local fallbacks when a category has no live product photo yet. */
const CATEGORY_IMAGE_FALLBACKS: Record<string, string> = {
  hamburguesas: '/demo/products/burger-bbq.png',
  tacos: '/demo/products/tacos.png',
  pizzas: '/demo/products/hero-banner.png',
  arepas: '/demo/products/tacos.png',
  pollo: '/demo/products/burger-chicken.png',
  parrilla: '/demo/products/burger-mediterranean.png',
  criolla: '/demo/products/burger-mediterranean.png',
  sushi: '/demo/products/salmon.png',
  cafe: '/demo/products/limonada.png',
  postres: '/demo/products/cheesecake.png',
  saludable: '/demo/products/salmon.png',
  bares: '/demo/products/limonada.png',
};

type DirectoryPayload = {
  results?: Array<Record<string, unknown>>;
  total?: number;
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  categories?: DirectoryCategoryStat[];
};

function categoryStatToCard(stat: DirectoryCategoryStat): ChatCatalogCategory {
  const imageUrl =
    (stat.coverUrl || '').trim() ||
    CATEGORY_IMAGE_FALLBACKS[stat.id] ||
    '/branding/elmenuxfa-avatar.png';
  return {
    id: stat.id,
    name: stat.label.toUpperCase(),
    imageUrl,
    imageSourceUrl: imageUrl,
    productCount: stat.count,
    availableCount: stat.count,
  };
}

function rankDiscoveryCategories(
  all: DirectoryCategoryStat[],
  interestIds: string[],
): DirectoryCategoryStat[] {
  const interest = new Set(interestIds);
  return [...all].sort((a, b) => {
    const aBoost = interest.has(a.id) ? 40 : 0;
    const bBoost = interest.has(b.id) ? 40 : 0;
    const aScore = a.score + aBoost;
    const bScore = b.score + bBoost;
    if (bScore !== aScore) return bScore - aScore;
    return b.count - a.count;
  });
}

function buildVisibleCategoryCards(
  all: DirectoryCategoryStat[],
  visibleCount: number,
  interestIds: string[],
): { cards: ChatCatalogCategory[]; remaining: number } {
  if (all.length === 0) return { cards: [], remaining: 0 };

  const ranked = rankDiscoveryCategories(all, interestIds);
  const limit = Math.max(1, Math.min(visibleCount, ranked.length));
  return {
    cards: ranked.slice(0, limit).map(categoryStatToCard),
    remaining: Math.max(0, ranked.length - limit),
  };
}

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureSessionId() {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = `disc_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `disc_${Date.now().toString(36)}`;
  }
}

/** Map Gemini/markdown to WA markers; keep labels, never dump raw URLs into the bubble. */
function toWhatsAppText(raw: string): string {
  return raw.replace(/\*\*([^*]+)\*\*/g, '*$1*');
}

/**
 * When restaurant cards are present, strip menu URLs / link dumps so the carousel
 * carries the UX (same idea as product cards in the restaurant chatbot).
 */
function cleanDiscoveryReplyText(
  text: string,
  restaurants?: DiscoveryUiRestaurant[],
): string {
  let t = (text || '').trim();
  t = t.replace(/\*\*([^*]+)\*\*/g, '*$1*');
  // [Alegría](https://...) → *Alegría* (no URL)
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, '*$1*');
  const hasCards = Boolean(restaurants?.length);
  if (hasCards) {
    t = t.replace(/https?:\/\/[^\s<>"')\]]+/gi, '');
    const names = (restaurants || []).map((r) => r.nombre.trim().toLowerCase());
    t = t
      .split('\n')
      .filter((line) => {
        const s = line.trim();
        if (!s) return true;
        if (/^([*\-•]|\d+\.)\s*$/.test(s)) return false;
        const plain = s
          .replace(/^([*\-•]|\d+\.)\s*/, '')
          .replace(/\*+/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        for (const n of names) {
          if (!n) continue;
          if (plain === n) return false;
          if (
            plain.startsWith(`${n} `) ||
            plain.startsWith(`${n}:`) ||
            plain.startsWith(`${n}·`) ||
            plain.startsWith(`${n}-`) ||
            plain.startsWith(`${n}—`)
          ) {
            const rest = plain.slice(n.length).replace(/^[\s:·\-|–—]+/, '');
            // Drop "Name — Zona / Ver menú" listing lines; cards already show that.
            if (rest.length < 48) return false;
          }
        }
        return true;
      })
      .join('\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!t) {
      t = `¡Claro! 🍽️ Aquí tienes opciones.\nDesliza las tarjetas y toca *Ver menú*.`;
    } else if (!/[🍕🍔🌮✨👋😊🔥]/.test(t)) {
      t = `${t} ✨`;
    }
  } else if (t) {
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, '*$1*\n$2');
    if (!/[🍕🍔🌮✨👋😊🔥🔎]/.test(t)) {
      if (/no (encontr|hay)|sin resultado/i.test(t)) {
        t = `${t} 🔎`;
      } else {
        t = `${t} 😊`;
      }
    }
  } else {
    t = 'Listo ✨ Aquí tienes lo que encontré.';
  }
  return t;
}

async function withHumanTyping<T>(
  startedAt: number,
  replyLen: number,
  work: Promise<T>,
): Promise<T> {
  const result = await work;
  const need = humanTypingMinMs(replyLen);
  const elapsed = Date.now() - startedAt;
  if (elapsed < need) await sleep(need - elapsed);
  return result;
}

function formatBubbleTime(ts?: number) {
  if (!ts) return '';
  try {
    return new Intl.DateTimeFormat('es-VE', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

function mapDirectoryRow(row: Record<string, unknown>): DiscoveryUiRestaurant {
  const isOpen = row.isOpen;
  const cover =
    typeof row.coverUrl === 'string' && row.coverUrl.trim() ? row.coverUrl.trim() : null;
  const logo =
    typeof row.logoUrl === 'string' && row.logoUrl.trim() ? row.logoUrl.trim() : null;
  const currencies = Array.isArray(row.currencies)
    ? row.currencies.filter((c): c is string => typeof c === 'string')
    : [];
  const showcaseRaw = Array.isArray(row.showcaseDishes) ? row.showcaseDishes : [];
  const showcaseDishes = showcaseRaw
    .map((d) => {
      if (!d || typeof d !== 'object') return null;
      const dish = d as Record<string, unknown>;
      const name = typeof dish.name === 'string' ? dish.name.trim() : '';
      const imageUrl = typeof dish.imageUrl === 'string' ? dish.imageUrl.trim() : '';
      const price = Number(dish.price);
      if (!name || !imageUrl || !Number.isFinite(price) || price <= 0) return null;
      const compareRaw = Number(dish.compareAtPrice);
      const categoryName =
        typeof dish.categoryName === 'string' && dish.categoryName.trim()
          ? dish.categoryName.trim()
          : null;
      return {
        name,
        imageUrl,
        price,
        compareAtPrice:
          Number.isFinite(compareRaw) && compareRaw > price ? compareRaw : null,
        categoryName,
      };
    })
    .filter(Boolean) as NonNullable<DiscoveryUiRestaurant['showcaseDishes']>;

  return {
    id: String(row.id || ''),
    slug: String(row.slug || ''),
    nombre: String(row.nombre || 'Restaurante'),
    logoUrl: logo,
    coverUrl: cover || showcaseDishes[0]?.imageUrl || null,
    categoria: (row.categoria as string | null) ?? null,
    direccion: (row.direccion as string | null) ?? null,
    zonaOperacion:
      (row.zonaOperacion as string | null) ??
      (row.zona as string | null) ??
      null,
    menuUrl: String(row.menuUrl || `/v/${encodeURIComponent(String(row.slug || ''))}`),
    chatUrl: (row.chatUrl as string | null) ?? null,
    isOpen: typeof isOpen === 'boolean' ? isOpen : null,
    openLabel:
      typeof isOpen === 'boolean'
        ? ((row.openLabel as string | null) ?? (isOpen ? 'Abierto' : 'Cerrado'))
        : 'Horario no confirmado',
    distanceKm: typeof row.distanceKm === 'number' ? row.distanceKm : null,
    ratingAverage: typeof row.ratingAverage === 'number' ? row.ratingAverage : undefined,
    ratingCount: typeof row.ratingCount === 'number' ? row.ratingCount : undefined,
    currencies,
    showcaseDishes,
  };
}

function matchDirectoryRegionLabel(raw: string | null | undefined): string | null {
  const folded = (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (!folded) return null;
  for (const name of DIRECTORY_REGIONS) {
    const n = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (folded.includes(n) || n.includes(folded)) return name;
  }
  return null;
}

async function resolveRegionFromGeo(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=es`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      principalSubdivision?: string;
      city?: string;
      locality?: string;
    };
    return (
      matchDirectoryRegionLabel(data.principalSubdivision) ||
      matchDirectoryRegionLabel(data.city) ||
      matchDirectoryRegionLabel(data.locality)
    );
  } catch {
    return null;
  }
}

async function fetchDirectory(params: {
  q?: string;
  category?: string;
  region?: string;
  lat?: number;
  lng?: number;
  offset?: number;
  limit?: number;
}): Promise<DirectoryPayload> {
  const url = new URL('/api/comercios/directory', window.location.origin);
  url.searchParams.set('mode', 'clientes');
  url.searchParams.set('limit', String(params.limit ?? PAGE_SIZE));
  url.searchParams.set('offset', String(params.offset ?? 0));
  if (params.q) url.searchParams.set('q', params.q);
  if (params.category) url.searchParams.set('category', params.category);
  if (params.region) url.searchParams.set('region', params.region);
  if (params.lat != null && params.lng != null) {
    url.searchParams.set('lat', String(params.lat));
    url.searchParams.set('lng', String(params.lng));
  }
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error('directory_failed');
  const json = (await res.json()) as { data?: DirectoryPayload };
  return json.data ?? {};
}

/**
 * One directory call → real ranked categories (count > 0 only) + top covers.
 * Pass region/geo so the welcome strip matches the user’s zone.
 */
async function loadDiscoveryCategoryStats(params?: {
  region?: string;
  lat?: number;
  lng?: number;
}): Promise<DirectoryCategoryStat[]> {
  try {
    const data = await fetchDirectory({
      limit: 1,
      offset: 0,
      region: params?.region,
      lat: params?.lat,
      lng: params?.lng,
    });
    const raw = Array.isArray(data.categories) ? data.categories : [];
    return raw
      .filter((c) => c && typeof c.id === 'string' && typeof c.count === 'number' && c.count > 0)
      .map((c) => ({
        id: c.id,
        label: c.label || c.id,
        glyph: c.glyph || '',
        priority: typeof c.priority === 'number' ? c.priority : 0,
        count: c.count,
        strongCount: typeof c.strongCount === 'number' ? c.strongCount : 0,
        coverUrl: c.coverUrl || null,
        score: typeof c.score === 'number' ? c.score : c.count * 12,
      }));
  } catch {
    return [];
  }
}

function attachChatLinks(rows: DiscoveryUiRestaurant[]): DiscoveryUiRestaurant[] {
  return rows.map((r) => ({
    ...r,
    chatUrl:
      r.chatUrl ??
      (canOfferDiscoveryChatLink(r.slug) ? buildDiscoveryChatUrl(r.slug) : null),
  }));
}

type DiscoveryAssistantViewProps = {
  shareRef?: string | null;
  /** Opaque WA handoff code (?h=) — redeemed once for search context. */
  handoffCode?: string | null;
  seedQuery?: string | null;
  seedZone?: string | null;
  apiEnabled?: boolean;
};

export function DiscoveryAssistantView({
  shareRef = null,
  handoffCode = null,
  seedQuery = null,
  seedZone = null,
  apiEnabled = false,
}: DiscoveryAssistantViewProps) {
  const router = useRouter();
  const regionId = useId();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<ChatThemeMode>('light');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [composerFocusTick, setComposerFocusTick] = useState(0);
  const [recording, setRecording] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [onboardingTick, setOnboardingTick] = useState(0);
  const [categoryPool, setCategoryPool] = useState<DirectoryCategoryStat[]>([]);
  const [categoryVisibleCount, setCategoryVisibleCount] = useState(
    DISCOVERY_CATEGORY_INITIAL,
  );
  const [categoryRemaining, setCategoryRemaining] = useState(0);
  const [categoryInterest, setCategoryInterest] = useState<string[]>([]);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [regionHint, setRegionHint] = useState<string | null>(seedZone);
  const handoffAppliedRef = useRef(false);
  const handoffReadyRef = useRef(false);
  const pendingAutoQueryRef = useRef<string | null>(null);
  const autoRanRef = useRef(false);
  const [handoffBootDone, setHandoffBootDone] = useState(false);
  const [skipGenericWelcome, setSkipGenericWelcome] = useState(false);
  const [lastSearch, setLastSearch] = useState<{
    q?: string;
    category?: string;
    region?: string;
    offset: number;
    total: number;
  } | null>(null);
  const [frameStyle, setFrameStyle] = useState<CSSProperties>({
    position: 'fixed',
    inset: 0,
    width: '100%',
    height: '100dvh',
    maxHeight: '100dvh',
  });
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sessionIdRef = useRef('ssr');

  useEffect(() => {
    setMounted(true);
    setTheme(resolvePreferredChatTheme(loadStoredChatTheme()));
    sessionIdRef.current = ensureSessionId();
    if (shareRef && typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem('elmenuxfa:discovery-ref', shareRef);
      } catch {
        /* ignore */
      }
    }
  }, [shareRef]);

  // WA handoff / seed: peek only on boot (previews must not consume). Consume on first send.
  useEffect(() => {
    if (!mounted || handoffAppliedRef.current) return;
    let cancelled = false;
    const run = async () => {
      let q = seedQuery;
      let zone = seedZone;
      let code = handoffCode;
      if (typeof window !== 'undefined') {
        const frag = window.location.hash.replace(/^#/, '');
        if (frag.startsWith('h=')) code = decodeURIComponent(frag.slice(2));
        else {
          const h = new URLSearchParams(frag).get('h');
          if (h) code = h;
        }
      }
      if (code) {
        try {
          const res = await fetch('/api/wa-handoff/redeem', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              code,
              destination: 'consumer_discovery',
              action: 'peek',
            }),
          });
          const json = (await res.json()) as {
            ok?: boolean;
            payload?: {
              query?: string | null;
              zone?: string | null;
              summary?: string | null;
              conversationHint?: string | null;
              transcriptExcerpt?: string | null;
            };
          };
          if (res.ok && json.ok && json.payload) {
            q = json.payload.query || q;
            zone = json.payload.zone || zone;
            (window as unknown as { __waHandoffCode?: string }).__waHandoffCode = code;
            try {
              const { saveDiscoveryHandoffContext } = await import(
                '../_lib/conversation-handoff-client'
              );
              saveDiscoveryHandoffContext({
                profile: 'consumer_discovery',
                query: q || null,
                zone: zone || null,
                summary: json.payload.summary || null,
                conversationHint: json.payload.conversationHint || null,
                transcriptExcerpt: json.payload.transcriptExcerpt || null,
                source: 'wa_platform',
              });
            } catch {
              /* continuity best-effort */
            }
          }
        } catch {
          /* keep seed params only */
        }
      }
      if (cancelled) return;
      handoffAppliedRef.current = true;
      handoffReadyRef.current = true;
      if (zone) setRegionHint(zone);
      if (q) {
        const text = zone ? `${q} en ${zone}` : q;
        pendingAutoQueryRef.current = text;
        setSkipGenericWelcome(true);
        setDraft(text);
        setComposerFocusTick((n) => n + 1);
      }
      setHandoffBootDone(true);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [mounted, handoffCode, seedQuery, seedZone]);

  // First open / reset: typing → hello → typing → prompt + real category carousel.
  // Skip generic welcome when WA handoff already prepared a search.
  useEffect(() => {
    if (!mounted || !handoffBootDone) return;
    if (skipGenericWelcome) {
      setMessages([
        {
          id: 'welcome-hello',
          role: 'assistant',
          text: WELCOME_HELLO,
          createdAt: Date.now(),
        },
        {
          id: 'handoff-context',
          role: 'assistant',
          text: 'Retomo tu búsqueda de WhatsApp. Un momento…',
          createdAt: Date.now(),
        },
      ]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setMessages([]);
      setCategoryVisibleCount(DISCOVERY_CATEGORY_INITIAL);
      setCategoryInterest([]);
      const statsPromise = loadDiscoveryCategoryStats({
        region: regionHint || undefined,
        lat: geo?.lat,
        lng: geo?.lng,
      });
      setBusy(true);
      await sleep(humanTypingMinMs(WELCOME_HELLO.length));
      if (cancelled) return;
      setMessages([
        {
          id: 'welcome-hello',
          role: 'assistant',
          text: WELCOME_HELLO,
          createdAt: Date.now(),
        },
      ]);
      playChatSound('messageReceived');
      setBusy(false);

      await sleep(humanLocalReplyMs());
      if (cancelled) return;
      setBusy(true);
      const stats = await statsPromise.catch(() => [] as DirectoryCategoryStat[]);
      if (cancelled) return;
      setCategoryPool(stats);
      const { cards, remaining } = buildVisibleCategoryCards(
        stats,
        DISCOVERY_CATEGORY_INITIAL,
        [],
      );
      setCategoryRemaining(remaining);
      await sleep(humanTypingMinMs(WELCOME_PROMPT.length));
      if (cancelled) return;
      setMessages((prev) => [
        ...prev,
        {
          id: 'welcome-prompt',
          role: 'assistant',
          text: WELCOME_PROMPT,
          categories: cards,
          createdAt: Date.now(),
        },
      ]);
      playChatSound('messageReceived');
      setBusy(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
    // Intentionally only remount/reset — region refreshes handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, onboardingTick, handoffBootDone, skipGenericWelcome]);

  // When the user shares a zone, rebuild the category strip for that region.
  useEffect(() => {
    if (!mounted || !regionHint) return;
    let cancelled = false;
    void (async () => {
      const stats = await loadDiscoveryCategoryStats({
        region: regionHint,
        lat: geo?.lat,
        lng: geo?.lng,
      });
      if (cancelled) return;
      setCategoryPool(stats);
      setCategoryVisibleCount(DISCOVERY_CATEGORY_INITIAL);
      const { cards, remaining } = buildVisibleCategoryCards(
        stats,
        DISCOVERY_CATEGORY_INITIAL,
        categoryInterest,
      );
      setCategoryRemaining(remaining);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === 'welcome-prompt');
        if (idx < 0) return prev;
        const copy = [...prev];
        copy[idx] = { ...copy[idx], categories: cards };
        return copy;
      });
    })();
    return () => {
      cancelled = true;
    };
    // categoryInterest intentionally omitted — keep current boosts when region changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, regionHint, geo?.lat, geo?.lng]);

  const syncWelcomeCategories = useCallback(
    (nextVisible: number, nextInterest: string[]) => {
      const { cards, remaining } = buildVisibleCategoryCards(
        categoryPool,
        nextVisible,
        nextInterest,
      );
      setCategoryRemaining(remaining);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === 'welcome-prompt');
        if (idx < 0) return prev;
        const copy = [...prev];
        copy[idx] = { ...copy[idx], categories: cards };
        return copy;
      });
    },
    [categoryPool],
  );

  const revealMoreCategories = useCallback(() => {
    // Same UX as Trueno “Ver todos”: unlock the full ranked strip at once.
    const nextVisible = Math.max(categoryPool.length, categoryVisibleCount);
    setCategoryVisibleCount(nextVisible);
    syncWelcomeCategories(nextVisible, categoryInterest);
  }, [
    categoryInterest,
    categoryPool.length,
    categoryVisibleCount,
    syncWelcomeCategories,
  ]);

  // Same visualViewport keyboard handling as restaurant WhatsApp chat.
  useEffect(() => {
    const sync = () => {
      const vv = window.visualViewport;
      if (!vv) {
        setFrameStyle({
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100dvh',
          maxHeight: '100dvh',
        });
        return;
      }
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      setFrameStyle({
        position: 'fixed',
        left: 0,
        right: 0,
        top: 0,
        width: '100%',
        height: `${vv.height}px`,
        maxHeight: `${vv.height}px`,
      });
    };
    sync();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy, composerFocusTick]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ChatThemeMode = prev === 'dark' ? 'light' : 'dark';
      saveChatTheme(next);
      return next;
    });
  }, []);

  const resetConversation = useCallback(() => {
    setDraft('');
    setLastSearch(null);
    setBusy(false);
    try {
      const id = `disc_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
      sessionStorage.setItem(SESSION_KEY, id);
      sessionIdRef.current = id;
    } catch {
      /* ignore */
    }
    setOnboardingTick((t) => t + 1);
  }, []);

  const pushAssistant = useCallback((msg: Omit<ThreadMessage, 'id' | 'role'>) => {
    const text = cleanDiscoveryReplyText(msg.text, msg.restaurants);
    setMessages((prev) => [
      ...prev,
      { id: newId('a'), role: 'assistant', createdAt: Date.now(), ...msg, text },
    ]);
    playChatSound('messageReceived');
  }, []);

  const runDirectorySearch = useCallback(
    async (input: {
      q?: string;
      category?: string;
      region?: string;
      lat?: number;
      lng?: number;
      offset?: number;
      userLabel?: string;
      append?: boolean;
    }) => {
      setBusy(true);
      const startedAt = Date.now();
      try {
        const offset = input.offset ?? 0;
        const lat = input.lat ?? geo?.lat;
        const lng = input.lng ?? geo?.lng;
        const data = await withHumanTyping(
          startedAt,
          72,
          fetchDirectory({
            q: input.q,
            category: input.category,
            region: input.region ?? regionHint ?? undefined,
            lat,
            lng,
            offset,
            limit: PAGE_SIZE,
          }),
        );
        const rows = attachChatLinks((data.results || []).map(mapDirectoryRow));
        const total = data.total ?? rows.length;
        const hasMore = Boolean(data.hasMore);
        setLastSearch({
          q: input.q,
          category: input.category,
          region: input.region ?? regionHint ?? undefined,
          offset,
          total,
        });

        if (input.append) {
          setMessages((prev) => {
            const copy = [...prev];
            for (let i = copy.length - 1; i >= 0; i -= 1) {
              if (copy[i].restaurants) {
                copy[i] = {
                  ...copy[i],
                  restaurants: [...(copy[i].restaurants || []), ...rows],
                  hasMore,
                };
                break;
              }
            }
            return copy;
          });
        } else {
          const label = input.userLabel || input.q || input.category || 'búsqueda';
          const products = buildFairDiscoveryProducts(rows, {
            categoryId: input.category,
            limit: 18,
          });
          const zoneBit = regionHint ? ` en *${regionHint}*` : '';
          if (rows.length === 0) {
            pushAssistant({
              text: `No encontré opciones para “${label}”${zoneBit} 😕\nPrueba otra categoría, zona o una nota de voz 🎤`,
              hasMore: false,
              searchKey: `${input.category || ''}|${input.q || ''}|${offset}`,
            });
          } else if (products.length > 0) {
            pushAssistant({
              text: `¡Claro! 🔥 Estos platos de “${label}”${zoneBit} te van a provocar.\nDesliza, mira el precio y toca *Pedir ahora*.`,
              products,
              restaurants: rows,
              menusCollapsed: true,
              hasMore,
              searchKey: `${input.category || ''}|${input.q || ''}|${offset}`,
            });
          } else {
            pushAssistant({
              text: `¡Claro! 🍽️ Encontré *${total}* restaurante${total === 1 ? '' : 's'} para “${label}”${zoneBit}.\nDesliza y toca *Ver menú*.`,
              restaurants: rows,
              menusCollapsed: false,
              hasMore,
              searchKey: `${input.category || ''}|${input.q || ''}|${offset}`,
            });
          }
        }
      } catch {
        pushAssistant({
          text: 'Uy, no pude consultar el directorio ahora 😕 Intenta de nuevo en un momento.',
        });
      } finally {
        setBusy(false);
      }
    },
    [geo, pushAssistant, regionHint],
  );

  const requestGeo = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        pushAssistant({
          text: 'Tu navegador no permite ubicación. Escribe una zona o ciudad (por ejemplo Táchira).',
        });
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setGeo(next);
          void resolveRegionFromGeo(next.lat, next.lng).then((region) => {
            if (region) setRegionHint(region);
          });
          resolve(next);
        },
        () => {
          pushAssistant({
            text: 'No pude usar tu ubicación. Escribe una zona o ciudad para filtrar.',
          });
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
      );
    });
  }, [pushAssistant]);

  const runAgent = useCallback(
    async (userText: string) => {
      const commercial = detectCommercialIntentFromText(userText);
      if (commercial.commercial) {
        setBusy(true);
        const bizUrl = `${BUSINESS_ASSISTANT_CANONICAL_APP_PATH}`;
        const tip =
          commercial.kind === 'register'
            ? 'Para registrar o unir tu negocio'
            : 'Para gestionar menú, precios o configuración';
        await sleep(humanTypingMinMs(80));
        pushAssistant({
          text: `${tip} te paso al asistente empresarial (misma cuenta del panel):\n${bizUrl}\n\nTu contexto de WhatsApp se conserva si abriste un enlace seguro.`,
        });
        setBusy(false);
        return;
      }
      if (!apiEnabled) {
        await runDirectorySearch({ q: userText, userLabel: userText });
        return;
      }
      setBusy(true);
      const startedAt = Date.now();
      try {
        const history = messages
          .filter(
            (m) =>
              (m.role === 'user' || m.role === 'assistant') &&
              Boolean((m.text || '').trim()),
          )
          .map((m) => ({ role: m.role as 'user' | 'assistant', text: m.text }))
          .concat([{ role: 'user' as const, text: userText }]);

        const res = await fetch('/api/asistente', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: history,
            sessionId: sessionIdRef.current,
            lat: geo?.lat,
            lng: geo?.lng,
            region: regionHint || undefined,
            ref: shareRef || undefined,
          }),
        });
        const json = (await res.json()) as {
          text?: string;
          restaurants?: DiscoveryUiRestaurant[];
          fallback?: boolean;
        };
        if (!res.ok) {
          await runDirectorySearch({ q: userText, userLabel: userText });
          return;
        }
        const rawText = json.text || 'Aquí tienes lo que encontré ✨';
        const restaurants = alignDiscoveryRestaurantsToReplyText(
          rawText,
          (json.restaurants || []).map((r) =>
            mapDirectoryRow(r as unknown as Record<string, unknown>),
          ),
        );
        if (restaurants.length === 0 && json.fallback) {
          await runDirectorySearch({ q: userText, userLabel: userText });
          return;
        }
        const products = buildFairDiscoveryProducts(restaurants, { limit: 18 });
        const replyText = cleanDiscoveryReplyText(rawText, restaurants);
        const elapsed = Date.now() - startedAt;
        const need = humanTypingMinMs(replyText.length);
        if (elapsed < need) await sleep(need - elapsed);
        pushAssistant({
          text: replyText,
          restaurants: attachChatLinks(restaurants),
          products: products.length > 0 ? products : undefined,
          menusCollapsed: products.length > 0,
          hasMore: false,
        });
      } catch {
        await runDirectorySearch({ q: userText, userLabel: userText });
      } finally {
        setBusy(false);
      }
    },
    [apiEnabled, geo, messages, pushAssistant, regionHint, runDirectorySearch, shareRef],
  );

  // Auto-run prepared WA search once (no re-ask what/where).
  // Do not consume here — preview bots that execute JS must not burn the code.
  useEffect(() => {
    if (!mounted || !handoffBootDone || !skipGenericWelcome) return;
    if (autoRanRef.current) return;
    const q = pendingAutoQueryRef.current;
    if (!q) return;
    autoRanRef.current = true;
    pendingAutoQueryRef.current = null;
    setMessages((prev) => [
      ...prev,
      { id: newId('u'), role: 'user', text: q, createdAt: Date.now() },
    ]);
    void runAgent(q);
  }, [mounted, handoffBootDone, skipGenericWelcome, runAgent]);

  const onChip = useCallback(
    async (chip: ChipAction) => {
      if (busy) return;
      if (chip.kind === 'focus') {
        const el = document.querySelector<HTMLTextAreaElement>(
          '[data-testid="discovery-composer-input"]',
        );
        el?.focus();
        return;
      }
      if (chip.kind === 'near') {
        setMessages((prev) => [
          ...prev,
          { id: newId('u'), role: 'user', text: chip.label, createdAt: Date.now() },
        ]);
        const coords = geo || (await requestGeo());
        if (!coords) return;
        await runDirectorySearch({
          userLabel: 'cerca de mí',
          q: '',
          lat: coords.lat,
          lng: coords.lng,
        });
        return;
      }
      const label = chip.label;
      setMessages((prev) => [
        ...prev,
        { id: newId('u'), role: 'user', text: label, createdAt: Date.now() },
      ]);
      if (chip.kind === 'category') {
        await runDirectorySearch({ category: chip.id, userLabel: label });
        return;
      }
      await runDirectorySearch({ q: chip.q, userLabel: label });
    },
    [busy, geo, requestGeo, runDirectorySearch],
  );

  const onSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    unlockChatSounds();
    playChatSound('messageSent');
    setDraft('');
    setMessages((prev) => [
      ...prev,
      { id: newId('u'), role: 'user', text, createdAt: Date.now() },
    ]);

    // Consume one-time handoff only on intentional user send (not page boot / previews).
    const pendingCode = (window as unknown as { __waHandoffCode?: string }).__waHandoffCode;
    if (pendingCode) {
      (window as unknown as { __waHandoffCode?: string }).__waHandoffCode = undefined;
      void fetch('/api/wa-handoff/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: pendingCode,
          destination: 'consumer_discovery',
          action: 'consume',
        }),
      }).catch(() => null);
    }

    if (text.length < 48) {
      const matchedRegion = matchDirectoryRegionLabel(text);
      if (matchedRegion) setRegionHint(matchedRegion);
    }

    await runAgent(text);
  }, [busy, draft, runAgent]);

  const onSendVoice = useCallback(
    async (payload: ChatVoicePayload) => {
      if (busy) return;
      unlockChatSounds();
      playChatSound('messageSent');
      const transcript = (payload.transcript || '').trim();
      // Bubble = audio player only (like restaurant chatbot). Transcript feeds the agent.
      setMessages((prev) => [
        ...prev,
        {
          id: newId('u'),
          role: 'user',
          text: '',
          voiceUrl: payload.url,
          voiceDurationMs: payload.durationMs,
          createdAt: Date.now(),
        },
      ]);
      if (!transcript) {
        setBusy(true);
        await sleep(humanTypingMinMs(80));
        pushAssistant({
          text: 'Recibí tu nota de voz 🎤\n¿Me la puedes escribir o dictar un poco más claro? Así te busco restaurantes al instante 🔍',
        });
        setBusy(false);
        return;
      }
      await runAgent(transcript);
    },
    [busy, pushAssistant, runAgent],
  );

  const onSendFile = useCallback(
    async (payload: ChatFilePayload) => {
      if (busy) return;
      unlockChatSounds();
      playChatSound('messageSent');
      const isImage = payload.kind === 'image';
      setMessages((prev) => [
        ...prev,
        {
          id: newId('u'),
          role: 'user',
          text: isImage ? '' : `📎 ${payload.file.name || 'Archivo'}`,
          imageUrl: isImage ? payload.url : null,
          imageName: payload.file.name || 'Imagen',
          createdAt: Date.now(),
        },
      ]);
      setBusy(true);
      await sleep(humanTypingMinMs(70));
      pushAssistant({
        text: 'Gracias por el archivo 📎 Por ahora busco mejor con texto, voz 🎤 o ubicación 📍\n¿Qué se te antoja?',
      });
      setBusy(false);
    },
    [busy, pushAssistant],
  );

  const onLoadMore = useCallback(async () => {
    if (!lastSearch || busy) return;
    const nextOffset = lastSearch.offset + PAGE_SIZE;
    if (nextOffset >= lastSearch.total) return;
    await runDirectorySearch({
      q: lastSearch.q,
      category: lastSearch.category,
      region: lastSearch.region,
      offset: nextOffset,
      append: true,
      userLabel: lastSearch.q || lastSearch.category,
    });
    setLastSearch((prev) => (prev ? { ...prev, offset: nextOffset } : prev));
  }, [busy, lastSearch, runDirectorySearch]);

  const onShareLocation = useCallback(
    (location: ChatSharedLocation) => {
      unlockChatSounds();
      playChatSound('messageSent');
      const next = { lat: location.lat, lng: location.lng };
      setGeo(next);
      void resolveRegionFromGeo(next.lat, next.lng).then((region) => {
        if (region) setRegionHint(region);
      });
      setMessages((prev) => [
        ...prev,
        {
          id: newId('u'),
          role: 'user',
          text: '📍 Ubicación compartida',
          createdAt: Date.now(),
        },
      ]);
      void runDirectorySearch({
        userLabel: 'cerca de mí',
        q: '',
        lat: next.lat,
        lng: next.lng,
      });
    },
    [runDirectorySearch],
  );

  const vars = chatThemeVars(theme) as CSSProperties;
  const hasWelcomeCategories = messages.some((m) => (m.categories?.length || 0) > 0);
  const showSuggestions =
    messages.length >= 2 &&
    messages.length <= 4 &&
    !busy &&
    !recording;
  // Categories live in the portrait carousel; chips stay as utility shortcuts only.
  const suggestionRows: Array<{ chip: ChipAction; testId: string; label: string }> = [
    ...QUICK_CHIPS.filter((chip) => chip.kind === 'near' || chip.kind === 'focus').map(
      (chip) => ({
        chip,
        testId: `discovery-chip-${chip.label.toLowerCase().replace(/\s+/g, '-')}`,
        label: chip.label,
      }),
    ),
    ...(hasWelcomeCategories
      ? []
      : QUICK_CHIPS.filter((chip) => chip.kind === 'category' || chip.kind === 'query').map(
          (chip) => ({
            chip,
            testId: `discovery-chip-${chip.label.toLowerCase().replace(/\s+/g, '-')}`,
            label: chip.label,
          }),
        )),
  ];

  if (!mounted) {
    return (
      <div
        className="flex h-[100dvh] w-full items-center justify-center text-sm text-slate-500"
        data-discovery-assistant="1"
        data-discovery-loading="1"
      >
        Cargando asistente…
      </div>
    );
  }

  return (
    <section
      className="relative z-[55] flex w-full flex-col overflow-hidden"
      style={{
        ...frameStyle,
        ...vars,
        backgroundColor: 'var(--chat-bg)',
        color: 'var(--chat-text)',
      }}
      aria-labelledby={regionId}
      data-chat-theme={theme}
      data-discovery-assistant="1"
      data-discovery-ref={shareRef || undefined}
      data-chatbot-preview="1"
      data-chatbot-typing={busy ? '1' : '0'}
      onPointerDownCapture={() => {
        unlockChatSounds();
        prefetchChatSounds();
      }}
    >
      <div
        className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden shadow-sm sm:border-x sm:border-[var(--chat-header-border)]"
        data-chat-shell="1"
      >
        <h2 id={regionId} className="sr-only">
          Asistente {BRAND_NAME}
        </h2>

        <ChatHeader
          businessName={BRAND_NAME}
          logoUrl={BRAND_AVATAR}
          initialLetter="e"
          cartCount={0}
          cartTotalLabel=""
          theme={theme}
          onToggleTheme={toggleTheme}
          onBack={() => router.push('/')}
          onOpenMenu={() => router.push('/')}
          onOpenCart={() => undefined}
          onNewConversation={resetConversation}
          isTyping={busy}
          subtitle="en línea"
          hideCommerceActions
        />

        <div
          className="relative flex min-h-0 flex-1 flex-col"
          style={{ backgroundColor: 'var(--chat-bg)' }}
          data-chat-wallpaper="1"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0"
            data-chat-doodle="1"
            style={{
              backgroundImage: `url('${CHAT_DOODLE_URL}')`,
              backgroundRepeat: 'repeat',
              backgroundPosition: 'top center',
              backgroundSize: '420px auto',
              opacity: theme === 'dark' ? 0.07 : 0.055,
              filter: theme === 'light' ? 'invert(1)' : 'none',
            }}
          />

          <div
            ref={scrollRef}
            id="discovery-thread"
            className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain px-0 py-2"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            data-testid="discovery-thread"
            data-chat-scroll="1"
          >
            <div className="mx-auto flex w-full max-w-5xl flex-col pb-1">
              {messages.map((m, index) => {
                const prev = messages[index - 1];
                const next = messages[index + 1];
                const isUser = m.role === 'user';
                const groupedWithPrev =
                  Boolean(prev) && prev.role === m.role && m.role !== 'system';
                const groupedWithNext =
                  Boolean(next) && next.role === m.role && m.role !== 'system';
                const radius = isUser
                  ? [
                      'rounded-2xl',
                      groupedWithPrev ? 'rounded-tr-md' : 'rounded-tr-2xl',
                      groupedWithNext ? 'rounded-br-md' : 'rounded-br-md',
                    ].join(' ')
                  : [
                      'rounded-2xl',
                      groupedWithPrev ? 'rounded-tl-md' : 'rounded-tl-2xl',
                      groupedWithNext ? 'rounded-bl-md' : 'rounded-bl-md',
                    ].join(' ');
                const timeLabel = formatBubbleTime(m.createdAt);
                const hasVoice = Boolean(m.voiceUrl);
                const hasImage = Boolean(m.imageUrl);
                const hasText = Boolean((m.text || '').trim());
                const hasBubble = hasText || hasVoice || hasImage;
                const hasProducts = Boolean(m.products && m.products.length > 0);
                const hasCards = Boolean(m.restaurants && m.restaurants.length > 0);
                const showMenus =
                  hasCards && (!m.menusCollapsed || !hasProducts);
                const hasCategories = Boolean(m.categories && m.categories.length > 0);

                return (
                  <div
                    key={m.id}
                    className={`flex w-full flex-col px-3 ${isUser ? 'items-end' : 'items-start'} ${groupedWithPrev ? 'mt-0.5' : 'mt-1.5'}`}
                    data-chat-role={m.role}
                  >
                    {hasBubble ? (
                      <div
                        className={[
                          'relative max-w-[min(85%,22rem)] px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-[1.4] shadow-sm',
                          radius,
                          isUser
                            ? 'bg-[var(--chat-bubble-out)] text-[var(--chat-text)]'
                            : 'bg-[var(--chat-bubble-in)] text-[var(--chat-text)]',
                        ].join(' ')}
                        data-chat-bubble="1"
                      >
                        {hasVoice ? (
                          <div className="mb-1">
                            <ChatVoiceNote
                              src={m.voiceUrl}
                              durationMs={m.voiceDurationMs}
                              pending={m.voicePending}
                              incoming={!isUser}
                              avatarUrl={isUser ? undefined : BRAND_AVATAR}
                              avatarLetter={isUser ? undefined : BRAND_NAME}
                            />
                          </div>
                        ) : null}
                        {hasImage && m.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.imageUrl}
                            alt={m.imageName || 'Imagen'}
                            className="mb-1 max-h-48 w-full rounded-lg object-cover"
                            data-chat-media-image="1"
                          />
                        ) : null}
                        {hasText ? (
                          <div className="whitespace-pre-wrap break-words" data-chat-text="1">
                            {formatChatText(toWhatsAppText(m.text))}
                          </div>
                        ) : null}
                        <span className="mt-0.5 flex items-center justify-end gap-0.5 self-end pl-2 text-[10.5px] tabular-nums leading-none text-[var(--chat-text-muted)]">
                          {timeLabel ? <span>{timeLabel}</span> : null}
                          {isUser ? <ChatReceiptTicks status="read" /> : null}
                        </span>
                      </div>
                    ) : null}

                    {hasCategories ? (
                      <div
                        className="-mx-3 mt-1.5 w-[calc(100%+1.5rem)] max-w-5xl"
                        data-chat-catalog-categories="1"
                        data-discovery-categories="1"
                      >
                        <ChatCategoryCarousel
                          categories={m.categories || []}
                          onSeeAll={
                            m.id === 'welcome-prompt' && categoryRemaining > 0
                              ? revealMoreCategories
                              : undefined
                          }
                          seeAllLabel={
                            categoryRemaining === 1
                              ? 'Ver 1 categoría más'
                              : `Ver todas las categorías (${categoryRemaining})`
                          }
                          onSelectCategory={(categoryId) => {
                            if (busy) return;
                            const chip =
                              categoryPool.find((c) => c.id === categoryId) ||
                              DIRECTORY_CATEGORY_CHIPS.find((c) => c.id === categoryId);
                            const label = chip?.label || categoryId;
                            const nextInterest = categoryInterest.includes(categoryId)
                              ? categoryInterest
                              : [...categoryInterest, categoryId].slice(-4);
                            setCategoryInterest(nextInterest);
                            setMessages((prev) => [
                              ...prev,
                              {
                                id: newId('u'),
                                role: 'user',
                                text: label,
                                createdAt: Date.now(),
                              },
                            ]);
                            void runDirectorySearch({
                              category: categoryId,
                              userLabel: label,
                            });
                          }}
                        />
                      </div>
                    ) : null}

                    {hasProducts ? (
                      <div
                        className="-mx-3 mt-1.5 w-[calc(100%+1.5rem)] max-w-5xl"
                        data-discovery-products="1"
                      >
                        <DiscoveryProductCarousel
                          products={m.products || []}
                          onSeeMenus={
                            hasCards && m.menusCollapsed
                              ? () => {
                                  setMessages((prev) =>
                                    prev.map((msg) =>
                                      msg.id === m.id
                                        ? { ...msg, menusCollapsed: false }
                                        : msg,
                                    ),
                                  );
                                }
                              : undefined
                          }
                        />
                      </div>
                    ) : null}

                    {showMenus ? (
                      <div
                        className="-mx-3 mt-1.5 w-[calc(100%+1.5rem)] max-w-5xl"
                        data-chat-catalog-products="1"
                        data-discovery-cards="1"
                      >
                        {hasProducts ? (
                          <p className="px-3 pb-1 text-[12px] font-medium text-[var(--chat-text-muted)]">
                            Menús de restaurantes
                          </p>
                        ) : null}
                        <DiscoveryRestaurantCarousel restaurants={m.restaurants || []} />
                        {m.hasMore ? (
                          <div className="px-3 pb-1">
                            <button
                              type="button"
                              onClick={() => void onLoadMore()}
                              disabled={busy}
                              className="inline-flex w-full max-w-[min(92%,22.5rem)] items-center justify-center gap-1 rounded-lg bg-[var(--chat-send)] px-3 py-2 text-[13px] font-semibold text-[var(--chat-send-fg)] active:opacity-90 disabled:opacity-60"
                              data-testid="discovery-load-more"
                            >
                              Ver todos los restaurantes
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {busy ? (
                <div
                  className="mt-1.5 flex justify-start px-3"
                  aria-label="El asistente está escribiendo"
                  data-testid="discovery-typing"
                  data-chat-typing="1"
                >
                  <div className="rounded-2xl rounded-bl-md bg-[var(--chat-bubble-in)] px-3.5 py-2.5 shadow-sm">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--chat-text-muted)] [animation-duration:900ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--chat-text-muted)] [animation-delay:120ms] [animation-duration:900ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--chat-text-muted)] [animation-delay:240ms] [animation-duration:900ms]" />
                    </span>
                  </div>
                </div>
              ) : null}

              <div ref={endRef} className="h-px w-full shrink-0" />
            </div>
          </div>
        </div>

        {showSuggestions ? (
          <div
            className="relative z-20 shrink-0 pt-1"
            style={{ backgroundColor: 'var(--chat-composer)' }}
            data-testid="discovery-chips"
            data-chat-suggested-replies="1"
          >
            <div className="mx-auto w-full max-w-5xl">
              <ChatHorizontalScroller ariaLabel="Respuestas sugeridas" snap={false}>
                {suggestionRows.map((row) => (
                  <button
                    key={row.testId}
                    type="button"
                    disabled={busy}
                    data-testid={row.testId}
                    data-chat-suggested-chip={row.testId}
                    onClick={() => void onChip(row.chip)}
                    className="shrink-0 whitespace-nowrap rounded-full border border-[var(--chat-card-border)] bg-[var(--chat-card)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--chat-text)] shadow-sm transition active:scale-[0.97] active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-send)]"
                  >
                    {row.label}
                  </button>
                ))}
              </ChatHorizontalScroller>
            </div>
          </div>
        ) : null}

        <div
          className="relative z-20 shrink-0"
          style={{ backgroundColor: 'var(--chat-composer)' }}
          data-discovery-composer-shell="1"
        >
          <div className="mx-auto w-full max-w-5xl">
            <DiscoveryComposer
              value={draft}
              disabled={busy}
              onChange={setDraft}
              onSend={() => void onSend()}
              onSendVoice={(payload) => {
                void onSendVoice(payload);
              }}
              onSendFile={onSendFile}
              onShareLocation={onShareLocation}
              onRecordingChange={setRecording}
              onComposerFocus={() => setComposerFocusTick((t) => t + 1)}
              placeholder="Escribe un mensaje"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
