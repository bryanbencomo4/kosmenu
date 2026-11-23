'use client';

import { useCallback, useEffect, useState } from 'react';

type SimReply = { text: string; outboundId: string };
type SimResult = {
  action: string;
  reason: string;
  state?: string;
  replies: SimReply[];
  metrics?: { receivedAtMs: number; repliedAtMs: number | null; storeOps: number };
};

type ChatLine = {
  id: string;
  role: 'user' | 'bot' | 'system';
  text: string;
  meta?: string;
};

export default function WaEntrySimulatorPage() {
  const [from, setFrom] = useState('584129999999');
  const [input, setInput] = useState('');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<Record<string, string> | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/wa-entry/dev/sim');
    const data = await res.json();
    if (data.links) setLinks(data.links);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function send(text: string, extras: { fromMe?: boolean; reset?: boolean } = {}) {
    if (!text.trim() && !extras.reset) return;
    setBusy(true);
    try {
      if (text.trim()) {
        setLines((prev) => [
          ...prev,
          {
            id: `u_${Date.now()}`,
            role: extras.fromMe ? 'system' : 'user',
            text: text.trim(),
            meta: extras.fromMe ? 'fromMe' : undefined,
          },
        ]);
      }
      const res = await fetch('/api/wa-entry/dev/sim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: text.trim() || undefined,
          from: `${from}@s.whatsapp.net`,
          fromMe: extras.fromMe,
          reset: extras.reset,
        }),
      });
      const data = await res.json();
      if (extras.reset) {
        setLines([{ id: `sys_${Date.now()}`, role: 'system', text: 'Sesión reiniciada (sim).' }]);
        return;
      }
      const result = data.result as SimResult;
      if (result?.replies?.length) {
        for (const reply of result.replies) {
          setLines((prev) => [
            ...prev,
            {
              id: reply.outboundId,
              role: 'bot',
              text: reply.text,
              meta: `${result.action} · ${result.state || ''}`,
            },
          ]);
        }
      } else {
        setLines((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            text: `Sin respuesta automática (${result?.action}: ${result?.reason})`,
          },
        ]);
      }
    } finally {
      setBusy(false);
      setInput('');
      void refresh();
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '24px 16px 48px',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        background: 'linear-gradient(165deg, #0f1f17 0%, #1a3a2a 45%, #0d2818 100%)',
        color: '#e8f5ee',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <header style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, opacity: 0.7, fontSize: 13, letterSpacing: '0.04em' }}>
            LOCAL ONLY · SIM ADAPTER
          </p>
          <h1 style={{ margin: '6px 0 8px', fontSize: 28, fontWeight: 700 }}>
            Wa-Entry Simulator
          </h1>
          <p style={{ margin: 0, opacity: 0.85, lineHeight: 1.45, fontSize: 15 }}>
            Prueba el router universal sin WaSender real ni webhooks de producción. Puerto
            recomendado: <code>3030</code>.
          </p>
        </header>

        {links && (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <div>Consumidor: {links.consumer}</div>
            <div>Registro: {links.businessRegister}</div>
            <div>Panel: {links.businessManage}</div>
          </div>
        )}

        <label style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>
          From (dígitos)
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 4,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.25)',
              color: 'inherit',
            }}
          />
        </label>

        <div
          style={{
            minHeight: 360,
            maxHeight: 520,
            overflowY: 'auto',
            padding: 14,
            marginBottom: 12,
            borderRadius: 16,
            background: 'rgba(0,0,0,0.28)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {lines.length === 0 && (
            <p style={{ opacity: 0.6, margin: 0 }}>Escribe &quot;Hola&quot; para empezar…</p>
          )}
          {lines.map((line) => (
            <div
              key={line.id}
              style={{
                alignSelf:
                  line.role === 'user' ? 'flex-end' : line.role === 'bot' ? 'flex-start' : 'center',
                maxWidth: line.role === 'system' ? '100%' : '85%',
                padding: '10px 12px',
                borderRadius: 12,
                whiteSpace: 'pre-wrap',
                background:
                  line.role === 'user'
                    ? '#25d366'
                    : line.role === 'bot'
                      ? 'rgba(255,255,255,0.1)'
                      : 'transparent',
                color: line.role === 'user' ? '#0b1a12' : 'inherit',
                opacity: line.role === 'system' ? 0.7 : 1,
                fontSize: line.role === 'system' ? 12 : 14,
              }}
            >
              {line.text}
              {line.meta && (
                <div style={{ marginTop: 6, fontSize: 11, opacity: 0.65 }}>{line.meta}</div>
              )}
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          style={{ display: 'flex', gap: 8, marginBottom: 12 }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Mensaje…"
            disabled={busy}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.25)',
              color: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: '12px 18px',
              borderRadius: 12,
              border: 0,
              background: '#25d366',
              color: '#0b1a12',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Enviar
          </button>
        </form>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['Hola', '1', '2', 'MENÚ', 'asdf'].map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => void send(q)}
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              {q}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void send('nota humana', { fromMe: true })}
            style={{
              padding: '8px 12px',
              borderRadius: 999,
              border: '1px solid rgba(255,180,80,0.4)',
              background: 'transparent',
              color: '#ffc078',
              cursor: 'pointer',
            }}
          >
            Simular fromMe
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void send('', { reset: true })}
            style={{
              padding: '8px 12px',
              borderRadius: 999,
              border: '1px solid rgba(255,100,100,0.4)',
              background: 'transparent',
              color: '#ff9a9a',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </main>
  );
}
