/**
 * WhatsApp chat links that work with both WhatsApp and WhatsApp Business.
 *
 * Prefer `api.whatsapp.com/send` over `wa.me`:
 * - skips the wa.me redirect that can mangle emoji text
 * - associates more reliably when only WhatsApp Business is installed
 *
 * On mobile clients, prefer the `whatsapp://` scheme so the OS hands off to
 * whichever WhatsApp app is available (including Business-only devices).
 */

export function digitsOnlyPhone(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function buildWhatsAppHref(
  phone: string | null | undefined,
  text?: string | null,
): string {
  const digits = digitsOnlyPhone(phone);
  if (!digits) return '';
  const params = new URLSearchParams({ phone: digits });
  const message = (text ?? '').trim();
  if (message) params.set('text', message);
  return `https://api.whatsapp.com/send?${params.toString()}`;
}

export function buildWhatsAppDeepLink(
  phone: string | null | undefined,
  text?: string | null,
): string {
  const digits = digitsOnlyPhone(phone);
  if (!digits) return '';
  const params = new URLSearchParams({ phone: digits });
  const message = (text ?? '').trim();
  if (message) params.set('text', message);
  return `whatsapp://send?${params.toString()}`;
}

export function isLikelyMobileWhatsAppClient(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

function parseWhatsAppTarget(href: string): { phone: string; text: string } | null {
  try {
    const url = new URL(href);
    if (url.protocol === 'whatsapp:') {
      return {
        phone: digitsOnlyPhone(url.searchParams.get('phone')),
        text: url.searchParams.get('text') ?? '',
      };
    }
    if (url.hostname === 'api.whatsapp.com') {
      return {
        phone: digitsOnlyPhone(url.searchParams.get('phone')),
        text: url.searchParams.get('text') ?? '',
      };
    }
    if (url.hostname === 'wa.me') {
      return {
        phone: digitsOnlyPhone(url.pathname),
        text: url.searchParams.get('text') ?? '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Open WhatsApp chat. On phones, try the native scheme first so WhatsApp Business
 * works when standard WhatsApp is not installed; fall back to HTTPS if needed.
 */
export function openWhatsAppChat(
  phone: string | null | undefined,
  text?: string | null,
): boolean {
  const https = buildWhatsAppHref(phone, text);
  if (!https || typeof window === 'undefined') return false;

  if (isLikelyMobileWhatsAppClient()) {
    const deep = buildWhatsAppDeepLink(phone, text);
    window.location.assign(deep);
    window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        window.location.assign(https);
      }
    }, 900);
    return true;
  }

  window.open(https, '_blank', 'noopener,noreferrer');
  return true;
}

/** Use on anchor click: mobile deep-link handoff, keep href as HTTPS fallback. */
export function handleWhatsAppLinkClick(
  href: string,
  event?: { preventDefault(): void },
): boolean {
  if (!isLikelyMobileWhatsAppClient() || typeof window === 'undefined') return false;
  const target = parseWhatsAppTarget(href);
  if (!target?.phone) return false;
  event?.preventDefault();
  return openWhatsAppChat(target.phone, target.text);
}

export function isValidWhatsAppHttpsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    if (url.hostname === 'wa.me') {
      return /^\/\d{10,15}$/.test(url.pathname);
    }
    if (url.hostname === 'api.whatsapp.com') {
      const phone = digitsOnlyPhone(url.searchParams.get('phone'));
      return url.pathname.replace(/\/+$/, '') === '/send' && /^\d{10,15}$/.test(phone);
    }
    return false;
  } catch {
    return false;
  }
}
