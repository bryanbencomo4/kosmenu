'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { Clock3, X } from 'lucide-react';

import {
  isScheduleConfigured,
  listBusinessScheduleDayRows,
  parseBusinessSchedule,
  type BusinessScheduleDayRow,
} from '../../../../api/_lib/business-hours';
import { useLockBodyScroll } from '../../../../_lib/use-lock-body-scroll';

type BusinessHoursSheetProps = {
  horarios: unknown;
  themeStyle?: CSSProperties;
  onClose: () => void;
};

export function BusinessHoursSheet({
  horarios,
  themeStyle = {},
  onClose,
}: BusinessHoursSheetProps) {
  useLockBodyScroll(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  const configured = isScheduleConfigured(parseBusinessSchedule(horarios));
  const rows = configured ? listBusinessScheduleDayRows(horarios) : [];

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4"
      style={{ ...themeStyle, paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="business-hours-title"
        className="flex max-h-[86dvh] w-full max-w-md flex-col overflow-hidden rounded-[24px] text-[var(--menu-text,#111111)] shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
        style={{ backgroundColor: 'var(--menu-surface, #ffffff)' }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4 sm:px-6">
          <div className="min-w-0 pr-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--menu-text-muted,#6b7280)]">
              Horario
            </p>
            <h2
              id="business-hours-title"
              className="mt-1 text-xl font-extrabold leading-tight tracking-[-0.02em] sm:text-2xl"
            >
              Días y horarios
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-[var(--menu-text-muted,#6b7280)]">
              {configured
                ? 'Horario de atención de la semana'
                : 'Sin horario publicado por el comercio'}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          data-sheet-scroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2 sm:px-6 [touch-action:pan-y]"
        >
          {configured ? (
            <ul className="space-y-2">
              {rows.map((row) => (
                <HoursDayRow key={row.key} row={row} />
              ))}
            </ul>
          ) : (
            <div
              className="flex flex-col items-center gap-3 rounded-[22px] border px-5 py-8 text-center"
              style={{
                backgroundColor: 'var(--menu-surface-alt, #f3f4f6)',
                borderColor: 'var(--menu-border, #e5e7eb)',
              }}
            >
              <span
                className="inline-flex h-12 w-12 items-center justify-center rounded-full"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--menu-primary) 14%, transparent)',
                  color: 'var(--menu-primary)',
                }}
                aria-hidden
              >
                <Clock3 className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <p className="text-[15px] font-extrabold tracking-[-0.02em] text-[var(--menu-text)]">
                No hay información disponible
              </p>
              <p className="max-w-[18rem] text-[13px] leading-5 text-[var(--menu-text-muted,#6b7280)]">
                Este comercio aún no ha establecido sus horarios de atención.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HoursDayRow({ row }: { row: BusinessScheduleDayRow }) {
  return (
    <li
      className="flex items-center gap-3 rounded-2xl border px-3.5 py-3"
      style={{
        backgroundColor: row.isToday
          ? 'color-mix(in srgb, var(--menu-primary) 10%, var(--menu-surface-alt, #f3f4f6))'
          : 'var(--menu-surface-alt, #f3f4f6)',
        borderColor: row.isToday
          ? 'color-mix(in srgb, var(--menu-primary) 28%, var(--menu-border, #e5e7eb))'
          : 'var(--menu-border, #e5e7eb)',
      }}
    >
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--menu-primary) 14%, transparent)',
          color: 'var(--menu-primary)',
        }}
        aria-hidden
      >
        <Clock3 className="h-3.5 w-3.5" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-extrabold leading-5 tracking-[-0.01em]">
          {row.label}
          {row.isToday ? (
            <span
              className="ml-2 text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: 'var(--menu-primary)' }}
            >
              Hoy
            </span>
          ) : null}
        </p>
        <p
          className={`mt-0.5 text-[13px] leading-5 ${
            row.closed ? 'font-semibold text-[var(--menu-text-muted,#6b7280)]' : 'font-medium text-[var(--menu-text)]'
          }`}
        >
          {row.hoursLabel}
        </p>
      </div>
    </li>
  );
}
