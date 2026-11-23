'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ChatComposer } from '../../../v/[id]/_components/chat/ChatComposer';
import { ChatHeader } from '../../../v/[id]/_components/chat/ChatHeader';
import { ChatMessageList } from '../../../v/[id]/_components/chat/ChatMessageList';
import {
  chatThemeVars,
  loadStoredChatTheme,
  resolvePreferredChatTheme,
  saveChatTheme,
  type ChatThemeMode,
} from '../../../v/[id]/_components/chat/chat-theme';
import type { ChatMessage } from '../../../v/[id]/_components/chat/chat-types';
import { usePanelSession } from '../../_lib/usePanelSession';
import { useConversationRealtime } from '../../_lib/useConversationRealtime';

type MessageRow = {
  id: string;
  seq: number;
  role: string;
  body: string;
  created_at: string;
  payload?: Record<string, unknown>;
};

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

/** Map supervision rows → consumer ChatMessage shape (same bubbles/list). */
function toChatMessages(rows: MessageRow[]): ChatMessage[] {
  return rows.map((m) => {
    const createdAt = Date.parse(m.created_at) || Date.now();
    if (m.role === 'system') {
      return {
        id: m.id,
        role: 'system' as const,
        text: m.body,
        createdAt,
      };
    }
    if (m.role === 'staff') {
      return {
        id: m.id,
        role: 'user' as const,
        text: m.body,
        createdAt,
        deliveryStatus: 'read' as const,
      };
    }
    if (m.role === 'consumer') {
      return {
        id: m.id,
        role: 'assistant' as const,
        text: m.body,
        createdAt,
        senderLabel: 'Cliente',
      };
    }
    // assistant + unknown → incoming assistant bubble
    return {
      id: m.id,
      role: 'assistant' as const,
      text: m.body,
      createdAt,
      senderLabel: 'Asistente',
    };
  });
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
  const [theme, setTheme] = useState<ChatThemeMode>('dark');
  const lastSeqRef = useRef(0);

  useEffect(() => {
    setTheme(resolvePreferredChatTheme(loadStoredChatTheme()));
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
    async (afterSeq = 0) => {
      if (!token || !conversationId) return;
      const res = await fetch(
        `/api/panel/conversaciones/${encodeURIComponent(conversationId)}?afterSeq=${afterSeq}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 401
            ? 'Sesión requerida. Serás redirigido al inicio de sesión.'
            : String(data.error || 'No se pudo abrir la conversación'),
        );
        return;
      }
      setError(null);
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
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
          lastSeqRef.current = merged.reduce(
            (max, m) => Math.max(max, m.seq || 0),
            lastSeqRef.current,
          );
          return merged;
        });
      } else {
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

  const onRealtimeInsert = useCallback(
    (row: {
      id: string;
      seq: number;
      role: string;
      body: string;
      created_at: string;
    }) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        lastSeqRef.current = Math.max(lastSeqRef.current, row.seq || 0);
        return [...prev, row];
      });
    },
    [],
  );

  const onBroadcastHint = useCallback(() => {
    void load(lastSeqRef.current);
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
        void load(lastSeqRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && lastSeqRef.current > 0) {
        void load(lastSeqRef.current);
      }
    }, 20_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(id);
    };
  }, [load]);

  async function act(action: string, text?: string) {
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
        body: JSON.stringify({ action, text }),
      },
    );
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      const code = String(data.error || '');
      const friendly: Record<string, string> = {
        human_takeover_disabled:
          'La intervención humana está desactivada (feature flag).',
        conflict: 'Otro empleado ya tomó esta conversación.',
        not_assignee: 'Solo el responsable (o un administrador) puede responder.',
        not_in_human_mode: 'Toma la conversación antes de escribir.',
        supervision_disabled: 'La supervisión no está activa para este comercio.',
        unauthorized: 'Sesión expirada. Vuelve a iniciar sesión.',
      };
      setError(friendly[code] || code || 'Acción fallida');
      if (res.status === 401) {
        window.location.href = `/panel/login?next=${encodeURIComponent(
          `/panel/conversaciones/${encodeURIComponent(conversationId)}`,
        )}`;
      }
      return;
    }
    setDraft('');
    await load(0);
  }

  const canCompose =
    humanTakeoverEnabled && conversation?.status === 'human_handling' && !busy;

  const inboxHref = useMemo(() => {
    const q = comercioId
      ? `?comercioId=${encodeURIComponent(comercioId)}`
      : '';
    return `/panel/conversaciones${q}`;
  }, [comercioId]);

  const chatMessages = useMemo(() => toChatMessages(messages), [messages]);
  const themeStyle = useMemo(() => chatThemeVars(theme), [theme]);

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
      className="fixed inset-0 z-40 flex flex-col overflow-hidden"
      style={{
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
                    testId: 'take-conversation',
                    onSelect: () => void act('take'),
                  },
                  {
                    id: 'return',
                    label: 'Devolver al asistente',
                    disabled:
                      busy || conversation?.status !== 'human_handling',
                    testId: 'return-assistant',
                    onSelect: () => void act('return'),
                  },
                ]
              : []),
            {
              id: 'close',
              label: 'Cerrar chat',
              disabled: busy,
              testId: 'close-conversation',
              onSelect: () => void act('close'),
            },
            {
              id: 'refresh',
              label: 'Actualizar',
              disabled: busy,
              onSelect: () => void load(0),
            },
            ...(email
              ? [
                  {
                    id: 'signout',
                    label: `Salir (${email})`,
                    onSelect: () => void signOut(),
                  },
                ]
              : [
                  {
                    id: 'signout',
                    label: 'Salir',
                    onSelect: () => void signOut(),
                  },
                ]),
          ]}
        />

        {/* Always-mounted hooks for Playwright (menu items unmount when closed). */}
        <div className="sr-only" aria-hidden="true">
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

        {humanTakeoverEnabled &&
        conversation &&
        conversation.status !== 'human_handling' &&
        conversation.status !== 'closed' ? (
          <div
            className="shrink-0 border-b px-3 py-1.5 text-[12px] text-[var(--chat-text-muted)]"
            style={{
              backgroundColor: 'var(--chat-header)',
              borderColor: 'var(--chat-header-border)',
            }}
          >
            <button
              type="button"
              disabled={busy}
              className="font-semibold text-[var(--chat-send)] underline-offset-2 hover:underline disabled:opacity-50"
              onClick={() => void act('take')}
            >
              Unirse al chat
            </button>
            <span> — el asistente sigue respondiendo</span>
          </div>
        ) : null}

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

        <div className="flex min-h-0 flex-1 flex-col" data-testid="message-list">
          <ChatMessageList
            messages={chatMessages}
            theme={theme}
            errorText={error}
            onRefresh={() => void load(0)}
            voiceAvatarLetter="C"
          />
        </div>

        {conversation?.status === 'human_handling' ? (
          <div
            className="shrink-0 border-t px-3 py-1.5 text-[12px] text-[var(--chat-text-muted)]"
            style={{
              backgroundColor: 'var(--chat-header)',
              borderColor: 'var(--chat-header-border)',
            }}
          >
            Estás atendiendo. Por ahora solo texto — voz y archivos del
            cliente no llegan aquí.
          </div>
        ) : null}

        {humanTakeoverEnabled ? (
          <ChatComposer
            value={draft}
            disabled={!canCompose}
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
