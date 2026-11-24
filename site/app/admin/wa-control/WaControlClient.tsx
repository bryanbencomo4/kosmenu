'use client';

import {
  Bot,
  Headphones,
  MoreVertical,
  Pause,
  Play,
  Search,
  SendHorizontal,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

/** WhatsApp Web dark palette (official-ish). */
const WA = {
  panel: '#111b21',
  panelElevated: '#202c33',
  header: '#202c33',
  searchBg: '#202c33',
  chatBg: '#0b141a',
  selected: '#2a3942',
  hover: '#202c33',
  border: '#222d34',
  text: '#e9edef',
  textMuted: '#8696a0',
  green: '#00a884',
  greenSoft: '#005c4b',
  bubbleIn: '#202c33',
  bubbleOut: '#005c4b',
  system: '#182229',
  danger: '#f15c6d',
} as const;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unattended', label: 'Sin leer' },
  { key: 'ai', label: 'IA' },
  { key: 'human', label: 'Humanas' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'closed', label: 'Cerradas' },
];

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

function Avatar({ label, size = 49 }: { label: string; size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full text-[17px] font-medium"
      style={{
        width: size,
        height: size,
        backgroundColor: '#6b7c85',
        color: '#fff',
      }}
    >
      {(label || '?').slice(0, 1).toUpperCase()}
    </div>
  );
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
  const [showInfo, setShowInfo] = useState(false);
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
    setShowInfo(false);
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
      className="flex h-full min-h-0 w-full overflow-hidden"
      style={{ backgroundColor: WA.panel, color: WA.text, fontFamily: 'Segoe UI, Helvetica Neue, Helvetica, Arial, sans-serif' }}
    >
      {/* ===== Chat list (WA left pane) ===== */}
      <aside
        className={`flex min-h-0 w-full flex-col border-r md:w-[38%] md:max-w-[420px] md:min-w-[320px] ${
          mobileShowThread && selected ? 'hidden md:flex' : 'flex'
        }`}
        style={{ backgroundColor: WA.panel, borderColor: WA.border }}
        data-testid="wa-inbox-list"
      >
        <div
          className="flex shrink-0 items-center justify-between px-4 py-3"
          style={{ backgroundColor: WA.header }}
        >
          <h2 className="text-[20px] font-semibold tracking-tight">Chats</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={busy}
              data-testid="wa-global-mute"
              onClick={() => runControl(muted ? 'resume_all' : 'pause_all')}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium disabled:opacity-50"
              style={{
                backgroundColor: muted ? 'rgba(245,158,11,0.2)' : 'transparent',
                color: muted ? '#fbbf24' : WA.textMuted,
              }}
              title={muted ? 'Reanudar IA' : 'Pausar IA'}
            >
              {muted ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              <span className="hidden sm:inline">{muted ? 'Reanudar' : 'Pausar'}</span>
            </button>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{ color: WA.textMuted }}
              aria-label="Más"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="shrink-0 px-3 pb-2 pt-1" style={{ backgroundColor: WA.panel }}>
          <div
            className="flex items-center gap-3 rounded-lg px-3 py-1.5"
            style={{ backgroundColor: WA.searchBg }}
          >
            <Search className="h-4 w-4 shrink-0" style={{ color: WA.textMuted }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar o empezar un chat"
              data-testid="wa-inbox-search"
              className="w-full bg-transparent py-1.5 text-[14.5px] outline-none placeholder:text-[#8696a0]"
              style={{ color: WA.text }}
            />
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f) => {
              const on = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className="shrink-0 rounded-full px-3 py-1 text-[13px] font-medium"
                  style={{
                    backgroundColor: on ? 'rgba(0,168,132,0.22)' : WA.panelElevated,
                    color: on ? WA.green : WA.textMuted,
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {conversations.length === 0 ? (
            <p className="px-6 py-16 text-center text-[14px]" style={{ color: WA.textMuted }}>
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
                  className="relative flex w-full gap-3 px-3 py-3 text-left"
                  style={{
                    backgroundColor: active ? WA.selected : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.backgroundColor = WA.hover;
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {active ? (
                    <span
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={{ backgroundColor: WA.green }}
                    />
                  ) : null}
                  <Avatar label={contactTitle(c)} />
                  <div
                    className="min-w-0 flex-1 border-b pb-3"
                    style={{ borderColor: WA.border }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className="truncate text-[16px]"
                        style={{ fontWeight: unread ? 600 : 400, color: WA.text }}
                      >
                        {contactTitle(c)}
                      </p>
                      <span
                        className="shrink-0 text-[12px] tabular-nums"
                        style={{ color: unread ? WA.green : WA.textMuted }}
                      >
                        {formatTime(c.lastMessageAtMs)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-[13.5px]" style={{ color: WA.textMuted }}>
                        {c.lastMessageText || statusLabel(c)}
                      </p>
                      {unread ? (
                        <span
                          className="grid min-w-[1.25rem] place-items-center rounded-full px-1.5 text-[11px] font-semibold text-[#111b21]"
                          style={{ backgroundColor: WA.green }}
                        >
                          {c.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ===== Main chat (WA center) ===== */}
      <section
        className={`relative min-h-0 min-w-0 flex-1 flex-col ${
          mobileShowThread && selected ? 'flex' : 'hidden md:flex'
        }`}
        data-testid="wa-inbox-thread"
        style={{ backgroundColor: WA.chatBg }}
      >
        {!selected ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3 border-b px-8 text-center"
            style={{ borderColor: WA.border, color: WA.textMuted }}
          >
            <div
              className="grid h-16 w-16 place-items-center rounded-full"
              style={{ backgroundColor: WA.panelElevated }}
            >
              <Headphones className="h-7 w-7" style={{ color: WA.green }} />
            </div>
            <p className="text-[28px] font-light" style={{ color: WA.text }}>
              Inbox WhatsApp
            </p>
            <p className="max-w-md text-[14px] leading-relaxed">
              Selecciona un chat para atender. Las respuestas automáticas solo aplican al número
              autorizado.
            </p>
          </div>
        ) : (
          <>
            <header
              className="relative z-10 flex shrink-0 items-center gap-3 px-3 py-2.5 sm:px-4"
              style={{ backgroundColor: WA.header }}
            >
              <button
                type="button"
                className="rounded-lg px-1 text-[18px] md:hidden"
                style={{ color: WA.text }}
                onClick={() => setMobileShowThread(false)}
                aria-label="Volver"
              >
                ←
              </button>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => setShowInfo((v) => !v)}
              >
                <Avatar
                  label={conversation ? contactTitle(conversation) : selected}
                  size={40}
                />
                <div className="min-w-0">
                  <p className="truncate text-[15.5px] font-medium">
                    {conversation ? contactTitle(conversation) : `+${selected}`}
                  </p>
                  <p className="truncate text-[12.5px]" style={{ color: WA.textMuted }}>
                    {conversation ? statusLabel(conversation) : `+${selected}`}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-1">
                {primaryControl?.kind !== 'closed' ? (
                  <button
                    type="button"
                    disabled={busy}
                    data-testid="wa-close"
                    onClick={() => runControl('close')}
                    className="rounded-full px-2.5 py-1.5 text-[12.5px] disabled:opacity-50"
                    style={{ color: WA.textMuted }}
                  >
                    Cerrar
                  </button>
                ) : null}
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-full"
                  style={{ color: WA.textMuted }}
                  onClick={() => setShowInfo((v) => !v)}
                  aria-label="Info"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
              </div>
            </header>

            {primaryControl?.kind === 'ai' || primaryControl?.kind === 'pending' ? (
              <div
                className="relative z-10 shrink-0 px-3 py-2"
                style={{ backgroundColor: WA.header }}
              >
                <button
                  type="button"
                  disabled={busy}
                  data-testid="wa-take"
                  onClick={() => runControl('take')}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full text-[14px] font-semibold disabled:opacity-50"
                  style={{ backgroundColor: WA.green, color: '#fff' }}
                >
                  <Headphones className="h-4 w-4" strokeWidth={2.25} />
                  Atender personalmente
                </button>
              </div>
            ) : null}

            {primaryControl?.kind === 'human' ? (
              <div
                className="relative z-10 shrink-0 px-3 py-2"
                style={{ backgroundColor: WA.header }}
              >
                <button
                  type="button"
                  disabled={busy}
                  data-testid="wa-return"
                  onClick={() => runControl('return')}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full text-[13.5px] font-semibold disabled:opacity-50"
                  style={{
                    backgroundColor: 'rgba(0,168,132,0.15)',
                    color: WA.text,
                  }}
                >
                  <Bot className="h-4 w-4" style={{ color: WA.green }} strokeWidth={2.25} />
                  Devolver al asistente
                  {primaryControl.label ? (
                    <span className="font-normal" style={{ color: WA.textMuted }}>
                      · {primaryControl.label}
                    </span>
                  ) : null}
                </button>
              </div>
            ) : null}

            <div className="relative min-h-0 flex-1">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-0"
                style={{
                  backgroundColor: WA.chatBg,
                  backgroundImage: `url('${CHAT_DOODLE_URL}')`,
                  backgroundRepeat: 'repeat',
                  backgroundPosition: 'top center',
                  backgroundSize: '420px auto',
                  opacity: 1,
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-0"
                style={{
                  backgroundImage: `url('${CHAT_DOODLE_URL}')`,
                  backgroundRepeat: 'repeat',
                  backgroundPosition: 'top center',
                  backgroundSize: '420px auto',
                  opacity: 0.06,
                }}
              />
              <div className="relative z-[1] flex h-full flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-12 sm:py-4">
                {messages.map((m) => {
                  const mine = m.role === 'assistant' || m.role === 'operator';
                  if (m.role === 'system') {
                    return (
                      <div key={m.id} className="flex justify-center py-1">
                        <span
                          className="max-w-[90%] rounded-lg px-3 py-1.5 text-center text-[12px] shadow"
                          style={{ backgroundColor: WA.system, color: WA.textMuted }}
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
                        className={`relative max-w-[85%] px-2.5 pb-1 pt-1.5 text-[14.2px] shadow-sm sm:max-w-[65%] ${
                          mine
                            ? 'rounded-lg rounded-tr-none'
                            : 'rounded-lg rounded-tl-none'
                        }`}
                        style={{
                          backgroundColor: mine ? WA.bubbleOut : WA.bubbleIn,
                          color: WA.text,
                        }}
                      >
                        <p className="whitespace-pre-wrap break-words leading-[1.35]">{m.text}</p>
                        <div
                          className="mt-0.5 flex items-center justify-end gap-1.5 pl-8 text-[11px]"
                          style={{ color: mine ? 'rgba(233,237,239,0.65)' : WA.textMuted }}
                        >
                          <span>
                            {m.role === 'contact'
                              ? ''
                              : m.role === 'assistant'
                                ? 'Asistente'
                                : 'Tú'}
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
              className="relative z-10 flex shrink-0 items-end gap-2 px-2 py-2 sm:px-3"
              style={{ backgroundColor: WA.header }}
            >
              <div
                className="flex min-h-[44px] flex-1 items-end rounded-lg px-3 py-2"
                style={{ backgroundColor: WA.panelElevated }}
              >
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  rows={1}
                  placeholder="Escribe un mensaje"
                  data-testid="wa-composer"
                  className="max-h-28 min-h-[24px] w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-[#8696a0]"
                  style={{ color: WA.text }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                disabled={busy || !composer.trim()}
                data-testid="wa-send"
                onClick={() => void sendMessage()}
                aria-label="Enviar"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full disabled:opacity-40"
                style={{ backgroundColor: WA.green, color: '#fff' }}
              >
                <SendHorizontal className="h-5 w-5" strokeWidth={2.25} />
              </button>
            </footer>
            {error ? (
              <p
                className="relative z-10 px-3 pb-2 text-[12.5px]"
                style={{ backgroundColor: WA.header, color: WA.danger }}
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* ===== Contact info drawer (WA-style, on demand) ===== */}
      {showInfo && conversation ? (
        <aside
          className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[340px] flex-col border-l shadow-2xl md:relative md:max-w-[300px]"
          style={{ backgroundColor: WA.panel, borderColor: WA.border }}
          data-testid="wa-inbox-sidebar"
        >
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ backgroundColor: WA.header }}
          >
            <button
              type="button"
              onClick={() => setShowInfo(false)}
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{ color: WA.textMuted }}
              aria-label="Cerrar info"
            >
              <X className="h-5 w-5" />
            </button>
            <p className="text-[15px] font-medium">Info. del contacto</p>
          </div>
          <div className="flex flex-col items-center gap-2 border-b px-4 py-8" style={{ borderColor: WA.border }}>
            <Avatar label={contactTitle(conversation)} size={80} />
            <p className="text-[18px] font-medium">{contactTitle(conversation)}</p>
            <p className="text-[14px]" style={{ color: WA.textMuted }}>
              +{conversation.fromDigits}
            </p>
          </div>
          <div className="space-y-4 px-4 py-4 text-[14px]">
            <div>
              <p className="text-[12px]" style={{ color: WA.green }}>
                Estado
              </p>
              <p>{statusLabel(conversation)}</p>
            </div>
            <div>
              <p className="text-[12px]" style={{ color: WA.green }}>
                Responsable
              </p>
              <p>{conversation.assignedOperatorLabel || '—'}</p>
            </div>
            <div>
              <p className="text-[12px]" style={{ color: WA.green }}>
                Notas
              </p>
              <p style={{ color: WA.textMuted }}>
                {conversation.contextNote || 'Sin notas.'}
              </p>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
