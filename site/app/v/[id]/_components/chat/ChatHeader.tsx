'use client';

import {
  ArrowLeft,
  LayoutGrid,
  MoreVertical,
  Moon,
  ShoppingBag,
  Sun,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import type { ChatThemeMode } from './chat-theme';
import {
  isChatSoundsEnabled,
  setChatSoundsEnabled,
  unlockChatSounds,
} from './chat-sound-manager';

type ChatHeaderProps = {
  businessName: string;
  logoUrl: string | null;
  initialLetter: string;
  cartCount: number;
  cartTotalLabel: string;
  theme: ChatThemeMode;
  onToggleTheme: () => void;
  onBack: () => void;
  onOpenMenu: () => void;
  onOpenCart: () => void;
  onNewConversation: () => void;
  onOpenCheckout?: () => void;
  whatsappUrl?: string | null;
  showCheckoutHint?: boolean;
  isTyping?: boolean;
  soundsEnabled?: boolean;
  onToggleSounds?: () => void;
  /** Tap avatar → full-screen photo (WhatsApp-like). */
  onOpenAvatar?: () => void;
  /** Tap name → business profile info. */
  onOpenProfile?: () => void;
};

export function ChatHeader({
  businessName,
  logoUrl,
  initialLetter,
  cartCount,
  cartTotalLabel,
  theme,
  onToggleTheme,
  onBack,
  onOpenMenu,
  onOpenCart,
  onNewConversation,
  onOpenCheckout,
  whatsappUrl = null,
  showCheckoutHint = false,
  isTyping = false,
  soundsEnabled: soundsEnabledProp,
  onToggleSounds,
  onOpenAvatar,
  onOpenProfile,
}: ChatHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [soundsOn, setSoundsOn] = useState(true);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const soundsEnabled =
    typeof soundsEnabledProp === 'boolean' ? soundsEnabledProp : soundsOn;

  useEffect(() => {
    setSoundsOn(isChatSoundsEnabled());
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(ev: MouseEvent) {
      if (!menuRef.current?.contains(ev.target as Node)) setMenuOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const iconBtn =
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--chat-text)] transition hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-send)]';

  return (
    <header
      className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 border-b px-1.5 sm:h-16 sm:px-2"
      style={{
        backgroundColor: 'var(--chat-header)',
        borderColor: 'var(--chat-header-border)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
      data-chat-header="1"
      data-chat-theme={theme}
    >
      <button
        type="button"
        className={iconBtn}
        onClick={onBack}
        aria-label="Volver al menú"
      >
        <ArrowLeft className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
      </button>

      <button
        type="button"
        className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--chat-input)] ring-1 ring-black/5 dark:ring-white/10"
        onClick={() => {
          if (logoUrl && onOpenAvatar) onOpenAvatar();
          else onOpenProfile?.();
        }}
        aria-label={logoUrl ? 'Ver foto de perfil' : 'Ver info del negocio'}
        data-chat-header-avatar="1"
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            className="grid h-full w-full place-items-center text-sm font-semibold text-[var(--chat-text)]"
            aria-hidden
          >
            {initialLetter}
          </span>
        )}
      </button>

      <button
        type="button"
        className="min-w-0 flex-1 px-2 text-left"
        onClick={() => onOpenProfile?.()}
        aria-label={`Ver info de ${businessName}`}
        data-chat-header-profile="1"
      >
        <p className="truncate text-[15.5px] font-semibold leading-tight tracking-[-0.01em] text-[var(--chat-text)]">
          {businessName}
        </p>
        <p
          className="truncate text-[12px] leading-tight text-[var(--chat-text-muted)]"
          data-chat-subtitle={isTyping ? 'typing' : 'idle'}
        >
          {isTyping ? 'escribiendo…' : 'Asistente virtual'}
        </p>
      </button>

      <button
        type="button"
        data-open-cart="1"
        data-chat-cart-button="1"
        onClick={onOpenCart}
        className={`${iconBtn} relative`}
        aria-label={
          cartCount > 0
            ? `Abrir carrito, ${cartCount} productos, total ${cartTotalLabel}`
            : 'Abrir carrito'
        }
      >
        <ShoppingBag className="h-[20px] w-[20px]" strokeWidth={2} aria-hidden />
        {cartCount > 0 ? (
          <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--chat-send)] px-0.5 text-[9px] font-bold text-[var(--chat-send-fg)]">
            {cartCount > 99 ? '99+' : cartCount}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={onOpenMenu}
        className={iconBtn}
        aria-label="Ver menú tradicional"
      >
        <LayoutGrid className="h-[20px] w-[20px]" strokeWidth={2} aria-hidden />
      </button>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className={iconBtn}
          aria-label="Más opciones"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreVertical className="h-[20px] w-[20px]" strokeWidth={2} aria-hidden />
        </button>
        {menuOpen ? (
          <div
            id={menuId}
            role="menu"
            className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[11.5rem] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] text-[var(--chat-text)] hover:bg-[color-mix(in_srgb,var(--chat-text)_6%,transparent)]"
              onClick={() => {
                setMenuOpen(false);
                onNewConversation();
              }}
            >
              Nueva conversación
            </button>
            {showCheckoutHint && onOpenCheckout ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] text-[var(--chat-text)] hover:bg-[color-mix(in_srgb,var(--chat-text)_6%,transparent)]"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenCheckout();
                }}
              >
                Continuar pedido
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] text-[var(--chat-text)] hover:bg-[color-mix(in_srgb,var(--chat-text)_6%,transparent)]"
              onClick={() => {
                setMenuOpen(false);
                onToggleTheme();
              }}
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" aria-hidden />
              ) : (
                <Moon className="h-4 w-4" aria-hidden />
              )}
              {theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
            </button>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={soundsEnabled}
              data-chat-sounds-toggle="1"
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[14px] text-[var(--chat-text)] hover:bg-[color-mix(in_srgb,var(--chat-text)_6%,transparent)]"
              onClick={() => {
                unlockChatSounds();
                const next = !soundsEnabled;
                setChatSoundsEnabled(next);
                setSoundsOn(next);
                onToggleSounds?.();
                setMenuOpen(false);
              }}
            >
              <span>Sonidos del chat</span>
              <span
                className="text-[12px] font-medium text-[var(--chat-text-muted)]"
                data-chat-sounds-state={soundsEnabled ? 'on' : 'off'}
              >
                {soundsEnabled ? 'Activados' : 'Silenciados'}
              </span>
            </button>
            {whatsappUrl ? (
              <a
                role="menuitem"
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] text-[var(--chat-text)] hover:bg-[color-mix(in_srgb,var(--chat-text)_6%,transparent)]"
                onClick={() => setMenuOpen(false)}
              >
                Hablar con el restaurante
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
