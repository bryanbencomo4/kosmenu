'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import {
  ChatComposer,
  type ChatFilePayload,
  type ChatVoicePayload,
} from '../../../v/[id]/_components/chat/ChatComposer';
import { ChatHeader } from '../../../v/[id]/_components/chat/ChatHeader';
import {
  ChatMediaLightbox,
  type ChatMediaLightboxState,
} from '../../../v/[id]/_components/chat/ChatMediaLightbox';
import { ChatMessageList } from '../../../v/[id]/_components/chat/ChatMessageList';
import {
  ChatSuggestedReplies,
  type ChatSuggestedChip,
} from '../../../v/[id]/_components/chat/ChatSuggestedReplies';
import { buildChatReplyRef } from '../../../v/[id]/_components/chat/chat-gestures';
import {
  blobToDataUrl,
  fileToPersistedDataUrl,
} from '../../../v/[id]/_components/chat/chat-media-persist';
import {
  chatThemeVars,
  saveChatTheme,
  type ChatThemeMode,
} from '../../../v/[id]/_components/chat/chat-theme';
import {
  isChatSoundsEnabled,
  playChatSound,
  setChatSoundsEnabled,
  unlockChatSounds,
} from '../../../v/[id]/_components/chat/chat-sound-manager';
import type {
  ChatAttachment,
  ChatMessage,
  ChatReplyRef,
} from '../../../v/[id]/_components/chat/chat-types';
import {
  mergePanelMessages,
  toPanelChatMessages,
  type PanelMessageRow,
} from '../../_lib/panel-chat-messages';
import { usePanelSession } from '../../_lib/usePanelSession';
import { useConversationRealtime } from '../../_lib/useConversationRealtime';
import { PanelStaffActions } from './PanelStaffActions';

const STAFF_MEDIA_MAX_BYTES = 1_200_000;

type MessageRow = PanelMessageRow;

type Conversation = {
  id: string;
  status: string;
  attention_version: number;
  assigned_user_id: string | null;
  comercio_id: string;
  consumer_label: string | null;
  last_message_preview: string | null;
};

function statusLabel(status: string) {
  switch (status) {
    case 'human_handling':
      return 'Tú atendiendo';
    case 'needs_attention':
      return 'Requiere atención';
    case 'closed':
      return 'Conversación cerrada';
    default:
      return 'Asistente atendiendo';
  }
}

function friendlyPanelError(code: string, status?: number) {
  const map: Record<string, string> = {
    rate_limited:
      'Hay mucha actividad ahora. Espera unos segundos e inténtalo de nuevo.',
    human_takeover_disabled:
      'La intervención humana está desactivada (feature flag).',
    conflict: 'Otro empleado ya tomó esta conversación.',
    not_assignee: 'Solo el responsable (o un administrador) puede responder.',
    not_in_human_mode: 'Únete al chat antes de escribir.',
    supervision_disabled: 'La supervisión no está activa para este comercio.',
    unauthorized: 'Sesión expirada. Vuelve a iniciar sesión.',
    not_found: 'No encontramos esta conversación.',
    empty_message: 'Escribe un mensaje o adjunta un archivo.',
    payload_too_large:
      'El archivo es demasiado grande. Prueba una foto más liviana o un audio más corto.',
  };
  if (map[code]) return map[code];
  if (status === 429) return map.rate_limited;
  if (status === 413) return map.payload_too_large;
  return code || 'No se pudo completar la acción.';
}

function ConversationDetailInner({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Promise<{ conversationId: string }>;
  searchParamsPromise?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token, email, userId, ready, signOut } = usePanelSession();
  const [conversationId, setConversationId] = useState('');
  const [comercioId, setComercioId] = useState('');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatReplyRef | null>(null);
  const [lightbox, setLightbox] = useState<ChatMediaLightboxState>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const typingIdleRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);
  const [humanTakeoverEnabled, setHumanTakeoverEnabled] = useState(true);
  // Merchant panel matches the consumer WhatsApp dark shell by default.
  const [theme, setTheme] = useState<ChatThemeMode>('dark');
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const [frameStyle, setFrameStyle] = useState<CSSProperties>({
    position: 'fixed',
    inset: 0,
    width: '100%',
    height: '100dvh',
    maxHeight: '100dvh',
  });
  const lastSeqRef = useRef(0);
  const playedSoundIdsRef = useRef<Set<string>>(new Set());
  const seededSoundsRef = useRef(false);

  useEffect(() => {
    setSoundsEnabled(isChatSoundsEnabled());
  }, []);

  // Browsers block Web Audio until a user gesture; unlock on first interaction.
  useEffect(() => {
    const unlock = () => unlockChatSounds();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await paramsPromise;
      const sp = searchParamsPromise ? await searchParamsPromise : {};
      if (cancelled) return;
      setConversationId(decodeURIComponent(p.conversationId || ''));
      const c = typeof sp.comercioId === 'string' ? sp.comercioId : '';
      if (c) setComercioId(c);
    })();
    return () => {
      cancelled = true;
    };
  }, [paramsPromise, searchParamsPromise]);

  const load = useCallback(
    async (afterSeq = 0, opts?: { silent?: boolean }) => {
      if (!token || !conversationId) return;
      const silent = Boolean(opts?.silent);
      const res = await fetch(
        `/api/panel/conversaciones/${encodeURIComponent(conversationId)}?afterSeq=${afterSeq}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Background poll / Realtime recovery must not flash raw API codes.
        if (silent || res.status === 429) return;
        setError(
          friendlyPanelError(
            String(data.error || ''),
            res.status,
          ),
        );
        if (res.status === 401) {
          window.location.href = `/panel/login?next=${encodeURIComponent(
            `/panel/conversaciones/${encodeURIComponent(conversationId)}`,
          )}`;
        }
        return;
      }
      if (!silent) setError(null);
      setConversation(data.conversation);
      if (typeof data.flags?.human_takeover === 'boolean') {
        setHumanTakeoverEnabled(data.flags.human_takeover);
      }
      if (!comercioId && data.conversation?.comercio_id) {
        setComercioId(String(data.conversation.comercio_id));
      }
      const incoming = (data.messages || []) as MessageRow[];
      if (afterSeq > 0) {
        setMessages((prev) => {
          const merged = mergePanelMessages(prev, incoming);
          lastSeqRef.current = merged.reduce(
            (max, m) => Math.max(max, m.seq || 0),
            lastSeqRef.current,
          );
          return merged;
        });
      } else {
        seededSoundsRef.current = false;
        playedSoundIdsRef.current = new Set(incoming.map((m) => m.id));
        seededSoundsRef.current = true;
        setMessages(incoming);
        lastSeqRef.current = incoming.reduce(
          (max, m) => Math.max(max, m.seq || 0),
          0,
        );
      }
    },
    [token, conversationId, comercioId],
  );

  useEffect(() => {
    if (ready && token && conversationId) void load(0);
  }, [ready, token, conversationId, load]);

  const onRealtimeInsert = useCallback((row: MessageRow) => {
    setMessages((prev) => {
      const merged = mergePanelMessages(prev, [row]);
      lastSeqRef.current = merged.reduce(
        (max, m) => Math.max(max, m.seq || 0),
        lastSeqRef.current,
      );
      return merged;
    });
  }, []);

  // Incoming customer / assistant turns — same cue as the consumer chat.
  useEffect(() => {
    if (!seededSoundsRef.current) return;
    for (const m of messages) {
      if (playedSoundIdsRef.current.has(m.id)) continue;
      playedSoundIdsRef.current.add(m.id);
      if (m.role === 'consumer' || m.role === 'assistant') {
        unlockChatSounds();
        playChatSound('messageReceived');
        break;
      }
    }
  }, [messages]);

  const onBroadcastHint = useCallback(
    (hint?: {
      type?: string;
      party?: string;
      typing?: boolean;
      messageId?: string;
      reactions?: unknown;
    }) => {
      if (hint?.type === 'presence' && hint.party === 'consumer') {
        if (typeof hint.typing === 'boolean') setPeerTyping(hint.typing);
      }
      if (
        hint?.type === 'reaction' &&
        typeof hint.messageId === 'string' &&
        Array.isArray(hint.reactions)
      ) {
        const mid = hint.messageId;
        const reactions = hint.reactions;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === mid
              ? {
                  ...m,
                  payload: {
                    ...(m.payload && typeof m.payload === 'object'
                      ? m.payload
                      : {}),
                    reactions,
                  },
                }
              : m,
          ),
        );
      }
      void load(lastSeqRef.current, { silent: true });
    },
    [load],
  );

  useConversationRealtime(
    conversationId || null,
    comercioId || null,
    onRealtimeInsert,
    onBroadcastHint,
  );

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && lastSeqRef.current > 0) {
        void load(lastSeqRef.current, { silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && lastSeqRef.current > 0) {
        void load(lastSeqRef.current, { silent: true });
      }
    }, 45_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(id);
    };
  }, [load]);

  async function act(
    action: string,
    text?: string,
    payload?: Record<string, unknown>,
    options?: { optimistic?: boolean },
  ) {
    if (!token || !conversationId) return;
    const isMessage = action === 'message';
    // Keep take/return/close gated; message sends stay responsive (WhatsApp-like).
    if (!isMessage || !options?.optimistic) setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/panel/conversaciones/${encodeURIComponent(conversationId)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, text, payload }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!isMessage || !options?.optimistic) setBusy(false);
    if (!res.ok) {
      setError(friendlyPanelError(String(data.error || ''), res.status));
      if (res.status === 401) {
        window.location.href = `/panel/login?next=${encodeURIComponent(
          `/panel/conversaciones/${encodeURIComponent(conversationId)}`,
        )}`;
      }
      return;
    }
    if (isMessage) {
      setDraft('');
      setReplyTo(null);
    }
    await load(lastSeqRef.current > 0 ? lastSeqRef.current : 0, {
      silent: true,
    });
    // Full refresh keeps status / assignee in sync after take/return/close.
    if (!isMessage) await load(0);
  }

  function sendStaffText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !canCompose) return;
    const reply = replyTo;
    setReplyTo(null);
    setDraft('');
    unlockChatSounds();
    playChatSound('messageSent');
    void act(
      'message',
      trimmed,
      reply ? { replyTo: reply } : undefined,
      { optimistic: true },
    );
  }

  async function sendStaffPresence(input: {
    typing?: boolean;
    readUpToSeq?: number;
  }) {
    if (!token || !conversationId) return;
    try {
      await fetch(
        `/api/panel/conversaciones/${encodeURIComponent(conversationId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'presence', ...input }),
          cache: 'no-store',
        },
      );
    } catch {
      /* presence is best-effort */
    }
  }

  function onStaffTypingActivity() {
    const now = Date.now();
    if (now - lastTypingSentRef.current > 1600) {
      lastTypingSentRef.current = now;
      void sendStaffPresence({ typing: true });
    }
    if (typingIdleRef.current) window.clearTimeout(typingIdleRef.current);
    typingIdleRef.current = window.setTimeout(() => {
      void sendStaffPresence({ typing: false });
    }, 2800);
  }

  function toggleStaffReaction(message: ChatMessage, emoji: string) {
    if (!canCompose && conversation?.status !== 'human_handling') return;
    void act(
      'react',
      undefined,
      { messageId: message.id, emoji },
      { optimistic: true },
    );
  }

  async function sendStaffVoice(payload: ChatVoicePayload) {
    if (!canCompose) return;
    if (payload.blob.size > STAFF_MEDIA_MAX_BYTES) {
      setError('La nota de voz es demasiado larga. Graba un audio más corto.');
      return;
    }
    const secs = Math.max(1, Math.round(payload.durationMs / 1000));
    let dataUrl = payload.url;
    try {
      dataUrl = await blobToDataUrl(payload.blob);
    } catch {
      setError('No se pudo preparar la nota de voz.');
      return;
    }
    if (dataUrl.length > STAFF_MEDIA_MAX_BYTES * 1.4) {
      setError('La nota de voz es demasiado larga. Graba un audio más corto.');
      return;
    }
    const attachment: ChatAttachment = {
      id: `audio-${Date.now()}`,
      kind: 'audio',
      name: 'Nota de voz',
      mime: payload.blob.type || 'audio/webm',
      size: payload.blob.size,
      url: dataUrl,
      analysis: payload.transcript || null,
    };
    const reply = replyTo;
    setReplyTo(null);
    unlockChatSounds();
    playChatSound('voiceSent');
    await act(
      'message',
      payload.transcript?.trim() || `🎤 Nota de voz (${secs}s)`,
      {
        attachments: [attachment],
        voiceUrl: dataUrl,
        voiceDurationMs: payload.durationMs,
        ...(reply ? { replyTo: reply } : {}),
      },
      { optimistic: true },
    );
  }

  async function sendStaffFile(payload: ChatFilePayload) {
    if (!canCompose) return;
    if (payload.file.size > STAFF_MEDIA_MAX_BYTES) {
      setError('El archivo es demasiado grande (máx. ~1,2 MB).');
      return;
    }
    let persistedUrl = payload.url;
    try {
      if (payload.kind === 'image' || payload.file.type.startsWith('image/')) {
        persistedUrl = await fileToPersistedDataUrl(payload.file);
      } else {
        persistedUrl = await blobToDataUrl(payload.file);
      }
    } catch {
      setError('No se pudo preparar el archivo.');
      return;
    }
    if (persistedUrl.length > STAFF_MEDIA_MAX_BYTES * 1.4) {
      setError('El archivo es demasiado grande después de comprimirlo.');
      return;
    }
    const kind =
      payload.kind === 'image' || payload.file.type.startsWith('image/')
        ? 'image'
        : 'file';
    const label =
      kind === 'image'
        ? `📷 ${payload.file.name || 'Imagen'}`
        : `📎 ${payload.file.name || 'Archivo'}`;
    const attachment: ChatAttachment = {
      id: `file-${Date.now()}`,
      kind,
      name: payload.file.name || label,
      mime: payload.file.type || (kind === 'image' ? 'image/jpeg' : 'application/octet-stream'),
      size: payload.file.size,
      url: persistedUrl,
      analysis: null,
    };
    const reply = replyTo;
    setReplyTo(null);
    unlockChatSounds();
    playChatSound('messageSent');
    await act(
      'message',
      label,
      {
        attachments: [attachment],
        ...(reply ? { replyTo: reply } : {}),
      },
      { optimistic: true },
    );
  }

  const canCompose =
    humanTakeoverEnabled && conversation?.status === 'human_handling' && !busy;

  const inboxHref = useMemo(() => {
    const q = comercioId
      ? `?comercioId=${encodeURIComponent(comercioId)}`
      : '';
    return `/panel/conversaciones${q}`;
  }, [comercioId]);

  const chatMessages = useMemo(
    () => toPanelChatMessages(messages),
    [messages],
  );
  const themeStyle = useMemo(() => chatThemeVars(theme), [theme]);

  // Real quick replies only — take/return/close live in the staff action bar.
  const quickReplyChips = useMemo((): ChatSuggestedChip[] => {
    if (!humanTakeoverEnabled) return [];
    if (conversation?.status !== 'human_handling') return [];
    return [
      {
        id: 'quick-ok',
        label: 'En un momento te atiendo',
        action: {
          type: 'text',
          text: 'En un momento te atiendo 😊',
        },
      },
      {
        id: 'quick-help',
        label: '¿En qué te ayudo?',
        action: { type: 'text', text: '¿En qué te puedo ayudar?' },
      },
      {
        id: 'quick-thanks',
        label: '¡Listo, gracias!',
        action: { type: 'text', text: '¡Listo! Gracias por tu paciencia 🙏' },
      },
    ];
  }, [conversation?.status, humanTakeoverEnabled]);

  const onPickChip = useCallback(
    (chip: ChatSuggestedChip) => {
      if (busy || !canCompose) return;
      const text = chip.action.type === 'text' ? chip.action.text : '';
      if (!text) return;
      sendStaffText(text);
    },
    // sendStaffText closes over latest state; chips only need canCompose/busy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, canCompose, conversationId, token, replyTo],
  );

  // Mark consumer messages read while the thread is open.
  useEffect(() => {
    if (!canCompose && conversation?.status !== 'human_handling') return;
    const maxSeq = messages.reduce((m, row) => Math.max(m, row.seq || 0), 0);
    if (maxSeq <= 0) return;
    void sendStaffPresence({ readUpToSeq: maxSeq, typing: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, conversation?.status, conversationId]);

  const status = conversation?.status || '';
  const showTake =
    humanTakeoverEnabled && status !== 'human_handling' && status !== 'closed';
  const showReturn = humanTakeoverEnabled && status === 'human_handling';
  const customerTitle =
    (conversation?.consumer_label || '').trim() || 'Cliente';

  const subtitle = conversation
    ? peerTyping
      ? 'escribiendo…'
      : [
          statusLabel(conversation.status),
          conversation.assigned_user_id
            ? userId && conversation.assigned_user_id === userId
              ? 'Tú'
              : 'Personal'
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
    : 'Cargando…';

  if (!ready) {
    return (
      <p className="p-4 text-sm text-[var(--chat-text-muted)]">
        Comprobando sesión…
      </p>
    );
  }

  return (
    <section
      className="z-[70] flex w-full flex-col overflow-hidden"
      style={{
        ...frameStyle,
        ...themeStyle,
        backgroundColor: 'var(--chat-bg)',
        color: 'var(--chat-text)',
      }}
      data-panel-chat="1"
      data-chat-theme={theme}
    >
      <div
        className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden shadow-sm sm:border-x sm:border-[var(--chat-header-border)]"
        data-chat-shell="1"
      >
        <ChatHeader
          businessName={customerTitle}
          logoUrl={null}
          initialLetter="C"
          cartCount={0}
          cartTotalLabel=""
          theme={theme}
          isTyping={peerTyping}
          soundsEnabled={soundsEnabled}
          onToggleSounds={() => {
            const next = !soundsEnabled;
            setChatSoundsEnabled(next);
            setSoundsEnabled(next);
          }}
          onToggleTheme={() => {
            setTheme((prev) => {
              const next = prev === 'dark' ? 'light' : 'dark';
              saveChatTheme(next);
              return next;
            });
          }}
          onBack={() => {
            window.location.href = inboxHref;
          }}
          onOpenMenu={() => {
            window.location.href = inboxHref;
          }}
          onOpenCart={() => undefined}
          onNewConversation={() => void load(0)}
          hideCommerceActions
          hideNewConversation
          subtitle={subtitle}
          subtitleTestId="conversation-status"
          subtitleStatus={conversation?.status || ''}
          extraMenuActions={[
            ...(humanTakeoverEnabled
              ? [
                  {
                    id: 'take',
                    label:
                      conversation?.status === 'human_handling'
                        ? 'Ya unido al chat'
                        : 'Unirse al chat',
                    disabled: busy || conversation?.status === 'human_handling',
                    testId: 'take-conversation-menu',
                    onSelect: () => void act('take'),
                  },
                  {
                    id: 'return',
                    label: 'Devolver al asistente',
                    disabled:
                      busy || conversation?.status !== 'human_handling',
                    testId: 'return-assistant-menu',
                    onSelect: () => void act('return'),
                  },
                ]
              : []),
            {
              id: 'refresh',
              label: 'Actualizar',
              disabled: busy,
              onSelect: () => void load(0),
            },
            {
              id: 'signout',
              label: email ? `Salir (${email})` : 'Salir',
              onSelect: () => void signOut(),
            },
          ]}
        />

        {/* Always-mounted hooks for Playwright. */}
        <div className="sr-only">
          {humanTakeoverEnabled ? (
            <>
              <button
                type="button"
                data-testid="take-conversation"
                disabled={busy || conversation?.status === 'human_handling'}
                onClick={() => void act('take')}
              >
                take
              </button>
              <button
                type="button"
                data-testid="return-assistant"
                disabled={busy || conversation?.status !== 'human_handling'}
                onClick={() => void act('return')}
              >
                return
              </button>
            </>
          ) : (
            <p data-testid="takeover-disabled-hint">takeover off</p>
          )}
        </div>

        {!humanTakeoverEnabled ? (
          <div
            className="shrink-0 border-b px-3 py-1.5 text-[12px] text-[var(--chat-text-muted)]"
            style={{
              backgroundColor: 'var(--chat-header)',
              borderColor: 'var(--chat-header-border)',
            }}
            data-testid="takeover-disabled-hint"
          >
            Intervención humana desactivada. Puedes leer el historial; el
            asistente sigue atendiendo.
          </div>
        ) : null}

        {humanTakeoverEnabled ? (
          <PanelStaffActions
            busy={busy}
            showTake={showTake}
            showReturn={showReturn}
            onTake={() => void act('take')}
            onReturn={() => void act('return')}
          />
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col" data-testid="message-list">
          <ChatMessageList
            messages={chatMessages}
            theme={theme}
            errorText={error}
            isTyping={peerTyping}
            onRefresh={() => void load(0)}
            voiceAvatarLetter="C"
            cartActionsReadOnly
            onReply={
              canCompose
                ? (m) =>
                    setReplyTo(
                      buildChatReplyRef(
                        m,
                        m.senderLabel === 'Cliente'
                          ? customerTitle
                          : m.role === 'user'
                            ? 'Tú'
                            : m.senderLabel || 'Asistente',
                      ),
                    )
                : undefined
            }
            onReact={
              canCompose
                ? (m, emoji) => toggleStaffReaction(m, emoji)
                : undefined
            }
            onOpenImage={(src, alt) => setLightbox({ src, alt })}
          />
        </div>

        <ChatSuggestedReplies
          chips={quickReplyChips}
          hidden={busy || !canCompose}
          onPick={onPickChip}
        />

        {canCompose || conversation?.status === 'human_handling' ? (
          <ChatComposer
            value={draft}
            disabled={!canCompose || busy}
            onChange={setDraft}
            inputTestId="staff-draft"
            sendTestId="staff-send"
            placeholder="Escribe un mensaje"
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
            replyAuthorFallback={customerTitle}
            onTypingActivity={
              canCompose ? () => onStaffTypingActivity() : undefined
            }
            onSend={() => {
              if (!canCompose || !draft.trim()) return;
              sendStaffText(draft);
            }}
            onSendVoice={
              canCompose
                ? (payload) => {
                    void sendStaffVoice(payload);
                  }
                : undefined
            }
            onSendFile={
              canCompose
                ? (payload) => {
                    void sendStaffFile(payload);
                  }
                : undefined
            }
          />
        ) : (
          <div
            className="shrink-0 border-t px-4 py-3.5"
            style={{
              backgroundColor: 'var(--chat-composer)',
              borderColor: 'var(--chat-header-border)',
              paddingBottom: 'max(0.85rem, env(safe-area-inset-bottom))',
            }}
            role="status"
            data-panel-composer-locked="1"
            data-testid="composer-locked-banner"
          >
            <p className="mx-auto max-w-5xl text-center text-[13.5px] leading-snug text-[var(--chat-text-muted)]">
              {!humanTakeoverEnabled
                ? 'No puedes enviar mensajes porque la intervención humana está desactivada.'
                : conversation?.status === 'closed'
                  ? 'No puedes enviar mensajes porque esta conversación está cerrada.'
                  : 'Únete al chat para enviar mensajes.'}
            </p>
            {/* Keep Playwright hooks mounted even without the composer. */}
            <div className="sr-only">
              <input data-testid="staff-draft" readOnly value="" />
              <button type="button" data-testid="staff-send" disabled>
                send
              </button>
            </div>
          </div>
        )}
      </div>
      <ChatMediaLightbox
        media={lightbox}
        onClose={() => setLightbox(null)}
      />
    </section>
  );
}

export function ConversationDetailClient({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Promise<{ conversationId: string }>;
  searchParamsPromise?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense
      fallback={
        <p className="p-4 text-sm text-stone-500">Cargando conversación…</p>
      }
    >
      <ConversationDetailInner
        paramsPromise={paramsPromise}
        searchParamsPromise={searchParamsPromise}
      />
    </Suspense>
  );
}
