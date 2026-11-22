'use client';

import { MessageCircle } from 'lucide-react';

import type { ChatContactCardData } from './chat-contact';

type ChatContactCardProps = {
  contact: ChatContactCardData;
};

export function ChatContactCard({ contact }: ChatContactCardProps) {
  return (
    <div
      className="w-full max-w-[min(100%,22.5rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] shadow-sm"
      data-chat-contact="1"
    >
      <div className="px-3 py-2.5">
        <p className="text-[13px] font-semibold text-[var(--chat-text)]">
          {contact.label}
        </p>
        {contact.phoneDisplay ? (
          <p className="mt-0.5 text-[12px] text-[var(--chat-text-muted)]">
            {contact.phoneDisplay}
          </p>
        ) : (
          <p className="mt-0.5 text-[12px] text-[var(--chat-text-muted)]">
            Te conectamos con una persona del local por WhatsApp.
          </p>
        )}
      </div>
      <div className="border-t border-[var(--chat-card-border)] p-2">
        <a
          href={contact.whatsappUrl}
          target="_blank"
          rel="noreferrer noopener"
          data-chat-contact-whatsapp="1"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--chat-send)] px-3 py-2 text-[13px] font-semibold text-[var(--chat-send-fg)] active:opacity-90"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          Abrir WhatsApp
        </a>
      </div>
    </div>
  );
}
