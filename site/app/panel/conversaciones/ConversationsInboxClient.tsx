'use client';

import { useEffect, useMemo, useState } from 'react';

type ConversationRow = {
  id: string;
  status: string;
  consumer_label: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_merchant_count: number;
  assigned_user_id: string | null;
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

export function ConversationsInboxClient({
  searchParamsPromise,
}: {
  searchParamsPromise?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [token, setToken] = useState('');
  const [comercioId, setComercioId] = useState('');
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
        const saved = window.sessionStorage.getItem('elmenuxfa:panel-bearer');
        if (!cancelled && saved) setToken(saved);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParamsPromise]);

  const canLoad = useMemo(
    () => Boolean(token.trim() && comercioId.trim()),
    [token, comercioId],
  );

  async function loadInbox() {
    if (!canLoad) return;
    setLoading(true);
    setError(null);
    try {
      window.sessionStorage.setItem('elmenuxfa:panel-bearer', token.trim());
    } catch {
      /* ignore */
    }
    const res = await fetch(
      `/api/panel/conversaciones?comercioId=${encodeURIComponent(comercioId.trim())}`,
      {
        headers: { Authorization: `Bearer ${token.trim()}` },
        cache: 'no-store',
      },
    );
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(
        res.status === 401
          ? 'Inicia sesión en el panel de El Menú XFA y pega aquí tu access token de sesión (piloto web).'
          : String(data.error || 'No se pudo cargar la bandeja'),
      );
      setRows([]);
      return;
    }
    setRows(data.conversations || []);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <p className="text-sm text-stone-600">
          Esta bandeja usa la misma autenticación Bearer del panel comerciante.
          El enlace de WhatsApp abre una conversación concreta; aquí listamos las
          recientes del comercio.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Comercio ID</span>
            <input
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              value={comercioId}
              onChange={(e) => setComercioId(e.target.value)}
              placeholder="UUID del comercio"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Access token (Bearer)</span>
            <input
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Supabase access_token"
              type="password"
              autoComplete="off"
            />
          </label>
        </div>
        <button
          type="button"
          className="mt-3 rounded-xl bg-[#c45c26] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={!canLoad || loading}
          onClick={() => void loadInbox()}
        >
          {loading ? 'Cargando…' : 'Actualizar bandeja'}
        </button>
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
                  <p>{statusLabel(row.status)}</p>
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
