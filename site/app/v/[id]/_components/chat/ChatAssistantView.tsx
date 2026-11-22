'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
import { ChatCatalogSheet } from './ChatCatalogSheet';
import { ChatHeader } from './ChatHeader';
import { ChatMessageList } from './ChatMessageList';
import {
  ChatSuggestedReplies,
  buildSuggestedReplies,
  type ChatSuggestedChip,
} from './ChatSuggestedReplies';
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
  ChatDeliveryStatus,
  ChatMessage,
  ChatProductCardData,
  ChatReplyRef,
  ChatSharedLocation,
} from './chat-types';

/** User declined extras / the recommendation ("no gracias", "ahora no", "no quiero"). */
const DECLINE_RE = /\b(no[, ]?gracias|ahora no|no quiero)\b/i;
/** Max complement carousels per conversation. */
const MAX_COMPLEMENT_ROUNDS = 2;

export type ChatCartSnapshotLine = {
  productId: string;
  quantity: number;
  selection: CartLineSelection;
};

type ChatAssistantViewProps = {
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
  };
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
  const [catalogSheetOpen, setCatalogSheetOpen] = useState(false);
  const [catalogSheetCategoryId, setCatalogSheetCategoryId] = useState<
    string | null
  >(null);
  // Latest reply target for async send paths (voice/file await network first).
  const replyToRef = useRef<ChatReplyRef | null>(null);
  replyToRef.current = replyTo;
  const [declinedComplements, setDeclinedComplements] = useState(false);
  const [complementsShownCount, setComplementsShownCount] = useState(0);
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

  const resetConversation = useCallback(() => {
    clearChatHistory(comercioId);
    ensureChatSessionId(comercioId);
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

  useEffect(() => {
    if (!incomingAppliedNotice) return;
    const notice = incomingAppliedNotice;
    setMessages((prev) => [
      ...prev,
      createMessage('system', `Agregado: ${notice.label}`, {
        productCards: notice.productCard ? [notice.productCard] : [],
      }),
    ]);
    if (
      catalog &&
      !declinedComplements &&
      complementsShownCount < MAX_COMPLEMENT_ROUNDS
    ) {
      const cartProductIds = Array.from(
        new Set([
          ...cartSnapshot.map((line) => line.productId),
          ...(notice.productCard?.product_id
            ? [notice.productCard.product_id]
            : []),
        ]),
      );
      const suggestions = suggestComplementProducts(catalog, cartProductIds, {
        limit: 4,
      });
      if (suggestions.length > 0) {
        const suggestMsg = createMessage(
          'assistant',
          '¡Listo! Ya está en tu pedido. ¿Te provoca algo más?',
          { catalogProducts: suggestions.map(toChatProductCard) },
        );
        setMessages((prev) => [...prev, suggestMsg]);
        setComplementsShownCount((n) => n + 1);
        playAssistantReceivedOnce(suggestMsg);
      }
    }
    onIncomingAppliedNoticeConsumed?.();
  }, [
    incomingAppliedNotice,
    onIncomingAppliedNoticeConsumed,
    catalog,
    cartSnapshot,
    declinedComplements,
    complementsShownCount,
    playAssistantReceivedOnce,
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

        // Complement upsell: at most twice, never after the user said no.
        if (
          action.type === 'propose_add' &&
          catalog &&
          !declinedComplements &&
          complementsShownCount < MAX_COMPLEMENT_ROUNDS
        ) {
          const cartProductIds = Array.from(
            new Set([
              ...cartSnapshot.map((line) => line.productId),
              action.product_id,
            ]),
          );
          const suggestions = suggestComplementProducts(
            catalog,
            cartProductIds,
            { limit: 4 },
          );
          if (suggestions.length > 0) {
            const suggestMsg = createMessage(
              'assistant',
              '¡Listo! Ya está en tu pedido. ¿Te provoca algo más?',
              { catalogProducts: suggestions.map(toChatProductCard) },
            );
            setMessages((prev) => [...prev, suggestMsg]);
            setComplementsShownCount((n) => n + 1);
            playAssistantReceivedOnce(suggestMsg);
          }
        }
      } finally {
        setCartBusy(false);
      }
    },
    [
      onApplyCartAction,
      onOpenCheckout,
      confirmedProposalIds,
      catalog,
      cartSnapshot,
      declinedComplements,
      complementsShownCount,
      playAssistantReceivedOnce,
    ],
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

        const res = await fetch(`/api/chat/${encodeURIComponent(comercioId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages.slice(-24),
            sessionId,
            cart_snapshot: cartSnapshot.slice(0, 40),
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
        } | null;

        if (data?.sessionId) {
          saveChatSessionId(comercioId, data.sessionId);
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
        const okMsg = createMessage('assistant', replyText, {
          productCards: data?.product_cards || [],
          cartActions: data?.cart_actions || [],
          catalogCategories: categoryCards,
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
    [catalog, onSelectCategory, openCatalogSheet, onOpenMenu, onOpenCart, sendText],
  );

  const sendVoice = useCallback(
    async (payload: ChatVoicePayload) => {
      if (isTyping) return;
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
      if (isTyping) return;
      setErrorText(null);
      let analysis: string | null = null;
      try {
        const form = new FormData();
        form.set('kind', payload.kind === 'image' ? 'image' : 'file');
        form.set('file', payload.file, payload.file.name);
        const res = await fetch(
          `/api/chat/${encodeURIComponent(comercioId)}/media`,
          { method: 'POST', body: form },
        );
        const data = (await res.json().catch(() => null)) as {
          analysis?: string | null;
        } | null;
        analysis = data?.analysis?.trim() || null;
      } catch {
        analysis = null;
      }

      const label =
        payload.kind === 'image'
          ? `📷 ${payload.file.name || 'Imagen'}`
          : `📎 ${payload.file.name || 'Archivo'}`;
      const attachment: ChatAttachment = {
        id: `file-${Date.now()}`,
        kind: payload.kind,
        name: payload.file.name || label,
        mime: payload.file.type || 'application/octet-stream',
        size: payload.file.size,
        url: payload.url,
        analysis,
      };
      const userText = analysis || label;
      const reply = replyToRef.current;
      setReplyTo(null);
      const userMsg = createMessage('user', userText, {
        replyTo: reply,
        deliveryStatus: 'sent',
        attachments: [attachment],
      });
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      await runAssistantTurn(userText, nextMessages);
    },
    [isTyping, messages, runAssistantTurn, comercioId],
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

  const suggestedChips = useMemo(
    () =>
      buildSuggestedReplies({
        catalog,
        cartCount,
        activeCategoryId: messages[messages.length - 1]?.catalogCategoryId ?? null,
        hasPaymentMethods: paymentMethods.length > 0,
        hasBusinessLocation: Boolean(businessLocation),
        hasBusinessHours: Boolean(businessHours),
        hasWhatsApp: Boolean(whatsappUrl),
      }),
    [
      catalog,
      cartCount,
      messages,
      paymentMethods.length,
      businessLocation,
      businessHours,
      whatsappUrl,
    ],
  );

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
      const nextMessages = [...messages, userMsg];
      // Persist before parent may unmount this view (menu/checkout handoff).
      setMessages(nextMessages);
      saveChatHistory(comercioId, nextMessages);
      await runAssistantTurn(
        [
          'TIPO: ubicacion_delivery',
          `RESUMEN: El cliente compartió su GPS para delivery (${location.lat}, ${location.lng}).`,
          'DETALLES: Usar estas coordenadas en el checkout de delivery. Confirma, explica que también puede recoger en el local si aplica, y propone abrir checkout. No inventes tarifa.',
        ].join('\n'),
        nextMessages,
      );
      // Open checkout after the turn so reply + receipts are saved while mounted.
      onShareLocationForDelivery?.(location);
    },
    [
      isTyping,
      messages,
      runAssistantTurn,
      onShareLocationForDelivery,
      comercioId,
    ],
  );

  return (
    <section
      ref={frameRef}
      className="z-[55] flex w-full flex-col overflow-hidden"
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
        showCheckoutHint={live && cartCount > 0}
        isTyping={isTyping}
        soundsEnabled={soundsEnabled}
        onToggleSounds={() => {
          const next = !soundsEnabled;
          setChatSoundsEnabled(next);
          setSoundsEnabled(next);
        }}
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
        onRefresh={refreshConversation}
      />

      <ChatSuggestedReplies
        chips={suggestedChips}
        hidden={isTyping || recording}
        onPick={onPickSuggestion}
      />

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
        onSendVoice={(payload) => {
          void sendVoice(payload);
        }}
        onSendFile={(payload) => {
          void sendFile(payload);
        }}
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
    </section>
  );
}
