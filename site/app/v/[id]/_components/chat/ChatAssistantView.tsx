'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import type { CartLineSelection } from '../../../../_lib/menu-product-options';
import {
  buildChatbotDemoReply,
  buildChatbotWelcomeMessage,
  CHATBOT_WELCOME_VERSION,
  refreshWelcomeInHistory,
} from '../../../../_lib/chatbot-preview';
import {
  clearChatHistory,
  ensureChatSessionId,
  loadChatHistory,
  saveChatHistory,
  saveChatSessionId,
} from '../../../../_lib/chatbot-session';
import {
  ChatComposer,
  type ChatFilePayload,
  type ChatVoicePayload,
} from './ChatComposer';
import { ChatBusinessProfileSheet } from './ChatBusinessProfileSheet';
import { ChatCatalogSheet } from './ChatCatalogSheet';
import { buildDeliveryLocationReply } from './chat-delivery-quote';
import { ChatHeader } from './ChatHeader';
import { fileToPersistedDataUrl } from './chat-media-persist';
import {
  ChatMediaLightbox,
  type ChatMediaLightboxState,
} from './ChatMediaLightbox';
import { ChatMessageList } from './ChatMessageList';
import {
  ChatPhoneActionSheet,
  type ChatPhoneAction,
} from './ChatPhoneActionSheet';
import {
  ChatSuggestedReplies,
  type ChatSuggestedChip,
} from './ChatSuggestedReplies';
import {
  buildContextualQuickReplies,
  isQuickReplyActionable,
  type ChatContextualChip,
} from './chat-quick-replies';
import type { DeliveryQuote } from '../../../../_lib/delivery-config';
import { findProductImageEl, flyToCart } from './chat-fly-to-cart';
import {
  buildFulfillmentReplyText,
  buildPlatformPitchText,
  buildRestaurantContactCard,
  matchContactIntent,
  matchFulfillmentIntent,
  matchPlatformIntent,
  type ChatContactCardData,
  type ChatFulfillmentOptions,
} from './chat-contact';
import {
  matchHoursIntent,
  type ChatHoursSnapshot,
} from './chat-hours';
import {
  matchLocationIntent,
  type ChatBusinessLocation,
} from './chat-location';
import {
  matchPaymentIntent,
  type ChatPaymentMethod,
} from './chat-payments';
import {
  humanLocalReplyMs,
  humanReadBeatMs,
  humanTypingMinMs,
  sleep,
} from './chat-timing';
import {
  CHAT_CATALOG_PAGE_SIZE,
  matchCatalogIntent,
  productsInCategory,
  suggestComplementProducts,
  toChatProductCard,
  type ChatCatalogSnapshot,
} from './chat-catalog';
import {
  buildChatReplyRef,
  prefixTextWithReplyContext,
} from './chat-gestures';
import {
  chatThemeVars,
  loadStoredChatTheme,
  resolvePreferredChatTheme,
  saveChatTheme,
  type ChatThemeMode,
} from './chat-theme';
import {
  isChatSoundsEnabled,
  playChatSound,
  prefetchChatSounds,
  setChatSoundsEnabled,
  unlockChatSounds,
} from './chat-sound-manager';
import type {
  ChatAppliedAddNotice,
  ChatAttachment,
  ChatCartActionData,
  ChatCatalogCategory,
  ChatCloseSalePrompt,
  ChatDeliveryStatus,
  ChatMessage,
  ChatProductCardData,
  ChatReplyRef,
  ChatSharedLocation,
} from './chat-types';

/** User declined extras / the recommendation ("no gracias", "ahora no", "no quiero"). */
const DECLINE_RE = /\b(no[, ]?gracias|ahora no|no quiero)\b/i;
/** Typed “ready to pay” from the close-sale moment. */
const READY_TO_PAY_RE =
  /\b(estoy\s+list[oa]\s+para\s+pagar|list[oa]\s+para\s+pagar|quiero\s+pagar|pasar\s+a\s+pagar|ir\s+a\s+pagar)\b/i;
/** Max close-sale / complement prompts per conversation. */
const MAX_COMPLEMENT_ROUNDS = 2;

export type ChatCartSnapshotLine = {
  productId: string;
  quantity: number;
  selection: CartLineSelection;
};

export type ChatAssistantViewProps = {
  comercioId: string;
  businessName: string;
  logoUrl: string | null;
  initialLetter: string;
  /** Slim catalog snapshot powering category/product carousels and the sheet. */
  catalog?: ChatCatalogSnapshot | null;
  /** Slim payment methods for "cómo pago" answers. */
  paymentMethods?: ChatPaymentMethod[];
  /** Business GPS pin for "dónde están / cómo llego". */
  businessLocation?: ChatBusinessLocation | null;
  /** Weekly hours for "horario / ¿están abiertos?". */
  businessHours?: ChatHoursSnapshot | null;
  /** Delivery / pickup / dine-in flags for fulfillment answers. */
  fulfillmentOptions?: ChatFulfillmentOptions | null;
  /** Display phone for WhatsApp contact card. */
  whatsappDisplay?: string | null;
  cartCount: number;
  cartTotalLabel: string;
  /** Authoritative shared cart (same as PublicMenuPage). */
  cartSnapshot?: ChatCartSnapshotLine[];
  chatRuntimeEnabled?: boolean;
  probeServerAuth?: boolean;
  whatsappUrl?: string | null;
  onOpenMenu: () => void;
  onOpenCart: () => void;
  onOpenCheckout?: () => void;
  /**
   * User authorized GPS share → seed delivery checkout (mode + point).
   * Parent should set delivery mode/point and open checkout when ready.
   */
  onShareLocationForDelivery?: (location: ChatSharedLocation) => void;
  /** Quote delivery for a shared GPS pin (client-side zones/fees). */
  onQuoteDeliveryAt?: (location: ChatSharedLocation) => {
    supportsDelivery: boolean;
    pickupAvailable?: boolean;
    quote: DeliveryQuote | null;
    feeLabel: string | null;
    currency?: string | null;
  };
  onApplyCartAction?: (
    action: ChatCartActionData,
  ) => boolean | 'stale' | void;
  onConfigureProduct?: (productId: string) => void;
  onAddSimpleProduct?: (productId: string) => void;
  /**
   * Gemini / server proposal that still needs explicit Confirm.
   * Not used for ProductOptionsSheet "Agregar al pedido" (direct add).
   */
  incomingProposal?: ChatCartActionData | null;
  onIncomingProposalConsumed?: () => void;
  /** Sheet already added to cart — show notice, no second confirm. */
  incomingAppliedNotice?: ChatAppliedAddNotice | null;
  onIncomingAppliedNoticeConsumed?: () => void;
};

function createMessage(
  role: ChatMessage['role'],
  text: string,
  options?: {
    demo?: boolean;
    isWelcome?: boolean;
    productCards?: ChatProductCardData[];
    cartActions?: ChatCartActionData[];
    deliveryStatus?: ChatDeliveryStatus;
    voiceUrl?: string | null;
    voiceDurationMs?: number;
    voicePending?: boolean;
    attachments?: ChatAttachment[];
    location?: ChatMessage['location'];
    replyTo?: ChatReplyRef | null;
    catalogCategories?: ChatCatalogCategory[];
    catalogProducts?: ChatProductCardData[];
    catalogCategoryId?: string | null;
    paymentMethods?: ChatPaymentMethod[];
    hoursSchedule?: ChatHoursSnapshot | null;
    contactCard?: ChatContactCardData | null;
    sticker?: ChatMessage['sticker'];
    closeSale?: ChatCloseSalePrompt | null;
  },
): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    createdAt: Date.now(),
    demo: options?.demo,
    isWelcome: options?.isWelcome,
    welcomeVersion: options?.isWelcome ? CHATBOT_WELCOME_VERSION : undefined,
    productCards: options?.productCards,
    cartActions: options?.cartActions,
    deliveryStatus:
      options?.deliveryStatus ?? (role === 'user' ? 'sent' : undefined),
    voiceUrl: options?.voiceUrl,
    voiceDurationMs: options?.voiceDurationMs,
    voicePending: options?.voicePending,
    attachments: options?.attachments,
    location: options?.location,
    replyTo: options?.replyTo ?? undefined,
    catalogCategories: options?.catalogCategories,
    catalogProducts: options?.catalogProducts,
    catalogCategoryId: options?.catalogCategoryId,
    paymentMethods: options?.paymentMethods,
    hoursSchedule: options?.hoursSchedule ?? undefined,
    contactCard: options?.contactCard ?? undefined,
    sticker: options?.sticker ?? undefined,
    closeSale: options?.closeSale ?? undefined,
  };
}

/** Post-add close-sale prompt — CTAs first; complements only after “sí”. */
function buildCloseSaleMessage(
  pendingProducts: ChatProductCardData[],
  opts?: { combinedLabel?: string | null },
): ChatMessage {
  const combined = (opts?.combinedLabel || '').trim();
  const text = combined
    ? `¡Listo! Ya agregué ${combined}. ¿Quieres algo de tomar o pasamos a pagar?`
    : pendingProducts.length > 0
      ? '¡Listo! Ya está en tu pedido. ¿Seguimos o pasamos a pagar?'
      : '¡Listo! Ya está en tu pedido. Cuando quieras, pasamos a pagar.';
  return createMessage('assistant', text, {
    closeSale: {
      id: `close_${Date.now().toString(36)}`,
      status: 'pending',
      pendingProducts,
    },
  });
}

type PendingChatConfiguration = {
  product_id: string;
  product_name?: string;
  combine_with_product_id: string;
  combine_with_product_name?: string;
  quantity: number;
  option_labels: string[];
  exclude_ingredients: string[];
  size_choices?: string[];
};

/** Drop older unanswered pay prompts so only the latest CTAs stay active. */
function clearPendingCloseSales(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) =>
    m.closeSale?.status === 'pending' ? { ...m, closeSale: undefined } : m,
  );
}

function welcomeCategories(
  catalog: ChatCatalogSnapshot | null | undefined,
): ChatCatalogCategory[] | undefined {
  return catalog && catalog.categories.length > 0
    ? catalog.categories
    : undefined;
}

function sameCategoryIds(
  a: ChatCatalogCategory[] | undefined,
  b: ChatCatalogCategory[] | undefined,
) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((c, i) => c.id === b[i].id && c.name === b[i].name);
}

/** Only the latest outbound user bubble — never fake-advance older ticks. */
function markLatestUserMessage(
  messages: ChatMessage[],
  status: ChatDeliveryStatus,
): ChatMessage[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const next = messages.slice();
      next[i] = { ...next[i], deliveryStatus: status };
      return next;
    }
  }
  return messages;
}

const FALLBACK =
  'En este momento no puedo responderte. Puedes consultar nuestro menú o hablar directamente con el restaurante.';

const VOICE_NOT_UNDERSTOOD =
  'No pude entender la nota de voz. ¿Puedes escribirlo o intentar de nuevo?';

/** STT returned nothing useful (empty / "[inaudible]" / punctuation only). */
function isUnusableTranscript(value: string | null | undefined): boolean {
  const t = (value ?? '').trim();
  if (!t) return true;
  if (/^[[(]?\s*inaudible\s*[\])]?[.!]?$/i.test(t)) return true;
  return !/[\p{L}\p{N}]/u.test(t);
}

/** Maps media-route failures to a clear, user-facing note. */
function describeVoiceMediaFailure(
  status: number,
  data: {
    ok?: boolean;
    mode?: string;
    note?: string | null;
    error?: string;
    message?: string;
  } | null,
): string | null {
  if (data?.error === 'production_blocked') {
    return 'La transcripción de voz no está habilitada en este entorno (media bloqueado en producción).';
  }
  if (data?.error === 'commerce_not_allowlisted') {
    return 'La transcripción de voz no está habilitada para este comercio.';
  }
  if (data?.error === 'gemini_unconfigured') {
    return 'La transcripción de voz no está configurada (falta la clave del modelo).';
  }
  if (data?.error === 'audio_too_large') {
    return 'La nota de voz es demasiado larga. Intenta con una más corta.';
  }
  if (data?.error === 'unsupported_audio') {
    return 'El formato de la nota de voz no es compatible.';
  }
  if (data?.note) return data.note;
  if (data?.mode === 'blocked') return 'La transcripción de voz está bloqueada ahora mismo.';
  if (data?.ok === false || status >= 400) {
    return data?.message?.trim() || 'No se pudo transcribir la nota de voz. Inténtalo de nuevo.';
  }
  return null;
}

function voiceFileName(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('mp4') || m.includes('aac') || m.includes('m4a')) return 'voice.m4a';
  if (m.includes('ogg')) return 'voice.ogg';
  if (m.includes('wav')) return 'voice.wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'voice.mp3';
  return 'voice.webm';
}

export function ChatAssistantView({
  comercioId,
  businessName,
  logoUrl,
  initialLetter,
  catalog = null,
  paymentMethods = [],
  businessLocation = null,
  businessHours = null,
  fulfillmentOptions = null,
  whatsappDisplay = null,
  cartCount,
  cartTotalLabel,
  cartSnapshot = [],
  chatRuntimeEnabled = false,
  probeServerAuth = false,
  whatsappUrl = null,
  onOpenMenu,
  onOpenCart,
  onOpenCheckout,
  onShareLocationForDelivery,
  onQuoteDeliveryAt,
  onApplyCartAction,
  onConfigureProduct,
  onAddSimpleProduct,
  incomingProposal = null,
  onIncomingProposalConsumed,
  incomingAppliedNotice = null,
  onIncomingAppliedNoticeConsumed,
}: ChatAssistantViewProps) {
  const [serverAuthorized, setServerAuthorized] = useState(chatRuntimeEnabled);
  const [authReason, setAuthReason] = useState<string | null>(null);
  const live = serverAuthorized;
  const [theme, setTheme] = useState<ChatThemeMode>('light');
  const [confirmedProposalIds, setConfirmedProposalIds] = useState(
    () => new Set<string>(),
  );

  useEffect(() => {
    setTheme(resolvePreferredChatTheme(loadStoredChatTheme()));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ChatThemeMode = prev === 'dark' ? 'light' : 'dark';
      saveChatTheme(next);
      return next;
    });
  }, []);

  const themeStyle = useMemo(() => chatThemeVars(theme), [theme]);

  const welcome = useMemo(
    () =>
      buildChatbotWelcomeMessage(businessName, {
        runtimeEnabled: live,
      }),
    [businessName, live],
  );

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const stored = loadChatHistory(comercioId);
    const base =
      stored && stored.length > 0
        ? stored
        : [
            createMessage('assistant', welcome, {
              demo: !live,
              isWelcome: true,
              catalogCategories: welcomeCategories(catalog),
            }),
          ];
    return refreshWelcomeInHistory(base, welcome, {
      runtimeEnabled: live,
    }) as ChatMessage[];
  });
  const [replyTo, setReplyTo] = useState<ChatReplyRef | null>(null);
  const [phoneAction, setPhoneAction] = useState<ChatPhoneAction | null>(null);
  const [mediaLightbox, setMediaLightbox] =
    useState<ChatMediaLightboxState>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [catalogSheetOpen, setCatalogSheetOpen] = useState(false);
  const [catalogSheetCategoryId, setCatalogSheetCategoryId] = useState<
    string | null
  >(null);
  // Latest reply target for async send paths (voice/file await network first).
  const replyToRef = useRef<ChatReplyRef | null>(null);
  replyToRef.current = replyTo;
  const [declinedComplements, setDeclinedComplements] = useState(false);
  const [complementsShownCount, setComplementsShownCount] = useState(0);
  /** Pending combinación / attribute ask — completed without re-search. */
  const [pendingConfiguration, setPendingConfiguration] =
    useState<PendingChatConfiguration | null>(null);
  const pendingConfigurationRef = useRef<PendingChatConfiguration | null>(null);
  pendingConfigurationRef.current = pendingConfiguration;
  /** Merchant is actively handling — skip expecting Gemini replies; speeds feed. */
  const [humanSupervisionActive, setHumanSupervisionActive] = useState(false);
  /** Watch feed after server created a supervised conversation (idle takeover). */
  const [supervisionWatchActive, setSupervisionWatchActive] = useState(false);
  const supervisionAfterSeqRef = useRef(0);
  const supervisionSeenIdsRef = useRef<Set<string>>(new Set());
  const supervisionFeedTokenRef = useRef<string | null>(null);
  /** Coalesce close-sale when several proposals confirm in a short burst. */
  const closeSaleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeSaleBatchRef = useRef<{
    productIds: string[];
    labels: string[];
  }>({ productIds: [], labels: [] });
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  /** Mic recording in progress (hides suggested replies). */
  const [recording, setRecording] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const playedReceiveIdsRef = useRef<Set<string>>(new Set());
  /** One receive cue per completed assistant turn (tools may take many rounds). */
  const receiveTurnLockRef = useRef(false);
  /** Active quick-reply context id — stale chips are ignored on pick. */
  const quickReplyContextIdRef = useRef<string | null>(null);
  const regionId = useId();
  const frameRef = useRef<HTMLElement | null>(null);
  const [frameStyle, setFrameStyle] = useState<CSSProperties>({});

  useEffect(() => {
    setSoundsEnabled(isChatSoundsEnabled());
  }, []);

  // Mobile keyboard: size the chat frame to visualViewport so the header stays
  // visible and the composer sits above the keyboard (100dvh alone often fails).
  // Full-bleed shell (left+right 0) so desktop isn't stuck left of a white void;
  // the inner column is centered like the public menu (max-w-5xl).
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
      setFrameStyle({
        position: 'fixed',
        left: 0,
        right: 0,
        width: '100%',
        top: `${vv.offsetTop}px`,
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

  // Mark history as already "heard" so remount / menu↔chat never replays cues.
  useEffect(() => {
    for (const m of messages) {
      if (m.role === 'assistant') playedReceiveIdsRef.current.add(m.id);
    }
    // Intentionally once on mount for this conversation instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playAssistantReceivedOnce = useCallback((msg: ChatMessage) => {
    if (msg.role !== 'assistant' || msg.isWelcome) return;
    if (playedReceiveIdsRef.current.has(msg.id)) return;
    if (receiveTurnLockRef.current) {
      playedReceiveIdsRef.current.add(msg.id);
      return;
    }
    playedReceiveIdsRef.current.add(msg.id);
    receiveTurnLockRef.current = true;
    playChatSound('messageReceived');
    // Unlock on next macrotask so a single turn cannot double-fire if two
    // assistant bubbles are appended in the same completion path.
    window.setTimeout(() => {
      receiveTurnLockRef.current = false;
    }, 0);
  }, []);

  useEffect(() => {
    if (!probeServerAuth || !comercioId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/chat/${encodeURIComponent(comercioId)}`,
          { method: 'GET' },
        );
        const data = (await res.json().catch(() => null)) as {
          authorized?: boolean;
          reason?: string | null;
        } | null;
        if (cancelled) return;
        setServerAuthorized(Boolean(data?.authorized));
        setAuthReason(data?.reason ?? null);
      } catch {
        if (!cancelled) {
          setServerAuthorized(false);
          setAuthReason('status_unreachable');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [probeServerAuth, comercioId]);

  // Local/E2E only: allow dual-browser tests to enable the staff feed watcher
  // without depending on a fragile composer type()+Enter against React state.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const e2e = (process.env.NEXT_PUBLIC_CHAT_SUPERVISION_E2E_BEARER || '').trim();
    if (!e2e) return;
    const w = window as Window & {
      __elmenuxfaSupervisionE2E?: {
        forceWatch: () => void;
        setSession: (sessionId: string) => void;
        ingestStaff: (
          rows: Array<{ id: string; seq?: number; role: string; body: string }>,
        ) => number;
      };
    };
    w.__elmenuxfaSupervisionE2E = {
      forceWatch: () => {
        // Feed effect requires live=true; probe may still be pending in tests.
        setServerAuthorized(true);
        setSupervisionWatchActive(true);
        setHumanSupervisionActive(true);
      },
      setSession: (sessionId: string) => {
        if (!sessionId.trim()) return;
        saveChatSessionId(comercioId, sessionId.trim());
      },
      /** Synchronously merge staff/system feed rows into the visible transcript. */
      ingestStaff: (
        rows: Array<{ id: string; seq?: number; role: string; body: string }>,
      ) => {
        // Clear seen set so a prior feed tick that recorded IDs without a
        // durable UI commit cannot block E2E ingest.
        supervisionSeenIdsRef.current = new Set();
        let nextLen = 0;
        let merged = 0;
        setMessages((prev) => {
          const existingBodies = new Set(
            prev.map((m) => String(m.text || '').trim()),
          );
          const next = [...prev];
          for (const m of rows) {
            if (m.role !== 'staff' && m.role !== 'system') continue;
            const body = String(m.body || '').trim();
            if (!body || existingBodies.has(body)) continue;
            if (supervisionSeenIdsRef.current.has(m.id)) continue;
            supervisionSeenIdsRef.current.add(m.id);
            existingBodies.add(body);
            next.push(createMessage('assistant', body, { demo: false }));
            merged += 1;
            supervisionAfterSeqRef.current = Math.max(
              supervisionAfterSeqRef.current,
              Number(m.seq || 0),
            );
          }
          nextLen = next.length;
          (
            window as Window & {
              __elmenuxfaSupervisionE2ELastMerge?: number;
            }
          ).__elmenuxfaSupervisionE2ELastMerge = nextLen;
          return next;
        });
        return merged || nextLen;
      },
    };
    return () => {
      delete w.__elmenuxfaSupervisionE2E;
    };
  }, [comercioId]);

  useEffect(() => {
    saveChatHistory(comercioId, messages);
  }, [comercioId, messages]);

  useEffect(() => {
    setMessages(
      (prev) =>
        refreshWelcomeInHistory(prev, welcome, {
          runtimeEnabled: live,
        }) as ChatMessage[],
    );
  }, [welcome, live]);

  // Categories are not persisted in history; (re)attach them to the welcome
  // bubble whenever the live catalog is available or changes.
  useEffect(() => {
    const categories = welcomeCategories(catalog);
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.isWelcome);
      if (idx < 0) return prev;
      if (sameCategoryIds(prev[idx].catalogCategories, categories)) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], catalogCategories: categories };
      return next;
    });
  }, [catalog]);

  // Staff/system via session-scoped REST after a conversation exists.
  // Faster cadence only while a human is (or may be) attending — target ~1–2s
  // delivery under controlled network; idle AI watch stays sparse (not 1–5s spam).
  useEffect(() => {
    if (!supervisionWatchActive || !live) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const sid = ensureChatSessionId(comercioId);
        const token = supervisionFeedTokenRef.current;
        const qs = new URLSearchParams({
          afterSeq: String(supervisionAfterSeqRef.current),
        });
        // Prefer HMAC feed token in header; sessionId query is legacy fallback.
        if (!token) qs.set('sessionId', sid);
        const res = await fetch(
          `/api/chat/${encodeURIComponent(comercioId)}/supervision-feed?${qs}`,
          {
            cache: 'no-store',
            headers: token
              ? { 'X-Chat-Supervision-Feed-Token': token }
              : undefined,
          },
        );
        const data = (await res.json().catch(() => null)) as {
          conversation?: { status?: string } | null;
          messages?: Array<{
            id: string;
            seq: number;
            role: string;
            body: string;
          }>;
        } | null;
        if (cancelled || !data) return;
        const status = data.conversation?.status;
        if (status === 'human_handling' || status === 'needs_attention') {
          setHumanSupervisionActive(true);
        } else if (status === 'ai_handling' || status === 'closed') {
          setHumanSupervisionActive(false);
        }
        const incoming = (data.messages || []).filter(
          (m) => m.role === 'staff' || m.role === 'system',
        );
        if (!incoming.length) return;
        setMessages((prev) => {
          const next = [...prev];
          for (const m of incoming) {
            if ((m.seq || 0) <= supervisionAfterSeqRef.current) continue;
            if (supervisionSeenIdsRef.current.has(m.id)) continue;
            supervisionSeenIdsRef.current.add(m.id);
            next.push(
              createMessage('assistant', m.body, {
                demo: m.role === 'system',
              }),
            );
            supervisionAfterSeqRef.current = Math.max(
              supervisionAfterSeqRef.current,
              m.seq || 0,
            );
          }
          return next;
        });
      } catch {
        /* ignore */
      }
    };
    void tick();
    const onVis = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVis);
    const intervalMs = humanSupervisionActive ? 1500 : 8000;
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [supervisionWatchActive, live, comercioId, humanSupervisionActive]);

  const resetConversation = useCallback(() => {
    clearChatHistory(comercioId);
    ensureChatSessionId(comercioId);
    setHumanSupervisionActive(false);
    setSupervisionWatchActive(false);
    supervisionAfterSeqRef.current = 0;
    supervisionSeenIdsRef.current = new Set();
    supervisionFeedTokenRef.current = null;
    setMessages([
      createMessage('assistant', welcome, {
        demo: !live,
        isWelcome: true,
        catalogCategories: welcomeCategories(catalog),
      }),
    ]);
    setConfirmedProposalIds(new Set());
    setErrorText(null);
    setDraft('');
    setReplyTo(null);
    setCatalogSheetOpen(false);
    setCatalogSheetCategoryId(null);
    setDeclinedComplements(false);
    setComplementsShownCount(0);
  }, [comercioId, welcome, live, catalog]);

  const openCatalogSheet = useCallback((categoryId?: string | null) => {
    setCatalogSheetCategoryId(categoryId ?? null);
    setCatalogSheetOpen(true);
  }, []);

  /** Deterministic (no Gemini): show the category's products as a carousel. */
  const buildCategoryMessage = useCallback(
    (categoryId: string): ChatMessage | null => {
      if (!catalog) return null;
      const category = catalog.categories.find((c) => c.id === categoryId);
      if (!category) return null;
      const items = productsInCategory(catalog, categoryId);
      // Cap DOM size; the full list stays reachable through the sheet.
      const cards = items
        .slice(0, CHAT_CATALOG_PAGE_SIZE)
        .map(toChatProductCard);
      return createMessage(
        'assistant',
        cards.length > 0
          ? `¡Claro! 🍕 Estas son las opciones de ${category.name}.`
          : `Por ahora no tengo productos en ${category.name}.`,
        { catalogProducts: cards, catalogCategoryId: categoryId },
      );
    },
    [catalog],
  );

  const onSelectCategory = useCallback(
    (categoryId: string) => {
      const msg = buildCategoryMessage(categoryId);
      if (!msg || isTyping) return;
      setIsTyping(true);
      void (async () => {
        await sleep(humanLocalReplyMs());
        setMessages((prev) => [...prev, msg]);
        playAssistantReceivedOnce(msg);
        setIsTyping(false);
      })();
    },
    [buildCategoryMessage, playAssistantReceivedOnce, isTyping],
  );

  /**
   * Deterministic answer for "ver menú / categorías / bebidas…" (no Gemini).
   * Still shows a short "escribiendo…" beat so it doesn't feel instant/robotic.
   * Returns true when the turn was fully handled locally.
   */
  const answerCatalogIntent = useCallback(
    async (text: string): Promise<boolean> => {
      const intent = matchCatalogIntent(text, catalog);
      if (!intent || !catalog) return false;
      const reply =
        intent.kind === 'category'
          ? buildCategoryMessage(intent.categoryId)
          : createMessage('assistant', 'Estas son nuestras categorías:', {
              catalogCategories: catalog.categories,
            });
      if (!reply) return false;
      setIsTyping(true);
      await sleep(humanLocalReplyMs());
      setMessages((prev) => [...markLatestUserMessage(prev, 'read'), reply]);
      playAssistantReceivedOnce(reply);
      setIsTyping(false);
      return true;
    },
    [catalog, buildCategoryMessage, playAssistantReceivedOnce],
  );

  /** Deterministic "dónde están / cómo llego" → WhatsApp-like location pin. */
  const answerLocationIntent = useCallback(
    async (text: string): Promise<boolean> => {
      if (!matchLocationIntent(text)) return false;
      setIsTyping(true);
      await sleep(humanLocalReplyMs());
      if (!businessLocation) {
        const empty = createMessage(
          'assistant',
          'Todavía no tengo el pin GPS del local publicado. Puedes preguntar por WhatsApp o buscar el nombre del restaurante en Maps.',
        );
        setMessages((prev) => [...markLatestUserMessage(prev, 'read'), empty]);
        playAssistantReceivedOnce(empty);
        setIsTyping(false);
        return true;
      }
      const reply = createMessage(
        'assistant',
        businessLocation.address
          ? `Aquí tienes nuestra ubicación:\n${businessLocation.address}`
          : 'Aquí tienes nuestra ubicación:',
        {
          location: {
            lat: businessLocation.lat,
            lng: businessLocation.lng,
            label: businessLocation.label,
            kind: 'business',
            address: businessLocation.address,
            mapsUrl: businessLocation.mapsUrl,
            directionsUrl: businessLocation.directionsUrl,
          },
        },
      );
      setMessages((prev) => [...markLatestUserMessage(prev, 'read'), reply]);
      playAssistantReceivedOnce(reply);
      setIsTyping(false);
      return true;
    },
    [businessLocation, playAssistantReceivedOnce],
  );

  /** Deterministic "cómo pago / métodos de pago" → payment methods card. */
  const answerPaymentIntent = useCallback(
    async (text: string): Promise<boolean> => {
      if (!matchPaymentIntent(text)) return false;
      setIsTyping(true);
      await sleep(humanLocalReplyMs());
      if (paymentMethods.length === 0) {
        const empty = createMessage(
          'assistant',
          'Por ahora no tengo métodos de pago publicados. Puedes continuar en el checkout o preguntar al restaurante.',
          cartCount > 0 && onOpenCheckout
            ? {
                cartActions: [
                  {
                    type: 'open_checkout',
                    requires_confirmation: true,
                    proposal_id: `checkout_pay_${Date.now().toString(36)}`,
                    catalog_fingerprint: null,
                    label: 'Ir a pagar',
                  },
                ],
              }
            : undefined,
        );
        setMessages((prev) => [...markLatestUserMessage(prev, 'read'), empty]);
        playAssistantReceivedOnce(empty);
        setIsTyping(false);
        return true;
      }
      const reply = createMessage(
        'assistant',
        'Estos son los métodos de pago disponibles:',
        {
          paymentMethods,
          cartActions:
            cartCount > 0
              ? [
                  {
                    type: 'open_checkout',
                    requires_confirmation: true,
                    proposal_id: `checkout_pay_${Date.now().toString(36)}`,
                    catalog_fingerprint: null,
                    label: 'Ir a pagar',
                  },
                ]
              : undefined,
        },
      );
      setMessages((prev) => [...markLatestUserMessage(prev, 'read'), reply]);
      playAssistantReceivedOnce(reply);
      setIsTyping(false);
      return true;
    },
    [
      paymentMethods,
      cartCount,
      onOpenCheckout,
      playAssistantReceivedOnce,
    ],
  );

  /** Deterministic "horario / ¿están abiertos?". */
  const answerHoursIntent = useCallback(
    async (text: string): Promise<boolean> => {
      if (!matchHoursIntent(text)) return false;
      setIsTyping(true);
      await sleep(humanLocalReplyMs());
      if (!businessHours) {
        const empty = createMessage(
          'assistant',
          'Todavía no tengo el horario publicado. Puedes confirmar por WhatsApp con el local.',
          whatsappUrl
            ? {
                contactCard: buildRestaurantContactCard({
                  whatsappUrl,
                  phoneDisplay: whatsappDisplay,
                  businessName,
                }),
              }
            : undefined,
        );
        setMessages((prev) => [...markLatestUserMessage(prev, 'read'), empty]);
        playAssistantReceivedOnce(empty);
        setIsTyping(false);
        return true;
      }
      const caption = businessHours.status.caption.replace(/^[🟢🔴]\s*/, '');
      const reply = createMessage('assistant', caption, {
        hoursSchedule: businessHours,
      });
      setMessages((prev) => [...markLatestUserMessage(prev, 'read'), reply]);
      playAssistantReceivedOnce(reply);
      setIsTyping(false);
      return true;
    },
    [
      businessHours,
      whatsappUrl,
      whatsappDisplay,
      businessName,
      playAssistantReceivedOnce,
    ],
  );

  /** Deterministic WhatsApp / "hablar con un humano". */
  const answerContactIntent = useCallback(
    async (text: string): Promise<boolean> => {
      if (!matchContactIntent(text)) return false;
      setIsTyping(true);
      await sleep(humanLocalReplyMs());
      const card = buildRestaurantContactCard({
        whatsappUrl,
        phoneDisplay: whatsappDisplay,
        businessName,
      });
      if (!card) {
        const empty = createMessage(
          'assistant',
          'Por ahora no tengo el WhatsApp del local publicado. Puedes usar el menú tradicional o volver a preguntar más tarde.',
        );
        setMessages((prev) => [...markLatestUserMessage(prev, 'read'), empty]);
        playAssistantReceivedOnce(empty);
        setIsTyping(false);
        return true;
      }
      const reply = createMessage(
        'assistant',
        'Claro, aquí tienes el contacto del local para hablar con una persona:',
        { contactCard: card },
      );
      setMessages((prev) => [...markLatestUserMessage(prev, 'read'), reply]);
      playAssistantReceivedOnce(reply);
      setIsTyping(false);
      return true;
    },
    [whatsappUrl, whatsappDisplay, businessName, playAssistantReceivedOnce],
  );

  /** Deterministic "elmenuxfa / cómo creo un menú". */
  const answerPlatformIntent = useCallback(
    async (text: string): Promise<boolean> => {
      if (!matchPlatformIntent(text)) return false;
      setIsTyping(true);
      await sleep(humanLocalReplyMs());
      const reply = createMessage('assistant', buildPlatformPitchText());
      setMessages((prev) => [...markLatestUserMessage(prev, 'read'), reply]);
      playAssistantReceivedOnce(reply);
      setIsTyping(false);
      return true;
    },
    [playAssistantReceivedOnce],
  );

  /** Deterministic delivery / pickup explanation. */
  const answerFulfillmentIntent = useCallback(
    async (text: string): Promise<boolean> => {
      if (!matchFulfillmentIntent(text)) return false;
      const options = fulfillmentOptions ?? {
        delivery: false,
        pickup: true,
        dineIn: false,
      };
      setIsTyping(true);
      await sleep(humanLocalReplyMs());
      const reply = createMessage(
        'assistant',
        buildFulfillmentReplyText(options),
        options.delivery && onOpenCheckout
          ? {
              cartActions: [
                {
                  type: 'open_checkout',
                  requires_confirmation: true,
                  proposal_id: `checkout_ful_${Date.now().toString(36)}`,
                  catalog_fingerprint: null,
                  label: 'Pedir delivery',
                },
              ],
            }
          : undefined,
      );
      setMessages((prev) => [...markLatestUserMessage(prev, 'read'), reply]);
      playAssistantReceivedOnce(reply);
      setIsTyping(false);
      return true;
    },
    [fulfillmentOptions, onOpenCheckout, playAssistantReceivedOnce],
  );

  useEffect(() => {
    if (!incomingProposal) return;
    const msg = createMessage(
      'assistant',
      'Listo: revisa la propuesta y confirma para agregarla al carrito.',
      {
        cartActions: [incomingProposal],
        productCards:
          incomingProposal.type === 'propose_add'
            ? [incomingProposal.product_card]
            : [],
      },
    );
    setMessages((prev) => [...prev, msg]);
    playAssistantReceivedOnce(msg);
    onIncomingProposalConsumed?.();
  }, [incomingProposal, onIncomingProposalConsumed, playAssistantReceivedOnce]);

  /**
   * Always offer pay after a successful add. Complement suggestions are optional
   * and capped — never suppress the pay CTA (that left guests stranded).
   * Multiple confirms in a burst share ONE commercial close-sale message.
   */
  const offerCloseSaleAfterAdd = useCallback(
    (extraProductIds: string[] = [], label?: string | null) => {
      closeSaleBatchRef.current.productIds.push(...extraProductIds);
      if (label) closeSaleBatchRef.current.labels.push(label);
      if (closeSaleTimerRef.current) {
        clearTimeout(closeSaleTimerRef.current);
      }
      closeSaleTimerRef.current = setTimeout(() => {
        const batch = closeSaleBatchRef.current;
        closeSaleBatchRef.current = { productIds: [], labels: [] };
        closeSaleTimerRef.current = null;
        const allowComplements =
          !declinedComplements && complementsShownCount < MAX_COMPLEMENT_ROUNDS;
        const cartProductIds = Array.from(
          new Set([
            ...cartSnapshot.map((line) => line.productId),
            ...batch.productIds,
          ]),
        );
        const suggestions =
          allowComplements && catalog
            ? suggestComplementProducts(catalog, cartProductIds, {
                limit: 4,
              }).map(toChatProductCard)
            : [];
        const combinedLabel =
          batch.labels.length === 1
            ? batch.labels[0]
            : batch.labels.length > 1
              ? 'tus productos'
              : null;
        const closeMsg = buildCloseSaleMessage(suggestions, {
          combinedLabel,
        });
        setMessages((prev) => [...clearPendingCloseSales(prev), closeMsg]);
        if (allowComplements) {
          setComplementsShownCount((n) => n + 1);
        }
        playAssistantReceivedOnce(closeMsg);
      }, 280);
    },
    [
      catalog,
      cartSnapshot,
      declinedComplements,
      complementsShownCount,
      playAssistantReceivedOnce,
    ],
  );

  useEffect(() => {
    if (!incomingAppliedNotice) return;
    const notice = incomingAppliedNotice;
    setMessages((prev) => [
      ...prev,
      createMessage('system', `Agregado: ${notice.label}`, {
        productCards: notice.productCard ? [notice.productCard] : [],
      }),
    ]);
    // Only successful adds (with a product card) unlock the pay handoff.
    if (notice.productCard?.product_id) {
      offerCloseSaleAfterAdd([notice.productCard.product_id]);
    }
    onIncomingAppliedNoticeConsumed?.();
  }, [
    incomingAppliedNotice,
    onIncomingAppliedNoticeConsumed,
    offerCloseSaleAfterAdd,
  ]);

  const confirmCartAction = useCallback(
    (action: ChatCartActionData) => {
      if (action.proposal_id && confirmedProposalIds.has(action.proposal_id)) {
        return;
      }
      setCartBusy(true);
      try {
        if (action.type === 'open_checkout') {
          if (action.proposal_id) {
            setConfirmedProposalIds((prev) => new Set(prev).add(action.proposal_id));
          }
          onOpenCheckout?.();
          setMessages((prev) => [
            ...prev,
            createMessage(
              'system',
              'Abriendo el checkout para revisar y pagar tu pedido.',
            ),
          ]);
          return;
        }
        const ok = onApplyCartAction?.(action);
        if (ok === 'stale') {
          setErrorText(
            'El catálogo cambió. Vuelve a elegir las opciones antes de confirmar.',
          );
          return;
        }
        if (ok === false) {
          setErrorText('No se pudo aplicar el cambio al carrito.');
          return;
        }
        if (action.proposal_id) {
          setConfirmedProposalIds((prev) => new Set(prev).add(action.proposal_id));
        }
        if (action.type === 'propose_add') {
          // Visual only: fly the proposal card's thumb to the cart (no-op if not found).
          try {
            const id = (action.proposal_id || '').replace(/["\\]/g, '');
            const cardEl = id
              ? document.querySelector(
                  `[data-chat-cart-action="propose_add"][data-proposal-id="${id}"]`,
                )
              : null;
            void flyToCart({
              source: findProductImageEl(cardEl),
              imageUrl: action.product_card.image_url,
            });
          } catch {
            /* animation is best-effort */
          }
        }
        setMessages((prev) => [
          ...prev,
          createMessage('system', `Listo: ${action.label}`),
        ]);

        if (action.type === 'propose_add') {
          setPendingConfiguration(null);
          offerCloseSaleAfterAdd([action.product_id], action.label);
        }
      } finally {
        setCartBusy(false);
      }
    },
    [
      onApplyCartAction,
      onOpenCheckout,
      confirmedProposalIds,
      offerCloseSaleAfterAdd,
    ],
  );

  const handleCloseSaleWantMore = useCallback(
    (messageId: string) => {
      let products: ChatProductCardData[] = [];
      let applied = false;
      setMessages((prev) => {
        const target = prev.find((m) => m.id === messageId);
        if (!target?.closeSale || target.closeSale.status !== 'pending') {
          return prev;
        }
        applied = true;
        products = target.closeSale.pendingProducts ?? [];
        return prev.map((m) =>
          m.id !== messageId
            ? m
            : {
                ...m,
                closeSale: {
                  ...m.closeSale!,
                  status: 'answered_more',
                },
                catalogProducts:
                  products.length > 0 ? products : m.catalogProducts,
              },
        );
      });
      if (!applied) return;
      if (products.length === 0) {
        openCatalogSheet(null);
      }
    },
    [openCatalogSheet],
  );

  const handleCloseSaleReadyToPay = useCallback(
    (messageId: string) => {
      // Allow pending + answered_more (pay stays available after “algo más”).
      setMessages((prev) => {
        const target = prev.find((m) => m.id === messageId);
        const status = target?.closeSale?.status;
        if (!target?.closeSale || (status !== 'pending' && status !== 'answered_more')) {
          return prev;
        }
        return [
          ...prev.map((m) =>
            m.id !== messageId
              ? m
              : {
                  ...m,
                  closeSale: {
                    ...m.closeSale!,
                    status: 'answered_pay' as const,
                  },
                },
          ),
          createMessage('user', 'Estoy listo para pagar', {
            deliveryStatus: 'read',
          }),
          createMessage(
            'assistant',
            'Perfecto. Te llevo a revisar y pagar tu pedido.',
          ),
        ];
      });
      setDeclinedComplements(true);
      onOpenCheckout?.();
    },
    [onOpenCheckout],
  );

  const dismissCartAction = useCallback((action: ChatCartActionData) => {
    if (action.type === 'propose_add') setDeclinedComplements(true);
    setMessages((prev) =>
      prev.map((m) =>
        m.cartActions?.length
          ? {
              ...m,
              cartActions: m.cartActions.filter((a) => a !== action),
            }
          : m,
      ),
    );
  }, []);

  const runAssistantTurn = useCallback(
    async (userText: string, history: ChatMessage[]) => {
      // Typing indicator only while a reply is being generated.
      const turnStartedAt = Date.now();
      setIsTyping(true);

      if (!live) {
        // Demo path: "delivered" = local demo engine accepted the turn.
        setMessages((prev) => markLatestUserMessage(prev, 'delivered'));
        try {
          const reply = buildChatbotDemoReply(userText, businessName);
          await sleep(humanTypingMinMs(reply.length));
          const demoMsg = createMessage('assistant', reply, { demo: true });
          setMessages((prev) => [
            ...markLatestUserMessage(prev, 'read'),
            demoMsg,
          ]);
          playAssistantReceivedOnce(demoMsg);
        } catch {
          setErrorText(
            'No pudimos mostrar la respuesta de demostración. Inténtalo de nuevo.',
          );
        } finally {
          setIsTyping(false);
        }
        return;
      }

      try {
        // Brief "read" beat before the network call so replies never feel instant.
        await sleep(humanReadBeatMs());
        const sessionId = ensureChatSessionId(comercioId);
        const apiHistory = history
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .filter((m) => !m.demo)
          // Voice notes that could not be transcribed carry no content for the model.
          .filter(
            (m) =>
              !(
                m.role === 'user' &&
                m.attachments?.some((a) => a.kind === 'audio') &&
                !m.attachments.some((a) => a.kind === 'audio' && a.analysis)
              ),
          );
        let lastUserIdx = -1;
        for (let i = apiHistory.length - 1; i >= 0; i--) {
          if (apiHistory[i].role === 'user') {
            lastUserIdx = i;
            break;
          }
        }
        const apiMessages = apiHistory.map((m, i) => ({
          role: m.role as 'user' | 'assistant',
          // Cited reply context applies to the LAST user message only.
          text:
            i === lastUserIdx && m.replyTo
              ? prefixTextWithReplyContext(m.text, m.replyTo, history)
              : m.text,
        }));

        if (
          apiMessages.length === 0 ||
          apiMessages[apiMessages.length - 1]?.role !== 'user'
        ) {
          apiMessages.push({ role: 'user', text: userText });
        }

        const pendingNow = pendingConfigurationRef.current;
        const sizeOnly =
          /^(normal|grande|mediana|familiar)$/i.test(userText.trim()) &&
          Boolean(pendingNow);
        const res = await fetch(`/api/chat/${encodeURIComponent(comercioId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages.slice(-24),
            sessionId,
            cart_snapshot: cartSnapshot.slice(0, 40),
            // Always attach pending so the Gemini simulator can complete size
            // even when it short-circuits deterministic_action.
            ...(pendingNow
              ? {
                  ...(sizeOnly
                    ? { deterministic_action: 'complete_pending_config' }
                    : {}),
                  pending_configuration: {
                    product_id: pendingNow.product_id,
                    product_name: pendingNow.product_name,
                    combine_with_product_id: pendingNow.combine_with_product_id,
                    combine_with_product_name:
                      pendingNow.combine_with_product_name,
                    quantity: pendingNow.quantity,
                    option_labels: pendingNow.option_labels,
                    exclude_ingredients: pendingNow.exclude_ingredients,
                  },
                }
              : {}),
          }),
        });

        // HTTP response received = server accepted the turn (delivered).
        setMessages((prev) => markLatestUserMessage(prev, 'delivered'));

        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          reply?: string;
          message?: string;
          sessionId?: string;
          error?: string;
          fallback?: { useTraditionalMenu?: boolean };
          cart_actions?: ChatCartActionData[];
          product_cards?: ChatProductCardData[];
          category_cards?: ChatCatalogCategory[];
          pending_configuration?: PendingChatConfiguration | null;
          supervision?: {
            mode?: string;
            conversationId?: string | null;
            feedToken?: string | null;
          };
          model?: string;
        } | null;

        if (data?.sessionId) {
          saveChatSessionId(comercioId, data.sessionId);
        }
        if (data?.supervision?.feedToken) {
          supervisionFeedTokenRef.current = data.supervision.feedToken;
        }
        if (data?.supervision?.conversationId) {
          setSupervisionWatchActive(true);
        }
        if (
          data?.supervision?.mode === 'human_handling' ||
          data?.model === 'human_handoff'
        ) {
          setHumanSupervisionActive(true);
          setSupervisionWatchActive(true);
        }

        const replyText =
          (data?.reply || data?.message || '').trim() || FALLBACK;

        // Hold "escribiendo…" until a human-feel minimum, even if Gemini was fast.
        const holdMs = Math.max(
          0,
          humanTypingMinMs(replyText.length) - (Date.now() - turnStartedAt),
        );
        if (holdMs > 0) await sleep(holdMs);

        if (!res.ok || data?.ok === false) {
          if (
            data?.error === 'gemini_unconfigured' ||
            data?.error === 'chatbot_disabled' ||
            data?.error === 'production_blocked'
          ) {
            setServerAuthorized(false);
            setAuthReason(data.error);
          }
          setErrorText(replyText);
          // Still show assistant reply → processed (blue ticks = answered, not "human read").
          const errMsg = createMessage('assistant', replyText);
          setMessages((prev) => [
            ...markLatestUserMessage(prev, 'read'),
            errMsg,
          ]);
          playAssistantReceivedOnce(errMsg);
          return;
        }

        // Prefer server category carousel; if the model listed categories as
        // plain text after a categories intent, still attach the live catalog.
        const categoryCards =
          (data?.category_cards && data.category_cards.length > 0
            ? data.category_cards
            : null) ||
          (matchCatalogIntent(userText, catalog)?.kind === 'categories' &&
          catalog
            ? catalog.categories
            : undefined);
        if (data?.pending_configuration) {
          setPendingConfiguration({
            product_id: data.pending_configuration.product_id,
            product_name: data.pending_configuration.product_name,
            combine_with_product_id:
              data.pending_configuration.combine_with_product_id,
            combine_with_product_name:
              data.pending_configuration.combine_with_product_name,
            quantity: data.pending_configuration.quantity || 1,
            option_labels: data.pending_configuration.option_labels || [],
            exclude_ingredients:
              data.pending_configuration.exclude_ingredients || [],
            size_choices: data.pending_configuration.size_choices,
          });
        } else if (
          data?.cart_actions?.some((a) => a.type === 'propose_add')
        ) {
          setPendingConfiguration(null);
        }

        // Attribute-only asks: do not re-attach a product browse carousel.
        const attributeOnly =
          Boolean(data?.pending_configuration) &&
          !(data?.cart_actions && data.cart_actions.length > 0);
        const okMsg = createMessage('assistant', replyText, {
          productCards: attributeOnly ? [] : data?.product_cards || [],
          cartActions: data?.cart_actions || [],
          catalogCategories: attributeOnly ? undefined : categoryCards,
        });
        setMessages((prev) => [
          ...markLatestUserMessage(prev, 'read'),
          okMsg,
        ]);
        playAssistantReceivedOnce(okMsg);
      } catch {
        // Network failure before accept: leave ticks at "sent" (no fake delivered/read).
        setErrorText(FALLBACK);
        const failMsg = createMessage('assistant', FALLBACK);
        setMessages((prev) => [...prev, failMsg]);
        playAssistantReceivedOnce(failMsg);
      } finally {
        setIsTyping(false);
      }
    },
    [
      live,
      businessName,
      comercioId,
      cartSnapshot,
      catalog,
      playAssistantReceivedOnce,
    ],
  );

  /** Sends `rawText` as a user turn (typed draft or a tapped suggestion chip). */
  const sendText = useCallback(
    async (rawText: string) => {
      const text = rawText.replace(/\s+/g, ' ').trim();
      if (!text || isTyping) return;

      setErrorText(null);
      if (DECLINE_RE.test(text)) setDeclinedComplements(true);
      const reply = replyTo;
      setReplyTo(null);
      const userMsg = createMessage('user', text, {
        deliveryStatus: 'sent',
        replyTo: reply,
      });
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);

      // Typed close-sale: go straight to checkout (no menu upsell sheet).
      if (READY_TO_PAY_RE.test(text) && cartCount > 0 && onOpenCheckout) {
        setDeclinedComplements(true);
        const ack = createMessage(
          'assistant',
          'Perfecto. Te llevo a revisar y pagar tu pedido.',
        );
        setMessages([
          ...nextMessages.map((m) =>
            m.closeSale?.status === 'pending' ||
            m.closeSale?.status === 'answered_more'
              ? {
                  ...m,
                  closeSale: {
                    ...m.closeSale,
                    status: 'answered_pay' as const,
                  },
                }
              : m,
          ),
          ack,
        ]);
        playAssistantReceivedOnce(ack);
        onOpenCheckout();
        return;
      }

      // Local UX answers first (carousels / location / hours / contact / …), then Gemini.
      if (await answerCatalogIntent(text)) return;
      if (await answerLocationIntent(text)) return;
      if (await answerHoursIntent(text)) return;
      if (await answerContactIntent(text)) return;
      if (await answerPlatformIntent(text)) return;
      if (await answerFulfillmentIntent(text)) return;
      if (await answerPaymentIntent(text)) return;
      await runAssistantTurn(text, nextMessages);
    },
    [
      isTyping,
      messages,
      replyTo,
      cartCount,
      onOpenCheckout,
      playAssistantReceivedOnce,
      runAssistantTurn,
      answerCatalogIntent,
      answerLocationIntent,
      answerHoursIntent,
      answerContactIntent,
      answerPlatformIntent,
      answerFulfillmentIntent,
      answerPaymentIntent,
    ],
  );

  const sendMessage = useCallback(async () => {
    const text = draft.replace(/\s+/g, ' ').trim();
    if (!text || isTyping) return;
    setDraft('');
    await sendText(text);
  }, [draft, isTyping, sendText]);

  const onPickSuggestion = useCallback(
    (chip: ChatSuggestedChip) => {
      const contextual = chip as ChatContextualChip;
      if (
        !isQuickReplyActionable(
          contextual,
          quickReplyContextIdRef.current,
        )
      ) {
        return;
      }
      // One-shot: clear context so a double-tap cannot re-fire stale chips.
      quickReplyContextIdRef.current = null;
      const action = chip.action;
      switch (action.type) {
        case 'category':
          onSelectCategory(action.categoryId);
          break;
        case 'catalog':
          if (catalog) openCatalogSheet(action.categoryId);
          else onOpenMenu();
          break;
        case 'cart':
          onOpenCart();
          break;
        case 'checkout':
          onOpenCheckout?.();
          break;
        case 'configure_product':
          onConfigureProduct?.(action.productId);
          break;
        case 'payments':
          void sendText('Cómo pago');
          break;
        case 'location':
          void sendText('Envíame la ubicación');
          break;
        case 'hours':
          void sendText('¿Cuál es el horario?');
          break;
        case 'contact':
          void sendText('Quiero el WhatsApp del local');
          break;
        case 'text':
          void sendText(action.text);
          break;
      }
    },
    [
      catalog,
      onSelectCategory,
      openCatalogSheet,
      onOpenMenu,
      onOpenCart,
      onOpenCheckout,
      onConfigureProduct,
      sendText,
    ],
  );

  const sendVoice = useCallback(
    async (payload: ChatVoicePayload) => {
      if (isTyping) return;
      if (humanSupervisionActive) {
        setErrorText(
          'Mientras el restaurante atiende, envía solo texto. Las notas de voz no llegan al personal.',
        );
        return;
      }
      setErrorText(null);
      const secs = Math.max(1, Math.round(payload.durationMs / 1000));
      const placeholder = `🎤 Nota de voz (${secs}s)`;
      const audioMime = payload.blob.type || 'audio/webm';
      const browserTranscript = isUnusableTranscript(payload.transcript)
        ? ''
        : (payload.transcript ?? '').trim();

      // Show the voice bubble right away; the transcript is filled in after STT.
      const reply = replyToRef.current;
      setReplyTo(null);
      const attachmentId = `audio-${Date.now()}`;
      const userMsg = createMessage('user', placeholder, {
        replyTo: reply,
        deliveryStatus: 'sent',
        voiceUrl: payload.url,
        voiceDurationMs: payload.durationMs,
        // Spinner in the bubble until STT finishes (avoids native audio "0").
        voicePending: true,
        attachments: [
          {
            id: attachmentId,
            kind: 'audio',
            name: 'Nota de voz',
            mime: audioMime,
            size: payload.blob.size,
            url: payload.url,
            analysis: null,
          },
        ],
      });
      setMessages((prev) => [...prev, userMsg]);
      // Header shows "escribiendo…" and the composer locks while we transcribe.
      setIsTyping(true);

      let serverTranscript = '';
      let note: string | null = null;
      // Live: ALWAYS ask the server STT (browser STT is often short/empty).
      // Not live: only when the browser gave us nothing, to surface why it can't.
      if (live || !browserTranscript) {
        try {
          // Some browsers hand back an untyped Blob — media route needs audio/*.
          const file = payload.blob.type
            ? payload.blob
            : new Blob([payload.blob], { type: audioMime });
          const form = new FormData();
          form.set('kind', 'audio');
          form.set('durationSec', String(Math.min(60, secs)));
          form.set('file', file, voiceFileName(audioMime));
          const res = await fetch(
            `/api/chat/${encodeURIComponent(comercioId)}/media`,
            { method: 'POST', body: form },
          );
          const data = (await res.json().catch(() => null)) as {
            ok?: boolean;
            mode?: string;
            transcript?: string | null;
            note?: string | null;
            error?: string;
            message?: string;
          } | null;
          const t = (data?.transcript ?? '').trim();
          if (res.ok && data?.ok !== false && !isUnusableTranscript(t)) {
            serverTranscript = t;
          } else {
            note = describeVoiceMediaFailure(res.status, data);
          }
        } catch {
          note = 'No se pudo contactar el servicio de transcripción de voz.';
        }
      }

      // Prefer the server transcript when it is more complete; browser is the fallback.
      const transcript =
        serverTranscript.length > browserTranscript.length
          ? serverTranscript
          : browserTranscript || serverTranscript;

      if (isUnusableTranscript(transcript)) {
        // Nothing to send to the model: never run a turn on the placeholder.
        const failMsg = createMessage('assistant', VOICE_NOT_UNDERSTOOD);
        setMessages((prev) => [
          ...markLatestUserMessage(
            prev.map((m) =>
              m.id === userMsg.id ? { ...m, voicePending: false } : m,
            ),
            'read',
          ),
          failMsg,
        ]);
        if (note) setErrorText(note);
        playAssistantReceivedOnce(failMsg);
        setIsTyping(false);
        return;
      }

      if (DECLINE_RE.test(transcript)) setDeclinedComplements(true);
      const finalUserMsg: ChatMessage = {
        ...userMsg,
        text: transcript,
        voicePending: false,
        attachments: userMsg.attachments?.map((a) =>
          a.id === attachmentId ? { ...a, analysis: transcript } : a,
        ),
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === userMsg.id ? finalUserMsg : m)),
      );
      const nextMessages = [...messages, finalUserMsg];
      if (await answerCatalogIntent(transcript)) {
        setIsTyping(false);
        return;
      }
      if (await answerLocationIntent(transcript)) {
        setIsTyping(false);
        return;
      }
      if (await answerHoursIntent(transcript)) {
        setIsTyping(false);
        return;
      }
      if (await answerContactIntent(transcript)) {
        setIsTyping(false);
        return;
      }
      if (await answerPlatformIntent(transcript)) {
        setIsTyping(false);
        return;
      }
      if (await answerFulfillmentIntent(transcript)) {
        setIsTyping(false);
        return;
      }
      if (await answerPaymentIntent(transcript)) {
        setIsTyping(false);
        return;
      }
      // runAssistantTurn owns the typing indicator from here on.
      await runAssistantTurn(transcript, nextMessages);
    },
    [
      isTyping,
      humanSupervisionActive,
      messages,
      live,
      runAssistantTurn,
      comercioId,
      answerCatalogIntent,
      answerLocationIntent,
      answerHoursIntent,
      answerContactIntent,
      answerPlatformIntent,
      answerFulfillmentIntent,
      answerPaymentIntent,
      playAssistantReceivedOnce,
    ],
  );

  const sendFile = useCallback(
    async (payload: ChatFilePayload) => {
      if (humanSupervisionActive) {
        setErrorText(
          'Mientras el restaurante atiende, envía solo texto. Los archivos no llegan al personal.',
        );
        return;
      }
      if (isTyping) return;
      setErrorText(null);

      // Images in chat are not payment proofs — steer the customer to checkout.
      if (payload.kind === 'image') {
        let persistedUrl = payload.url;
        try {
          persistedUrl = await fileToPersistedDataUrl(payload.file);
          if (payload.url.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(payload.url);
            } catch {
              /* ignore */
            }
          }
        } catch {
          persistedUrl = payload.url;
        }
        const label = `📷 ${payload.file.name || 'Imagen'}`;
        const attachment: ChatAttachment = {
          id: `file-${Date.now()}`,
          kind: 'image',
          name: payload.file.name || label,
          mime: payload.file.type || 'image/jpeg',
          size: payload.file.size,
          url: persistedUrl,
          analysis: null,
        };
        const reply = replyToRef.current;
        setReplyTo(null);
        const userMsg = createMessage('user', label, {
          replyTo: reply,
          deliveryStatus: 'sent',
          attachments: [attachment],
        });
        setIsTyping(true);
        const withUser = [...messages, userMsg];
        setMessages(withUser);
        saveChatHistory(comercioId, withUser);
        await sleep(humanLocalReplyMs());
        const notice = createMessage(
          'assistant',
          'Si es un *comprobante de pago*, adjúntalo en el *checkout* al confirmar el pedido (ahí queda registrado para el local). Desde el chat no procesamos comprobantes.',
          cartCount > 0 && onOpenCheckout
            ? {
                cartActions: [
                  {
                    type: 'open_checkout',
                    requires_confirmation: true,
                    proposal_id: `checkout_proof_${Date.now().toString(36)}`,
                    catalog_fingerprint: null,
                    label: 'Ir al checkout',
                  },
                ],
              }
            : undefined,
        );
        const next = [...markLatestUserMessage(withUser, 'read'), notice];
        setMessages(next);
        saveChatHistory(comercioId, next);
        playAssistantReceivedOnce(notice);
        setIsTyping(false);
        return;
      }

      const label = `📎 ${payload.file.name || 'Archivo'}`;
      const attachment: ChatAttachment = {
        id: `file-${Date.now()}`,
        kind: 'file',
        name: payload.file.name || label,
        mime: payload.file.type || 'application/octet-stream',
        size: payload.file.size,
        url: payload.url,
        analysis: null,
      };
      const reply = replyToRef.current;
      setReplyTo(null);
      const userMsg = createMessage('user', label, {
        replyTo: reply,
        deliveryStatus: 'sent',
        attachments: [attachment],
      });
      setIsTyping(true);
      const withUser = [...messages, userMsg];
      setMessages(withUser);
      await sleep(humanLocalReplyMs());
      const notice = createMessage(
        'assistant',
        'Recibí el archivo. Si es un *comprobante de pago*, súbelo en el *checkout* al pagar para que el restaurante lo vea con el pedido.',
        cartCount > 0 && onOpenCheckout
          ? {
              cartActions: [
                {
                  type: 'open_checkout',
                  requires_confirmation: true,
                  proposal_id: `checkout_file_${Date.now().toString(36)}`,
                  catalog_fingerprint: null,
                  label: 'Ir al checkout',
                },
              ],
            }
          : undefined,
      );
      const next = [...markLatestUserMessage(withUser, 'read'), notice];
      setMessages(next);
      playAssistantReceivedOnce(notice);
      setIsTyping(false);
    },
    [
      isTyping,
      humanSupervisionActive,
      messages,
      comercioId,
      cartCount,
      onOpenCheckout,
      playAssistantReceivedOnce,
    ],
  );

  /** Pull-to-refresh: re-attach welcome categories from the live catalog. */
  const refreshConversation = useCallback(() => {
    setErrorText(null);
    const categories = welcomeCategories(catalog);
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.isWelcome);
      if (idx < 0) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], catalogCategories: categories };
      return next;
    });
  }, [catalog]);

  const suggestedChips = useMemo(() => {
    const built = buildContextualQuickReplies({
      catalog,
      cartCount,
      messages,
      activeCategoryId:
        messages[messages.length - 1]?.catalogCategoryId ?? null,
      hasPaymentMethods: paymentMethods.length > 0,
      hasBusinessLocation: Boolean(businessLocation),
      hasBusinessHours: Boolean(businessHours),
      hasWhatsApp: Boolean(whatsappUrl),
      suppressComplements: declinedComplements,
      pendingSizeChoices: pendingConfiguration?.size_choices ?? null,
    });
    quickReplyContextIdRef.current = built.context?.id ?? null;
    return built.chips;
  }, [
    catalog,
    cartCount,
    messages,
    paymentMethods.length,
    businessLocation,
    businessHours,
    whatsappUrl,
    declinedComplements,
    pendingConfiguration,
  ]);

  const shareLocation = useCallback(
    async (location: ChatSharedLocation) => {
      if (isTyping) return;
      setErrorText(null);
      const label =
        location.label?.trim() ||
        `📍 ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
      const reply = replyToRef.current;
      setReplyTo(null);
      const userMsg = createMessage(
        'user',
        `Compartí mi ubicación para delivery: ${label}`,
        {
          replyTo: reply,
          deliveryStatus: 'sent',
          location: {
            lat: location.lat,
            lng: location.lng,
            label,
            kind: 'customer',
          },
        },
      );
      const withUser = [...messages, userMsg];
      setMessages(withUser);
      saveChatHistory(comercioId, withUser);

      const quoted = onQuoteDeliveryAt?.(location);
      const result = buildDeliveryLocationReply({
        supportsDelivery: quoted?.supportsDelivery ?? false,
        pickupAvailable: quoted?.pickupAvailable,
        quote: quoted?.quote ?? null,
        feeLabel: quoted?.feeLabel ?? null,
        currency: quoted?.currency ?? null,
      });

      setIsTyping(true);
      await sleep(humanLocalReplyMs());
      const assistantMsg = createMessage('assistant', result.message, {
        cartActions:
          result.openCheckout && onOpenCheckout
            ? [
                {
                  type: 'open_checkout',
                  requires_confirmation: true,
                  proposal_id: `checkout_del_${Date.now().toString(36)}`,
                  catalog_fingerprint: null,
                  label: 'Continuar al checkout',
                },
              ]
            : undefined,
      });
      const next = [...markLatestUserMessage(withUser, 'read'), assistantMsg];
      setMessages(next);
      saveChatHistory(comercioId, next);
      playAssistantReceivedOnce(assistantMsg);
      setIsTyping(false);

      if (result.openCheckout) {
        onShareLocationForDelivery?.(location);
      }
    },
    [
      isTyping,
      messages,
      onQuoteDeliveryAt,
      onShareLocationForDelivery,
      onOpenCheckout,
      comercioId,
      playAssistantReceivedOnce,
    ],
  );

  const onPhoneLinkClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a[data-chat-link="phone"]');
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      const raw =
        link.getAttribute('data-chat-phone-raw') ||
        link.textContent ||
        '';
      const display =
        link.getAttribute('data-chat-phone-display') || raw;
      if (!raw.trim()) return;
      setPhoneAction({ raw: raw.trim(), display: display.trim() || raw.trim() });
    },
    [],
  );

  const openImage = useCallback((src: string, alt: string) => {
    if (!src) return;
    setMediaLightbox({ src, alt });
  }, []);

  return (
    <section
      ref={frameRef}
      className="relative z-[55] flex w-full flex-col overflow-hidden"
      style={{
        ...frameStyle,
        ...themeStyle,
        backgroundColor: 'var(--chat-bg)',
        color: 'var(--chat-text)',
      }}
      aria-labelledby={regionId}
      data-chatbot-preview="1"
      data-chatbot-runtime={live ? '1' : '0'}
      data-chatbot-phase="3.3-ui"
      data-chatbot-typing={isTyping ? '1' : '0'}
      data-chat-theme={theme}
      data-cart-count={cartCount}
      data-chat-sounds={soundsEnabled ? '1' : '0'}
      onClick={onPhoneLinkClick}
      onPointerDownCapture={() => {
        unlockChatSounds();
        prefetchChatSounds();
      }}
    >
      {/* Centered column matches the public menu shell (max-w-5xl). */}
      <div
        className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden shadow-sm sm:border-x sm:border-[var(--chat-header-border)]"
        data-chat-shell="1"
      >
      <h2 id={regionId} className="sr-only">
        Asistente virtual de {businessName}
      </h2>

      <ChatHeader
        businessName={businessName}
        logoUrl={logoUrl}
        initialLetter={initialLetter}
        cartCount={cartCount}
        cartTotalLabel={cartTotalLabel}
        theme={theme}
        onToggleTheme={toggleTheme}
        onBack={onOpenMenu}
        onOpenMenu={onOpenMenu}
        onOpenCart={onOpenCart}
        onNewConversation={resetConversation}
        onOpenCheckout={onOpenCheckout}
        whatsappUrl={whatsappUrl}
        showCheckoutHint={cartCount > 0 && Boolean(onOpenCheckout)}
        isTyping={isTyping}
        soundsEnabled={soundsEnabled}
        onToggleSounds={() => {
          const next = !soundsEnabled;
          setChatSoundsEnabled(next);
          setSoundsEnabled(next);
        }}
        onOpenAvatar={
          logoUrl ? () => openImage(logoUrl, businessName) : undefined
        }
        onOpenProfile={() => setProfileOpen(true)}
      />

      {!live &&
      (authReason === 'gemini_unconfigured' ||
        authReason === 'chatbot_disabled' ||
        authReason === 'production_blocked' ||
        authReason === 'quota_backend_not_persistent') ? (
        <div
          className="shrink-0 border-b px-3 py-1.5 text-[12px] text-[var(--chat-text-muted)]"
          style={{
            backgroundColor: 'var(--chat-header)',
            borderColor: 'var(--chat-header-border)',
          }}
        >
          El asistente no está disponible ahora. Usa el menú o habla con el
          restaurante.
        </div>
      ) : null}

      <ChatMessageList
        messages={messages}
        isTyping={isTyping}
        errorText={errorText}
        theme={theme}
        confirmedProposalIds={confirmedProposalIds}
        onConfirmCartAction={confirmCartAction}
        onDismissCartAction={dismissCartAction}
        onConfigureProduct={onConfigureProduct}
        onAddSimpleProduct={onAddSimpleProduct}
        cartActionBusy={cartBusy}
        onReply={(m) => setReplyTo(buildChatReplyRef(m))}
        onSelectCategory={catalog ? onSelectCategory : undefined}
        onSeeAllCatalog={catalog ? openCatalogSheet : undefined}
        onOpenCheckout={onOpenCheckout}
        onCloseSaleWantMore={handleCloseSaleWantMore}
        onCloseSaleReadyToPay={handleCloseSaleReadyToPay}
        onOpenImage={openImage}
        onRefresh={refreshConversation}
        voiceAvatarUrl={logoUrl}
        voiceAvatarLetter={initialLetter}
      />

      <ChatSuggestedReplies
        chips={suggestedChips}
        hidden={isTyping || recording}
        onPick={onPickSuggestion}
      />

      {humanSupervisionActive ? (
        <div
          className="shrink-0 border-t px-3 py-1.5 text-[12px] text-[var(--chat-text-muted)]"
          style={{
            backgroundColor: 'var(--chat-header)',
            borderColor: 'var(--chat-header-border)',
          }}
        >
          El restaurante está atendiendo. Por ahora solo texto — voz y archivos
          no llegan al personal.
        </div>
      ) : null}

      <ChatComposer
        onRecordingChange={setRecording}
        value={draft}
        disabled={isTyping}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        onChange={setDraft}
        onSend={() => {
          void sendMessage();
        }}
        onSendVoice={
          humanSupervisionActive
            ? undefined
            : (payload) => {
                void sendVoice(payload);
              }
        }
        onSendFile={
          humanSupervisionActive
            ? undefined
            : (payload) => {
                void sendFile(payload);
              }
        }
        onShareLocation={(location) => {
          void shareLocation(location);
        }}
      />
      </div>

      {catalog ? (
        <ChatCatalogSheet
          open={catalogSheetOpen}
          catalog={catalog}
          initialCategoryId={catalogSheetCategoryId}
          onClose={() => setCatalogSheetOpen(false)}
          onConfigureProduct={(productId) => {
            // Close first so ProductOptionsSheet (parent overlay) isn't hidden behind it.
            setCatalogSheetOpen(false);
            onConfigureProduct?.(productId);
          }}
          onAddSimpleProduct={onAddSimpleProduct}
        />
      ) : null}

      <ChatPhoneActionSheet
        phone={phoneAction}
        onClose={() => setPhoneAction(null)}
      />

      <ChatBusinessProfileSheet
        open={profileOpen}
        profile={{
          name: businessName,
          logoUrl,
          initialLetter,
          address: businessLocation?.address ?? null,
          whatsappUrl,
          whatsappDisplay,
          location: businessLocation,
          hours: businessHours,
        }}
        onClose={() => setProfileOpen(false)}
        onOpenAvatar={(src, alt) => {
          setProfileOpen(false);
          openImage(src, alt);
        }}
      />

      <ChatMediaLightbox
        media={mediaLightbox}
        onClose={() => setMediaLightbox(null)}
      />
    </section>
  );
}
