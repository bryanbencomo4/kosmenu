'use client';

import { ArrowLeft, MoreVertical, Phone, ShoppingCart } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  CHAT_THEME_DARK,
  CHAT_THEME_LIGHT,
  loadStoredChatTheme,
  resolvePreferredChatTheme,
  type ChatThemeMode,
} from './chat-theme';

type ChatAssistantSkeletonProps = {
  businessName?: string;
  logoUrl?: string | null;
  initialLetter?: string;
};

/**
 * WhatsApp-style shell shown while the assistant chunk loads.
 * Kept free of ChatAssistantView / composer / message-list imports.
 */
export function ChatAssistantSkeleton({
  businessName = 'Asistente',
  logoUrl = null,
  initialLetter = 'A',
}: ChatAssistantSkeletonProps) {
  const [theme, setTheme] = useState<ChatThemeMode>('light');
  useEffect(() => {
    setTheme(resolvePreferredChatTheme(loadStoredChatTheme()));
  }, []);
  const colors = theme === 'dark' ? CHAT_THEME_DARK : CHAT_THEME_LIGHT;

  const letter = (initialLetter || businessName || 'A').trim().charAt(0).toUpperCase() || 'A';

  return (
    <section
      className="relative z-[55] flex h-[100dvh] w-full flex-col overflow-hidden"
      style={{ backgroundColor: colors.bg, color: colors.text }}
      data-chatbot-skeleton="1"
      aria-busy="true"
      aria-label="Cargando asistente"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden sm:border-x"
        style={{ borderColor: colors.headerBorder }}
      >
        {/* Header */}
        <header
          className="flex shrink-0 items-center gap-2 px-2 py-2 sm:px-3"
          style={{
            backgroundColor: colors.header,
            borderBottom: `1px solid ${colors.headerBorder}`,
          }}
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--chat-text-muted,#667781)]">
            <ArrowLeft className="h-5 w-5" strokeWidth={2.2} aria-hidden />
          </span>
          <span
            className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: colors.send }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              letter
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold leading-tight">{businessName}</p>
            <p className="truncate text-[12px]" style={{ color: colors.textMuted }}>
              cargando…
            </p>
          </div>
          <span className="inline-flex h-9 w-9 items-center justify-center opacity-50">
            <Phone className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <span className="inline-flex h-9 w-9 items-center justify-center opacity-50">
            <ShoppingCart className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <span className="inline-flex h-9 w-9 items-center justify-center opacity-50">
            <MoreVertical className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
        </header>

        {/* Messages area */}
        <div className="relative min-h-0 flex-1 overflow-hidden px-3 py-4 sm:px-4">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            aria-hidden
            style={{
              backgroundImage: `radial-gradient(${theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'} 1px, transparent 1px)`,
              backgroundSize: '14px 14px',
            }}
          />
          <div className="relative flex flex-col gap-3">
            {/* Incoming welcome bubble */}
            <div
              className="chat-skel-pulse max-w-[78%] self-start rounded-lg rounded-tl-sm px-3 py-2.5 shadow-sm"
              style={{ backgroundColor: colors.bubbleIn }}
            >
              <div
                className="h-3 w-40 rounded-full"
                style={{ backgroundColor: colors.textMuted, opacity: 0.28 }}
              />
              <div
                className="mt-2 h-3 w-56 max-w-full rounded-full"
                style={{ backgroundColor: colors.textMuted, opacity: 0.22 }}
              />
              <div
                className="mt-2 h-3 w-28 rounded-full"
                style={{ backgroundColor: colors.textMuted, opacity: 0.18 }}
              />
            </div>
            {/* Outgoing stub */}
            <div
              className="chat-skel-pulse max-w-[62%] self-end rounded-lg rounded-tr-sm px-3 py-2.5 shadow-sm"
              style={{ backgroundColor: colors.bubbleOut, animationDelay: '120ms' }}
            >
              <div
                className="h-3 w-32 rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,0.35)' }}
              />
            </div>
            {/* Incoming stub */}
            <div
              className="chat-skel-pulse max-w-[70%] self-start rounded-lg rounded-tl-sm px-3 py-2.5 shadow-sm"
              style={{ backgroundColor: colors.bubbleIn, animationDelay: '220ms' }}
            >
              <div
                className="h-3 w-48 max-w-full rounded-full"
                style={{ backgroundColor: colors.textMuted, opacity: 0.24 }}
              />
              <div
                className="mt-2 h-3 w-36 rounded-full"
                style={{ backgroundColor: colors.textMuted, opacity: 0.18 }}
              />
            </div>
          </div>
        </div>

        {/* Composer */}
        <div
          className="flex shrink-0 items-end gap-2 px-2 py-2 sm:px-3"
          style={{
            backgroundColor: colors.composer,
            paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
          }}
        >
          <div
            className="min-h-[42px] min-w-0 flex-1 rounded-[22px] px-4 py-2.5"
            style={{ backgroundColor: colors.input }}
          >
            <div
              className="chat-skel-pulse mt-1 h-3 w-28 rounded-full"
              style={{ backgroundColor: colors.textMuted, opacity: 0.22 }}
            />
          </div>
          <div
            className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full"
            style={{ backgroundColor: colors.send }}
            aria-hidden
          >
            <span className="h-2.5 w-2.5 rounded-full bg-white/80" />
          </div>
        </div>
      </div>

      <style>{`
        .chat-skel-pulse {
          animation: chat-skel-pulse 1.2s ease-in-out infinite;
        }
        @keyframes chat-skel-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.62; }
        }
        @media (prefers-reduced-motion: reduce) {
          .chat-skel-pulse { animation: none; }
        }
      `}</style>
    </section>
  );
}
