'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

type HandoffPayload = {
  intent?: string | null;
  query?: string | null;
  zone?: string | null;
  pendingOperation?: string | null;
  candidateComercioId?: string | null;
  businessNameDraft?: string | null;
  conversationHint?: string | null;
};

type Msg = { role: 'assistant' | 'user'; text: string };

function readHashHandoff(): string | null {
  if (typeof window === 'undefined') return null;
  const frag = window.location.hash.replace(/^#/, '');
  if (frag.startsWith('h=')) return decodeURIComponent(frag.slice(2));
  const params = new URLSearchParams(frag);
  const h = params.get('h');
  return h?.trim() || null;
}

/**
 * Next fallback UI for asistente-negocio (and business host asistente rewrite).
 * Canonical merchant URL is app.elmenuxfa.com/asistente (Flutter).
 */
export function BusinessAssistantView(props: { initialHandoffCode: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [code, setCode] = useState<string | null>(props.initialHandoffCode);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const consumedRef = useRef(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const fromHash = readHashHandoff();
    if (fromHash) setCode(fromHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const res = await fetch('/api/asistente-negocio', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            handoffCode: code || undefined,
            handoffAction: 'peek',
          }),
        });
        const json = (await res.json()) as { ok?: boolean; text?: string; error?: string };
        if (!res.ok || !json.ok) throw new Error(json.error || 'boot_failed');
        if (cancelled) return;
        setMessages([{ role: 'assistant', text: json.text || '¡Hola!' }]);
        setStatus('ready');
      } catch {
        if (cancelled) return;
        setStatus('error');
        setMessages([
          {
            role: 'assistant',
            text:
              'No pude cargar el asistente. Usa la URL oficial del panel: https://app.elmenuxfa.com/asistente',
          },
        ]);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function consumeOnce() {
    if (consumedRef.current || !code) return;
    consumedRef.current = true;
    await fetch('/api/wa-handoff/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code,
        destination: 'business_assistant',
        action: 'consume',
      }),
    }).catch(() => null);
  }

  function onSend() {
    const text = input.trim();
    if (!text || pending) return;
    setInput('');
    const nextMsgs: Msg[] = [...messages, { role: 'user', text }];
    setMessages(nextMsgs);
    startTransition(async () => {
      await consumeOnce();
      try {
        const res = await fetch('/api/asistente-negocio', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: nextMsgs,
            handoffCode: code || undefined,
            handoffAction: 'peek',
          }),
        });
        const json = (await res.json()) as { text?: string };
        setMessages((m) => [
          ...m,
          { role: 'assistant', text: json.text || 'Sin respuesta.' },
        ]);
      } catch {
        setMessages((m) => [
          ...m,
          { role: 'assistant', text: 'Error de red. Intenta de nuevo.' },
        ]);
      }
    });
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col">
      <header className="border-b border-stone-200/80 bg-white/80 px-4 py-3 backdrop-blur">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">elmenuxfa.com</p>
        <h1 className="text-lg font-semibold text-stone-900">Asistente para negocios</h1>
        <p className="text-xs text-stone-500">
          URL oficial del comerciante:{' '}
          <a className="underline" href="https://app.elmenuxfa.com/asistente">
            app.elmenuxfa.com/asistente
          </a>
        </p>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {status === 'loading' && <p className="text-sm text-stone-500">Cargando…</p>}
        {messages.map((m, i) => (
          <div
            key={`${i}-${m.role}`}
            className={
              m.role === 'assistant'
                ? 'max-w-[92%] whitespace-pre-wrap rounded-2xl bg-white px-3 py-2 text-sm text-stone-800 shadow-sm'
                : 'ml-auto max-w-[92%] whitespace-pre-wrap rounded-2xl bg-stone-900 px-3 py-2 text-sm text-white'
            }
          >
            {m.text}
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-stone-200 bg-white p-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        <input
          className="flex-1 rounded-full border border-stone-300 px-4 py-2 text-sm outline-none"
          placeholder="Escribe tu mensaje…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={pending || !input.trim()}
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
