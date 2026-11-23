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
import { ChatMessageList } from '../../../v/[id]/_components/chat/ChatMessageList';
import {
  ChatSuggestedReplies,
  type ChatSuggestedChip,
} from '../../../v/[id]/_components/chat/ChatSuggestedReplies';
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
import type { ChatAttachment } from '../../../v/[id]/_components/chat/chat-types';
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  const onBroadcastHint = useCallback(() => {
    void load(lastSeqRef.current, { silent: true });
  }, [load]);

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
  ) {
    if (!token || !conversationId) return;
    setBusy(true);
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
    setBusy(false);
    if (!res.ok) {
      setError(friendlyPanelError(String(data.error || ''), res.status));
      if (res.status === 401) {
        window.location.href = `/panel/login?next=${encodeURIComponent(
          `/panel/conversaciones/${encodeURIComponent(conversationId)}`,
        )}`;
      }
      return;
    }
    setDraft('');
    await load(lastSeqRef.current > 0 ? lastSeqRef.current : 0, {
      silent: true,
    });
    // Full refresh keeps status / assignee in sync after take/return/close.
    if (action !== 'message') await load(0);
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
    unlockChatSounds();
    playChatSound('voiceSent');
    await act(
      'message',
      payload.transcript?.trim() || `🎤 Nota de voz (${secs}s)`,
      {
        attachments: [attachment],
        voiceUrl: dataUrl,
        voiceDurationMs: payload.durationMs,
      },
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
    unlockChatSounds();
    playChatSound('messageSent');
    await act('message', label, { attachments: [attachment] });
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
      unlockChatSounds();
      playChatSound('messageSent');
      void act('message', text);
    },
    // act closes over latest state; chips only need canCompose/busy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, canCompose, conversationId, token],
  );

  const status = conversation?.status || '';
  const showTake =
    humanTakeoverEnabled && status !== 'human_handling' && status !== 'closed';
  const showReturn = humanTakeoverEnabled && status === 'human_handling';
  const showClose = humanTakeoverEnabled && status !== 'closed';

  const subtitle = conversation
    ? [
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
          businessName="Cliente"
          logoUrl={null}
          initialLetter="C"
          cartCount={0}
          cartTotalLabel=""
          theme={theme}
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
              id: 'close',
              label: 'Cerrar chat',
              disabled: busy,
              testId: 'close-conversation-menu',
              onSelect: () => void act('close'),
            },
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
          <button
            type="button"
            data-testid="close-conversation"
            disabled={busy}
            onClick={() => void act('close')}
          >
            close
          </button>
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
            showClose={showClose}
            onTake={() => void act('take')}
            onReturn={() => void act('return')}
            onClose={() => void act('close')}
          />
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col" data-testid="message-list">
          <ChatMessageList
            messages={chatMessages}
            theme={theme}
            errorText={error}
            onRefresh={() => void load(0)}
            voiceAvatarLetter="C"
            cartActionsReadOnly
          />
        </div>

        <ChatSuggestedReplies
          chips={quickReplyChips}
          hidden={busy || !canCompose}
          onPick={onPickChip}
        />

        {humanTakeoverEnabled ? (
          <ChatComposer
            value={draft}
            disabled={!canCompose || busy}
            onChange={setDraft}
            inputTestId="staff-draft"
            sendTestId="staff-send"
            placeholder={
              canCompose
                ? 'Escribe un mensaje'
                : 'Únete al chat para responder'
            }
            onSend={() => {
              if (!canCompose || !draft.trim()) return;
              void act('message', draft.trim());
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
        ) : null}
      </div>
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
