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

import { ChatComposer } from '../../../v/[id]/_components/chat/ChatComposer';
import { ChatHeader } from '../../../v/[id]/_components/chat/ChatHeader';
import { ChatMessageList } from '../../../v/[id]/_components/chat/ChatMessageList';
import {
  ChatSuggestedReplies,
  type ChatSuggestedChip,
} from '../../../v/[id]/_components/chat/ChatSuggestedReplies';
import {
  chatThemeVars,
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
  };
  if (map[code]) return map[code];
  if (status === 429) return map.rate_limited;
  return code || 'No se pudo completar la acción.';
}

/** Map supervision rows → consumer ChatMessage shape (same bubbles/list). */
function toChatMessages(rows: MessageRow[]): ChatMessage[] {
  return rows.map((m) => {
    const createdAt = Date.parse(m.created_at) || Date.now();
    if (m.role === 'system') {
      return { id: m.id, role: 'system' as const, text: m.body, createdAt };
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
  // Merchant panel matches the consumer WhatsApp dark shell by default.
  const [theme, setTheme] = useState<ChatThemeMode>('dark');
  const [frameStyle, setFrameStyle] = useState<CSSProperties>({
    position: 'fixed',
    inset: 0,
    width: '100%',
    height: '100dvh',
    maxHeight: '100dvh',
  });
  const lastSeqRef = useRef(0);

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
      setError(friendlyPanelError(String(data.error || ''), res.status));
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

  const actionChips = useMemo((): ChatSuggestedChip[] => {
    if (!humanTakeoverEnabled) return [];
    const chips: ChatSuggestedChip[] = [];
    const status = conversation?.status || '';
    if (status !== 'human_handling' && status !== 'closed') {
      chips.push({
        id: 'take',
        label: 'Unirse al chat',
        action: { type: 'text', text: '__take__' },
      });
    }
    if (status === 'human_handling') {
      chips.push({
        id: 'return',
        label: 'Devolver al asistente',
        action: { type: 'text', text: '__return__' },
      });
      chips.push({
        id: 'quick-ok',
        label: 'En un momento te atiendo',
        action: {
          type: 'text',
          text: 'En un momento te atiendo 😊',
        },
      });
      chips.push({
        id: 'quick-help',
        label: '¿En qué te ayudo?',
        action: { type: 'text', text: '¿En qué te puedo ayudar?' },
      });
    }
    chips.push({
      id: 'close',
      label: 'Cerrar chat',
      action: { type: 'text', text: '__close__' },
    });
    return chips.slice(0, 5);
  }, [conversation?.status, humanTakeoverEnabled]);

  const onPickChip = useCallback(
    (chip: ChatSuggestedChip) => {
      if (busy) return;
      const text =
        chip.action.type === 'text' ? chip.action.text : '';
      if (text === '__take__') {
        void act('take');
        return;
      }
      if (text === '__return__') {
        void act('return');
        return;
      }
      if (text === '__close__') {
        void act('close');
        return;
      }
      if (canCompose && text) {
        void act('message', text);
      }
    },
    // act closes over latest state; chips only need canCompose/busy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, canCompose, conversationId, token],
  );

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

        <div className="flex min-h-0 flex-1 flex-col" data-testid="message-list">
          <ChatMessageList
            messages={chatMessages}
            theme={theme}
            errorText={error}
            onRefresh={() => void load(0)}
            voiceAvatarLetter="C"
          />
        </div>

        <ChatSuggestedReplies
          chips={actionChips}
          hidden={busy || !humanTakeoverEnabled}
          onPick={onPickChip}
        />

        {conversation?.status === 'human_handling' ? (
          <div
            className="shrink-0 border-t px-3 py-1.5 text-[12px] text-[var(--chat-text-muted)]"
            style={{
              backgroundColor: 'var(--chat-header)',
              borderColor: 'var(--chat-header-border)',
            }}
          >
            Estás atendiendo. Por ahora solo texto — voz y archivos del cliente
            no llegan aquí.
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
