'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, MapPin, X } from 'lucide-react';

import { formatVenezuelaOperatingStatesPreview } from '../../../../_lib/venezuela-states';
import { useLockBodyScroll } from '../../../../_lib/use-lock-body-scroll';

type OperatingCoverageProps = {
  /** Display labels already resolved (e.g. "Miranda"). */
  stateLabels: string[];
  /** Theme CSS vars captured from the kiosk surface (optional). */
  themeStyle?: CSSProperties;
};

/**
 * Compact operating-area line for virtual businesses.
 * 1–2 states stay inline; 3+ open an elegant sheet so the list never piles up.
 */
export function OperatingCoverage({ stateLabels, themeStyle = {} }: OperatingCoverageProps) {
  const [open, setOpen] = useState(false);
  const labels = stateLabels.map((label) => label.trim()).filter(Boolean);
  if (labels.length === 0) return null;

  const preview = formatVenezuelaOperatingStatesPreview(labels, 2);
  const expandable = labels.length > 2;

  return (
    <>
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group mt-1.5 inline-flex max-w-[min(92vw,22rem)] items-center gap-1.5 rounded-full border border-[var(--menu-border)] bg-[var(--menu-surface)] px-3 py-1.5 text-left shadow-[var(--menu-shadow)] transition hover:-translate-y-0.5 sm:mt-2 sm:gap-2 sm:px-3.5 sm:py-1.5"
          aria-label={`Opera en ${labels.length} estados. Ver lista completa.`}
        >
          <MapPin
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--menu-primary)' }}
            aria-hidden
          />
          <span className="min-w-0 text-[12px] font-medium leading-4 text-[var(--menu-text-muted)] sm:text-[13px] sm:leading-5">
            <span className="font-semibold text-[var(--menu-text)]">Opera en </span>
            {preview}
          </span>
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 text-[var(--menu-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--menu-primary)]"
            aria-hidden
          />
        </button>
      ) : (
        <p className="mt-1.5 flex max-w-sm items-start justify-center gap-1 text-[12px] font-medium leading-4 text-[var(--menu-text-muted)] sm:mt-2 sm:gap-1.5 sm:text-[13px] sm:leading-5">
          <MapPin
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--menu-primary)' }}
            aria-hidden
          />
          <span>
            <span className="font-semibold text-[var(--menu-text)]">Opera en </span>
            {preview}
          </span>
        </p>
      )}

      {open
        ? createPortal(
            <OperatingCoverageSheet
              labels={labels}
              themeStyle={themeStyle}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function OperatingCoverageSheet({
  labels,
  themeStyle,
  onClose,
}: {
  labels: string[];
  themeStyle: CSSProperties;
  onClose: () => void;
}) {
  useLockBodyScroll(true);
  const closeRef = useRef<HTMLButtonElement>(null);

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
        aria-labelledby="operating-coverage-title"
        className="flex max-h-[86dvh] w-full max-w-md flex-col overflow-hidden rounded-[24px] text-[var(--menu-text,#111111)] shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
        style={{ backgroundColor: 'var(--menu-surface, #ffffff)' }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4 sm:px-6">
          <div className="min-w-0 pr-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--menu-text-muted,#6b7280)]">
              Cobertura
            </p>
            <h2
              id="operating-coverage-title"
              className="mt-1 text-xl font-extrabold leading-tight tracking-[-0.02em] sm:text-2xl"
            >
              Dónde operamos
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-[var(--menu-text-muted,#6b7280)]">
              {labels.length} {labels.length === 1 ? 'estado' : 'estados'} de Venezuela
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
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {labels.map((label) => (
              <li
                key={label}
                className="flex items-center gap-2.5 rounded-2xl border px-3.5 py-3"
                style={{
                  backgroundColor: 'var(--menu-surface-alt, #f3f4f6)',
                  borderColor: 'var(--menu-border, #e5e7eb)',
                }}
              >
                <span
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--menu-primary) 14%, transparent)',
                    color: 'var(--menu-primary)',
                  }}
                  aria-hidden
                >
                  <MapPin className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 text-[14px] font-semibold leading-5 tracking-[-0.01em]">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
