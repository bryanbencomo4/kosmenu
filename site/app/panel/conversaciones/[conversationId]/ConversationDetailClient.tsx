'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

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

function roleLabel(role: string) {
  if (role === 'consumer') return 'Cliente';
  if (role === 'assistant') return 'Asistente';
  if (role === 'staff') return 'Personal';
  return 'Sistema';
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
  const { token, email, ready, signOut } = usePanelSession();
  const [conversationId, setConversationId] = useState('');
  const [comercioId, setComercioId] = useState('');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastSeqRef = useRef(0);

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

  useConversationRealtime(conversationId || null, onRealtimeInsert);

  // Recovery after disconnect / missed Realtime — not primary delivery.
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
      setError(String(data.error || 'Acción fallida'));
      return;
    }
    setDraft('');
    await load(0);
  }

  if (!ready) {
    return <p className="text-sm text-stone-500">Comprobando sesión…</p>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm text-stone-600">
              Conversación{' '}
              <span className="font-mono text-xs">{conversationId}</span>
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
        {conversation ? (
          <p
            className="mt-2 text-sm"
            data-testid="conversation-status"
            data-status={conversation.status}
          >
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
            data-testid="take-conversation"
            className="rounded-xl bg-[#c45c26] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => void act('take')}
          >
            Tomar conversación
          </button>
          <button
            type="button"
            disabled={busy}
            data-testid="return-assistant"
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => void act('return')}
          >
            Devolver al asistente
          </button>
          <button
            type="button"
            disabled={busy}
            data-testid="close-conversation"
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
        <ul className="max-h-[55vh] space-y-2 overflow-y-auto" data-testid="message-list">
          {messages.map((m) => {
            const proposals = productProposalLabels(m.payload);
            return (
            <li
              key={m.id}
              data-role={m.role}
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
              {proposals.length > 0 ? (
                <p className="mt-1 text-[11px] text-stone-500">
                  Propuestas: {proposals.join(' · ')}
                </p>
              ) : null}
            </li>
            );
          })}
        </ul>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm"
            data-testid="staff-draft"
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
            data-testid="staff-send"
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
          Solo texto por ahora: notas de voz y adjuntos aún no están disponibles
          desde el panel. Mensajes nuevos llegan por Realtime; si se pierde la
          conexión, se recuperan desde la base al volver a la pestaña.
        </p>
      </div>
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
    <Suspense fallback={<p className="text-sm text-stone-500">Cargando…</p>}>
      <ConversationDetailInner
        paramsPromise={paramsPromise}
        searchParamsPromise={searchParamsPromise}
      />
    </Suspense>
  );
}
