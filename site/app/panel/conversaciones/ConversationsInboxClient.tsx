'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';

import { commerceChatChannelName } from '../../_lib/chat-supervision-realtime';
import { getBrowserSupabase } from '../../_lib/supabase-browser';
import { chatThemeVars } from '../../v/[id]/_components/chat/chat-theme';
import { usePanelSession } from '../_lib/usePanelSession';

type ConversationRow = {
  id: string;
  status: string;
  consumer_label: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_merchant_count: number;
  assigned_user_id: string | null;
};

type ComercioOption = {
  id: string;
  nombre: string;
  role: string;
  supervision_enabled: boolean;
};

const THEME_VARS = chatThemeVars('dark');

function statusLabel(status: string) {
  switch (status) {
    case 'human_handling':
      return 'Humano atendiendo';
    case 'needs_attention':
      return 'Requiere atención';
    case 'closed':
      return 'Cerrada';
    default:
      return 'IA atendiendo';
  }
}

function statusRank(status: string) {
  switch (status) {
    case 'needs_attention':
      return 0;
    case 'human_handling':
      return 1;
    case 'closed':
      return 3;
    default:
      return 2;
  }
}

function prioritizeConversations(rows: ConversationRow[]) {
  return [...rows].sort((a, b) => {
    const byStatus = statusRank(a.status) - statusRank(b.status);
    if (byStatus !== 0) return byStatus;
    return String(b.last_message_at || '').localeCompare(
      String(a.last_message_at || ''),
    );
  });
}

function formatListTime(iso: string | null) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  try {
    const d = new Date(t);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    }
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'short',
    }).format(d);
  } catch {
    return '';
  }
}

function ConversationsInboxInner({
  searchParamsPromise,
}: {
  searchParamsPromise?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token, email, userId, ready, signOut } = usePanelSession();

  function assigneeLabel(assignedUserId: string | null) {
    if (!assignedUserId) return null;
    if (userId && assignedUserId === userId) return 'Tú';
    return 'Personal';
  }
  const [comercioId, setComercioId] = useState('');
  const [comercios, setComercios] = useState<ComercioOption[]>([]);
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sp = searchParamsPromise ? await searchParamsPromise : {};
      const c = typeof sp.comercioId === 'string' ? sp.comercioId : '';
      if (!cancelled && c) setComercioId(c);
      try {
        const saved = window.sessionStorage.getItem('elmenuxfa:panel-comercio');
        if (!cancelled && !c && saved) setComercioId(saved);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParamsPromise]);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/panel/conversaciones/me', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(
          res.status === 401
            ? 'Sesión expirada. Vuelve a iniciar sesión.'
            : String(data.error || 'No se pudieron cargar tus comercios'),
        );
        return;
      }
      const list = (data.comercios || []) as ComercioOption[];
      setComercios(list);
      setComercioId((prev) => {
        if (prev.trim()) return prev;
        if (list.length === 1) return list[0].id;
        const preferred = list.find((c) => c.supervision_enabled);
        return preferred?.id || prev;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  const loadInbox = useCallback(async () => {
    if (!token || !comercioId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      window.sessionStorage.setItem('elmenuxfa:panel-comercio', comercioId.trim());
    } catch {
      /* ignore */
    }
    const res = await fetch(
      `/api/panel/conversaciones?comercioId=${encodeURIComponent(comercioId.trim())}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      },
    );
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(
        res.status === 401
          ? 'Sesión expirada. Vuelve a iniciar sesión.'
          : String(data.error || 'No se pudo cargar la bandeja'),
      );
      setRows([]);
      return;
    }
    setRows(prioritizeConversations(data.conversations || []));
  }, [token, comercioId]);

  useEffect(() => {
    if (ready && token && comercioId.trim()) void loadInbox();
  }, [ready, token, comercioId, loadInbox]);

  useEffect(() => {
    if (!token || !comercioId.trim()) return;
    const sb = getBrowserSupabase();
    if (!sb) return;
    const cid = comercioId.trim();
    const channel = sb
      .channel(`commerce:${cid}:chat_inbox`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
          filter: `comercio_id=eq.${cid}`,
        },
        () => {
          void loadInbox();
        },
      )
      .subscribe();

    const hint = sb
      .channel(commerceChatChannelName(cid))
      .on('broadcast', { event: 'chat' }, () => {
        void loadInbox();
      })
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
      void sb.removeChannel(hint);
    };
  }, [token, comercioId, loadInbox]);

  useEffect(() => {
    if (!token || !comercioId.trim()) return;
    const id = window.setInterval(() => {
      void loadInbox();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [token, comercioId, loadInbox]);

  if (!ready) {
    return (
      <p
        className="p-4 text-sm"
        style={{ ...THEME_VARS, color: 'var(--chat-text-muted)' }}
      >
        Comprobando sesión…
      </p>
    );
  }

  const selected = comercios.find((c) => c.id === comercioId);

  return (
    <div
      className="mx-auto flex min-h-[100dvh] max-w-lg flex-col overflow-hidden md:min-h-[70vh] md:rounded-xl md:border"
      style={{
        ...THEME_VARS,
        backgroundColor: 'var(--chat-card)',
        color: 'var(--chat-text)',
        borderColor: 'var(--chat-card-border)',
      }}
      data-chat-theme="dark"
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{
          backgroundColor: 'var(--chat-header)',
          borderBottom: '1px solid var(--chat-header-border)',
        }}
      >
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold">Chats</p>
          {email ? (
            <p
              className="truncate text-[12px]"
              style={{ color: 'var(--chat-text-muted)' }}
            >
              {email}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://app.elmenuxfa.com"
            className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--chat-text) 8%, transparent)',
            }}
          >
            Panel
          </a>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--chat-text) 8%, transparent)',
            }}
            disabled={!token || !comercioId.trim() || loading}
            onClick={() => void loadInbox()}
          >
            {loading ? '…' : 'Actualizar'}
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--chat-text) 8%, transparent)',
            }}
            onClick={() => void signOut()}
          >
            Salir
          </button>
        </div>
      </div>

      <div
        className="border-b px-3 py-2"
        style={{ borderColor: 'var(--chat-card-border)' }}
      >
        <label className="block text-[12px] font-medium" style={{ color: 'var(--chat-text-muted)' }}>
          Comercio
          {comercios.length > 0 ? (
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2 text-[14.5px]"
              style={{
                borderColor: 'var(--chat-card-border)',
                color: 'var(--chat-text)',
                backgroundColor: 'var(--chat-input)',
              }}
              value={comercioId}
              onChange={(e) => setComercioId(e.target.value)}
              data-testid="comercio-select"
            >
              <option value="">Selecciona un comercio</option>
              {comercios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.supervision_enabled ? '' : ' (supervisión off)'}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-[14.5px]"
              style={{
                borderColor: 'var(--chat-card-border)',
                color: 'var(--chat-text)',
              }}
              value={comercioId}
              onChange={(e) => setComercioId(e.target.value)}
              placeholder="UUID del comercio"
            />
          )}
        </label>
        {selected && !selected.supervision_enabled ? (
          <p className="mt-2 text-[13px] text-amber-800">
            La supervisión no está activa para este comercio (feature flag).
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-[13px] text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((row) => {
          const initial = (
            row.consumer_label || 'Cliente'
          )
            .trim()
            .charAt(0)
            .toUpperCase() || 'C';
          const unread = row.unread_merchant_count > 0;
          return (
            <li key={row.id}>
              <a
                href={`/panel/conversaciones/${encodeURIComponent(row.id)}?comercioId=${encodeURIComponent(comercioId)}`}
                className="flex items-center gap-3 border-b px-3 py-3 transition hover:bg-black/[0.03]"
                style={{ borderColor: 'var(--chat-card-border)' }}
                data-testid="conversation-row"
              >
                <div
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-[17px] font-semibold"
                  style={{
                    backgroundColor: 'var(--chat-input)',
                    color: 'var(--chat-text)',
                  }}
                >
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className={`truncate text-[16px] ${unread ? 'font-semibold' : 'font-medium'}`}
                      style={{ color: 'var(--chat-text)' }}
                    >
                      {row.consumer_label || 'Cliente'}
                    </p>
                    <span
                      className="shrink-0 text-[12px] tabular-nums"
                      style={{
                        color: unread ? 'var(--chat-send)' : 'var(--chat-text-muted)',
                      }}
                    >
                      {formatListTime(row.last_message_at)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p
                      className="truncate text-[13.5px]"
                      style={{ color: 'var(--chat-text-muted)' }}
                    >
                      {row.last_message_preview || 'Sin mensajes'}
                    </p>
                    {unread ? (
                      <span
                        className="grid min-w-[1.25rem] place-items-center rounded-full px-1.5 text-[11.5px] font-semibold text-white"
                        style={{ backgroundColor: 'var(--chat-send)' }}
                      >
                        {row.unread_merchant_count}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className="mt-0.5 text-[11.5px]"
                    style={{ color: 'var(--chat-text-muted)' }}
                    data-status={row.status}
                  >
                    {statusLabel(row.status)}
                    {assigneeLabel(row.assigned_user_id)
                      ? ` · ${assigneeLabel(row.assigned_user_id)}`
                      : ''}
                  </p>
                </div>
              </a>
            </li>
          );
        })}
        {!loading && rows.length === 0 ? (
          <li
            className="px-6 py-16 text-center text-[14px]"
            style={{ color: 'var(--chat-text-muted)' }}
          >
            No hay conversaciones todavía (o la supervisión no está activa para
            este comercio).
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function ConversationsInboxClient({
  searchParamsPromise,
}: {
  searchParamsPromise?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense
      fallback={
        <p className="p-4 text-sm text-stone-500">Cargando bandeja…</p>
      }
    >
      <ConversationsInboxInner searchParamsPromise={searchParamsPromise} />
    </Suspense>
  );
}
