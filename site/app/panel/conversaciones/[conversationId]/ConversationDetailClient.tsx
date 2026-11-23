'use client';

import { ArrowLeft, MoreVertical, SendHorizontal } from 'lucide-react';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  CHAT_THEME_LIGHT,
  chatThemeVars,
} from '../../../v/[id]/_components/chat/chat-theme';
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

const THEME_VARS = chatThemeVars('light');

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

function bubbleSenderLabel(role: string) {
  if (role === 'assistant') return 'Asistente';
  if (role === 'staff') return 'Tú';
  if (role === 'consumer') return 'Cliente';
  return null;
}

function formatMsgTime(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(t));
  } catch {
    return null;
  }
}

function productProposalLabels(payload?: Record<string, unknown>) {
  const cards = payload?.product_cards;
  if (!Array.isArray(cards) || cards.length === 0) return [] as string[];
  return cards
    .map((card) => {
      if (!card || typeof card !== 'object') return '';
      const row = card as Record<string, unknown>;
      return String(row.name || row.nombre || row.title || '').trim();
    })
    .filter(Boolean)
    .slice(0, 8);
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
  const [menuOpen, setMenuOpen] = useState(false);
  const lastSeqRef = useRef(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, conversation?.status]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(ev: MouseEvent) {
      if (!menuRef.current?.contains(ev.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  async function act(action: string, text?: string) {
    if (!token || !conversationId) return;
    setBusy(true);
    setError(null);
    setMenuOpen(false);
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
    if (action === 'take') {
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  const canCompose =
    humanTakeoverEnabled && conversation?.status === 'human_handling' && !busy;

  const inboxHref = useMemo(() => {
    const q = comercioId
      ? `?comercioId=${encodeURIComponent(comercioId)}`
      : '';
    return `/panel/conversaciones${q}`;
  }, [comercioId]);

  if (!ready) {
    return (
      <p className="p-4 text-sm" style={{ color: CHAT_THEME_LIGHT.textMuted }}>
        Comprobando sesión…
      </p>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col"
      style={{ ...THEME_VARS, color: 'var(--chat-text)' }}
      data-panel-chat="1"
    >
      {/* WhatsApp-style header */}
      <header
        className="flex shrink-0 items-center gap-2 px-2 py-2 shadow-sm"
        style={{
          backgroundColor: '#008069',
          color: '#fff',
        }}
      >
        <a
          href={inboxHref}
          className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
          aria-label="Volver a la bandeja"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
        </a>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 text-sm font-semibold">
          C
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-medium leading-tight">
            Cliente
          </p>
          <p
            className="truncate text-[12.5px] leading-tight text-white/85"
            data-testid="conversation-status"
            data-status={conversation?.status || ''}
          >
            {conversation
              ? statusLabel(conversation.status)
              : 'Cargando conversación…'}
            {conversation?.assigned_user_id
              ? userId && conversation.assigned_user_id === userId
                ? ' · Tú'
                : ' · Personal'
              : null}
          </p>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
            aria-label="Más opciones"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical className="h-5 w-5" strokeWidth={2.2} />
          </button>
          {menuOpen ? (
            <div
              className="absolute right-0 top-full z-50 mt-1 min-w-[13.5rem] overflow-hidden rounded-md py-1 text-[14.5px] shadow-lg"
              style={{
                backgroundColor: 'var(--chat-card)',
                color: 'var(--chat-text)',
                border: '1px solid var(--chat-card-border)',
              }}
            >
              {humanTakeoverEnabled ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className="block w-full px-4 py-2.5 text-left hover:bg-black/[0.04] disabled:opacity-50"
                    onClick={() => void act('take')}
                  >
                    Tomar conversación
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="block w-full px-4 py-2.5 text-left hover:bg-black/[0.04] disabled:opacity-50"
                    onClick={() => void act('return')}
                  >
                    Devolver al asistente
                  </button>
                </>
              ) : (
                <p
                  className="px-4 py-2.5 text-[12.5px]"
                  style={{ color: 'var(--chat-text-muted)' }}
                >
                  Intervención humana desactivada. Solo lectura.
                </p>
              )}
              <button
                type="button"
                disabled={busy}
                className="block w-full px-4 py-2.5 text-left hover:bg-black/[0.04] disabled:opacity-50"
                onClick={() => void act('close')}
              >
                Cerrar chat
              </button>
              <button
                type="button"
                disabled={busy}
                className="block w-full px-4 py-2.5 text-left hover:bg-black/[0.04] disabled:opacity-50"
                onClick={() => {
                  setMenuOpen(false);
                  void load(0);
                }}
              >
                Actualizar
              </button>
              {email ? (
                <p
                  className="border-t px-4 py-2 text-[11.5px]"
                  style={{
                    borderColor: 'var(--chat-card-border)',
                    color: 'var(--chat-text-muted)',
                  }}
                >
                  {email}
                </p>
              ) : null}
              <button
                type="button"
                className="block w-full px-4 py-2.5 text-left hover:bg-black/[0.04]"
                onClick={() => void signOut()}
              >
                Salir
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Action strip — always mounted so Playwright data-testid stay queryable */}
      <div
        className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-3 py-2"
        style={{ backgroundColor: 'var(--chat-header)' }}
      >
        {humanTakeoverEnabled ? (
          <>
            <button
              type="button"
              disabled={busy || conversation?.status === 'human_handling'}
              data-testid="take-conversation"
              className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--chat-send)' }}
              onClick={() => void act('take')}
            >
              {conversation?.status === 'human_handling'
                ? 'Ya unido'
                : 'Unirse al chat'}
            </button>
            <button
              type="button"
              disabled={busy || conversation?.status !== 'human_handling'}
              data-testid="return-assistant"
              className="rounded-full border px-3.5 py-1.5 text-[13px] font-semibold disabled:opacity-50"
              style={{
                borderColor: 'var(--chat-card-border)',
                backgroundColor: 'var(--chat-card)',
                color: 'var(--chat-text)',
              }}
              onClick={() => void act('return')}
            >
              Devolver al asistente
            </button>
          </>
        ) : (
          <p
            className="text-[12.5px]"
            style={{ color: 'var(--chat-text-muted)' }}
            data-testid="takeover-disabled-hint"
          >
            Intervención humana desactivada. Solo lectura.
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          data-testid="close-conversation"
          className="rounded-full border px-3.5 py-1.5 text-[13px] font-semibold disabled:opacity-50"
          style={{
            borderColor: 'var(--chat-card-border)',
            backgroundColor: 'var(--chat-card)',
            color: 'var(--chat-text)',
          }}
          onClick={() => void act('close')}
        >
          Cerrar
        </button>
      </div>

      {error ? (
        <p
          className="shrink-0 px-4 py-2 text-center text-[13px] text-red-700"
          role="alert"
          style={{ backgroundColor: '#fff' }}
        >
          {error}
        </p>
      ) : null}

      {/* Message canvas */}
      <ul
        ref={listRef}
        data-testid="message-list"
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 py-2"
        style={{
          backgroundColor: 'var(--chat-bg)',
          backgroundImage:
            'radial-gradient(var(--chat-pattern) 1.1px, transparent 1.1px)',
          backgroundSize: '18px 18px',
        }}
      >
        {messages.map((m, idx) => {
          const prev = messages[idx - 1];
          const next = messages[idx + 1];
          const groupedWithPrev = Boolean(prev && prev.role === m.role);
          const groupedWithNext = Boolean(next && next.role === m.role);
          const proposals = productProposalLabels(m.payload);
          const timeLabel = formatMsgTime(m.created_at);
          const sender = bubbleSenderLabel(m.role);

          if (m.role === 'system') {
            return (
              <li
                key={m.id}
                data-role={m.role}
                className="flex justify-center px-3 py-1"
              >
                <p
                  className="max-w-[min(100%,18rem)] rounded-md px-2.5 py-1 text-center text-[11.5px] font-medium leading-snug shadow-sm"
                  style={{
                    backgroundColor: 'var(--chat-system)',
                    color: 'var(--chat-text-muted)',
                  }}
                >
                  {m.body}
                </p>
              </li>
            );
          }

          const isOut = m.role === 'staff';
          const radius = isOut
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

          return (
            <li
              key={m.id}
              data-role={m.role}
              className={`flex w-full flex-col px-2.5 ${isOut ? 'items-end' : 'items-start'} ${groupedWithPrev ? 'mt-0.5' : 'mt-1.5'}`}
            >
              <div
                className={[
                  'max-w-[min(85%,22rem)] px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-[1.4] shadow-sm',
                  radius,
                ].join(' ')}
                style={{
                  backgroundColor: isOut
                    ? 'var(--chat-bubble-out)'
                    : 'var(--chat-bubble-in)',
                  color: 'var(--chat-text)',
                }}
              >
                {!groupedWithPrev && sender && !isOut ? (
                  <p
                    className="mb-0.5 text-[12.5px] font-semibold leading-tight"
                    style={{
                      color:
                        m.role === 'assistant'
                          ? 'var(--chat-send)'
                          : 'var(--chat-link)',
                    }}
                  >
                    {sender}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                {proposals.length > 0 ? (
                  <p
                    className="mt-1 text-[11.5px]"
                    style={{ color: 'var(--chat-text-muted)' }}
                  >
                    Propuestas: {proposals.join(' · ')}
                  </p>
                ) : null}
                <span
                  className="mt-0.5 flex items-center justify-end gap-0.5 self-end pl-2 text-[10.5px] tabular-nums leading-none"
                  style={{ color: 'var(--chat-text-muted)' }}
                >
                  {timeLabel ? <span>{timeLabel}</span> : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Composer — WhatsApp-like */}
      {humanTakeoverEnabled ? (
        <div
          className="flex shrink-0 items-end gap-2 px-2 py-2"
          style={{ backgroundColor: 'var(--chat-composer)' }}
        >
          <div
            className="flex min-w-0 flex-1 items-end rounded-[24px] px-3 py-1.5 shadow-sm"
            style={{ backgroundColor: 'var(--chat-input)' }}
          >
            <textarea
              ref={inputRef}
              data-testid="staff-draft"
              rows={1}
              className="max-h-28 min-h-[40px] w-full resize-none bg-transparent py-2 text-[15px] leading-5 outline-none placeholder:text-[var(--chat-text-muted)]"
              style={{ color: 'var(--chat-text)' }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                canCompose
                  ? 'Escribe un mensaje'
                  : 'Únete al chat para responder'
              }
              disabled={!canCompose}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (canCompose && draft.trim()) {
                    void act('message', draft.trim());
                  }
                }
              }}
            />
          </div>
          <button
            type="button"
            data-testid="staff-send"
            aria-label="Enviar"
            className="mb-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-full text-white shadow-sm disabled:opacity-45"
            style={{ backgroundColor: 'var(--chat-send)' }}
            disabled={!canCompose || !draft.trim()}
            onClick={() => void act('message', draft.trim())}
          >
            <SendHorizontal className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>
      ) : (
        <p
          className="shrink-0 px-4 py-3 text-center text-[12.5px]"
          style={{
            backgroundColor: 'var(--chat-composer)',
            color: 'var(--chat-text-muted)',
          }}
          data-testid="takeover-disabled-hint"
        >
          Intervención humana desactivada. Puedes leer el historial; el
          asistente sigue atendiendo.
        </p>
      )}
    </div>
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
