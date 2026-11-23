'use client';

import { useEffect } from 'react';

import {
  buildWhatsAppHref,
  openWhatsAppChat,
} from '../../../../_lib/whatsapp-href';
import { phoneDigitsForCall, phoneDigitsForWhatsApp } from './chat-format';

export type ChatPhoneAction = {
  /** Original text as shown in the bubble (e.g. "+58 414-0821635"). */
  display: string;
  /** Raw matched substring (may equal display). */
  raw: string;
};

type ChatPhoneActionSheetProps = {
  phone: ChatPhoneAction | null;
  onClose: () => void;
};

export function ChatPhoneActionSheet({
  phone,
  onClose,
}: ChatPhoneActionSheetProps) {
  useEffect(() => {
    if (!phone) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phone, onClose]);

  if (!phone) return null;

  const waDigits = phoneDigitsForWhatsApp(phone.raw);
  const callDigits = phoneDigitsForCall(phone.raw);
  const display = phone.display.trim() || phone.raw;
  const waHref = buildWhatsAppHref(waDigits);
  const telHref = callDigits ? `tel:+${callDigits}` : '';

  return (
    <div
      className="absolute inset-0 z-[80] flex items-end justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10"
      data-chat-phone-sheet="1"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/45"
        data-chat-phone-sheet-backdrop="1"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Opciones del número"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-[1.35rem] shadow-xl"
        style={{
          backgroundColor: 'var(--chat-card)',
          color: 'var(--chat-text)',
          border: '1px solid var(--chat-card-border)',
        }}
        data-chat-phone-sheet-panel="1"
      >
        <p
          className="px-5 pb-1 pt-4 text-[13px] leading-snug text-[var(--chat-text-muted)]"
          data-chat-phone-sheet-caption="1"
        >
          Este número de teléfono está en WhatsApp
        </p>
        <div className="flex flex-col pb-2 pt-1">
          <a
            href={waHref || undefined}
            data-chat-phone-sheet-chat="1"
            className="px-5 py-3.5 text-left text-[16px] leading-snug text-[var(--chat-text)] active:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
            onClick={(event) => {
              if (!waDigits) {
                event.preventDefault();
                return;
              }
              event.preventDefault();
              openWhatsAppChat(waDigits);
              onClose();
            }}
          >
            Chatear con {display}
          </a>
          <a
            href={telHref || undefined}
            data-chat-phone-sheet-call="1"
            className="px-5 py-3.5 text-left text-[16px] leading-snug text-[var(--chat-text)] active:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
            onClick={(event) => {
              if (!telHref) {
                event.preventDefault();
                return;
              }
              // Native dialer — WhatsApp VoIP is not available from the web view.
              onClose();
            }}
          >
            Llamar en WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
