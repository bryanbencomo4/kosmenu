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
import { ChatHeader } from './ChatHeader';
import { ChatMessageList } from './ChatMessageList';
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
  ChatDeliveryStatus,
  ChatMessage,
  ChatProductCardData,
  ChatSharedLocation,
} from './chat-types';

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
    attachments?: ChatAttachment[];
    location?: ChatMessage['location'];
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
    attachments: options?.attachments,
    location: options?.location,
  };
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

export function ChatAssistantView({
  comercioId,
  businessName,
  logoUrl,
  initialLetter,
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
            }),
          ];
    return refreshWelcomeInHistory(base, welcome, {
      runtimeEnabled: live,
    }) as ChatMessage[];
  });
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
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
  useEffect(() => {
    const sync = () => {
      const vv = window.visualViewport;
      if (!vv) {
        setFrameStyle({
          position: 'fixed',
          inset: 0,
          height: '100dvh',
          maxHeight: '100dvh',
        });
        return;
      }
      setFrameStyle({
        position: 'fixed',
        left: 0,
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

  const resetConversation = useCallback(() => {
    clearChatHistory(comercioId);
    ensureChatSessionId(comercioId);
    setMessages([
      createMessage('assistant', welcome, { demo: !live, isWelcome: true }),
    ]);
    setConfirmedProposalIds(new Set());
    setErrorText(null);
    setDraft('');
  }, [comercioId, welcome, live]);

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
    setMessages((prev) => [
      ...prev,
      createMessage('system', `Agregado: ${incomingAppliedNotice.label}`, {
        productCards: incomingAppliedNotice.productCard
          ? [incomingAppliedNotice.productCard]
          : [],
      }),
    ]);
    onIncomingAppliedNoticeConsumed?.();
  }, [incomingAppliedNotice, onIncomingAppliedNoticeConsumed]);

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
        setMessages((prev) => [
          ...prev,
          createMessage('system', `Listo: ${action.label}`),
        ]);
      } finally {
        setCartBusy(false);
      }
    },
    [onApplyCartAction, onOpenCheckout, confirmedProposalIds],
  );

  const dismissCartAction = useCallback((action: ChatCartActionData) => {
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
      setIsTyping(true);

      if (!live) {
        // Demo path: "delivered" = local demo engine accepted the turn (no fake delay).
        setMessages((prev) => markLatestUserMessage(prev, 'delivered'));
        window.setTimeout(() => {
          try {
            const reply = buildChatbotDemoReply(userText, businessName);
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
        }, 650);
        return;
      }

      try {
        const sessionId = ensureChatSessionId(comercioId);
        const apiMessages = history
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .filter((m) => !m.demo)
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            text: m.text,
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
        } | null;

        if (data?.sessionId) {
          saveChatSessionId(comercioId, data.sessionId);
        }

        const replyText =
          (data?.reply || data?.message || '').trim() || FALLBACK;

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

        const okMsg = createMessage('assistant', replyText, {
          productCards: data?.product_cards || [],
          cartActions: data?.cart_actions || [],
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
    [live, businessName, comercioId, cartSnapshot, playAssistantReceivedOnce],
  );

  const sendMessage = useCallback(async () => {
    const text = draft.replace(/\s+/g, ' ').trim();
    if (!text || isTyping) return;

    setErrorText(null);
    setDraft('');
    const userMsg = createMessage('user', text, { deliveryStatus: 'sent' });
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    await runAssistantTurn(text, nextMessages);
  }, [draft, isTyping, messages, runAssistantTurn]);

  const sendVoice = useCallback(
    async (payload: ChatVoicePayload) => {
      if (isTyping) return;
      setErrorText(null);
      const secs = Math.max(1, Math.round(payload.durationMs / 1000));
      let transcript = payload.transcript?.trim() || '';

      // Browser STT missing (common on Safari iOS) → gated backend helper (simulate by default).
      if (!transcript) {
        try {
          const form = new FormData();
          form.set('kind', 'audio');
          form.set(
            'file',
            payload.blob,
            payload.blob.type.includes('mp4') ? 'voice.m4a' : 'voice.webm',
          );
          const res = await fetch(
            `/api/chat/${encodeURIComponent(comercioId)}/media`,
            { method: 'POST', body: form },
          );
          const data = (await res.json().catch(() => null)) as {
            transcript?: string | null;
            note?: string | null;
          } | null;
          if (data?.transcript?.trim()) {
            transcript = data.transcript.trim();
          } else if (data?.note) {
            setErrorText(data.note);
          }
        } catch {
          /* keep audio without transcript */
        }
      }

      const text = transcript || `🎤 Nota de voz (${secs}s)`;
      const userMsg = createMessage('user', text, {
        deliveryStatus: 'sent',
        voiceUrl: payload.url,
        voiceDurationMs: payload.durationMs,
        attachments: [
          {
            id: `audio-${Date.now()}`,
            kind: 'audio',
            name: 'Nota de voz',
            mime: payload.blob.type || 'audio/webm',
            size: payload.blob.size,
            url: payload.url,
            analysis: transcript || null,
          },
        ],
      });
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      await runAssistantTurn(text, nextMessages);
    },
    [isTyping, messages, runAssistantTurn, comercioId],
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
      const userMsg = createMessage('user', userText, {
        deliveryStatus: 'sent',
        attachments: [attachment],
      });
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      await runAssistantTurn(userText, nextMessages);
    },
    [isTyping, messages, runAssistantTurn, comercioId],
  );

  const shareLocation = useCallback(
    async (location: ChatSharedLocation) => {
      if (isTyping) return;
      setErrorText(null);
      const label =
        location.label?.trim() ||
        `📍 ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
      const userMsg = createMessage(
        'user',
        `Compartí mi ubicación para delivery: ${label}`,
        {
          deliveryStatus: 'sent',
          location: {
            lat: location.lat,
            lng: location.lng,
            label,
          },
        },
      );
      const nextMessages = [...messages, userMsg];
      // Persist before parent may unmount this view (menu/checkout handoff).
      setMessages(nextMessages);
      saveChatHistory(comercioId, nextMessages);
      await runAssistantTurn(
        `Quiero delivery en esta ubicación: lat ${location.lat}, lng ${location.lng}. Ayúdame a continuar al checkout.`,
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
      className="z-[55] mx-auto flex w-full max-w-3xl flex-col overflow-hidden shadow-sm sm:max-w-3xl"
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
      />

      <ChatComposer
        value={draft}
        disabled={isTyping}
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
    </section>
  );
}
