'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import type { PaymentDisplayField } from '../../../_lib/payment-method-display';

type PaymentCopyFieldsProps = {
  fields: PaymentDisplayField[];
  note?: string | null;
  /** Compact rows for dense checkout cards. */
  dense?: boolean;
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

export function PaymentCopyFields({ fields, note, dense = false }: PaymentCopyFieldsProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (fields.length === 0 && !note) return null;

  return (
    <div className={dense ? 'mt-2 space-y-1.5' : 'mt-2 space-y-2'}>
      {fields.map((field, index) => {
        const key = `${field.label}-${index}`;
        const copied = copiedKey === key;
        return (
          <div
            key={key}
            className="flex items-center gap-2 rounded-xl bg-black/[0.04] px-2.5 py-2"
          >
            <div className="min-w-0 flex-1">
              {field.label ? (
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--menu-text-muted,#6b7280)]">
                  {field.label}
                </p>
              ) : null}
              <p className="truncate text-sm font-semibold text-[var(--menu-text,#111827)]">
                {field.value}
              </p>
            </div>
            <button
              type="button"
              aria-label={copied ? 'Copiado' : `Copiar ${field.label || 'dato'}`}
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
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-black/10 bg-white px-2 text-[11px] font-bold text-[var(--menu-text,#111827)] shadow-sm active:scale-[0.98]"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Listo' : 'Copiar'}
            </button>
          </div>
        );
      })}
      {note ? (
        <p className="px-0.5 text-xs leading-5 text-[var(--menu-text-muted,#6b7280)]">{note}</p>
      ) : null}
    </div>
  );
}
