'use client';

import type { ChatDeliveryStatus } from './chat-types';

type ChatReceiptTicksProps = {
  status?: ChatDeliveryStatus;
};

/**
 * Honest outbound receipts (not fake “human read”):
 * 1 grey = sent (queued), 2 grey = delivered (server/demo accepted),
 * 2 blue = read (assistant finished processing / replied).
 */
export function ChatReceiptTicks({ status = 'sent' }: ChatReceiptTicksProps) {
  const color =
    status === 'read' ? '#53BDEB' : 'color-mix(in srgb, var(--chat-text-muted) 90%, transparent)';
  const double = status === 'delivered' || status === 'read';

  return (
    <svg
      width={double ? 16 : 12}
      height="11"
      viewBox={double ? '0 0 16 11' : '0 0 12 11'}
      aria-hidden
      className="ml-0.5 inline-block shrink-0 align-middle"
      data-chat-receipt={status}
    >
      {double ? (
        <>
          <path
            d="M1.2 5.6 3.5 8.1 8.4 1.8"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5.2 5.6 7.5 8.1 14.2 1.5"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <path
          d="M1.4 5.6 4.1 8.2 10.4 1.6"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
