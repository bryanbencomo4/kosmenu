'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { getBrowserSupabase } from '../_lib/supabase-browser';
import { BUSINESS_ASSISTANT_APP_HOME } from '../_lib/business-assistant';
import { formatChatText } from '../v/[id]/_components/chat/chat-format';
import {
  isChatSoundsEnabled,
  playChatSound,
  prefetchChatSounds,
  setChatSoundsEnabled,
  unlockChatSounds,
} from '../v/[id]/_components/chat/chat-sound-manager';
import {
  chatThemeVars,
  loadStoredChatTheme,
  resolvePreferredChatTheme,
  saveChatTheme,
  type ChatThemeMode,
} from '../v/[id]/_components/chat/chat-theme';
import { ChatComposer } from '../v/[id]/_components/chat/ChatComposer';
import { ChatHeader } from '../v/[id]/_components/chat/ChatHeader';
import {
  ChatSuggestedReplies,
  type ChatSuggestedChip,
} from '../v/[id]/_components/chat/ChatSuggestedReplies';
import {
  BusinessAccountCard,
  type AccountCardMode,
} from './BusinessAccountCard';
import { BusinessAuthCard } from './BusinessAuthCard';
import {
  BusinessCustomersCard,
  type CustomersCardData,
} from './BusinessCustomersCard';
import {
  BusinessMetricsCard,
  type MetricsCardData,
} from './BusinessMetricsCard';
import {
  BusinessMenuView,
  type BusinessMenuViewData,
} from './BusinessMenuView';
import {
  BusinessOrdersListCard,
  type OrdersListData,
} from './BusinessOrdersListCard';

const CHAT_DOODLE_URL = '/chat/doodle-pattern.png';
const BRAND_AVATAR = '/branding/elmenuxfa-avatar.png';
const TOKEN_KEY = 'elmenuxfa:business-assistant-bearer';
const SHOP_KEY = 'elmenuxfa:business-assistant-comercio';

type Proposal = {
  action: string;
  confirmToken: string;
  expiresAt: number;
  summary: string;
};

type Msg = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  createdAt: number;
  proposal?: Proposal | null;
  showAuthCard?: boolean;
  showAccountCard?: AccountCardMode | null;
  menuView?: BusinessMenuViewData | null;
  ordersView?: OrdersListData | null;
  metricsView?: MetricsCardData | null;
  customersView?: CustomersCardData | null;
};

type ApiJson = {
  ok?: boolean;
  text?: string;
  error?: string;
  authenticated?: boolean;
  needsAuth?: boolean;
  showAuthCard?: boolean;
  showAccountCard?: AccountCardMode | null;
  proposal?: Proposal | null;
  menuView?: BusinessMenuViewData | null;
  ordersView?: OrdersListData | null;
  metricsView?: MetricsCardData | null;
  customersView?: CustomersCardData | null;
  selectedComercioId?: string | null;
  needsComercioSelect?: boolean;
  chips?: Array<{ id: string; label: string; text?: string; comercioId?: string }>;
};

type AssistantChip = ChatSuggestedChip & { comercioId?: string };

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function readHashHandoff(): string | null {
  if (typeof window === 'undefined') return null;
  const frag = window.location.hash.replace(/^#/, '');
  if (frag.startsWith('h=')) return decodeURIComponent(frag.slice(2));
  const params = new URLSearchParams(frag);
  return params.get('h')?.trim() || null;
}

function readBearer(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function writeBearer(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function readStoredShop(): string | null {
  try {
    return sessionStorage.getItem(SHOP_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function writeStoredShop(id: string | null) {
  try {
    if (id) sessionStorage.setItem(SHOP_KEY, id);
    else sessionStorage.removeItem(SHOP_KEY);
  } catch {
    /* ignore */
  }
}

function formatBubbleTime(ts: number) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return null;
  }
}

export function BusinessAssistantView(props: { initialHandoffCode: string | null }) {
  const listId = useId();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<ChatThemeMode>('light');
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [code, setCode] = useState<string | null>(props.initialHandoffCode);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [showAuthCard, setShowAuthCard] = useState(false);
  const [authModeHint, setAuthModeHint] = useState<'login' | 'register' | null>(null);
  const [chips, setChips] = useState<AssistantChip[]>([]);
  const [selectedComercioId, setSelectedComercioId] = useState<string | null>(null);
  const [bootKey, setBootKey] = useState(0);
  const [sessionReady, setSessionReady] = useState(false);
  const selectedComercioIdRef = useRef<string | null>(null);
  const [frameStyle, setFrameStyle] = useState<CSSProperties>({
    position: 'fixed',
    inset: 0,
    width: '100%',
    height: '100dvh',
    maxHeight: '100dvh',
  });
  const consumedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const playedReceiveIdsRef = useRef(new Set<string>());
  const bootedOnceRef = useRef(false);
  const messagesRef = useRef<Msg[]>([]);

  const unlockAudio = useCallback(() => {
    unlockChatSounds();
    prefetchChatSounds();
  }, []);

  const apiPost = useCallback(async (body: Record<string, unknown>) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const token = readBearer();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch('/api/asistente-negocio', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as ApiJson;
    return { res, json };
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    selectedComercioIdRef.current = selectedComercioId;
  }, [selectedComercioId]);

  const applySelectedShop = useCallback((id: string | null | undefined) => {
    const next = id?.trim() || null;
    selectedComercioIdRef.current = next;
    setSelectedComercioId(next);
    writeStoredShop(next);
  }, []);

  const mapChips = useCallback((raw: ApiJson['chips']): AssistantChip[] => {
    return (raw || [])
      .filter((c) => c.id !== 'login' && c.id !== 'register')
      .map((c) => {
        const fromId =
          c.id.startsWith('shop:') && c.id.length > 5 ? c.id.slice(5) : undefined;
        const comercioId = c.comercioId || fromId;
        const send =
          (c.text || '').trim() ||
          c.label.replace(/^[^\wÁÉÍÓÚÜÑáéíóúüñ0-9]+/u, '').trim() ||
          c.label;
        return {
          id: c.id,
          label: c.label,
          comercioId,
          action: { type: 'text' as const, text: send },
        };
      });
  }, []);

  useEffect(() => {
    setMounted(true);
    setTheme(resolvePreferredChatTheme(loadStoredChatTheme()));
    setSoundsEnabled(isChatSoundsEnabled());
    const storedShop = readStoredShop();
    if (storedShop) applySelectedShop(storedShop);
    const fromHash = readHashHandoff();
    if (fromHash) setCode(fromHash);

    const sb = getBrowserSupabase();
    let cancelled = false;
    void (async () => {
      try {
        const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
        const token = data.session?.access_token;
        if (token) writeBearer(token);
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();

    // Never wipe the thread on TOKEN_REFRESHED / INITIAL_SESSION — that felt like a "reset".
    const { data: sub } = sb?.auth.onAuthStateChange((event, session) => {
      writeBearer(session?.access_token ?? null);
      if (event === 'SIGNED_OUT') {
        setNeedsAuth(true);
        setShowAuthCard(true);
        return;
      }
      if (event === 'SIGNED_IN' && session?.access_token) {
        setNeedsAuth(false);
        setShowAuthCard(false);
        const onlyGreeting = messagesRef.current.length <= 1;
        if (onlyGreeting) setBootKey((k) => k + 1);
      }
    }) ?? { data: { subscription: null } };
    return () => {
      cancelled = true;
      sub.subscription?.unsubscribe();
    };
  }, []);

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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy, showAuthCard]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (playedReceiveIdsRef.current.has(last.id)) return;
    playedReceiveIdsRef.current.add(last.id);
    playChatSound('messageReceived');
  }, [messages]);

  useEffect(() => {
    if (!sessionReady) return;
    let cancelled = false;
    async function boot() {
      setBusy(true);
      try {
        const { res, json } = await apiPost({
          handoffCode: code || undefined,
          handoffAction: 'peek',
          comercioId: selectedComercioIdRef.current || undefined,
        });
        if (!res.ok || json.ok === false) throw new Error(json.error || 'boot_failed');
        if (cancelled) return;
        if (json.selectedComercioId) applySelectedShop(json.selectedComercioId);
        else if (json.needsComercioSelect) applySelectedShop(null);
        const id = newId('a');
        playedReceiveIdsRef.current.add(id);
        const wantAuth = Boolean(json.needsAuth || json.showAuthCard || json.authenticated === false);
        // Preserve an in-progress thread unless this is first boot or an intentional reboot.
        const preserve =
          bootedOnceRef.current &&
          messagesRef.current.length > 1 &&
          !wantAuth;
        if (!preserve) {
          setMessages([
            {
              id,
              role: 'assistant',
              text: json.text || '¡Hola! 👋',
              createdAt: Date.now(),
              proposal: json.proposal ?? null,
              showAuthCard: wantAuth,
              menuView: json.menuView ?? null,
            },
          ]);
        }
        bootedOnceRef.current = true;
        setNeedsAuth(wantAuth);
        setShowAuthCard(wantAuth);
        setChips(mapChips(json.chips));
      } catch {
        if (cancelled) return;
        if (!bootedOnceRef.current || messagesRef.current.length <= 1) {
          setMessages([
            {
              id: newId('a'),
              role: 'assistant',
              text: 'Uy, no pude cargar 😅 Recarga un momentito y seguimos aquí mismo.',
              createdAt: Date.now(),
              showAuthCard: true,
            },
          ]);
          setShowAuthCard(true);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [apiPost, applySelectedShop, code, bootKey, mapChips, sessionReady]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ChatThemeMode = prev === 'dark' ? 'light' : 'dark';
      saveChatTheme(next);
      return next;
    });
  }, []);

  const toggleSounds = useCallback(() => {
    setSoundsEnabled((prev) => {
      const next = !prev;
      setChatSoundsEnabled(next);
      return next;
    });
  }, []);

  const consumeOnce = useCallback(async () => {
    if (consumedRef.current || !code) return;
    consumedRef.current = true;
    await apiPost({
      handoffCode: code,
      handoffAction: 'consume',
    }).catch(() => null);
  }, [apiPost, code]);

  const pushAssistant = useCallback((json: ApiJson) => {
    const wantAuth = Boolean(json.needsAuth || json.showAuthCard);
    setNeedsAuth(wantAuth);
    setShowAuthCard(wantAuth);
    if (json.selectedComercioId) applySelectedShop(json.selectedComercioId);
    if (json.needsComercioSelect) applySelectedShop(null);
    if (json.chips?.length) {
      setChips(mapChips(json.chips));
    }
    setMessages((m) => [
      ...m,
      {
        id: newId('a'),
        role: 'assistant',
        text: json.text || 'Sin respuesta.',
        createdAt: Date.now(),
        proposal: json.proposal ?? null,
        showAuthCard: wantAuth,
        showAccountCard: json.showAccountCard ?? null,
        menuView: json.menuView ?? null,
        ordersView: json.ordersView ?? null,
        metricsView: json.metricsView ?? null,
        customersView: json.customersView ?? null,
      },
    ]);
  }, [applySelectedShop, mapChips]);

  const sendText = useCallback(
    async (text: string, opts?: { comercioId?: string | null }) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      if (opts?.comercioId) applySelectedShop(opts.comercioId);

      const lower = trimmed.toLowerCase();
      if (/entrar|login|iniciar/.test(lower)) {
        setShowAuthCard(true);
        setAuthModeHint('login');
        setMessages((m) => [
          ...m,
          { id: newId('u'), role: 'user', text: trimmed, createdAt: Date.now() },
          {
            id: newId('a'),
            role: 'assistant',
            text: 'Perfecto 🔐 Usa la tarjetita de abajo — no tienes que salir del chat.',
            createdAt: Date.now(),
            showAuthCard: true,
          },
        ]);
        return;
      }
      if (/registrar|registrarme|crear cuenta|sign ?up/.test(lower)) {
        setShowAuthCard(true);
        setAuthModeHint('register');
        setMessages((m) => [
          ...m,
          { id: newId('u'), role: 'user', text: trimmed, createdAt: Date.now() },
          {
            id: newId('a'),
            role: 'assistant',
            text: '¡Vamos! ✨ En la tarjetita elige *Registrarme* y listo, aquí mismo.',
            createdAt: Date.now(),
            showAuthCard: true,
          },
        ]);
        return;
      }

      unlockAudio();
      const userMsg: Msg = {
        id: newId('u'),
        role: 'user',
        text: trimmed,
        createdAt: Date.now(),
      };
      const nextMsgs = [...messages, userMsg];
      setMessages(nextMsgs);
      playChatSound('messageSent');
      setBusy(true);
      await consumeOnce();
      try {
        const { json } = await apiPost({
          messages: nextMsgs.map((m) => ({ role: m.role, text: m.text })),
          handoffCode: code || undefined,
          handoffAction: 'peek',
          comercioId: selectedComercioIdRef.current || undefined,
        });
        pushAssistant(json);
      } catch {
        setMessages((m) => [
          ...m,
          {
            id: newId('a'),
            role: 'assistant',
            text: 'Se me fue la red un segundo 😅 Intenta de nuevo.',
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [apiPost, applySelectedShop, busy, code, consumeOnce, messages, pushAssistant, unlockAudio],
  );

  const onConfirm = useCallback(
    async (proposal: Proposal, action: 'apply' | 'cancel') => {
      if (busy) return;
      unlockAudio();
      setBusy(true);
      try {
        const { json } = await apiPost({
          confirmToken: proposal.confirmToken,
          confirmAction: action,
          handoffCode: code || undefined,
          handoffAction: 'peek',
          comercioId: selectedComercioIdRef.current || undefined,
        });
        pushAssistant(json);
      } catch {
        setMessages((m) => [
          ...m,
          {
            id: newId('a'),
            role: 'assistant',
            text: 'No pude confirmar eso ahora 😅 Prueba otra vez.',
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [apiPost, busy, code, pushAssistant, unlockAudio],
  );

  const onAuthed = useCallback((accessToken: string) => {
    writeBearer(accessToken);
    setNeedsAuth(false);
    setShowAuthCard(false);
    // One intentional reboot → home greeting with metrics (don't also append a duplicate bubble).
    bootedOnceRef.current = false;
    setBootKey((k) => k + 1);
  }, []);

  const onSend = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void sendText(text);
  }, [draft, sendText]);

  const vars = chatThemeVars(theme) as CSSProperties;
  const showChips =
    !needsAuth &&
    !busy &&
    !messages.some((m) => m.proposal) &&
    chips.length > 0;

  if (!mounted) {
    return (
      <div
        className="flex h-[100dvh] w-full items-center justify-center text-sm text-slate-500"
        data-business-assistant="1"
      >
        Cargando…
      </div>
    );
  }

  return (
    <div
      className="flex w-full flex-col overflow-hidden"
      style={{ ...vars, ...frameStyle }}
      data-chat-theme={theme}
      data-business-assistant="1"
      onPointerDownCapture={unlockAudio}
    >
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-[var(--chat-bg)] shadow-sm sm:border-x sm:border-[var(--chat-header-border)]">
        <ChatHeader
          businessName="elmenuxfa.com"
          logoUrl={BRAND_AVATAR}
          initialLetter="e"
          cartCount={0}
          cartTotalLabel=""
          theme={theme}
          onToggleTheme={toggleTheme}
          onBack={() => {
            window.location.href = BUSINESS_ASSISTANT_APP_HOME;
          }}
          onOpenMenu={() => undefined}
          onOpenCart={() => undefined}
          onNewConversation={() => undefined}
          hideCommerceActions
          hideNewConversation
          isTyping={busy}
          subtitle={busy ? undefined : 'Asistente del negocio'}
          soundsEnabled={soundsEnabled}
          onToggleSounds={toggleSounds}
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
            id={listId}
            className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain px-0 py-2"
            role="log"
            aria-live="polite"
            data-testid="business-thread"
          >
            <div className="mx-auto flex w-full max-w-5xl flex-col pb-1">
              {messages.map((m, index) => {
                const prev = messages[index - 1];
                const isUser = m.role === 'user';
                const groupedWithPrev = Boolean(prev) && prev.role === m.role;
                const radius = isUser
                  ? 'rounded-2xl rounded-br-md'
                  : 'rounded-2xl rounded-bl-md';
                const timeLabel = formatBubbleTime(m.createdAt);
                const isLast = index === messages.length - 1;
                return (
                  <div
                    key={m.id}
                    className={`flex w-full flex-col px-3 ${
                      isUser ? 'items-end' : 'items-start'
                    } ${groupedWithPrev ? 'mt-0.5' : 'mt-1.5'}`}
                  >
                    <div
                      className={[
                        'max-w-[min(85%,22rem)] px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-[1.4] shadow-sm',
                        radius,
                        isUser
                          ? 'bg-[var(--chat-bubble-out)] text-[var(--chat-text)]'
                          : 'bg-[var(--chat-bubble-in)] text-[var(--chat-text)]',
                      ].join(' ')}
                      data-chat-bubble="1"
                    >
                      <div className="whitespace-pre-wrap break-words">
                        {formatChatText(m.text)}
                      </div>
                      {timeLabel ? (
                        <span className="mt-0.5 flex justify-end text-[10.5px] tabular-nums text-[var(--chat-text-muted)]">
                          {timeLabel}
                        </span>
                      ) : null}
                    </div>

                    {m.menuView && m.menuView.categories.length > 0 ? (
                      <BusinessMenuView
                        menu={m.menuView}
                        onAction={(text) => void sendText(text)}
                      />
                    ) : null}

                    {m.ordersView && m.ordersView.orders.length > 0 ? (
                      <BusinessOrdersListCard
                        data={m.ordersView}
                        onAction={(text) => void sendText(text)}
                      />
                    ) : null}

                    {m.metricsView ? (
                      <BusinessMetricsCard
                        data={m.metricsView}
                        onAction={(text) => void sendText(text)}
                      />
                    ) : null}

                    {m.customersView && m.customersView.customers.length > 0 ? (
                      <BusinessCustomersCard
                        data={m.customersView}
                        onAction={(text) => void sendText(text)}
                      />
                    ) : null}

                    {m.proposal?.confirmToken ? (
                      <div
                        className="mt-1.5 w-full max-w-[min(92%,22rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-3 shadow-sm"
                        data-business-proposal={m.proposal.action}
                      >
                        <p className="text-[13px] font-semibold text-[var(--chat-text)]">
                          ✅ Confirmar cambio
                        </p>
                        <p className="mt-1 text-[12px] text-[var(--chat-text-muted)]">
                          {m.proposal.summary}
                        </p>
                        <div className="mt-2.5 flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onConfirm(m.proposal!, 'apply')}
                            className="inline-flex flex-1 items-center justify-center rounded-lg bg-[var(--chat-send)] px-3 py-2 text-[12px] font-semibold text-[var(--chat-send-fg)]"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onConfirm(m.proposal!, 'cancel')}
                            className="inline-flex flex-1 items-center justify-center rounded-lg border border-[var(--chat-card-border)] bg-[var(--chat-input)] px-3 py-2 text-[12px] font-semibold text-[var(--chat-text)]"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {isLast && showAuthCard ? (
                      <BusinessAuthCard key={authModeHint || 'auth'} onAuthed={onAuthed} />
                    ) : null}

                    {m.showAccountCard ? (
                      <BusinessAccountCard
                        mode={m.showAccountCard}
                        onPickMode={(mode) => {
                          void sendText(
                            mode === 'password' ? 'cambiar contraseña' : 'cambiar email',
                          );
                        }}
                        onDone={(message) => {
                          setMessages((prev) => [
                            ...prev,
                            {
                              id: newId('a'),
                              role: 'assistant',
                              text: message,
                              createdAt: Date.now(),
                            },
                          ]);
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}

              {busy ? (
                <div className="mt-1.5 flex justify-start px-3" data-chat-typing="1">
                  <div className="rounded-2xl rounded-bl-md bg-[var(--chat-bubble-in)] px-3.5 py-2.5 shadow-sm">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--chat-text-muted)] [animation-duration:900ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--chat-text-muted)] [animation-delay:120ms] [animation-duration:900ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--chat-text-muted)] [animation-delay:240ms] [animation-duration:900ms]" />
                    </span>
                  </div>
                </div>
              ) : null}
              <div ref={bottomRef} className="h-px w-full shrink-0" />
            </div>
          </div>
        </div>

        <div
          className="relative z-20 shrink-0"
          style={{ backgroundColor: 'var(--chat-composer)' }}
          data-business-composer-shell="1"
        >
          <ChatSuggestedReplies
            chips={chips}
            hidden={!showChips}
            onPick={(chip) => {
              const assistantChip = chip as AssistantChip;
              const fromId =
                assistantChip.id.startsWith('shop:') && assistantChip.id.length > 5
                  ? assistantChip.id.slice(5)
                  : undefined;
              const comercioId = assistantChip.comercioId || fromId;
              const text =
                chip.action.type === 'text'
                  ? chip.action.text
                  : chip.label.replace(/^[^\wÁÉÍÓÚÜÑáéíóúüñ0-9]+/u, '').trim() ||
                    chip.label;
              void sendText(text, comercioId ? { comercioId } : undefined);
            }}
          />
          <ChatComposer
            value={draft}
            disabled={busy}
            onChange={setDraft}
            onSend={onSend}
            hideAttach
            placeholder="Escríbeme como en WhatsApp…"
            inputTestId="business-composer-input"
            sendTestId="business-composer-send"
            onComposerFocus={() => {
              unlockAudio();
              if (window.scrollY !== 0) window.scrollTo(0, 0);
            }}
          />
        </div>
      </div>
    </div>
  );
}
