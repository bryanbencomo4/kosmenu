'use client';

import { useEffect, useRef } from 'react';

type DeliveryNoteFieldProps = {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  suggestions: string[];
  /** Suggestions that start a phrase ("Al frente de") instead of replacing the field. */
  prefixes?: string[];
  required?: boolean;
  multiline?: boolean;
  onChange: (value: string) => void;
  onRemember: (value: string) => void;
};

function applyPrefix(current: string, prefix: string, prefixes: string[]) {
  const trimmed = current.trim();
  const known = [...prefixes].sort((left, right) => right.length - left.length);
  const existing = known.find((item) =>
    trimmed.toLocaleLowerCase('es').startsWith(item.toLocaleLowerCase('es')),
  );
  const rest = existing ? trimmed.slice(existing.length).trim() : trimmed;
  if (!rest || existing) return rest ? `${prefix} ${rest}` : `${prefix} `;
  return `${prefix} ${trimmed}`;
}

export function DeliveryNoteField({
  id,
  label,
  value,
  placeholder,
  suggestions,
  prefixes = [],
  required = false,
  multiline = false,
  onChange,
  onRemember,
}: DeliveryNoteFieldProps) {
  const current = value.trim().toLocaleLowerCase('es');
  const rememberRef = useRef(onRemember);
  rememberRef.current = onRemember;

  useEffect(() => {
    const text = value.trim();
    if (!text) return;
    const timer = window.setTimeout(() => rememberRef.current(text), 500);
    return () => window.clearTimeout(timer);
  }, [value]);

  function applySuggestion(suggestion: string) {
    const isPrefix = prefixes.some(
      (prefix) => prefix.toLocaleLowerCase('es') === suggestion.toLocaleLowerCase('es'),
    );
    const next = isPrefix ? applyPrefix(value, suggestion, prefixes) : suggestion;
    onChange(next);
    onRemember(next);
  }

  return (
    <div className="rounded-[22px] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)]">
      <label htmlFor={id} className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
          {label}
        </span>
        <span className="text-[11px] font-semibold text-[var(--menu-text-muted)]">
          {required ? 'Requerido' : 'Opcional'}
        </span>
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          rows={2}
          required={required}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onRemember(value)}
          className="w-full rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] px-4 py-3 text-sm outline-none"
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          required={required}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onRemember(value)}
          className="h-12 w-full rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] px-4 text-sm outline-none"
        />
      )}
      {suggestions.length > 0 ? (
        <div className="mt-2 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {suggestions.map((suggestion) => {
            const isPrefix = prefixes.some(
              (prefix) => prefix.toLocaleLowerCase('es') === suggestion.toLocaleLowerCase('es'),
            );
            const selected =
              current.length > 0 &&
              (isPrefix
                ? current.startsWith(suggestion.toLocaleLowerCase('es'))
                : current === suggestion.toLocaleLowerCase('es'));
            return (
              <button
                key={suggestion}
                type="button"
                onClick={() => applySuggestion(suggestion)}
                className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold"
                style={
                  selected
                    ? { backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }
                    : { backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text)' }
                }
              >
                {suggestion}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
