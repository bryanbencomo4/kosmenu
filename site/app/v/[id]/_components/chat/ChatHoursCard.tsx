'use client';

import type { ChatHoursSnapshot } from './chat-hours';

type ChatHoursCardProps = {
  hours: ChatHoursSnapshot;
};

export function ChatHoursCard({ hours }: ChatHoursCardProps) {
  const { status, days } = hours;
  return (
    <div
      className="w-full max-w-[min(100%,22.5rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] shadow-sm"
      data-chat-hours="1"
      data-chat-hours-open={status.isOpen ? '1' : '0'}
    >
      <div className="border-b border-[var(--chat-card-border)] px-3 py-2">
        <p className="text-[13px] font-semibold text-[var(--chat-text)]">
          Horario
        </p>
        <p
          className={`mt-0.5 text-[12.5px] font-medium leading-snug ${
            status.isOpen ? 'text-[var(--chat-send)]' : 'text-rose-400'
          }`}
          data-chat-hours-caption="1"
        >
          {status.caption}
        </p>
      </div>
      <ul className="divide-y divide-[var(--chat-card-border)]">
        {days.map((day) => (
          <li
            key={day.key}
            className={`flex items-baseline justify-between gap-3 px-3 py-2 text-[12.5px] ${
              day.isToday
                ? 'bg-[color-mix(in_srgb,var(--chat-send)_10%,transparent)]'
                : ''
            }`}
            data-chat-hours-day={day.key}
            data-chat-hours-today={day.isToday ? '1' : '0'}
          >
            <span
              className={`min-w-0 font-medium ${
                day.isToday
                  ? 'text-[var(--chat-text)]'
                  : 'text-[var(--chat-text-muted)]'
              }`}
            >
              {day.label}
              {day.isToday ? (
                <span className="ml-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--chat-send)]">
                  Hoy
                </span>
              ) : null}
            </span>
            <span
              className={`shrink-0 text-right ${
                day.closed
                  ? 'text-[var(--chat-text-muted)]'
                  : 'text-[var(--chat-text)]'
              }`}
            >
              {day.hoursLabel}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
