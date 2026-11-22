'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';

import { usePanelSession } from '../_lib/usePanelSession';
import { getBrowserSupabase } from '../../_lib/supabase-browser';

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
    const channel = sb
      .channel(`commerce:${comercioId.trim()}:chat_inbox`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
          filter: `comercio_id=eq.${comercioId.trim()}`,
        },
        () => {
          void loadInbox();
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [token, comercioId, loadInbox]);

  if (!ready) {
    return <p className="text-sm text-stone-500">Comprobando sesión…</p>;
  }

  const selected = comercios.find((c) => c.id === comercioId);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm text-stone-600">
              Bandeja de conversaciones del asistente virtual.
            </p>
            {email ? (
              <p className="mt-1 text-xs text-stone-500">{email}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="text-xs font-medium text-stone-600 underline"
            onClick={() => void signOut()}
          >
            Salir
          </button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="block text-sm">
            <span className="font-medium">Comercio</span>
            {comercios.length > 0 ? (
              <select
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
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
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
                value={comercioId}
                onChange={(e) => setComercioId(e.target.value)}
                placeholder="UUID del comercio"
              />
            )}
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className="w-full rounded-xl bg-[#c45c26] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
              disabled={!token || !comercioId.trim() || loading}
              onClick={() => void loadInbox()}
            >
              {loading ? 'Cargando…' : 'Actualizar'}
            </button>
          </div>
        </div>
        {selected && !selected.supervision_enabled ? (
          <p className="mt-2 text-sm text-amber-800">
            La supervisión no está activa para este comercio (feature flag).
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id}>
            <a
              href={`/panel/conversaciones/${encodeURIComponent(row.id)}?comercioId=${encodeURIComponent(comercioId)}`}
              className="block rounded-2xl border border-black/10 bg-white p-4 shadow-sm transition hover:border-[#c45c26]/40"
              data-testid="conversation-row"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {row.consumer_label || 'Cliente anónimo'}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">
                    {row.last_message_preview || 'Sin mensajes'}
                  </p>
                </div>
                <div className="text-right text-xs text-stone-500">
                  <p data-status={row.status}>{statusLabel(row.status)}</p>
                  {assigneeLabel(row.assigned_user_id) ? (
                    <p className="mt-1">
                      Resp: {assigneeLabel(row.assigned_user_id)}
                    </p>
                  ) : null}
                  {row.unread_merchant_count > 0 ? (
                    <p className="mt-1 font-semibold text-[#c45c26]">
                      {row.unread_merchant_count} nuevo(s)
                    </p>
                  ) : null}
                </div>
              </div>
            </a>
          </li>
        ))}
        {!loading && rows.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-6 text-center text-sm text-stone-500">
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
    <Suspense fallback={<p className="text-sm text-stone-500">Cargando…</p>}>
      <ConversationsInboxInner searchParamsPromise={searchParamsPromise} />
    </Suspense>
  );
}
