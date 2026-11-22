import { playChatSound } from './chat-sound-manager';

export const CHAT_CART_BUTTON_SELECTOR = '[data-chat-cart-button]';

export type FlyToCartOptions = {
  /** Image / element to launch from. Preferred over `from`. */
  source?: Element | null;
  /** Explicit start rect (e.g. when the source is gone). */
  from?: { left: number; top: number; width: number; height: number } | null;
  /** Thumbnail URL; falls back to the source `<img>` src, then a plain dot. */
  imageUrl?: string | null;
  /** Flight time in ms (clamped 400–500). */
  durationMs?: number;
  /** Play the `cartAdd` synth cue (default true). */
  sound?: boolean;
};

/**
 * Finds the nearest product image inside `el` (the card the user tapped) so the
 * flying thumb starts from the picture, not the button.
 */
export function findProductImageEl(el: Element | null | undefined): Element | null {
  if (!el) return null;
  const card = el.closest('[data-chat-product-card]') ?? el.closest('article,li');
  return (
    card?.querySelector('img') ??
    card?.querySelector('[data-chat-product-image]') ??
    card ??
    el
  );
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/** Brief scale pulse on the cart button. */
export function pulseChatCartButton(): void {
  if (typeof document === 'undefined') return;
  const btn = document.querySelector<HTMLElement>(CHAT_CART_BUTTON_SELECTOR);
  if (!btn || typeof btn.animate !== 'function') return;
  try {
    btn.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.28)', offset: 0.4 },
        { transform: 'scale(1)' },
      ],
      { duration: 320, easing: 'ease-out' },
    );
  } catch {
    /* ignore */
  }
}

/**
 * Animates a floating thumb from the product image to the cart button, then
 * pulses the cart. Purely visual: never throws, never touches cart state.
 * Resolves when the animation ends (or immediately when it is skipped).
 */
export function flyToCart(opts: FlyToCartOptions = {}): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }
  if (opts.sound !== false) playChatSound('cartAdd');

  try {
    const target = document.querySelector<HTMLElement>(CHAT_CART_BUTTON_SELECTOR);
    const startRect =
      (opts.source?.isConnected ? opts.source.getBoundingClientRect() : null) ??
      opts.from ??
      null;
    if (!target || !startRect || startRect.width <= 0 || startRect.height <= 0) {
      pulseChatCartButton();
      return Promise.resolve();
    }
    if (prefersReducedMotion()) {
      pulseChatCartButton();
      return Promise.resolve();
    }

    const end = target.getBoundingClientRect();
    const size = Math.max(28, Math.min(56, Math.min(startRect.width, startRect.height)));
    const startX = startRect.left + startRect.width / 2 - size / 2;
    const startY = startRect.top + startRect.height / 2 - size / 2;
    const dx = end.left + end.width / 2 - size / 2 - startX;
    const dy = end.top + end.height / 2 - size / 2 - startY;

    const img =
      opts.imageUrl ||
      (opts.source instanceof HTMLImageElement ? opts.source.currentSrc || opts.source.src : null);

    const thumb = document.createElement('div');
    thumb.setAttribute('aria-hidden', 'true');
    thumb.setAttribute('data-chat-fly-thumb', '1');
    Object.assign(thumb.style, {
      position: 'fixed',
      left: `${startX}px`,
      top: `${startY}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '9999px',
      pointerEvents: 'none',
      zIndex: '2147483000',
      backgroundColor: 'var(--chat-send, #22c55e)',
      backgroundImage: img ? `url("${img.replace(/"/g, '%22')}")` : 'none',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      boxShadow: '0 6px 18px rgba(0,0,0,.28)',
      willChange: 'transform, opacity',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(thumb);

    const duration = Math.max(400, Math.min(500, opts.durationMs ?? 450));

    return new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        thumb.remove();
        pulseChatCartButton();
        resolve();
      };
      if (typeof thumb.animate !== 'function') {
        done();
        return;
      }
      try {
        // Arc: rise a little above the straight line mid-flight.
        const anim = thumb.animate(
          [
            { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
            {
              transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 36}px) scale(0.8)`,
              opacity: 1,
              offset: 0.5,
            },
            { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0.35 },
          ],
          { duration, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
        );
        anim.onfinish = done;
        anim.oncancel = done;
        // Safety net if the animation never fires finish (hidden tab, etc.).
        window.setTimeout(done, duration + 250);
      } catch {
        done();
      }
    });
  } catch {
    return Promise.resolve();
  }
}
