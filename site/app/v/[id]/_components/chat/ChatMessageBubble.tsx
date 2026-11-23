'use client';

import { Reply } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { ChatCartActionCard } from './ChatCartActionCard';
import { ChatCategoryCarousel } from './ChatCategoryCarousel';
import { ChatCloseSaleCard } from './ChatCloseSaleCard';
import { ChatContactCard } from './ChatContactCard';
import { ChatHoursCard } from './ChatHoursCard';
import { ChatPaymentMethodsCard } from './ChatPaymentMethodsCard';
import { ChatProductCard } from './ChatProductCard';
import { ChatProductCarousel } from './ChatProductCarousel';
import { ChatReceiptTicks } from './ChatReceiptTicks';
import { ChatVoiceNote } from './ChatVoiceNote';
import { formatChatText } from './chat-format';
import { staticMapPreviewUrl } from './chat-location';
import {
  REPLY_LONG_PRESS_MS,
  REPLY_SWIPE_SLOP_PX,
  REPLY_SWIPE_THRESHOLD_PX,
  classifyReplySwipe,
  isReplyGestureBlockedTarget,
  isReplySwipeArmed,
  replySwipeOffset,
} from './chat-gestures';
import type { ChatCartActionData, ChatMessage } from './chat-types';

type ReplyGestureState = {
  pointerId: number;
  startX: number;
  startY: number;
  phase: 'pending' | 'swipe' | 'dead';
  dx: number;
};

/**
 * Swipe-right (and touch long-press) to reply on a bubble.
 * - `touch-action: pan-y` (set by the caller) keeps vertical chat scroll native;
 *   if the browser starts scrolling it sends pointercancel and we bail out.
 * - Pointer capture is taken ONLY once the gesture is a confirmed horizontal swipe.
 * - Gestures starting on controls / `[data-chat-h-scroll]` are ignored.
 * Handlers are React props, so nothing leaks past unmount; the long-press timer is
 * cleared in an effect cleanup.
 */
function useReplyGesture(enabled: boolean, onTrigger: () => void) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const stateRef = useRef<ReplyGestureState | null>(null);
  const longPressRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const triggerRef = useRef(onTrigger);
  triggerRef.current = onTrigger;

  const clearLongPress = useCallback(() => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  const reset = useCallback(() => {
    clearLongPress();
    stateRef.current = null;
    setDragging(false);
    setOffset(0);
  }, [clearLongPress]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (isReplyGestureBlockedTarget(event.target as Element | null)) return;
      longPressFiredRef.current = false;
      stateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        phase: 'pending',
        dx: 0,
      };
      clearLongPress();
      // Long-press is touch/pen only (a mouse "hold" is just text selection).
      if (event.pointerType !== 'mouse') {
        longPressRef.current = window.setTimeout(() => {
          longPressRef.current = null;
          const st = stateRef.current;
          if (!st || st.phase !== 'pending') return;
          longPressFiredRef.current = true;
          st.phase = 'dead';
          try {
            window.getSelection()?.removeAllRanges();
          } catch {
            /* ignore */
          }
          try {
            navigator.vibrate?.(8);
          } catch {
            /* ignore */
          }
          triggerRef.current();
        }, REPLY_LONG_PRESS_MS);
      }
    },
    [enabled, clearLongPress],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const st = stateRef.current;
      if (!st || st.pointerId !== event.pointerId || st.phase === 'dead') return;
      const dx = event.clientX - st.startX;
      const dy = event.clientY - st.startY;
      if (st.phase === 'pending') {
        const verdict = classifyReplySwipe(dx, dy);
        if (verdict === 'pending') return;
        // Any real movement cancels the long-press (it's a scroll or swipe).
        if (Math.abs(dx) > REPLY_SWIPE_SLOP_PX || Math.abs(dy) > REPLY_SWIPE_SLOP_PX) {
          clearLongPress();
        }
        if (verdict === 'ignore') {
          st.phase = 'dead';
          return;
        }
        st.phase = 'swipe';
        setDragging(true);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      }
      st.dx = dx;
      setOffset(replySwipeOffset(dx));
    },
    [clearLongPress],
  );

  const end = useCallback(
    (event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      const st = stateRef.current;
      if (!st || st.pointerId !== event.pointerId) return;
      const fire = !cancelled && st.phase === 'swipe' && isReplySwipeArmed(st.dx);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      reset();
      if (fire) triggerRef.current();
    },
    [reset],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => end(event, false),
    [end],
  );
  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => end(event, true),
    [end],
  );
  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    // Suppress the native touch callout right after our long-press fired.
    if (longPressFiredRef.current) event.preventDefault();
  }, []);

  return {
    offset,
    dragging,
    armed: dragging && offset >= REPLY_SWIPE_THRESHOLD_PX,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu },
  };
}

function replyRoleLabel(role: ChatMessage['role']) {
  return role === 'user' ? 'Tú' : 'Asistente';
}

type ChatMessageBubbleProps = {
  message: ChatMessage;
  /**
   * Enables swipe-right / long-press / "Responder" button on this bubble.
   * Parent should set composer reply state (see `buildChatReplyRef`).
   */
  onReply?: (message: ChatMessage) => void;
  groupedWithPrev?: boolean;
  groupedWithNext?: boolean;
  confirmedProposalIds?: Set<string>;
  onConfirmCartAction?: (action: ChatCartActionData) => void;
  onDismissCartAction?: (action: ChatCartActionData) => void;
  /** Merchant panel: render cart proposals without client CTAs. */
  cartActionsReadOnly?: boolean;
  onConfigureProduct?: (productId: string) => void;
  onAddSimpleProduct?: (productId: string) => void;
  cartActionBusy?: boolean;
  /** Tap a category in `message.catalogCategories`. */
  onSelectCategory?: (categoryId: string) => void;
  /** "Ver todos" on a product carousel; null = whole catalog. */
  onSeeAllCatalog?: (categoryId: string | null) => void;
  /** CTA under payment-methods card. */
  onOpenCheckout?: () => void;
  /** Close-sale: guest wants more complements. */
  onCloseSaleWantMore?: (messageId: string) => void;
  /** Close-sale: guest is ready to pay (skip menu upsell sheet). */
  onCloseSaleReadyToPay?: (messageId: string) => void;
  /** Full-screen image viewer (product / attachment / avatar). */
  onOpenImage?: (src: string, alt: string) => void;
  /** Avatar for incoming WhatsApp-like voice notes. */
  voiceAvatarUrl?: string | null;
  voiceAvatarLetter?: string;
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

export function ChatMessageBubble({
  message,
  groupedWithPrev = false,
  groupedWithNext = false,
  confirmedProposalIds,
  onConfirmCartAction,
  onDismissCartAction,
  cartActionsReadOnly = false,
  onConfigureProduct,
  onAddSimpleProduct,
  cartActionBusy = false,
  onReply,
  onSelectCategory,
  onSeeAllCatalog,
  onOpenCheckout,
  onCloseSaleWantMore,
  onCloseSaleReadyToPay,
  onOpenImage,
  voiceAvatarUrl = null,
  voiceAvatarLetter = '?',
}: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const timeLabel = formatChatTime(message.createdAt);
  const replyEnabled = Boolean(onReply) && !isSystem;
  const paymentMethods = message.paymentMethods || [];
  const hoursSchedule = message.hoursSchedule || null;
  const contactCard = message.contactCard || null;
  // Hooks must run before the system-message early return below.
  const replyGesture = useReplyGesture(replyEnabled, () => onReply?.(message));

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
            <ChatProductCard card={card} onOpenImage={onOpenImage} />
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
  const catalogCategories = message.catalogCategories ?? [];
  const catalogProducts = message.catalogProducts ?? [];
  const closeSale = message.closeSale ?? null;
  const showCatalogProducts =
    catalogProducts.length > 0 &&
    (!closeSale || closeSale.status === 'answered_more');
  const hasCartActions = Boolean(message.cartActions?.length);
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
            'group relative max-w-[min(85%,22rem)] px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-[1.4] shadow-sm',
            radius,
            isUser
              ? 'bg-[var(--chat-bubble-out)] text-[var(--chat-text)]'
              : 'bg-[var(--chat-bubble-in)] text-[var(--chat-text)]',
            replyEnabled ? 'touch-pan-y' : '',
            replyGesture.dragging ? 'select-none' : '',
            replyGesture.dragging ? '' : 'transition-transform duration-150 ease-out',
          ].join(' ')}
          style={
            replyGesture.offset > 0
              ? { transform: `translateX(${replyGesture.offset}px)` }
              : undefined
          }
          data-chat-bubble="1"
          data-chat-reply-armed={replyGesture.armed ? '1' : undefined}
          {...(replyEnabled ? replyGesture.handlers : {})}
        >
          {replyEnabled ? (
            <>
              {/* Swipe affordance, revealed to the left of the bubble while dragging. */}
              <span
                aria-hidden
                className="pointer-events-none absolute right-full top-1/2 mr-2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[var(--chat-text-muted)]"
                style={{
                  opacity: Math.min(1, replyGesture.offset / REPLY_SWIPE_THRESHOLD_PX),
                  transform: `translateY(-50%) scale(${replyGesture.armed ? 1.15 : 0.7 + 0.3 * Math.min(1, replyGesture.offset / REPLY_SWIPE_THRESHOLD_PX)})`,
                  backgroundColor: replyGesture.armed
                    ? 'color-mix(in srgb, var(--chat-send) 22%, transparent)'
                    : 'color-mix(in srgb, var(--chat-text) 8%, transparent)',
                  color: replyGesture.armed ? 'var(--chat-send)' : undefined,
                }}
                data-chat-reply-icon="1"
              >
                <Reply className="h-4 w-4" strokeWidth={2.1} />
              </span>
              {/* Non-gesture path: keyboard / screen reader / desktop hover. */}
              <button
                type="button"
                aria-label={`Responder al mensaje de ${replyRoleLabel(message.role).toLowerCase()}`}
                className={[
                  // Invisible + click-through until hover/focus so it never eats stray touches.
                  'pointer-events-none absolute top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[var(--chat-text-muted)] opacity-0 transition-opacity hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)] focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--chat-send)] group-hover:pointer-events-auto group-hover:opacity-100',
                  isUser ? 'right-full' : 'left-full',
                ].join(' ')}
                onClick={() => onReply?.(message)}
                data-chat-reply-button="1"
              >
                <Reply className="h-4 w-4" strokeWidth={2.1} aria-hidden />
              </button>
            </>
          ) : null}
          {!isUser && message.senderLabel ? (
            <p
              className="mb-0.5 text-[12.5px] font-semibold leading-tight"
              style={{
                color:
                  message.senderLabel === 'Cliente'
                    ? 'var(--chat-link)'
                    : 'var(--chat-send)',
              }}
              data-chat-sender-label="1"
            >
              {message.senderLabel}
            </p>
          ) : null}
          {message.replyTo ? (
            <div
              className="mb-1 max-w-full overflow-hidden rounded-md border-l-[3px] border-[var(--chat-send)] bg-[color-mix(in_srgb,var(--chat-text)_7%,transparent)] px-2 py-1"
              data-chat-reply-quote="1"
            >
              <p className="text-[11.5px] font-semibold leading-tight text-[var(--chat-send)]">
                {replyRoleLabel(message.replyTo.role)}
              </p>
              <p className="line-clamp-2 break-words text-[12.5px] leading-snug text-[var(--chat-text-muted)]">
                {message.replyTo.preview}
              </p>
            </div>
          ) : null}
          {hasVoice ? (
            <div className="mb-1">
              <ChatVoiceNote
                src={message.voiceUrl}
                durationMs={message.voiceDurationMs}
                pending={message.voicePending}
                incoming={!isUser}
                avatarUrl={voiceAvatarUrl}
                avatarLetter={voiceAvatarLetter}
              />
            </div>
          ) : null}
          {mediaAttachments.map((att) =>
            att.kind === 'image' ? (
              att.url ? (
                <button
                  key={att.id}
                  type="button"
                  className="mb-1 block w-full overflow-hidden rounded-lg text-left"
                  data-chat-media-image="1"
                  onClick={() => onOpenImage?.(att.url, att.name)}
                  aria-label={`Ver ${att.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={att.url}
                    alt={att.name}
                    className="max-h-48 w-full object-cover"
                  />
                </button>
              ) : (
                <div
                  key={att.id}
                  className="mb-1 flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--chat-text)_6%,transparent)] px-2.5 py-2 text-[13px] text-[var(--chat-text-muted)]"
                  data-chat-media-image-missing="1"
                >
                  📷 {att.name || 'Imagen'} (vista no disponible)
                </div>
              )
            ) : att.url ? (
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
            ) : (
              <div
                key={att.id}
                className="mb-1 flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--chat-text)_6%,transparent)] px-2.5 py-2 text-[13px] text-[var(--chat-text-muted)]"
                data-chat-media-file="1"
              >
                📎 {att.name}
              </div>
            ),
          )}
          {hasLocation && message.location ? (
            <div
              className="mb-1 w-full max-w-[16.5rem] overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--chat-text)_6%,transparent)]"
              data-chat-location="1"
              data-chat-location-kind={message.location.kind || 'customer'}
            >
              <a
                href={
                  message.location.mapsUrl ||
                  `https://maps.google.com/?q=${message.location.lat},${message.location.lng}`
                }
                target="_blank"
                rel="noreferrer"
                className="block"
                data-chat-location-map="1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={staticMapPreviewUrl(
                    message.location.lat,
                    message.location.lng,
                  )}
                  alt=""
                  className="h-[120px] w-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </a>
              <div className="px-2.5 py-2 text-[13px]">
                <p className="font-semibold leading-snug text-[var(--chat-text)]">
                  {message.location.kind === 'business'
                    ? '📍 Ubicación del local'
                    : '📍 Ubicación para delivery'}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--chat-text-muted)]">
                  {message.location.address ||
                    message.location.label ||
                    `${message.location.lat.toFixed(5)}, ${message.location.lng.toFixed(5)}`}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  <a
                    className="text-[12px] font-semibold text-[var(--chat-send)] underline-offset-2 hover:underline"
                    href={
                      message.location.mapsUrl ||
                      `https://maps.google.com/?q=${message.location.lat},${message.location.lng}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir en Maps
                  </a>
                  {message.location.directionsUrl ? (
                    <a
                      className="text-[12px] font-semibold text-[var(--chat-send)] underline-offset-2 hover:underline"
                      href={message.location.directionsUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Cómo llegar
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          {hasText ? (
            <div className="break-words" data-chat-text="1">
              {formatChatText(message.text)}
            </div>
          ) : null}
          <div className="mt-1 flex justify-end">{meta}</div>
        </div>
      ) : null}

      {message.sticker ? (
        <div
          className="mt-1 select-none text-[64px] leading-none"
          role="img"
          aria-label={message.sticker.label || 'Sticker'}
          data-chat-sticker={message.sticker.id}
        >
          {message.sticker.id || message.sticker.label}
        </div>
      ) : null}

      {catalogCategories.length > 0 ? (
        <div
          className="-mx-3 mt-1.5 w-[calc(100%+1.5rem)] max-w-5xl"
          data-chat-catalog-categories="1"
        >
          <ChatCategoryCarousel
            categories={catalogCategories}
            onSelectCategory={(id) => onSelectCategory?.(id)}
          />
        </div>
      ) : null}

      {showCatalogProducts || standaloneCards.length > 0 ? (
        <div
          className="-mx-3 mt-1.5 w-[calc(100%+1.5rem)] max-w-5xl"
          data-chat-catalog-products="1"
        >
          {showCatalogProducts ? (
            <ChatProductCarousel
              products={catalogProducts}
              onConfigure={onConfigureProduct}
              onAddSimple={onAddSimpleProduct}
              onOpenImage={onOpenImage}
              onSeeAll={
                onSeeAllCatalog
                  ? () => onSeeAllCatalog(message.catalogCategoryId ?? null)
                  : undefined
              }
            />
          ) : (
            <ChatProductCarousel
              products={standaloneCards}
              onConfigure={onConfigureProduct}
              onAddSimple={onAddSimpleProduct}
              onOpenImage={onOpenImage}
              onSeeAll={
                onSeeAllCatalog ? () => onSeeAllCatalog(null) : undefined
              }
            />
          )}
        </div>
      ) : null}

      {closeSale ? (
        <div
          className={`mt-1.5 flex w-full max-w-[min(92%,22.5rem)] flex-col ${isUser ? 'items-end' : 'items-start'}`}
          data-chat-close-sale-block="1"
        >
          <ChatCloseSaleCard
            prompt={closeSale}
            busy={cartActionBusy}
            onWantMore={() => onCloseSaleWantMore?.(message.id)}
            onReadyToPay={() => onCloseSaleReadyToPay?.(message.id)}
          />
        </div>
      ) : null}

      {paymentMethods.length > 0 ? (
        <div
          className={`mt-1.5 flex w-full max-w-[min(92%,22.5rem)] flex-col ${isUser ? 'items-end' : 'items-start'}`}
          data-chat-payment-block="1"
        >
          <ChatPaymentMethodsCard
            methods={paymentMethods}
            onOpenCheckout={onOpenCheckout}
          />
        </div>
      ) : null}

      {hoursSchedule ? (
        <div
          className={`mt-1.5 flex w-full max-w-[min(92%,22.5rem)] flex-col ${isUser ? 'items-end' : 'items-start'}`}
          data-chat-hours-block="1"
        >
          <ChatHoursCard hours={hoursSchedule} />
        </div>
      ) : null}

      {contactCard ? (
        <div
          className={`mt-1.5 flex w-full max-w-[min(92%,22.5rem)] flex-col ${isUser ? 'items-end' : 'items-start'}`}
          data-chat-contact-block="1"
        >
          <ChatContactCard contact={contactCard} />
        </div>
      ) : null}

      {hasCartActions ? (
        <div
          className={`mt-1.5 flex w-full max-w-[min(92%,22.5rem)] flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}
          data-chat-attachments="1"
        >
          {message.cartActions?.map((action, idx) => (
            <ChatCartActionCard
              key={`${message.id}-action-${action.proposal_id || idx}`}
              action={action}
              busy={cartActionBusy}
              confirmed={Boolean(
                action.proposal_id &&
                  confirmedProposalIds?.has(action.proposal_id),
              )}
              readOnly={cartActionsReadOnly}
              onConfirm={(a) => onConfirmCartAction?.(a)}
              onDismiss={onDismissCartAction}
              onConfigure={onConfigureProduct}
              onOpenImage={onOpenImage}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
