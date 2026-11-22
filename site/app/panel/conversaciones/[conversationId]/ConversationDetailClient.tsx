'use client';

import { useCallback, useEffect, useState } from 'react';

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

function roleLabel(role: string) {
  if (role === 'consumer') return 'Cliente';
  if (role === 'assistant') return 'Asistente';
  if (role === 'staff') return 'Personal';
  return 'Sistema';
}

export function ConversationDetailClient({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Promise<{ conversationId: string }>;
  searchParamsPromise?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [conversationId, setConversationId] = useState('');
  const [comercioId, setComercioId] = useState('');
  const [token, setToken] = useState('');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await paramsPromise;
      const sp = searchParamsPromise ? await searchParamsPromise : {};
      if (cancelled) return;
      setConversationId(decodeURIComponent(p.conversationId || ''));
      const c = typeof sp.comercioId === 'string' ? sp.comercioId : '';
      if (c) setComercioId(c);
      try {
        const saved = window.sessionStorage.getItem('elmenuxfa:panel-bearer');
        if (saved) setToken(saved);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paramsPromise, searchParamsPromise]);

  const load = useCallback(
    async (afterSeq = 0) => {
      if (!token.trim() || !conversationId) return;
      const res = await fetch(
        `/api/panel/conversaciones/${encodeURIComponent(conversationId)}?afterSeq=${afterSeq}`,
        {
          headers: { Authorization: `Bearer ${token.trim()}` },
          cache: 'no-store',
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 401
            ? 'Autenticación requerida. Inicia sesión y usa tu token de acceso.'
            : String(data.error || 'No se pudo abrir la conversación'),
        );
        return;
      }
      setError(null);
      setConversation(data.conversation);
      if (!comercioId && data.conversation?.comercio_id) {
        setComercioId(String(data.conversation.comercio_id));
      }
      const incoming = (data.messages || []) as MessageRow[];
      if (afterSeq > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
        });
      } else {
        setMessages(incoming);
      }
    },
    [token, conversationId, comercioId],
  );

  useEffect(() => {
    if (token && conversationId) void load(0);
  }, [token, conversationId, load]);

  // Recovery only (not primary Realtime): refresh when tab becomes visible.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && messages.length) {
        const lastSeq = messages[messages.length - 1]?.seq || 0;
        void load(lastSeq);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load, messages]);

  async function act(action: string, text?: string) {
    if (!token.trim() || !conversationId) return;
    setBusy(true);
    setError(null);
    try {
      window.sessionStorage.setItem('elmenuxfa:panel-bearer', token.trim());
    } catch {
      /* ignore */
    }
    const res = await fetch(
      `/api/panel/conversaciones/${encodeURIComponent(conversationId)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, text }),
      },
    );
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(String(data.error || 'Acción fallida'));
      return;
    }
    setDraft('');
    await load(0);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <p className="text-sm text-stone-600">
          Conversación <span className="font-mono text-xs">{conversationId}</span>
        </p>
        {!token ? (
          <label className="mt-3 block text-sm">
            <span className="font-medium">Access token (Bearer)</span>
            <input
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              autoComplete="off"
            />
          </label>
        ) : null}
        {conversation ? (
          <p className="mt-2 text-sm">
            Estado: <strong>{conversation.status}</strong>
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-xl bg-[#c45c26] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => void act('take')}
          >
            Tomar conversación
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => void act('return')}
          >
            Devolver al asistente
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => void act('close')}
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => void load(0)}
          >
            Actualizar
          </button>
        </div>
      </section>

      <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
        <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-xl px-3 py-2 text-sm ${
                m.role === 'consumer'
                  ? 'ml-8 bg-[#dcf8c6]'
                  : m.role === 'staff'
                    ? 'mr-8 bg-[#fff4e8]'
                    : 'mr-8 bg-stone-100'
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                {roleLabel(m.role)}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              conversation?.status === 'human_handling'
                ? 'Escribe al cliente…'
                : 'Toma la conversación para escribir'
            }
            disabled={conversation?.status !== 'human_handling' || busy}
          />
          <button
            type="button"
            className="rounded-xl bg-[#c45c26] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={
              conversation?.status !== 'human_handling' || busy || !draft.trim()
            }
            onClick={() => void act('message', draft.trim())}
          >
            Enviar
          </button>
        </div>
        <p className="mt-2 text-[11px] text-stone-500">
          Realtime Broadcast se activa tras migrar políticas privadas; esta vista
          recupera mensajes al volver a la pestaña. La base de datos es la fuente
          de verdad.
        </p>
      </div>
    </div>
  );
}
