'use client';

import { useEffect, useRef } from 'react';

import { ChatMessageBubble } from './ChatMessageBubble';
import type { ChatThemeMode } from './chat-theme';
import type { ChatCartActionData, ChatMessage } from './chat-types';

/** Transparent doodle wallpaper (figures only; no solid fill). */
const CHAT_DOODLE_URL = '/chat/doodle-pattern.png';

type ChatMessageListProps = {
  messages: ChatMessage[];
  isTyping?: boolean;
  errorText?: string | null;
  theme?: ChatThemeMode;
  confirmedProposalIds?: Set<string>;
  onConfirmCartAction?: (action: ChatCartActionData) => void;
  onDismissCartAction?: (action: ChatCartActionData) => void;
  onConfigureProduct?: (productId: string) => void;
  onAddSimpleProduct?: (productId: string) => void;
  cartActionBusy?: boolean;
};

export function ChatMessageList({
  messages,
  isTyping = false,
  errorText = null,
  theme = 'light',
  confirmedProposalIds,
  onConfirmCartAction,
  onDismissCartAction,
  onConfigureProduct,
  onAddSimpleProduct,
  cartActionBusy = false,
}: ChatMessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping, errorText]);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      style={{ backgroundColor: 'var(--chat-bg)' }}
      data-chat-wallpaper="1"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        data-chat-doodle="1"
        style={{
          backgroundImage: `url('${CHAT_DOODLE_URL}')`,
          backgroundRepeat: 'repeat',
          backgroundPosition: 'top center',
          backgroundSize: '420px auto',
          // Keep doodles subtle — dense wallpaper looked noisy at higher opacity.
          opacity: theme === 'dark' ? 0.07 : 0.055,
          filter: theme === 'light' ? 'invert(1)' : 'none',
        }}
      />
      <div
        className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-0 py-2"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        data-chat-scroll="1"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col pb-1">
          {messages.map((message, index) => {
            const prev = messages[index - 1];
            const next = messages[index + 1];
            const groupedWithPrev =
              Boolean(prev) &&
              prev.role === message.role &&
              message.role !== 'system' &&
              prev.role !== 'system';
            const groupedWithNext =
              Boolean(next) &&
              next.role === message.role &&
              message.role !== 'system' &&
              next.role !== 'system';
            return (
              <ChatMessageBubble
                key={message.id}
                message={message}
                groupedWithPrev={groupedWithPrev}
                groupedWithNext={groupedWithNext}
                confirmedProposalIds={confirmedProposalIds}
                onConfirmCartAction={onConfirmCartAction}
                onDismissCartAction={onDismissCartAction}
                onConfigureProduct={onConfigureProduct}
                onAddSimpleProduct={onAddSimpleProduct}
                cartActionBusy={cartActionBusy}
              />
            );
          })}

          {isTyping ? (
            <div
              className="mt-1.5 flex justify-start px-3"
              aria-label="El asistente está escribiendo"
              data-chat-typing="1"
            >
              <div className="rounded-2xl rounded-bl-md bg-[var(--chat-bubble-in)] px-3.5 py-2.5 shadow-sm">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--chat-text-muted)] [animation-duration:900ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--chat-text-muted)] [animation-delay:120ms] [animation-duration:900ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--chat-text-muted)] [animation-delay:240ms] [animation-duration:900ms]" />
                </span>
              </div>
            </div>
          ) : null}

          {errorText ? (
            <div className="px-3 py-2" role="alert">
              <p
                className="rounded-lg px-3 py-2 text-[13px] text-[var(--chat-text)] shadow-sm"
                style={{ backgroundColor: 'var(--chat-system)' }}
              >
                {errorText}
              </p>
            </div>
          ) : null}

          <div ref={endRef} className="h-px w-full shrink-0" />
        </div>
      </div>
    </div>
  );
}
