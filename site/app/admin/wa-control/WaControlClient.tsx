'use client';

import {
  Bot,
  FileText,
  Headphones,
  Mic,
  Moon,
  MoreVertical,
  Pause,
  Play,
  Reply,
  Search,
  Sun,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import {
  ChatComposer,
  type ChatFilePayload,
  type ChatVoicePayload,
} from '../../v/[id]/_components/chat/ChatComposer';
import { formatChatText } from '../../v/[id]/_components/chat/chat-format';
import {
  REPLY_LONG_PRESS_MS,
  REPLY_SWIPE_THRESHOLD_PX,
  classifyReplySwipe,
  isReplyGestureBlockedTarget,
  replySwipeOffset,
} from '../../v/[id]/_components/chat/chat-gestures';
import type { ChatReplyRef } from '../../v/[id]/_components/chat/chat-types';
import {
  chatThemeVars,
  loadStoredChatTheme,
  resolvePreferredChatTheme,
  saveChatTheme,
  type ChatThemeMode,
} from '../../v/[id]/_components/chat/chat-theme';

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
  mediaKind?: 'image' | 'file' | 'audio' | null;
  mediaUrl?: string | null;
  mediaName?: string | null;
  replyTo?: {
    messageId: string;
    preview: string;
    authorLabel?: string | null;
    role?: string | null;
  } | null;
  reactions?: Array<{ emoji: string; party: 'operator' | 'contact' }>;
  waKey?: { id: string; remoteJid: string; fromMe: boolean } | null;
  wasenderMsgId?: number | string | null;
};

type GlobalMute = {
  muted?: boolean;
  effective?: boolean;
  reason?: string | null;
};

type FilterKey = 'all' | 'unattended' | 'ai' | 'human' | 'pending' | 'closed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unattended', label: 'Sin leer' },
  { key: 'ai', label: 'IA' },
  { key: 'human', label: 'Humanas' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'closed', label: 'Cerradas' },
];

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
/** Same doodle asset + treatment as restaurant / discovery chatbot. */
const CHAT_DOODLE_URL = '/chat/doodle-pattern.png';
const INBOX_THEME_KEY = 'elmenuxfa:wa-inbox-theme-v1';

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
      className="grid shrink-0 place-items-center rounded-full text-[17px] font-medium text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: '#6b7c85',
      }}
    >
      {(label || '?').slice(0, 1).toUpperCase()}
    </div>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
}

function loadInboxTheme(): ChatThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const local = window.localStorage.getItem(INBOX_THEME_KEY);
    if (local === 'light' || local === 'dark') return local;
  } catch {
    /* ignore */
  }
  return resolvePreferredChatTheme(loadStoredChatTheme(), true);
}

export function WaControlClient() {
  const [theme, setTheme] = useState<ChatThemeMode>('dark');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [q, setQ] = useState('');
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [conversation, setConversation] = useState<InboxConversation | null>(null);
  const [global, setGlobal] = useState<GlobalMute | null>(null);
  const [composer, setComposer] = useState('');
  const [replyTo, setReplyTo] = useState<ChatReplyRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [reactionFor, setReactionFor] = useState<string | null>(null);
  const lastAfterMs = useRef(0);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<string | null>(null);
  const nearBottomRef = useRef(true);
  const pinBottomRef = useRef(false);
  const prevMsgLenRef = useRef(0);
  const prevLastMsgIdRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const scrollThreadToEnd = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = threadScrollRef.current;
    if (!el) return;
    if (behavior === 'auto') {
      el.scrollTop = el.scrollHeight;
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
    nearBottomRef.current = true;
  }, []);

  useEffect(() => {
    setTheme(loadInboxTheme());
  }, []);

  const themeVars = useMemo(() => chatThemeVars(theme) as CSSProperties, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: ChatThemeMode = prev === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(INBOX_THEME_KEY, next);
        saveChatTheme(next);
        window.dispatchEvent(new Event('storage'));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

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
    setReplyTo(null);
    setReactionFor(null);
    // Reset thread immediately so we never animate through the previous chat.
    setMessages([]);
    setConversation(null);
    prevMsgLenRef.current = 0;
    prevLastMsgIdRef.current = null;
    pinBottomRef.current = true;
    nearBottomRef.current = true;
    lastAfterMs.current = 0;
    setBusy(true);
    try {
      const json = await postAction({ action: 'get_messages', fromDigits: digits });
      setConversation((json.conversation as InboxConversation) || null);
      const msgs = (json.messages as InboxMessage[]) || [];
      pinBottomRef.current = true;
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

  // Pin to latest message instantly on open; only smooth-follow new appends.
  useLayoutEffect(() => {
    const lastId = messages.length ? messages[messages.length - 1]!.id : null;
    const prevLen = prevMsgLenRef.current;
    const prevLastId = prevLastMsgIdRef.current;
    prevMsgLenRef.current = messages.length;
    prevLastMsgIdRef.current = lastId;

    if (!selected || messages.length === 0) return;

    if (pinBottomRef.current || prevLen === 0) {
      pinBottomRef.current = false;
      scrollThreadToEnd('auto');
      // Late media layout can grow height — re-pin once more next frame.
      requestAnimationFrame(() => scrollThreadToEnd('auto'));
      return;
    }

    const appended = messages.length > prevLen && lastId !== prevLastId;
    if (appended && nearBottomRef.current) {
      scrollThreadToEnd('smooth');
    }
  }, [messages, selected, scrollThreadToEnd]);

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

  const canCompose =
    !!selected &&
    primaryControl?.kind !== 'closed' &&
    (primaryControl?.kind === 'human' ||
      primaryControl?.kind === 'ai' ||
      primaryControl?.kind === 'pending');

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

  const startReply = (m: InboxMessage) => {
    setReplyTo({
      messageId: m.id,
      role: m.role === 'contact' ? 'user' : m.role === 'operator' ? 'user' : 'assistant',
      preview: (m.text || m.mediaName || 'Mensaje').slice(0, 120),
      kind: m.mediaKind === 'audio' ? 'audio' : m.mediaKind === 'image' ? 'image' : m.mediaKind === 'file' ? 'file' : 'text',
      authorLabel:
        m.role === 'contact' ? 'Contacto' : m.role === 'assistant' ? 'Asistente' : 'Tú',
      ...(m.mediaKind === 'image' && m.mediaUrl ? { thumbUrl: m.mediaUrl } : {}),
    });
    setReactionFor(null);
  };

  const sendMessage = async () => {
    const text = composer.trim();
    if (!selected || !text) return;
    setBusy(true);
    setError(null);
    try {
      const json = await postAction({
        action: 'send_message',
        fromDigits: selected,
        text,
        ...(replyTo ? { replyToMessageId: replyTo.messageId } : {}),
      });
      setComposer('');
      setReplyTo(null);
      if (json.message) setMessages((prev) => [...prev, json.message as InboxMessage]);
      if (json.conversation) setConversation(json.conversation as InboxConversation);
      await refresh({ soft: true });
    } catch (e) {
      const err = e as Error & { payload?: Record<string, unknown> };
      if (err.payload?.message) {
        setMessages((prev) => [...prev, err.payload!.message as InboxMessage]);
        setComposer('');
        setReplyTo(null);
      }
      if (err.payload?.conversation) {
        setConversation(err.payload.conversation as InboxConversation);
      }
      setError(String(err.message || e));
    } finally {
      setBusy(false);
    }
  };

  const sendMedia = async (payload: ChatFilePayload) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await blobToDataUrl(payload.file);
      const json = await postAction({
        action: 'send_media',
        fromDigits: selected,
        mediaKind: payload.kind === 'image' ? 'image' : 'file',
        mediaBase64: dataUrl,
        mediaMime: payload.file.type || undefined,
        mediaName: payload.file.name,
        text: composer.trim() || undefined,
        ...(replyTo ? { replyToMessageId: replyTo.messageId } : {}),
      });
      setComposer('');
      setReplyTo(null);
      if (json.message) setMessages((prev) => [...prev, json.message as InboxMessage]);
      if (json.conversation) setConversation(json.conversation as InboxConversation);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const sendVoice = async (payload: ChatVoicePayload) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await blobToDataUrl(payload.blob);
      const json = await postAction({
        action: 'send_media',
        fromDigits: selected,
        mediaKind: 'audio',
        mediaBase64: dataUrl,
        mediaMime: payload.blob.type || 'audio/webm',
        mediaName: 'nota-de-voz.webm',
        text: payload.transcript || undefined,
        ...(replyTo ? { replyToMessageId: replyTo.messageId } : {}),
      });
      setReplyTo(null);
      if (json.message) setMessages((prev) => [...prev, json.message as InboxMessage]);
      if (json.conversation) setConversation(json.conversation as InboxConversation);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const reactTo = async (m: InboxMessage, emoji: string) => {
    if (!selected) return;
    setReactionFor(null);
    setBusy(true);
    try {
      const json = await postAction({
        action: 'send_reaction',
        fromDigits: selected,
        targetMessageId: m.id,
        emoji,
      });
      if (json.message) {
        setMessages((prev) =>
          prev.map((row) => (row.id === m.id ? (json.message as InboxMessage) : row)),
        );
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const panelBg = theme === 'dark' ? '#111b21' : '#ffffff';
  const elevated = theme === 'dark' ? '#202c33' : '#f0f2f5';
  const border = theme === 'dark' ? '#222d34' : 'rgba(0,0,0,0.08)';
  const textMuted = 'var(--chat-text-muted)';

  return (
    <div
      data-testid="wa-inbox-root"
      data-chat-theme={theme}
      className="flex h-full min-h-0 w-full overflow-hidden"
      style={{
        ...themeVars,
        backgroundColor: panelBg,
        color: 'var(--chat-text)',
        fontFamily: 'Segoe UI, Helvetica Neue, Helvetica, Arial, sans-serif',
      }}
    >
      {/* ===== Chat list ===== */}
      <aside
        className={`flex min-h-0 w-full flex-col border-r md:w-[38%] md:max-w-[420px] md:min-w-[320px] ${
          mobileShowThread && selected ? 'hidden md:flex' : 'flex'
        }`}
        style={{ backgroundColor: panelBg, borderColor: border }}
        data-testid="wa-inbox-list"
      >
        <div
          className="flex shrink-0 items-center justify-between px-4 py-3"
          style={{ backgroundColor: 'var(--chat-header)' }}
        >
          <h2 className="text-[20px] font-semibold tracking-tight">Chats</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{ color: textMuted }}
              aria-label={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
              title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
              data-testid="wa-theme-toggle"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              type="button"
              disabled={busy}
              data-testid="wa-global-mute"
              onClick={() => runControl(muted ? 'resume_all' : 'pause_all')}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium disabled:opacity-50"
              style={{
                backgroundColor: muted ? 'rgba(245,158,11,0.2)' : 'transparent',
                color: muted ? '#d97706' : textMuted,
              }}
              title={muted ? 'Reanudar IA' : 'Pausar IA'}
            >
              {muted ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              <span className="hidden sm:inline">{muted ? 'Reanudar' : 'Pausar'}</span>
            </button>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{ color: textMuted }}
              aria-label="Más"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="shrink-0 px-3 pb-2 pt-1" style={{ backgroundColor: panelBg }}>
          <div
            className="flex items-center gap-3 rounded-lg px-3 py-1.5"
            style={{ backgroundColor: elevated }}
          >
            <Search className="h-4 w-4 shrink-0" style={{ color: textMuted }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar o empezar un chat"
              data-testid="wa-inbox-search"
              className="w-full bg-transparent py-1.5 text-[14.5px] outline-none"
              style={{ color: 'var(--chat-text)' }}
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
                    backgroundColor: on
                      ? 'color-mix(in srgb, var(--chat-send) 22%, transparent)'
                      : elevated,
                    color: on ? 'var(--chat-send)' : textMuted,
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
            <p className="px-6 py-16 text-center text-[14px]" style={{ color: textMuted }}>
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
                  className="relative flex w-full gap-3 px-3 py-3 text-left transition-colors"
                  style={{
                    backgroundColor: active
                      ? theme === 'dark'
                        ? '#2a3942'
                        : '#f0f2f5'
                      : 'transparent',
                  }}
                >
                  {active ? (
                    <span
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={{ backgroundColor: 'var(--chat-send)' }}
                    />
                  ) : null}
                  <Avatar label={contactTitle(c)} />
                  <div className="min-w-0 flex-1 border-b pb-3" style={{ borderColor: border }}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className="truncate text-[16px]"
                        style={{
                          fontWeight: unread ? 600 : 400,
                          color: 'var(--chat-text)',
                        }}
                      >
                        {contactTitle(c)}
                      </p>
                      <span
                        className="shrink-0 text-[12px] tabular-nums"
                        style={{ color: unread ? 'var(--chat-send)' : textMuted }}
                      >
                        {formatTime(c.lastMessageAtMs)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-[13.5px]" style={{ color: textMuted }}>
                        {c.lastMessageText || statusLabel(c)}
                      </p>
                      {unread ? (
                        <span
                          className="grid min-w-[1.25rem] place-items-center rounded-full px-1.5 text-[11px] font-semibold text-[#111b21]"
                          style={{ backgroundColor: 'var(--chat-send)' }}
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

      {/* ===== Main chat ===== */}
      <section
        className={`relative min-h-0 min-w-0 flex-1 flex-col ${
          mobileShowThread && selected ? 'flex' : 'hidden md:flex'
        }`}
        data-testid="wa-inbox-thread"
        style={{ backgroundColor: 'var(--chat-bg)' }}
      >
        {!selected ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3 border-b px-8 text-center"
            style={{ borderColor: border, color: textMuted }}
          >
            <div
              className="grid h-16 w-16 place-items-center rounded-full"
              style={{ backgroundColor: elevated }}
            >
              <Headphones className="h-7 w-7" style={{ color: 'var(--chat-send)' }} />
            </div>
            <p className="text-[28px] font-light" style={{ color: 'var(--chat-text)' }}>
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
              style={{
                backgroundColor: 'var(--chat-header)',
                borderBottom: `1px solid var(--chat-header-border)`,
              }}
            >
              <button
                type="button"
                className="rounded-lg px-1 text-[18px] md:hidden"
                style={{ color: 'var(--chat-text)' }}
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
                  <p className="truncate text-[12.5px]" style={{ color: textMuted }}>
                    {conversation ? statusLabel(conversation) : `+${selected}`}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="grid h-9 w-9 place-items-center rounded-full"
                  style={{ color: textMuted }}
                  aria-label={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
                >
                  {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </button>
                {primaryControl?.kind !== 'closed' ? (
                  <button
                    type="button"
                    disabled={busy}
                    data-testid="wa-close"
                    onClick={() => runControl('close')}
                    className="rounded-full px-2.5 py-1.5 text-[12.5px] disabled:opacity-50"
                    style={{ color: textMuted }}
                  >
                    Cerrar
                  </button>
                ) : null}
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-full"
                  style={{ color: textMuted }}
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
                style={{ backgroundColor: 'var(--chat-header)' }}
              >
                <button
                  type="button"
                  disabled={busy}
                  data-testid="wa-take"
                  onClick={() => runControl('take')}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full text-[14px] font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--chat-send)' }}
                >
                  <Headphones className="h-4 w-4" strokeWidth={2.25} />
                  Atender personalmente
                </button>
              </div>
            ) : null}

            {primaryControl?.kind === 'human' ? (
              <div
                className="relative z-10 shrink-0 px-3 py-2"
                style={{ backgroundColor: 'var(--chat-header)' }}
              >
                <button
                  type="button"
                  disabled={busy}
                  data-testid="wa-return"
                  onClick={() => runControl('return')}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full text-[13.5px] font-semibold disabled:opacity-50"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--chat-send) 15%, transparent)',
                    color: 'var(--chat-text)',
                  }}
                >
                  <Bot className="h-4 w-4" style={{ color: 'var(--chat-send)' }} strokeWidth={2.25} />
                  Devolver al asistente
                  {primaryControl.label ? (
                    <span className="font-normal" style={{ color: textMuted }}>
                      · {primaryControl.label}
                    </span>
                  ) : null}
                </button>
              </div>
            ) : null}

            <div
              className="relative min-h-0 flex-1"
              style={{ backgroundColor: 'var(--chat-bg)' }}
              data-chat-wallpaper="1"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-0"
                data-chat-doodle="1"
                style={{
                  backgroundImage: `url('${CHAT_DOODLE_URL}')`,
                  backgroundRepeat: 'repeat',
                  backgroundPosition: 'top center',
                  backgroundSize: '420px auto',
                  opacity: theme === 'dark' ? 0.07 : 0.055,
                  filter: theme === 'light' ? 'invert(1)' : 'none',
                }}
              />
              <div
                ref={threadScrollRef}
                className="relative z-[1] flex h-full flex-col overflow-y-auto overscroll-contain px-3 py-3 sm:px-12 sm:py-4"
                data-testid="wa-inbox-scroll"
                onScroll={() => {
                  const el = threadScrollRef.current;
                  if (!el) return;
                  nearBottomRef.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
                }}
              >
                <div className="mt-auto flex flex-col gap-1">
                  {messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      reactionOpen={reactionFor === m.id}
                      onToggleReaction={() =>
                        setReactionFor((cur) => (cur === m.id ? null : m.id))
                      }
                      onReply={() => startReply(m)}
                      onReact={(emoji) => void reactTo(m, emoji)}
                    />
                  ))}
                  <div ref={threadEndRef} />
                </div>
              </div>
            </div>

            <footer
              className="relative z-10 shrink-0"
              style={{ backgroundColor: 'var(--chat-composer)' }}
            >
              {canCompose ? (
                <ChatComposer
                  value={composer}
                  onChange={setComposer}
                  onSend={() => void sendMessage()}
                  onSendFile={(p) => void sendMedia(p)}
                  onSendVoice={(p) => void sendVoice(p)}
                  disabled={busy}
                  replyTo={replyTo}
                  onClearReply={() => setReplyTo(null)}
                  replyAuthorFallback="Contacto"
                  inputTestId="wa-composer"
                  sendTestId="wa-send"
                  placeholder="Escribe un mensaje"
                />
              ) : (
                <p className="px-4 py-3 text-center text-[13px]" style={{ color: textMuted }}>
                  Esta conversación está cerrada.
                </p>
              )}
              {error ? (
                <p className="px-3 pb-2 text-[12.5px] text-[#f15c6d]" role="alert">
                  {error}
                </p>
              ) : null}
            </footer>
          </>
        )}
      </section>

      {showInfo && conversation ? (
        <aside
          className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[340px] flex-col border-l shadow-2xl md:relative md:max-w-[300px]"
          style={{ backgroundColor: panelBg, borderColor: border }}
          data-testid="wa-inbox-sidebar"
        >
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ backgroundColor: 'var(--chat-header)' }}
          >
            <button
              type="button"
              onClick={() => setShowInfo(false)}
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{ color: textMuted }}
              aria-label="Cerrar info"
            >
              <X className="h-5 w-5" />
            </button>
            <p className="text-[15px] font-medium">Info. del contacto</p>
          </div>
          <div
            className="flex flex-col items-center gap-2 border-b px-4 py-8"
            style={{ borderColor: border }}
          >
            <Avatar label={contactTitle(conversation)} size={80} />
            <p className="text-[18px] font-medium">{contactTitle(conversation)}</p>
            <p className="text-[14px]" style={{ color: textMuted }}>
              +{conversation.fromDigits}
            </p>
          </div>
          <div className="space-y-4 px-4 py-4 text-[14px]">
            <div>
              <p className="text-[12px]" style={{ color: 'var(--chat-send)' }}>
                Estado
              </p>
              <p>{statusLabel(conversation)}</p>
            </div>
            <div>
              <p className="text-[12px]" style={{ color: 'var(--chat-send)' }}>
                Responsable
              </p>
              <p>{conversation.assignedOperatorLabel || '—'}</p>
            </div>
            <div>
              <p className="text-[12px]" style={{ color: 'var(--chat-send)' }}>
                Notas
              </p>
              <p style={{ color: textMuted }}>{conversation.contextNote || 'Sin notas.'}</p>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function MessageBubble({
  message: m,
  reactionOpen,
  onToggleReaction,
  onReply,
  onReact,
}: {
  message: InboxMessage;
  reactionOpen: boolean;
  onToggleReaction: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
}) {
  const mine = m.role === 'assistant' || m.role === 'operator';
  const [offset, setOffset] = useState(0);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const longPressRef = useRef<number | null>(null);
  const phaseRef = useRef<'pending' | 'swipe' | 'ignore'>('pending');

  useEffect(() => {
    return () => {
      if (longPressRef.current) window.clearTimeout(longPressRef.current);
    };
  }, []);

  if (m.role === 'system') {
    return (
      <div className="flex justify-center py-1">
        <span
          className="max-w-[90%] rounded-lg px-3 py-1.5 text-center text-[12px] shadow"
          style={{
            backgroundColor: 'var(--chat-system)',
            color: 'var(--chat-text-muted)',
          }}
        >
          {formatChatText(m.text)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`group relative flex ${mine ? 'justify-end' : 'justify-start'}`}
      data-testid={`wa-msg-${m.role}`}
      style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (isReplyGestureBlockedTarget(e.target as Element)) return;
        startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
        phaseRef.current = 'pending';
        longPressRef.current = window.setTimeout(() => {
          onReply();
          startRef.current = null;
          setOffset(0);
        }, REPLY_LONG_PRESS_MS);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
      onPointerMove={(e) => {
        if (!startRef.current) return;
        const dx = e.clientX - startRef.current.x;
        const dy = e.clientY - startRef.current.y;
        if (phaseRef.current === 'pending') {
          phaseRef.current = classifyReplySwipe(dx, dy);
          if (phaseRef.current !== 'pending' && longPressRef.current) {
            window.clearTimeout(longPressRef.current);
            longPressRef.current = null;
          }
        }
        if (phaseRef.current === 'swipe') {
          setOffset(replySwipeOffset(dx));
        }
      }}
      onPointerUp={() => {
        if (longPressRef.current) {
          window.clearTimeout(longPressRef.current);
          longPressRef.current = null;
        }
        if (phaseRef.current === 'swipe' && offset >= REPLY_SWIPE_THRESHOLD_PX) {
          onReply();
        }
        startRef.current = null;
        phaseRef.current = 'pending';
        setOffset(0);
      }}
      onPointerCancel={() => {
        if (longPressRef.current) {
          window.clearTimeout(longPressRef.current);
          longPressRef.current = null;
        }
        startRef.current = null;
        phaseRef.current = 'pending';
        setOffset(0);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onToggleReaction();
      }}
      onDoubleClick={() => onToggleReaction()}
    >
      {offset > 8 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-full top-1/2 mr-2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full"
          style={{
            opacity: Math.min(1, offset / REPLY_SWIPE_THRESHOLD_PX),
            color: 'var(--chat-send)',
          }}
        >
          <Reply className="h-4 w-4" />
        </span>
      ) : null}

      <button
        type="button"
        aria-label="Responder"
        className={[
          'pointer-events-none absolute top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100',
          mine ? 'right-full mr-1' : 'left-full ml-1',
        ].join(' ')}
        style={{ color: 'var(--chat-text-muted)' }}
        onClick={onReply}
      >
        <Reply className="h-4 w-4" />
      </button>

      <div className="relative max-w-[85%] sm:max-w-[65%]">
        {reactionOpen ? (
          <div
            className={[
              'absolute z-20 -top-11 flex items-center gap-0.5 rounded-full border px-1.5 py-1 shadow-lg',
              mine ? 'right-0' : 'left-0',
            ].join(' ')}
            style={{
              backgroundColor: 'var(--chat-card)',
              borderColor: 'var(--chat-card-border)',
            }}
            role="dialog"
            aria-label="Reaccionar"
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full text-[20px]"
                onClick={() => onReact(emoji)}
                aria-label={`Reaccionar con ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={`relative px-2.5 pb-1 pt-1.5 text-[14.2px] shadow-sm ${
            mine ? 'rounded-lg rounded-tr-none' : 'rounded-lg rounded-tl-none'
          }`}
          style={{
            backgroundColor: mine ? 'var(--chat-bubble-out)' : 'var(--chat-bubble-in)',
            color: 'var(--chat-text)',
          }}
        >
          {m.replyTo ? (
            <div
              className="mb-1 flex max-w-full items-stretch gap-2 overflow-hidden rounded-md border-l-[3px] py-1 pl-2 pr-1"
              style={{
                borderColor: 'var(--chat-send)',
                backgroundColor: 'color-mix(in srgb, var(--chat-text) 7%, transparent)',
              }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="text-[11.5px] font-semibold leading-tight"
                  style={{ color: 'var(--chat-send)' }}
                >
                  {m.replyTo.authorLabel || 'Mensaje'}
                </p>
                <p
                  className="mt-0.5 truncate text-[12.5px]"
                  style={{ color: 'var(--chat-text-muted)' }}
                >
                  {m.replyTo.preview}
                </p>
              </div>
            </div>
          ) : null}

          {m.mediaKind === 'image' && m.mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.mediaUrl}
              alt={m.mediaName || 'Imagen'}
              className="mb-1 max-h-56 w-full rounded-lg object-cover"
            />
          ) : null}

          {m.mediaKind === 'audio' && m.mediaUrl ? (
            <audio controls src={m.mediaUrl} className="mb-1 max-w-full" preload="metadata" />
          ) : null}

          {m.mediaKind === 'file' ? (
            m.mediaUrl ? (
              <a
                href={m.mediaUrl}
                target="_blank"
                rel="noreferrer"
                className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] underline-offset-2 hover:underline"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--chat-text) 6%, transparent)',
                  color: 'var(--chat-link)',
                }}
              >
                <FileText className="h-4 w-4" />
                {m.mediaName || 'Archivo'}
              </a>
            ) : (
              <div
                className="mb-1 flex items-center gap-2 text-[13px]"
                style={{ color: 'var(--chat-text-muted)' }}
              >
                <FileText className="h-4 w-4" />
                {m.mediaName || 'Archivo'}
              </div>
            )
          ) : null}

          {m.mediaKind === 'audio' && !m.mediaUrl ? (
            <div
              className="mb-1 flex items-center gap-2 text-[13px]"
              style={{ color: 'var(--chat-text-muted)' }}
            >
              <Mic className="h-4 w-4" />
              Nota de voz
            </div>
          ) : null}

          {m.text ? (
            <div className="whitespace-pre-wrap break-words leading-[1.35]">
              {formatChatText(m.text)}
            </div>
          ) : null}

          <div
            className="mt-0.5 flex items-center justify-end gap-1.5 pl-8 text-[11px]"
            style={{ color: 'var(--chat-text-muted)' }}
          >
            <span>
              {m.role === 'contact' ? '' : m.role === 'assistant' ? 'Asistente' : 'Tú'}
            </span>
            <span>{formatTime(m.atMs)}</span>
          </div>
        </div>

        {m.reactions && m.reactions.length > 0 ? (
          <div
            className={[
              '-mt-1.5 flex flex-wrap gap-1 px-1',
              mine ? 'justify-end' : 'justify-start',
            ].join(' ')}
          >
            {m.reactions.map((r) => (
              <button
                key={`${r.party}-${r.emoji}`}
                type="button"
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[13px] shadow-sm"
                style={{
                  backgroundColor: 'var(--chat-card)',
                  borderColor: 'var(--chat-card-border)',
                }}
                onClick={() => onReact(r.emoji)}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
