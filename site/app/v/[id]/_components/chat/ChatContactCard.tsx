'use client';

import type { ChatContactCardData } from './chat-contact';

type ChatContactCardProps = {
  contact: ChatContactCardData;
};

/**
 * WhatsApp Business–style contact share card:
 * avatar + name + "Cuenta de empresa" + "Mensaje" (no "Ver la empresa").
 */
export function ChatContactCard({ contact }: ChatContactCardProps) {
  const name = (contact.businessName || contact.label || 'Restaurante').trim();
  const initial = name.charAt(0).toUpperCase() || 'R';

  return (
    <div
      className="w-full max-w-[min(100%,18.5rem)] overflow-hidden rounded-xl shadow-sm"
      data-chat-contact="1"
      style={{
        backgroundColor: 'var(--chat-bubble-out)',
        color: 'var(--chat-text)',
      }}
    >
      <div className="flex items-center gap-3 px-3 py-3">
        {contact.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={contact.avatarUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full object-cover"
            data-chat-contact-avatar="1"
          />
        ) : (
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-[18px] font-bold"
            style={{
              backgroundColor: 'var(--chat-send)',
              color: 'var(--chat-send-fg)',
            }}
            aria-hidden
          >
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[15px] font-semibold leading-tight"
            style={{ color: 'var(--chat-send)' }}
            data-chat-contact-name="1"
          >
            {name}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-tight text-[var(--chat-text-muted)]">
            Cuenta de empresa
          </p>
        </div>
      </div>

      <div
        className="border-t"
        style={{
          borderColor: 'color-mix(in srgb, var(--chat-text) 14%, transparent)',
        }}
      >
        <a
          href={contact.whatsappUrl}
          target="_blank"
          rel="noreferrer noopener"
          data-chat-contact-whatsapp="1"
          className="flex w-full items-center justify-center px-3 py-2.5 text-[15px] font-medium active:opacity-80"
          style={{ color: 'var(--chat-send)' }}
        >
          Mensaje
        </a>
      </div>
    </div>
  );
}
