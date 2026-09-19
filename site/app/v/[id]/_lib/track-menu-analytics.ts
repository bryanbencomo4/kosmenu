import { detectMenuDevice, detectMenuOrigin } from '../../../api/_lib/business-hours';

type MenuEvent =
  | 'menu_view'
  | 'qr_scan'
  | 'product_view'
  | 'add_to_cart'
  | 'checkout_started'
  | 'order_completed';

export function isOwnerPreviewPath(pathname: string) {
  return pathname.startsWith('/preview/');
}

function identifier(comercioId: string) {
  return encodeURIComponent(comercioId.trim());
}

async function postEvent(
  comercioId: string,
  event: MenuEvent,
  extra: Record<string, unknown> = {},
) {
  const origin = detectMenuOrigin(window.location.search, document.referrer);
  const device = detectMenuDevice(window.navigator.userAgent);
  await fetch(`/api/menu/${identifier(comercioId)}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, origin, device, ...extra }),
    keepalive: true,
  }).catch(() => undefined);
}

export async function trackPublicMenuVisit(comercioId: string, isOwnerPreview: boolean) {
  if (typeof window === 'undefined' || isOwnerPreview || !comercioId.trim()) {
    return;
  }
  const origin = detectMenuOrigin(window.location.search, document.referrer);
  const events: MenuEvent[] = origin === 'qr' ? ['qr_scan', 'menu_view'] : ['menu_view'];
  const sessionKey = `elmenuxfa:menu-track:${comercioId}:${events.join(',')}`;
  if (window.sessionStorage.getItem(sessionKey) === '1') {
    return;
  }
  window.sessionStorage.setItem(sessionKey, '1');
  await Promise.all(events.map((event) => postEvent(comercioId, event)));
}

export async function trackMenuFunnelEvent(
  comercioId: string,
  event: Exclude<MenuEvent, 'menu_view' | 'qr_scan'>,
  extra: Record<string, unknown> = {},
  dedupeKey?: string,
) {
  if (typeof window === 'undefined' || !comercioId.trim()) return;
  if (isOwnerPreviewPath(window.location.pathname)) return;
  if (dedupeKey) {
    const key = `elmenuxfa:funnel:${comercioId}:${event}:${dedupeKey}`;
    if (window.sessionStorage.getItem(key) === '1') return;
    window.sessionStorage.setItem(key, '1');
  }
  await postEvent(comercioId, event, extra);
}
