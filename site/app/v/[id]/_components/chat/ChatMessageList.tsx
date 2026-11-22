'use client';

import { ChevronsDown } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from 'react';

import { ChatMessageBubble } from './ChatMessageBubble';
import type { ChatThemeMode } from './chat-theme';
import type { ChatCartActionData, ChatMessage } from './chat-types';

/** Transparent doodle wallpaper (figures only; no solid fill). */
const CHAT_DOODLE_URL = '/chat/doodle-pattern.png';

/** Messages rendered initially (the window grows when scrolling up). */
export const CHAT_HISTORY_INITIAL_WINDOW = 40;
/** Extra messages revealed each time the user reaches the top. */
export const CHAT_HISTORY_PAGE = 30;
/** scrollTop below this (px) triggers loading older messages. */
const LOAD_OLDER_THRESHOLD_PX = 80;
/** Within this distance from the bottom the user counts as "following" the chat. */
const NEAR_BOTTOM_PX = 140;
/** Pull distance (px) at scrollTop 0 that triggers `onRefresh`. */
const PULL_REFRESH_PX = 60;
/** Keep the initial bottom pinned (images loading) until the user interacts or this elapses. */
const INITIAL_PIN_MS = 1500;

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
  /** Swipe / long-press / button reply on a bubble. */
  onReply?: (message: ChatMessage) => void;
  /** Tap a category card in a welcome/category carousel. */
  onSelectCategory?: (categoryId: string) => void;
  /** "Ver todos" under a product carousel (null = whole catalog). */
  onSeeAllCatalog?: (categoryId: string | null) => void;
  /** CTA under payment-methods card. */
  onOpenCheckout?: () => void;
  /** Full-screen image viewer. */
  onOpenImage?: (src: string, alt: string) => void;
  /** Pull-to-refresh at the very top (touch). Parent may no-op. */
  onRefresh?: () => void;
  /** Avatar for incoming voice notes (business logo). */
  voiceAvatarUrl?: string | null;
  voiceAvatarLetter?: string;
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
  onReply,
  onSelectCategory,
  onSeeAllCatalog,
  onOpenCheckout,
  onOpenImage,
  onRefresh,
  voiceAvatarUrl = null,
  voiceAvatarLetter = '?',
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const [visibleCount, setVisibleCount] = useState(CHAT_HISTORY_INITIAL_WINDOW);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  /** Floating jump-to-latest control (WhatsApp-like). */
  const [showJumpLatest, setShowJumpLatest] = useState(false);

  /** True while the viewport is at / near the bottom (updated on scroll, pre-layout). */
  const nearBottomRef = useRef(true);
  /** Snapshot taken right before prepending older messages. */
  const prependRef = useRef<{ height: number; top: number } | null>(null);
  const initialPinRef = useRef(true);
  const prevLenRef = useRef(0);
  const prevLastIdRef = useRef<string | null>(null);
  const pullStartRef = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);

  const total = messages.length;
  const windowSize = Math.min(visibleCount, total);
  const offset = total - windowSize;
  const visible = offset > 0 ? messages.slice(-visibleCount) : messages;
  const hasOlder = offset > 0;

  const pinTimerRef = useRef<number | null>(null);
  /** Pin to the bottom while late images lay out; auto-released after a short window. */
  const armInitialPin = useCallback(() => {
    initialPinRef.current = true;
    if (pinTimerRef.current !== null) window.clearTimeout(pinTimerRef.current);
    pinTimerRef.current = window.setTimeout(() => {
      pinTimerRef.current = null;
      initialPinRef.current = false;
    }, INITIAL_PIN_MS);
  }, []);

  const scrollToEnd = useCallback((behavior: ScrollBehavior) => {
    const el = scrollRef.current;
    if (!el) return;
    if (behavior === 'auto') {
      el.scrollTop = el.scrollHeight;
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
    nearBottomRef.current = true;
    setShowJumpLatest(false);
  }, []);

  // --- Bottom-first on mount / empty→nonempty / append ------------------------
  useLayoutEffect(() => {
    const lastId = messages.length ? messages[messages.length - 1]!.id : null;
    const prevLen = prevLenRef.current;
    const prevLastId = prevLastIdRef.current;
    prevLenRef.current = messages.length;
    prevLastIdRef.current = lastId;

    if (messages.length === 0) return;

    if (prevLen === 0) {
      // First paint with content: jump to the end instantly (no animated scroll).
      armInitialPin();
      nearBottomRef.current = true;
      scrollToEnd('auto');
      return;
    }

    if (messages.length < prevLen) {
      // Conversation reset / trimmed: back to a fresh window pinned at the bottom.
      setVisibleCount(CHAT_HISTORY_INITIAL_WINDOW);
      armInitialPin();
      nearBottomRef.current = true;
      scrollToEnd('auto');
      return;
    }

    const appended = messages.length > prevLen && lastId !== prevLastId;
    if (appended) {
      const last = messages[messages.length - 1]!;
      // Own message always follows; others only if the user was already at the bottom.
      if (nearBottomRef.current || last.role === 'user') {
        scrollToEnd('smooth');
      }
    }
  }, [messages, scrollToEnd, armInitialPin]);

  // Typing indicator / error bubble: keep them visible only if following the chat.
  useLayoutEffect(() => {
    if (!isTyping && !errorText) return;
    if (nearBottomRef.current) scrollToEnd('smooth');
  }, [isTyping, errorText, scrollToEnd]);

  // Restore position after older messages were prepended.
  useLayoutEffect(() => {
    const snap = prependRef.current;
    const el = scrollRef.current;
    if (!snap || !el) return;
    prependRef.current = null;
    el.scrollTop = el.scrollHeight - snap.height + snap.top;
  }, [visibleCount]);

  // Late layout shifts (images) during the initial settle keep the bottom pinned.
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const release = () => {
      initialPinRef.current = false;
    };
    el.addEventListener('wheel', release, { passive: true });
    el.addEventListener('touchstart', release, { passive: true });
    el.addEventListener('keydown', release);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        if (initialPinRef.current) el.scrollTop = el.scrollHeight;
      });
      ro.observe(content);
    }
    return () => {
      // pinTimerRef only flips a ref; letting it fire after unmount is harmless
      // (and clearing it here would break StrictMode's double effect run).
      el.removeEventListener('wheel', release);
      el.removeEventListener('touchstart', release);
      el.removeEventListener('keydown', release);
      ro?.disconnect();
    };
  }, []);

  useEffect(
    () => () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    },
    [],
  );

  // --- Scroll: track "near bottom" + load older history at the top ------------
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near =
      el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    setShowJumpLatest(!near);
    if (
      el.scrollTop < LOAD_OLDER_THRESHOLD_PX &&
      hasOlder &&
      prependRef.current === null &&
      !initialPinRef.current
    ) {
      prependRef.current = { height: el.scrollHeight, top: el.scrollTop };
      setVisibleCount((c) => c + CHAT_HISTORY_PAGE);
    }
  }, [hasOlder]);

  // --- Pull-to-refresh (touch, only when already at the very top) -------------
  const onTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!onRefresh || refreshing || !el || el.scrollTop > 0) {
        pullStartRef.current = null;
        return;
      }
      pullStartRef.current = e.touches[0]?.clientY ?? null;
    },
    [onRefresh, refreshing],
  );

  const onTouchMove = useCallback((e: ReactTouchEvent<HTMLDivElement>) => {
    const startY = pullStartRef.current;
    const el = scrollRef.current;
    if (startY === null || !el) return;
    if (el.scrollTop > 0) {
      pullStartRef.current = null;
      pullRef.current = 0;
      setPull(0);
      return;
    }
    const dy = (e.touches[0]?.clientY ?? startY) - startY;
    const next = dy > 0 ? Math.min(dy, 120) : 0;
    pullRef.current = next;
    setPull(next > 8 ? next * 0.5 : 0);
  }, []);

  const onTouchEnd = useCallback(() => {
    const dy = pullRef.current;
    pullStartRef.current = null;
    pullRef.current = 0;
    setPull(0);
    if (!onRefresh || dy <= PULL_REFRESH_PX) return;
    setRefreshing(true);
    try {
      onRefresh();
    } catch {
      /* parent refresh is best-effort */
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      setRefreshing(false);
    }, 700);
  }, [onRefresh]);

  const showPullIndicator = refreshing || pull > 0;

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
      {showPullIndicator ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
          style={{ transform: `translateY(${refreshing ? 8 : Math.min(pull, 56)}px)` }}
          data-chat-pull-indicator="1"
          role="status"
          aria-label={refreshing ? 'Actualizando' : 'Suelta para actualizar'}
        >
          <span
            className={`h-6 w-6 rounded-full border-2 border-[var(--chat-send)] border-t-transparent bg-[var(--chat-card)] shadow ${
              refreshing ? 'animate-spin' : ''
            }`}
            style={
              refreshing ? undefined : { transform: `rotate(${Math.round(pull * 6)}deg)` }
            }
          />
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain px-0 py-2"
        // We restore scroll manually when prepending history; native anchoring would double-apply.
        style={{ overflowAnchor: 'none' }}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        data-chat-scroll="1"
        data-chat-history-window={visibleCount}
        data-chat-history-more={hasOlder ? '1' : '0'}
        onScroll={onScroll}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div ref={contentRef} className="mx-auto flex w-full max-w-5xl flex-col pb-1">
          {visible.map((message, index) => {
            const globalIndex = offset + index;
            const prev = messages[globalIndex - 1];
            const next = messages[globalIndex + 1];
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
                onReply={onReply}
                onSelectCategory={onSelectCategory}
                onSeeAllCatalog={onSeeAllCatalog}
                onOpenCheckout={onOpenCheckout}
                onOpenImage={onOpenImage}
                voiceAvatarUrl={voiceAvatarUrl}
                voiceAvatarLetter={voiceAvatarLetter}
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

      {showJumpLatest ? (
        <button
          type="button"
          data-chat-jump-latest="1"
          aria-label="Ir al mensaje más reciente"
          onClick={() => scrollToEnd('smooth')}
          className="absolute bottom-3 right-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--chat-card-border)] bg-[var(--chat-card)] text-[var(--chat-text-muted)] shadow-md transition hover:bg-[color-mix(in_srgb,var(--chat-text)_6%,var(--chat-card))] active:scale-95"
        >
          <ChevronsDown className="h-5 w-5" strokeWidth={2.2} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
