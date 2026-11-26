'use client';

import type { ThreadMeta } from './_lib/thread-store';

function whenLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

/** Bottom sheet with the owner's recent conversations (stored on this device). */
export function BusinessThreadsSheet({
  threads,
  activeId,
  shopNames,
  onOpen,
  onDelete,
  onNew,
  onClose,
}: {
  threads: ThreadMeta[];
  activeId: string | null;
  shopNames: Record<string, string>;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Conversaciones"
      data-business-threads="1"
    >
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[78dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--chat-text-muted)]/40" />
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
          <p className="text-[16px] font-semibold text-[var(--chat-text)]">Conversaciones</p>
          <button
            type="button"
            onClick={onNew}
            className="rounded-full bg-[var(--chat-send)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--chat-send-fg)]"
          >
            ＋ Nueva
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 [touch-action:pan-y]">
          {threads.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-[var(--chat-text-muted)]">
              Aquí verás tus conversaciones anteriores.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {threads.map((t) => (
                <li key={t.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onOpen(t.id)}
                    className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left active:opacity-80 ${
                      t.id === activeId
                        ? 'bg-[color-mix(in_srgb,var(--chat-send)_14%,transparent)]'
                        : 'hover:bg-[color-mix(in_srgb,var(--chat-text)_6%,transparent)]'
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14.5px] font-medium text-[var(--chat-text)]">
                        {t.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--chat-text-muted)]">
                        {whenLabel(t.updatedAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-[var(--chat-text-muted)]">
                      {(t.comercioId && shopNames[t.comercioId]) || 'Mi negocio'} · {t.count} mensajes
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Eliminar conversación"
                    onClick={() => onDelete(t.id)}
                    className="shrink-0 rounded-full px-2.5 py-2 text-[14px] text-[var(--chat-text-muted)] hover:text-rose-500"
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
