'use client';

import Link from 'next/link';
import { Moon, Sun, UtensilsCrossed } from 'lucide-react';
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
import { DIRECTORY_CATEGORY_CHIPS } from '../api/_lib/public-directory-geo';
import {
  chatThemeVars,
  loadStoredChatTheme,
  resolvePreferredChatTheme,
  saveChatTheme,
  type ChatThemeMode,
} from '../v/[id]/_components/chat/chat-theme';
import { DiscoveryComposer } from './DiscoveryComposer';
import {
  DiscoveryRestaurantCarousel,
  type DiscoveryUiRestaurant,
} from './DiscoveryRestaurantCarousel';

const PAGE_SIZE = 24;
const SESSION_KEY = 'elmenuxfa:discovery-assistant-session-v1';

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
  hasMore?: boolean;
  searchKey?: string;
};

type DirectoryPayload = {
  results?: Array<Record<string, unknown>>;
  total?: number;
  offset?: number;
  limit?: number;
  hasMore?: boolean;
};

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

function mapDirectoryRow(row: Record<string, unknown>): DiscoveryUiRestaurant {
  const isOpen = row.isOpen;
  return {
    id: String(row.id || ''),
    slug: String(row.slug || ''),
    nombre: String(row.nombre || 'Restaurante'),
    logoUrl: (row.logoUrl as string | null) ?? null,
    categoria: (row.categoria as string | null) ?? null,
    direccion: (row.direccion as string | null) ?? null,
    zonaOperacion: (row.zonaOperacion as string | null) ?? null,
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
  };
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
  apiEnabled?: boolean;
};

export function DiscoveryAssistantView({
  shareRef = null,
  apiEnabled = false,
}: DiscoveryAssistantViewProps) {
  const listId = useId();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<ChatThemeMode>('light');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: '¡Hola! ¿Qué se te antoja comer hoy?',
    },
  ]);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [regionHint, setRegionHint] = useState<string | null>(null);
  const [lastSearch, setLastSearch] = useState<{
    q?: string;
    category?: string;
    region?: string;
    offset: number;
    total: number;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const sessionIdRef = useRef('ssr');

  useEffect(() => {
    setMounted(true);
    setTheme(resolvePreferredChatTheme(loadStoredChatTheme()));
    sessionIdRef.current = ensureSessionId();
    // Persist non-sensitive share origin for future analytics (e.g. ?ref=wa).
    if (shareRef && typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem('elmenuxfa:discovery-ref', shareRef);
      } catch {
        /* ignore */
      }
    }
  }, [shareRef]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ChatThemeMode = prev === 'dark' ? 'light' : 'dark';
      saveChatTheme(next);
      return next;
    });
  }, []);

  const pushAssistant = useCallback((msg: Omit<ThreadMessage, 'id' | 'role'>) => {
    setMessages((prev) => [
      ...prev,
      { id: newId('a'), role: 'assistant', ...msg },
    ]);
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
      try {
        const offset = input.offset ?? 0;
        const lat = input.lat ?? geo?.lat;
        const lng = input.lng ?? geo?.lng;
        const data = await fetchDirectory({
          q: input.q,
          category: input.category,
          region: input.region ?? regionHint ?? undefined,
          lat,
          lng,
          offset,
          limit: PAGE_SIZE,
        });
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
          pushAssistant({
            text:
              rows.length === 0
                ? `No encontré restaurantes para “${label}”. Prueba otra categoría o zona.`
                : `Encontré ${total} opción${total === 1 ? '' : 'es'} para “${label}”.`,
            restaurants: rows,
            hasMore,
            searchKey: `${input.category || ''}|${input.q || ''}|${offset}`,
          });
        }
      } catch {
        pushAssistant({
          text: 'No pude consultar el directorio ahora. Intenta de nuevo en un momento.',
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
      if (!apiEnabled) {
        await runDirectorySearch({ q: userText, userLabel: userText });
        return;
      }
      setBusy(true);
      try {
        const history = messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
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
        const restaurants = json.restaurants || [];
        if (restaurants.length === 0 && json.fallback) {
          // Conventional directory search continues when the agent cannot help.
          await runDirectorySearch({ q: userText, userLabel: userText });
          return;
        }
        pushAssistant({
          text: json.text || 'Aquí tienes lo que encontré.',
          restaurants,
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
          { id: newId('u'), role: 'user', text: chip.label },
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
      setMessages((prev) => [...prev, { id: newId('u'), role: 'user', text: label }]);
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
    setDraft('');
    setMessages((prev) => [...prev, { id: newId('u'), role: 'user', text }]);

    // Soft region capture when user types a place after geo deny.
    if (
      /tachira|táchira|caracas|zulia|lara|merida|mérida|valencia|maracaibo/i.test(text) &&
      text.length < 40
    ) {
      setRegionHint(text);
    }

    await runAgent(text);
  }, [busy, draft, runAgent]);

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

  const vars = chatThemeVars(theme) as CSSProperties;

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
    <div
      className="flex h-[100dvh] w-full flex-col"
      style={vars}
      data-chat-theme={theme}
      data-discovery-assistant="1"
      data-discovery-ref={shareRef || undefined}
    >
      <header
        className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5"
        style={{
          background: 'var(--chat-header)',
          borderColor: 'var(--chat-header-border)',
        }}
      >
        <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--chat-send)] text-[var(--chat-send-fg)]">
          <UtensilsCrossed className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-[var(--chat-text)]">
            Asistente El Menú XFA
          </p>
          <p className="truncate text-[12px] text-[var(--chat-text-muted)]">
            Descubre dónde comer
          </p>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="grid h-9 w-9 place-items-center rounded-full text-[var(--chat-text)]"
          aria-label={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <div
        id={listId}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4"
        style={{ background: 'var(--chat-bg)' }}
        data-testid="discovery-thread"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-3 py-2 text-[14px] leading-snug shadow-sm ${
                m.role === 'user'
                  ? 'rounded-br-md bg-[var(--chat-bubble-out)] text-[var(--chat-text)]'
                  : 'rounded-bl-md bg-[var(--chat-bubble-in)] text-[var(--chat-text)]'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.restaurants && m.restaurants.length > 0 ? (
                <div className="mt-2 -mx-1">
                  <DiscoveryRestaurantCarousel restaurants={m.restaurants} />
                </div>
              ) : null}
              {m.hasMore ? (
                <button
                  type="button"
                  onClick={() => void onLoadMore()}
                  disabled={busy}
                  className="mt-2 text-[12px] font-semibold text-[var(--chat-link)]"
                  data-testid="discovery-load-more"
                >
                  Ver más
                </button>
              ) : null}
            </div>
          </div>
        ))}

        {messages.length <= 1 ? (
          <div className="flex flex-wrap gap-2 pt-1" data-testid="discovery-chips">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                disabled={busy}
                onClick={() => void onChip(chip)}
                className="rounded-full border border-[var(--chat-card-border)] bg-[var(--chat-card)] px-3 py-1.5 text-[12px] font-semibold text-[var(--chat-text)] shadow-sm"
                data-testid={`discovery-chip-${chip.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {chip.label}
              </button>
            ))}
            {DIRECTORY_CATEGORY_CHIPS.filter(
              (c) => !['pizzas', 'hamburguesas'].includes(c.id),
            )
              .slice(0, 4)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onChip({ kind: 'category', id: c.id, label: c.label })
                  }
                  className="rounded-full border border-[var(--chat-card-border)] bg-[var(--chat-card)] px-3 py-1.5 text-[12px] font-semibold text-[var(--chat-text)] shadow-sm"
                >
                  {c.glyph} {c.label}
                </button>
              ))}
          </div>
        ) : null}

        {busy ? (
          <p className="text-[12px] text-[var(--chat-text-muted)]" data-testid="discovery-typing">
            Buscando…
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div
        className="shrink-0 border-t px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1"
        style={{
          background: 'var(--chat-composer)',
          borderColor: 'var(--chat-header-border)',
        }}
      >
        <DiscoveryComposer
          value={draft}
          disabled={busy}
          onChange={setDraft}
          onSend={() => void onSend()}
          placeholder="Pizza, hamburguesa, zona…"
        />
        <p className="px-2 pb-1 text-center text-[10px] text-[var(--chat-text-muted)]">
          <Link href="/" className="underline-offset-2 hover:underline">
            Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
