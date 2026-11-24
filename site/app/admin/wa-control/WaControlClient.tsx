'use client';

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

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unattended', label: 'Sin atender' },
  { key: 'ai', label: 'Atendidas por IA' },
  { key: 'human', label: 'Atención humana' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'closed', label: 'Cerradas' },
];

async function postAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch('/admin/api/wa-control', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.error || res.status));
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
  if (c.humanActive || c.status === 'human_handling') return 'Atención humana';
  if (c.status === 'needs_attention') return 'Pendiente';
  if (c.status === 'pending') return 'Pendiente';
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
      const list = (json.conversations as InboxConversation[]) || [];
      setConversations(list);
      setGlobal((json.global as GlobalMute) || null);
      if (json.conversation) {
        setConversation(json.conversation as InboxConversation);
      }
      const msgs = (json.messages as InboxMessage[]) || [];
      if (opts?.soft && lastAfterMs.current) {
        if (msgs.length) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            for (const m of msgs) {
              if (!seen.has(m.id)) merged.push(m);
            }
            return merged;
          });
          lastAfterMs.current = Math.max(lastAfterMs.current, ...msgs.map((m) => m.atMs));
        }
      } else if (selectedRef.current) {
        setMessages(msgs);
        lastAfterMs.current = msgs.reduce((a, m) => Math.max(a, m.atMs), 0);
      }
      setError(null);
    } catch (e) {
      if (!opts?.soft) setError(String(e));
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
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Efficient soft poll as Realtime signal substitute until inbox tables are migrated.
  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh({ soft: true });
    }, 4000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selected]);

  const muted = !!(global?.effective || global?.muted);

  const primaryControl = useMemo(() => {
    if (!conversation) return null;
    if (conversation.status === 'closed') {
      return { kind: 'closed' as const };
    }
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
      await postAction({
        action,
        ...(selected ? { fromDigits: selected } : {}),
      });
      await refresh();
      if (selected) await openConversation(selected);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async () => {
    const text = composer.trim();
    if (!selected || !text) return;
    setBusy(true);
    try {
      const json = await postAction({
        action: 'send_message',
        fromDigits: selected,
        text,
      });
      setComposer('');
      if (json.message) {
        setMessages((prev) => [...prev, json.message as InboxMessage]);
      }
      if (json.conversation) {
        setConversation(json.conversation as InboxConversation);
      }
      await refresh({ soft: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="wa-inbox-root"
      className="flex h-[calc(100dvh-7.5rem)] min-h-[520px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)]"
    >
      {/* Left: conversations */}
      <aside
        className={`flex w-full flex-col border-r border-slate-200/80 md:w-[340px] lg:w-[380px] ${
          mobileShowThread && selected ? 'hidden md:flex' : 'flex'
        }`}
        data-testid="wa-inbox-list"
      >
        <div className="border-b border-slate-200/80 px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">Bandeja WhatsApp</h2>
            <button
              type="button"
              disabled={busy}
              data-testid="wa-global-mute"
              onClick={() => runControl(muted ? 'resume_all' : 'pause_all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                muted
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {muted ? 'Reanudar respuestas automáticas' : 'Pausar respuestas automáticas'}
            </button>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar contacto o teléfono"
            data-testid="wa-inbox-search"
            className="mb-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  filter === f.key
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Sin conversaciones aún. Los mensajes entrantes aparecerán aquí.
            </p>
          ) : (
            conversations.map((c) => {
              const active = selected === c.fromDigits;
              return (
                <button
                  key={c.fromDigits}
                  type="button"
                  data-testid={`wa-conv-${c.fromDigits}`}
                  onClick={() => void openConversation(c.fromDigits)}
                  className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition ${
                    active ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                    {(c.displayName || c.fromDigits).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {contactTitle(c)}
                      </p>
                      <span className="shrink-0 text-[11px] text-slate-500">
                        {formatTime(c.lastMessageAtMs)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-500">+{c.fromDigits}</p>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-sm text-slate-600">{c.lastMessageText || '—'}</p>
                      {c.unreadCount > 0 ? (
                        <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {c.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {statusLabel(c)}
                      {c.assignedOperatorLabel ? ` · ${c.assignedOperatorLabel}` : ''}
                      {c.humanActive ? ' · humano' : ''}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Center: thread */}
      <section
        className={`min-w-0 flex-1 flex-col bg-[#f4f6fb] ${
          mobileShowThread && selected ? 'flex' : 'hidden md:flex'
        }`}
        data-testid="wa-inbox-thread"
      >
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">
            Selecciona una conversación para atenderla.
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-slate-200/80 bg-white px-4 py-3">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm text-slate-600 md:hidden"
                onClick={() => setMobileShowThread(false)}
              >
                ←
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">
                  {conversation ? contactTitle(conversation) : `+${selected}`}
                </p>
                <p className="truncate text-xs text-slate-500">
                  +{selected}
                  {conversation ? ` · ${statusLabel(conversation)}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {primaryControl?.kind === 'ai' || primaryControl?.kind === 'pending' ? (
                  <button
                    type="button"
                    disabled={busy}
                    data-testid="wa-take"
                    onClick={() => runControl('take')}
                    className="rounded-full bg-[#00A884] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-105"
                  >
                    Atender personalmente
                  </button>
                ) : null}
                {primaryControl?.kind === 'human' ? (
                  <>
                    <span
                      data-testid="wa-attending-label"
                      className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800"
                    >
                      Atendiendo: {primaryControl.label}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      data-testid="wa-return"
                      onClick={() => runControl('return')}
                      className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800"
                    >
                      Devolver al asistente
                    </button>
                  </>
                ) : null}
                {primaryControl?.kind !== 'closed' ? (
                  <button
                    type="button"
                    disabled={busy}
                    data-testid="wa-close"
                    onClick={() => runControl('close')}
                    className="rounded-full px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100"
                  >
                    Cerrar
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">Cerrada · historial conservado</span>
                )}
              </div>
            </header>

            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {messages.map((m) => {
                const mine = m.role === 'assistant' || m.role === 'operator';
                const isSystem = m.role === 'system';
                if (isSystem) {
                  return (
                    <div key={m.id} className="flex justify-center">
                      <span className="rounded-full bg-slate-200/80 px-3 py-1 text-[11px] text-slate-600">
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
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                        m.role === 'operator'
                          ? 'rounded-br-md bg-[#dcf8c6] text-slate-900'
                          : m.role === 'assistant'
                            ? 'rounded-br-md bg-white text-slate-900'
                            : 'rounded-bl-md bg-white text-slate-900'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-slate-500">
                        <span>
                          {m.role === 'contact'
                            ? 'Cliente'
                            : m.role === 'assistant'
                              ? 'Asistente'
                              : m.operatorLabel || 'Operador'}
                        </span>
                        <span>{formatTime(m.atMs)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={threadEndRef} />
            </div>

            <footer className="border-t border-slate-200/80 bg-white px-3 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  rows={2}
                  placeholder="Escribe una respuesta…"
                  data-testid="wa-composer"
                  className="max-h-28 min-h-[44px] flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400"
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
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Enviar
                </button>
              </div>
              {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
            </footer>
          </>
        )}
      </section>

      {/* Right: contact info */}
      <aside
        className="hidden w-[280px] flex-col border-l border-slate-200/80 bg-white lg:flex"
        data-testid="wa-inbox-sidebar"
      >
        <div className="border-b border-slate-200/80 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Contacto</h3>
        </div>
        {conversation ? (
          <div className="space-y-4 overflow-y-auto px-4 py-4 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Nombre</p>
              <p className="font-medium text-slate-900">{contactTitle(conversation)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Teléfono</p>
              <p className="font-medium text-slate-900">+{conversation.fromDigits}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Estado</p>
              <p className="font-medium text-slate-900">{statusLabel(conversation)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Responsable</p>
              <p className="font-medium text-slate-900">
                {conversation.assignedOperatorLabel || '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Rol contextual</p>
              <p className="font-medium text-slate-900">{conversation.contextRole || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Notas / contexto</p>
              <p className="whitespace-pre-wrap text-slate-700">
                {conversation.contextNote || 'Sin notas internas.'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Versión de atención</p>
              <p className="font-mono text-xs text-slate-600">{conversation.attentionVersion}</p>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Los datos de pedidos privados no se exponen aquí. Intervención oficial: usar «Atender
              personalmente» (no se afirma detección automática desde WhatsApp Business).
            </p>
          </div>
        ) : (
          <p className="px-4 py-8 text-sm text-slate-500">Sin contacto seleccionado.</p>
        )}
      </aside>
    </div>
  );
}
