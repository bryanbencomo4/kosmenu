'use client';

import { useCallback, useState } from 'react';

type ApiResult = Record<string, unknown>;

async function postAction(body: Record<string, string>): Promise<ApiResult> {
  const res = await fetch('/admin/api/wa-control', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ApiResult;
}

export function WaControlClient() {
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>('');

  const run = useCallback(async (action: string) => {
    setBusy(true);
    try {
      const started = performance.now();
      const json = await postAction({
        action,
        ...(digits.trim() ? { fromDigits: digits.trim() } : {}),
      });
      const elapsed = Math.round(performance.now() - started);
      setLog(JSON.stringify({ elapsedClientMs: elapsed, ...json }, null, 2));
    } catch (e) {
      setLog(String(e));
    } finally {
      setBusy(false);
    }
  }, [digits]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Teléfono del contacto (dígitos)</span>
        <input
          value={digits}
          onChange={(e) => setDigits(e.target.value)}
          placeholder="58412..."
          style={{ padding: '10px 12px', border: '1px solid #ccc', borderRadius: 8 }}
        />
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" disabled={busy} onClick={() => run('status')}>
          Estado
        </button>
        <button type="button" disabled={busy} onClick={() => run('list_conversations')}>
          Ver conversaciones
        </button>
        <button type="button" disabled={busy} onClick={() => run('take')}>
          Tomar conversación
        </button>
        <button type="button" disabled={busy} onClick={() => run('return')}>
          Devolver al asistente
        </button>
        <button type="button" disabled={busy} onClick={() => run('pause_all')}>
          Pausar todas las respuestas
        </button>
        <button type="button" disabled={busy} onClick={() => run('resume_all')}>
          Reanudar todas
        </button>
        <button type="button" disabled={busy} onClick={() => run('list_tickets')}>
          Tickets pendientes
        </button>
      </div>
      <pre
        style={{
          background: '#111',
          color: '#d7ffd7',
          padding: 12,
          borderRadius: 8,
          overflow: 'auto',
          minHeight: 160,
          fontSize: 12,
        }}
      >
        {log || 'Sin acciones aún.'}
      </pre>
    </div>
  );
}
