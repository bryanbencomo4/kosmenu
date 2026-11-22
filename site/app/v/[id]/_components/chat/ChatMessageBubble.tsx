'use client';

import { ChatCartActionCard } from './ChatCartActionCard';
import { ChatProductCard } from './ChatProductCard';
import { ChatReceiptTicks } from './ChatReceiptTicks';
import type { ChatCartActionData, ChatMessage } from './chat-types';

type ChatMessageBubbleProps = {
  message: ChatMessage;
  groupedWithPrev?: boolean;
  groupedWithNext?: boolean;
  confirmedProposalIds?: Set<string>;
  onConfirmCartAction?: (action: ChatCartActionData) => void;
  onDismissCartAction?: (action: ChatCartActionData) => void;
  onConfigureProduct?: (productId: string) => void;
  onAddSimpleProduct?: (productId: string) => void;
  cartActionBusy?: boolean;
};

function formatChatTime(ts: number) {
  if (!Number.isFinite(ts) || ts <= 0) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return null;
  }
}

function formatDuration(ms?: number) {
  if (!ms || ms <= 0) return '0:00';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ChatMessageBubble({
  message,
  groupedWithPrev = false,
  groupedWithNext = false,
  confirmedProposalIds,
  onConfirmCartAction,
  onDismissCartAction,
  onConfigureProduct,
  onAddSimpleProduct,
  cartActionBusy = false,
}: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const timeLabel = formatChatTime(message.createdAt);

  if (isSystem) {
    const cards = message.productCards || [];
    return (
      <div
        className="flex flex-col items-center gap-1.5 px-3 py-1"
        role="status"
        data-chat-role="system"
        data-chat-applied={cards.length ? '1' : '0'}
      >
        <p
          className="max-w-[min(100%,18rem)] rounded-md px-2.5 py-1 text-center text-[11.5px] font-medium leading-snug text-[var(--chat-text-muted)] shadow-sm"
          style={{ backgroundColor: 'var(--chat-system)' }}
        >
          {message.text}
        </p>
        {cards.map((card) => (
          <div
            key={`${message.id}-${card.product_id}`}
            className="w-full max-w-[min(100%,20.5rem)]"
          >
            <ChatProductCard card={card} />
          </div>
        ))}
      </div>
    );
  }

  const actionProductIds = new Set(
    (message.cartActions || [])
      .filter((a) => a.type === 'propose_add')
      .map((a) => a.product_id),
  );
  const standaloneCards = (message.productCards || []).filter(
    (c) => !actionProductIds.has(c.product_id),
  );
  const mediaAttachments = (message.attachments || []).filter(
    (a) => a.kind === 'image' || a.kind === 'file',
  );
  const hasProductAttachments =
    standaloneCards.length > 0 || Boolean(message.cartActions?.length);
  const hasVoice = Boolean(message.voiceUrl);
  const hasLocation = Boolean(message.location);
  const hasText = Boolean(message.text.trim());

  const radius = isUser
    ? [
        'rounded-2xl',
        groupedWithPrev ? 'rounded-tr-md' : 'rounded-tr-2xl',
        groupedWithNext ? 'rounded-br-md' : 'rounded-br-md',
      ].join(' ')
    : [
        'rounded-2xl',
        groupedWithPrev ? 'rounded-tl-md' : 'rounded-tl-2xl',
        groupedWithNext ? 'rounded-bl-md' : 'rounded-bl-md',
      ].join(' ');

  const meta = (
    <span className="mt-0.5 flex items-center justify-end gap-0.5 self-end pl-2 text-[10.5px] tabular-nums leading-none text-[var(--chat-text-muted)]">
      {timeLabel ? <span>{timeLabel}</span> : null}
      {isUser ? <ChatReceiptTicks status={message.deliveryStatus || 'sent'} /> : null}
    </span>
  );

  return (
    <div
      className={`flex w-full flex-col px-3 ${isUser ? 'items-end' : 'items-start'} ${groupedWithPrev ? 'mt-0.5' : 'mt-1.5'}`}
      data-chat-role={message.role}
    >
      {hasText || hasVoice || hasLocation || mediaAttachments.length > 0 ? (
        <div
          className={[
            'relative max-w-[min(85%,22rem)] px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-[1.4] shadow-sm',
            radius,
            isUser
              ? 'bg-[var(--chat-bubble-out)] text-[var(--chat-text)]'
              : 'bg-[var(--chat-bubble-in)] text-[var(--chat-text)]',
          ].join(' ')}
        >
          {hasVoice ? (
            <div className="mb-1 min-w-[12rem]" data-chat-voice="1">
              <audio
                controls
                preload="metadata"
                src={message.voiceUrl || undefined}
                className="h-9 w-full max-w-[16rem]"
              />
              <p className="mt-0.5 text-[11px] text-[var(--chat-text-muted)]">
                Nota de voz · {formatDuration(message.voiceDurationMs)}
              </p>
            </div>
          ) : null}
          {mediaAttachments.map((att) =>
            att.kind === 'image' ? (
              <a
                key={att.id}
                href={att.url}
                target="_blank"
                rel="noreferrer"
                className="mb-1 block overflow-hidden rounded-lg"
                data-chat-media-image="1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.url}
                  alt={att.name}
                  className="max-h-48 w-full object-cover"
                />
              </a>
            ) : (
              <a
                key={att.id}
                href={att.url}
                target="_blank"
                rel="noreferrer"
                className="mb-1 flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--chat-text)_6%,transparent)] px-2.5 py-2 text-[13px] underline-offset-2 hover:underline"
                data-chat-media-file="1"
              >
                📎 {att.name}
              </a>
            ),
          )}
          {hasLocation && message.location ? (
            <div
              className="mb-1 rounded-lg bg-[color-mix(in_srgb,var(--chat-text)_6%,transparent)] px-2.5 py-2 text-[13px]"
              data-chat-location="1"
            >
              <p className="font-medium">📍 Ubicación para delivery</p>
              <p className="text-[12px] text-[var(--chat-text-muted)]">
                {message.location.label ||
                  `${message.location.lat.toFixed(5)}, ${message.location.lng.toFixed(5)}`}
              </p>
              <a
                className="mt-1 inline-block text-[12px] font-semibold text-[var(--chat-send)] underline-offset-2 hover:underline"
                href={`https://maps.google.com/?q=${message.location.lat},${message.location.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Ver en mapa
              </a>
            </div>
          ) : null}
          {hasText ? (
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          ) : null}
          <div className="mt-1 flex justify-end">{meta}</div>
        </div>
      ) : null}

      {hasProductAttachments ? (
        <div
          className={`mt-1.5 flex w-full max-w-[min(92%,22.5rem)] flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}
          data-chat-attachments="1"
        >
          {standaloneCards.map((card) => (
            <ChatProductCard
              key={`${message.id}-${card.product_id}`}
              card={card}
              onConfigure={onConfigureProduct}
              onAddSimple={onAddSimpleProduct}
            />
          ))}
          {message.cartActions?.map((action, idx) => (
            <ChatCartActionCard
              key={`${message.id}-action-${action.proposal_id || idx}`}
              action={action}
              busy={cartActionBusy}
              confirmed={Boolean(
                action.proposal_id &&
                  confirmedProposalIds?.has(action.proposal_id),
              )}
              onConfirm={(a) => onConfirmCartAction?.(a)}
              onDismiss={onDismissCartAction}
              onConfigure={onConfigureProduct}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
