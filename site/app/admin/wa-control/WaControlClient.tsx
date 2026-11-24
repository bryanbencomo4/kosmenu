'use client';

import { Bot, Headphones, Pause, Play, SendHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { chatThemeVars } from '../../v/[id]/_components/chat/chat-theme';

type InboxStatus =
  | 'ai_handling'
  | 'human_handling'
  | 'needs_attention'
  | 'pending'
  | 'closed';

type InboxConversation = {
  fromDigits: string;
  displayName: string | null;
  status: InboxStatus;
  assignedOperatorId: string | null;
  assignedOperatorLabel: string | null;
  lastMessageText: string;
  lastMessageAtMs: number;
  unreadCount: number;
  attentionVersion: number;
  contextRole: string | null;
  contextNote: string | null;
  updatedAtMs: number;
  closedAtMs: number | null;
  humanActive: boolean;
  aiActive: boolean;
};

type InboxMessage = {
  id: string;
  fromDigits: string;
  role: 'contact' | 'assistant' | 'operator' | 'system';
  text: string;
  atMs: number;
  operatorLabel?: string | null;
};

type GlobalMute = {
  muted?: boolean;
  effective?: boolean;
  reason?: string | null;
};

type FilterKey = 'all' | 'unattended' | 'ai' | 'human' | 'pending' | 'closed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unattended', label: 'Sin atender' },
  { key: 'ai', label: 'IA' },
  { key: 'human', label: 'Humana' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'closed', label: 'Cerradas' },
];

const THEME_VARS = chatThemeVars('dark');
const CHAT_DOODLE_URL = '/chat/doodle-pattern.png';

async function postAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch('/admin/api/wa-control', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  if (!res.ok) {
    const detail = [json.error, json.detail].filter(Boolean).join(' — ');
    const err = new Error(
      res.status === 401
        ? 'Sesión expirada. Recarga e inicia sesión de nuevo.'
        : detail || `HTTP ${res.status}`,
    ) as Error & { payload?: Record<string, unknown> };
    err.payload = json;
    throw err;
  }
  return json;
}

function formatTime(ms: number): string {
  if (!ms) return '';
  try {
    const d = new Date(ms);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return new Intl.DateTimeFormat('es-VE', { hour: '2-digit', minute: '2-digit' }).format(d);
    }
    return new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'short' }).format(d);
  } catch {
    return '';
  }
}

function statusLabel(c: InboxConversation): string {
  if (c.humanActive || c.status === 'human_handling') return 'Humano atendiendo';
  if (c.status === 'needs_attention' || c.status === 'pending') return 'Pendiente';
  if (c.status === 'closed') return 'Cerrada';
  if (c.aiActive || c.status === 'ai_handling') return 'IA atendiendo';
  return 'Pendiente';
}

function contactTitle(c: InboxConversation): string {
  return c.displayName?.trim() || `+${c.fromDigits}`;
}

export function WaControlClient() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [q, setQ] = useState('');
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [conversation, setConversation] = useState<InboxConversation | null>(null);
  const [global, setGlobal] = useState<GlobalMute | null>(null);
  const [composer, setComposer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const lastAfterMs = useRef(0);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const refresh = useCallback(async (opts?: { soft?: boolean }) => {
    try {
      const json = await postAction({
        action: 'poll',
        filter,
        q,
        fromDigits: selectedRef.current || undefined,
        afterMs: opts?.soft ? lastAfterMs.current || undefined : undefined,
      });
      setConversations((json.conversations as InboxConversation[]) || []);
      setGlobal((json.global as GlobalMute) || null);
      if (json.conversation) setConversation(json.conversation as InboxConversation);
      const msgs = (json.messages as InboxMessage[]) || [];
      if (opts?.soft && lastAfterMs.current) {
        if (msgs.length) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            for (const m of msgs) if (!seen.has(m.id)) merged.push(m);
            return merged;
          });
          lastAfterMs.current = Math.max(lastAfterMs.current, ...msgs.map((m) => m.atMs));
        }
      } else if (selectedRef.current) {
        setMessages(msgs);
        lastAfterMs.current = msgs.reduce((a, m) => Math.max(a, m.atMs), 0);
      }
      if (!opts?.soft) setError(null);
    } catch (e) {
      if (!opts?.soft) setError(String(e instanceof Error ? e.message : e));
    }
  }, [filter, q]);

  const openConversation = useCallback(async (digits: string) => {
    setSelected(digits);
    setMobileShowThread(true);
    setBusy(true);
    try {
      const json = await postAction({ action: 'get_messages', fromDigits: digits });
      setConversation((json.conversation as InboxConversation) || null);
      const msgs = (json.messages as InboxMessage[]) || [];
      setMessages(msgs);
      lastAfterMs.current = msgs.reduce((a, m) => Math.max(a, m.atMs), 0);
      setError(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => void refresh({ soft: true }), 4000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selected]);

  const muted = !!(global?.effective || global?.muted);

  const primaryControl = useMemo(() => {
    if (!conversation) return null;
    if (conversation.status === 'closed') return { kind: 'closed' as const };
    if (conversation.humanActive || conversation.status === 'human_handling') {
      return {
        kind: 'human' as const,
        label: conversation.assignedOperatorLabel || 'operador',
      };
    }
    if (conversation.status === 'pending' || conversation.status === 'needs_attention') {
      return { kind: 'pending' as const };
    }
    return { kind: 'ai' as const };
  }, [conversation]);

  const runControl = async (action: string) => {
    if (!selected && action !== 'pause_all' && action !== 'resume_all') return;
    setBusy(true);
    try {
      await postAction({ action, ...(selected ? { fromDigits: selected } : {}) });
      await refresh();
      if (selected) await openConversation(selected);
      setError(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async () => {
    const text = composer.trim();
    if (!selected || !text) return;
    setBusy(true);
    setError(null);
    try {
      const json = await postAction({ action: 'send_message', fromDigits: selected, text });
      setComposer('');
      if (json.message) setMessages((prev) => [...prev, json.message as InboxMessage]);
      if (json.conversation) setConversation(json.conversation as InboxConversation);
      await refresh({ soft: true });
    } catch (e) {
      const err = e as Error & { payload?: Record<string, unknown> };
      if (err.payload?.message) {
        setMessages((prev) => [...prev, err.payload!.message as InboxMessage]);
        setComposer('');
      }
      if (err.payload?.conversation) {
        setConversation(err.payload.conversation as InboxConversation);
      }
      setError(String(err.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="wa-inbox-root"
      data-chat-theme="dark"
      className="flex h-full min-h-0 w-full overflow-hidden"
      style={{
        ...THEME_VARS,
        backgroundColor: 'var(--chat-card)',
        color: 'var(--chat-text)',
      }}
    >
      {/* List */}
      <aside
        className={`flex min-h-0 w-full flex-col border-r md:w-[320px] lg:w-[360px] xl:w-[380px] ${
          mobileShowThread && selected ? 'hidden md:flex' : 'flex'
        }`}
        style={{ borderColor: 'var(--chat-card-border)', backgroundColor: 'var(--chat-card)' }}
        data-testid="wa-inbox-list"
      >
        <div
          className="shrink-0 border-b px-3 py-2.5"
          style={{
            backgroundColor: 'var(--chat-header)',
            borderColor: 'var(--chat-header-border)',
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-[16px] font-semibold">Chats</h2>
            <button
              type="button"
              disabled={busy}
              data-testid="wa-global-mute"
              onClick={() => runControl(muted ? 'resume_all' : 'pause_all')}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50"
              style={{
                backgroundColor: muted
                  ? 'color-mix(in srgb, #f59e0b 28%, var(--chat-input))'
                  : 'color-mix(in srgb, var(--chat-text) 10%, transparent)',
                color: muted ? '#fde68a' : 'var(--chat-text)',
              }}
            >
              {muted ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {muted ? 'Reanudar' : 'Pausar IA'}
            </button>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar contacto o teléfono"
            data-testid="wa-inbox-search"
            className="mb-2 w-full rounded-lg px-3 py-2 text-[14px] outline-none"
            style={{
              backgroundColor: 'var(--chat-input)',
              color: 'var(--chat-text)',
            }}
          />
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                style={{
                  backgroundColor:
                    filter === f.key
                      ? 'var(--chat-send)'
                      : 'color-mix(in srgb, var(--chat-text) 8%, transparent)',
                  color: filter === f.key ? 'var(--chat-send-fg)' : 'var(--chat-text)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {conversations.length === 0 ? (
            <p
              className="px-4 py-16 text-center text-[14px]"
              style={{ color: 'var(--chat-text-muted)' }}
            >
              Sin conversaciones aún.
            </p>
          ) : (
            conversations.map((c) => {
              const active = selected === c.fromDigits;
              const unread = c.unreadCount > 0;
              return (
                <button
                  key={c.fromDigits}
                  type="button"
                  data-testid={`wa-conv-${c.fromDigits}`}
                  onClick={() => void openConversation(c.fromDigits)}
                  className="flex w-full gap-3 border-b px-3 py-3 text-left"
                  style={{
                    borderColor: 'var(--chat-card-border)',
                    backgroundColor: active
                      ? 'color-mix(in srgb, var(--chat-send) 14%, var(--chat-card))'
                      : 'transparent',
                  }}
                >
                  <div
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-[17px] font-semibold"
                    style={{ backgroundColor: 'var(--chat-input)', color: 'var(--chat-text)' }}
                  >
                    {(c.displayName || c.fromDigits).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`truncate text-[15.5px] ${unread ? 'font-semibold' : 'font-medium'}`}>
                        {contactTitle(c)}
                      </p>
                      <span
                        className="shrink-0 text-[12px] tabular-nums"
                        style={{ color: unread ? 'var(--chat-send)' : 'var(--chat-text-muted)' }}
                      >
                        {formatTime(c.lastMessageAtMs)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-[13.5px]" style={{ color: 'var(--chat-text-muted)' }}>
                        {c.lastMessageText || '—'}
                      </p>
                      {unread ? (
                        <span
                          className="grid min-w-[1.25rem] place-items-center rounded-full px-1.5 text-[11.5px] font-semibold text-white"
                          style={{ backgroundColor: 'var(--chat-send)' }}
                        >
                          {c.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--chat-text-muted)' }}>
                      {statusLabel(c)}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Thread */}
      <section
        className={`relative min-h-0 min-w-0 flex-1 flex-col ${
          mobileShowThread && selected ? 'flex' : 'hidden md:flex'
        }`}
        data-testid="wa-inbox-thread"
        style={{ backgroundColor: 'var(--chat-bg)' }}
      >
        {!selected ? (
          <div
            className="flex flex-1 items-center justify-center p-8 text-center text-[14px]"
            style={{ color: 'var(--chat-text-muted)' }}
          >
            Selecciona una conversación
          </div>
        ) : (
          <>
            <header
              className="relative z-10 flex shrink-0 items-center gap-2 border-b px-2 py-2 sm:gap-3 sm:px-3"
              style={{
                backgroundColor: 'var(--chat-header)',
                borderColor: 'var(--chat-header-border)',
              }}
            >
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-[15px] md:hidden"
                style={{ color: 'var(--chat-text)' }}
                onClick={() => setMobileShowThread(false)}
                aria-label="Volver"
              >
                ←
              </button>
              <div
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold"
                style={{ backgroundColor: 'var(--chat-input)' }}
              >
                {(conversation ? contactTitle(conversation) : selected).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15.5px] font-semibold">
                  {conversation ? contactTitle(conversation) : `+${selected}`}
                </p>
                <p className="truncate text-[12px]" style={{ color: 'var(--chat-text-muted)' }}>
                  {conversation ? statusLabel(conversation) : `+${selected}`}
                  {conversation?.assignedOperatorLabel
                    ? ` · ${conversation.assignedOperatorLabel}`
                    : ''}
                </p>
              </div>
              {primaryControl?.kind !== 'closed' ? (
                <button
                  type="button"
                  disabled={busy}
                  data-testid="wa-close"
                  onClick={() => runControl('close')}
                  className="rounded-full px-2.5 py-1.5 text-[12px] font-medium disabled:opacity-50"
                  style={{
                    color: 'var(--chat-text-muted)',
                    backgroundColor: 'color-mix(in srgb, var(--chat-text) 8%, transparent)',
                  }}
                >
                  Cerrar
                </button>
              ) : null}
            </header>

            {primaryControl?.kind === 'ai' || primaryControl?.kind === 'pending' ? (
              <div
                className="relative z-10 shrink-0 border-b px-3 py-2"
                style={{
                  backgroundColor: 'var(--chat-header)',
                  borderColor: 'var(--chat-header-border)',
                }}
              >
                <button
                  type="button"
                  disabled={busy}
                  data-testid="wa-take"
                  onClick={() => runControl('take')}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50"
                  style={{ backgroundColor: 'var(--chat-send)', color: 'var(--chat-send-fg)' }}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                    <Headphones className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </span>
                  Atender personalmente
                </button>
              </div>
            ) : null}

            {primaryControl?.kind === 'human' ? (
              <div
                className="relative z-10 shrink-0 border-b px-3 py-2"
                style={{
                  backgroundColor: 'var(--chat-header)',
                  borderColor: 'var(--chat-header-border)',
                }}
              >
                <button
                  type="button"
                  disabled={busy}
                  data-testid="wa-return"
                  onClick={() => runControl('return')}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full px-3 text-[13px] font-semibold disabled:opacity-50"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--chat-send) 14%, var(--chat-input))',
                    color: 'var(--chat-text)',
                  }}
                >
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--chat-send) 22%, transparent)',
                      color: 'var(--chat-send)',
                    }}
                  >
                    <Bot className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </span>
                  Devolver al asistente
                </button>
              </div>
            ) : null}

            <div className="relative min-h-0 flex-1">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-0"
                style={{
                  backgroundImage: `url('${CHAT_DOODLE_URL}')`,
                  backgroundRepeat: 'repeat',
                  backgroundPosition: 'top center',
                  backgroundSize: '420px auto',
                  opacity: 0.07,
                }}
              />
              <div className="relative z-[1] flex h-full flex-col space-y-1.5 overflow-y-auto overscroll-contain px-2 py-3 sm:px-4">
                {messages.map((m) => {
                  const mine = m.role === 'assistant' || m.role === 'operator';
                  if (m.role === 'system') {
                    return (
                      <div key={m.id} className="flex justify-center py-1">
                        <span
                          className="max-w-[92%] rounded-md px-3 py-1 text-center text-[11.5px] shadow-sm"
                          style={{
                            backgroundColor: 'var(--chat-system)',
                            color: 'var(--chat-text-muted)',
                          }}
                        >
                          {m.text}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={m.id}
                      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                      data-testid={`wa-msg-${m.role}`}
                    >
                      <div
                        className={`max-w-[88%] px-2.5 py-1.5 text-[14.5px] shadow-sm sm:max-w-[75%] ${
                          mine ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'
                        }`}
                        style={{
                          backgroundColor: mine ? 'var(--chat-bubble-out)' : 'var(--chat-bubble-in)',
                          color: 'var(--chat-text)',
                        }}
                      >
                        <p className="whitespace-pre-wrap break-words leading-snug">{m.text}</p>
                        <div
                          className="mt-0.5 flex items-center justify-end gap-1.5 text-[10.5px]"
                          style={{ color: 'var(--chat-text-muted)' }}
                        >
                          <span>
                            {m.role === 'contact'
                              ? 'Cliente'
                              : m.role === 'assistant'
                                ? 'Asistente'
                                : m.operatorLabel || 'Tú'}
                          </span>
                          <span>{formatTime(m.atMs)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>
            </div>

            <footer
              className="relative z-10 shrink-0 border-t px-2 py-2"
              style={{
                backgroundColor: 'var(--chat-composer)',
                borderColor: 'var(--chat-header-border)',
              }}
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  rows={1}
                  placeholder="Escribe un mensaje"
                  data-testid="wa-composer"
                  className="max-h-28 min-h-[44px] flex-1 resize-none rounded-[1.5rem] border-0 px-4 py-2.5 text-[15px] outline-none"
                  style={{ backgroundColor: 'var(--chat-input)', color: 'var(--chat-text)' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={busy || !composer.trim()}
                  data-testid="wa-send"
                  onClick={() => void sendMessage()}
                  aria-label="Enviar"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full disabled:opacity-40"
                  style={{ backgroundColor: 'var(--chat-send)', color: 'var(--chat-send-fg)' }}
                >
                  <SendHorizontal className="h-5 w-5" strokeWidth={2.25} />
                </button>
              </div>
              {error ? (
                <p className="mt-1.5 px-1 text-[12.5px] text-red-400" role="alert">
                  {error}
                </p>
              ) : null}
            </footer>
          </>
        )}
      </section>

      {/* Contact panel — desktop only */}
      <aside
        className="hidden min-h-0 w-[260px] shrink-0 flex-col border-l xl:flex"
        style={{
          borderColor: 'var(--chat-card-border)',
          backgroundColor: 'var(--chat-header)',
        }}
        data-testid="wa-inbox-sidebar"
      >
        <div
          className="shrink-0 border-b px-4 py-3"
          style={{ borderColor: 'var(--chat-header-border)' }}
        >
          <h3 className="text-[14px] font-semibold">Contacto</h3>
        </div>
        {conversation ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-[14px]">
            <div>
              <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--chat-text-muted)' }}>
                Nombre
              </p>
              <p className="font-medium">{contactTitle(conversation)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--chat-text-muted)' }}>
                Teléfono
              </p>
              <p className="font-medium">+{conversation.fromDigits}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--chat-text-muted)' }}>
                Estado
              </p>
              <p className="font-medium">{statusLabel(conversation)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--chat-text-muted)' }}>
                Responsable
              </p>
              <p className="font-medium">{conversation.assignedOperatorLabel || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--chat-text-muted)' }}>
                Notas
              </p>
              <p className="whitespace-pre-wrap" style={{ color: 'var(--chat-text-muted)' }}>
                {conversation.contextNote || 'Sin notas.'}
              </p>
            </div>
          </div>
        ) : (
          <p className="px-4 py-8 text-[14px]" style={{ color: 'var(--chat-text-muted)' }}>
            Sin contacto seleccionado.
          </p>
        )}
      </aside>
    </div>
  );
}
