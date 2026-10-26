'use client';

import { Check, Copy, Info } from 'lucide-react';
import { useState } from 'react';

import type { PaymentDisplayField } from '../../../_lib/payment-method-display';

type PaymentCopyFieldsProps = {
  fields: PaymentDisplayField[];
  note?: string | null;
  /** Compact rows for dense checkout cards. */
  dense?: boolean;
  /**
   * `copy` (default): clipboard button per field.
   * `info`: tip/info icon only — for cash notes that are not meant to be copied.
   */
  mode?: 'copy' | 'info';
};

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

export function PaymentCopyFields({
  fields,
  note,
  dense = false,
  mode = 'copy',
}: PaymentCopyFieldsProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const infoOnly = mode === 'info';

  if (fields.length === 0 && !note) return null;

  if (infoOnly) {
    const tip =
      note?.trim() ||
      fields
        .map((field) => field.value.trim())
        .filter(Boolean)
        .join(' · ') ||
      null;
    if (!tip) return null;

    return (
      <div
        className={
          dense
            ? 'mt-2 flex items-start gap-2.5 rounded-xl px-2.5 py-2'
            : 'mt-2 flex items-start gap-2.5 rounded-xl px-3 py-2.5'
        }
        style={{
          backgroundColor: 'color-mix(in srgb, var(--menu-text) 8%, transparent)',
        }}
      >
        <span
          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg"
          style={{
            color: 'var(--menu-text-muted)',
            backgroundColor: 'color-mix(in srgb, var(--menu-text) 10%, transparent)',
          }}
          aria-hidden
        >
          <Info className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <p className="min-w-0 flex-1 text-sm leading-5" style={{ color: 'var(--menu-text-muted)' }}>
          {tip}
        </p>
      </div>
    );
  }

  return (
    <div className={dense ? 'mt-2 space-y-1.5' : 'mt-2 space-y-2'}>
      {fields.map((field, index) => {
        const key = `${field.label}-${index}`;
        const copied = copiedKey === key;
        return (
          <div
            key={key}
            className="flex items-center gap-2 rounded-xl px-2.5 py-2"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--menu-text) 8%, transparent)',
            }}
          >
            <div className="min-w-0 flex-1">
              {field.label ? (
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--menu-text-muted)' }}
                >
                  {field.label}
                </p>
              ) : null}
              <p
                className="truncate text-sm font-semibold"
                style={{ color: 'var(--menu-text)' }}
              >
                {field.value}
              </p>
            </div>
            <button
              type="button"
              aria-label={copied ? 'Copiado' : `Copiar ${field.label || 'dato'}`}
              title={copied ? 'Copiado' : 'Copiar'}
              onClick={async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const ok = await copyText(field.value);
                if (!ok) return;
                setCopiedKey(key);
                window.setTimeout(() => {
                  setCopiedKey((current) => (current === key ? null : current));
                }, 1400);
              }}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg active:scale-[0.96]"
              style={{
                color: copied ? '#34d399' : 'var(--menu-text)',
                backgroundColor: 'color-mix(in srgb, var(--menu-text) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--menu-text) 18%, transparent)',
              }}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              ) : (
                <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />
              )}
            </button>
          </div>
        );
      })}
      {note ? (
        <p className="px-0.5 text-xs leading-5" style={{ color: 'var(--menu-text-muted)' }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
