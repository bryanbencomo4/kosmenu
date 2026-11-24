'use client';

import { useEffect, useState, useTransition } from 'react';

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

function greetingFromPayload(payload: HandoffPayload | null): string {
  if (!payload) {
    return '¡Hola! 😊 Soy el asistente para negocios de elmenuxfa.com. Puedo orientarte para registrar tu menú o, si ya tienes cuenta, ayudarte a gestionar productos con confirmación segura.';
  }
  if (payload.pendingOperation === 'edit_price' || payload.intent?.includes('edit_price')) {
    const hint = payload.conversationHint || 'ese precio';
    return `¡Hola! 😊 Vamos a revisar: ${hint}.\n\nPrimero confirmaré tu acceso al negocio para hacerlo de forma segura. Las modificaciones requieren autenticación y tu confirmación — no bastará el número de WhatsApp.`;
  }
  if (payload.pendingOperation === 'register_business' || payload.intent?.includes('register')) {
    const name = payload.businessNameDraft ? ` *${payload.businessNameDraft}*` : '';
    return `¡Excelente! 🙌 Continuamos el registro${name}.\n\nPuedes crear la cuenta en el panel (nunca compartas contraseñas aquí). Cuando estés autenticado, retomamos el menú.`;
  }
  if (payload.conversationHint) {
    return `¡Hola! 😊 Retomamos: ${payload.conversationHint}.\n\nSi necesitas cambios en el menú, verificaré tu acceso antes de proponer nada.`;
  }
  return '¡Hola! 😊 Continuamos desde WhatsApp. ¿Qué necesitas hacer con tu negocio?';
}

export function BusinessAssistantView(props: { initialHandoffCode: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [payload, setPayload] = useState<HandoffPayload | null>(null);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!props.initialHandoffCode) {
        if (!cancelled) {
          setStatus('ready');
          setMessages([{ role: 'assistant', text: greetingFromPayload(null) }]);
        }
        return;
      }
      try {
        const res = await fetch('/api/wa-handoff/redeem', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code: props.initialHandoffCode,
            destination: 'business_assistant',
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          payload?: HandoffPayload;
        };
        if (!res.ok || !json.ok) {
          const map: Record<string, string> = {
            expired: 'Este enlace de acceso venció. Vuelve a pedirlo por WhatsApp.',
            consumed: 'Este enlace ya fue usado. Pide uno nuevo por WhatsApp si lo necesitas.',
            revoked: 'Este enlace fue revocado.',
            not_found: 'No reconocí este enlace de acceso.',
            destination_mismatch: 'Este enlace no corresponde al asistente para negocios.',
          };
          throw new Error(map[json.error || ''] || 'No pude validar el acceso.');
        }
        if (cancelled) return;
        setPayload(json.payload || null);
        setMessages([{ role: 'assistant', text: greetingFromPayload(json.payload || null) }]);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Error de acceso');
        setStatus('error');
        setMessages([
          {
            role: 'assistant',
            text:
              (e instanceof Error ? e.message : 'Error de acceso') +
              '\n\nPuedes abrir el panel: https://app.elmenuxfa.com/',
          },
        ]);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [props.initialHandoffCode]);

  function onSend() {
    const text = input.trim();
    if (!text || pending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    startTransition(() => {
      const lower = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      let reply: string;
      if (/\b(registrar|crear cuenta|unirme)\b/.test(lower)) {
        reply =
          'Para registrar tu negocio usa el flujo seguro del panel (con autenticación):\nhttps://app.elmenuxfa.com/?tab=register\n\nCuando entres, puedes armar el menú ahí. No creo comercios solo con el chat sin verificación.';
      } else if (/\b(precio|producto|tasa|horario)\b/.test(lower)) {
        reply =
          'Puedo ayudarte a *preparar* ese cambio, pero ejecutarlo requiere sesión autenticada y permisos del comercio.\n\nAbre tu panel para confirmarlo:\nhttps://app.elmenuxfa.com/\n\nLa API segura de escritura conversacional aún no está armada para todas las operaciones; no fingiré que ya se actualizó.';
      } else if (/\b(plan|precio del servicio|cuanto cuesta)\b/.test(lower)) {
        reply =
          'Los planes publicados están en:\nhttps://business.elmenuxfa.com/\n\nNo invento tarifas por chat.';
      } else {
        const ctx = payload?.businessNameDraft
          ? ` (contexto: ${payload.businessNameDraft})`
          : '';
        reply = `Entendido${ctx}. ¿Quieres registrar un negocio, consultar el servicio, o gestionar un menú ya existente? Si es gestión, necesitarás iniciar sesión en el panel.`;
      }
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
    });
  }

  const suggestions =
    payload?.pendingOperation === 'edit_price'
      ? ['Abrir panel para cambiar precio', 'Consultar mi menú', 'Hablar con soporte']
      : payload?.pendingOperation === 'register_business'
        ? ['Crear cuenta', 'Ver planes', 'Retomar después']
        : ['Registrar mi negocio', 'Cambiar un precio', 'Ver planes'];

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col">
      <header className="border-b border-stone-200/80 bg-white/80 px-4 py-3 backdrop-blur">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">elmenuxfa.com</p>
        <h1 className="text-lg font-semibold text-stone-900">Asistente para negocios</h1>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {status === 'loading' && (
          <p className="text-sm text-stone-500">Validando acceso…</p>
        )}
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
        {error && status === 'error' ? null : null}
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="shrink-0 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs text-stone-700"
            onClick={() => {
              setInput(s);
            }}
          >
            {s}
          </button>
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
          className="flex-1 rounded-full border border-stone-300 px-4 py-2 text-sm outline-none focus:border-stone-500"
          placeholder="Escribe tu mensaje…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status === 'loading'}
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
