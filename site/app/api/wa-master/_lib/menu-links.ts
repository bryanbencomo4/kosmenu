/**
 * Public menu URLs for elmenuxfa.com — use real host + slug rules.
 * QR catalog force: ?src=qr (see detectMenuOrigin / shouldForceCatalogModeFromQuery).
 * Delivery / pedidos: apex /v/{slug} when delivery is enabled for the commerce.
 */

import { publicSiteUrl } from '../../_lib/public-site-url';

export type PublicMenuLinks = {
  slug: string;
  menuUrl: string;
  qrUrl: string;
  ordersUrl: string;
  deliveryEnabled: boolean | null;
  sameUrlForQrAndOrders: boolean;
};

export function buildPublicMenuLinks(params: {
  slug: string;
  permiteDelivery?: boolean | null;
  siteBase?: string;
}): PublicMenuLinks {
  const base = (params.siteBase || publicSiteUrl || 'https://elmenuxfa.com').replace(/\/$/, '');
  const slug = encodeURIComponent(String(params.slug || '').trim());
  const menuUrl = `${base}/v/${slug}`;
  const qrUrl = `${menuUrl}?src=qr`;
  // Delivery/orders share the public menu URL; the menu itself offers delivery when enabled.
  const ordersUrl = menuUrl;
  const deliveryEnabled =
    params.permiteDelivery === undefined ? null : Boolean(params.permiteDelivery);
  return {
    slug: params.slug,
    menuUrl,
    qrUrl,
    ordersUrl,
    deliveryEnabled,
    sameUrlForQrAndOrders: false,
  };
}

export function formatMenuLinksReply(params: {
  businessName?: string | null;
  links: PublicMenuLinks;
  which: 'qr' | 'orders' | 'both' | 'menu';
}): string {
  const name = params.businessName ? ` de *${params.businessName}*` : '';
  if (params.which === 'qr') {
    return `¡Claro! 😊 Aquí tienes el enlace del menú${name} para QR:\n${params.links.qrUrl}\n\nPuedes usarlo directamente en tu código QR.`;
  }
  if (params.which === 'orders') {
    if (params.links.deliveryEnabled === false) {
      return `El menú público${name} está aquí:\n${params.links.menuUrl}\n\nEn los datos públicos no aparece delivery activo para este local. Si lo activaste hace poco, confírmalo en el panel.`;
    }
    return `¡Claro! 🛵 Enlace para que tus clientes vean el menú y pidan${name}:\n${params.links.ordersUrl}`;
  }
  if (params.which === 'menu') {
    return `¡Claro! 😊 Enlace público del menú${name}:\n${params.links.menuUrl}`;
  }
  return (
    `¡Claro! 😊 Aquí tienes los enlaces${name}:\n\n` +
    `📋 *Menú para QR:*\n${params.links.qrUrl}\n\n` +
    `🛵 *Menú para pedidos:*\n${params.links.ordersUrl}\n\n` +
    (params.links.deliveryEnabled === false
      ? 'Nota: delivery no figura activo en los datos públicos de este local.\n\n'
      : '') +
    'Puedes compartirlos directamente con tus clientes.'
  );
}
