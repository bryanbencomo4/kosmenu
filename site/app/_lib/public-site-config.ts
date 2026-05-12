const DEFAULT_PUBLIC_SITE_URL = 'https://www.elmenuxfa.com';
const DEFAULT_BUSINESS_SITE_URL = 'https://business.elmenuxfa.com';
const DEFAULT_SUPPORT_EMAIL = 'hola@elmenuxfa.com';
const DEFAULT_MARKETING_WHATSAPP_DIGITS = '584148216433';
const DEFAULT_MARKETING_WHATSAPP_MESSAGE =
  'Hola, quiero crear mi menú digital con elmenuxfa.com. Me gustaría recibir información del plan profesional.';

function resolveSiteUrl(rawValue: string | undefined, fallback: string) {
  const candidate = rawValue?.trim();

  if (!candidate) {
    return fallback;
  }

  try {
    return new URL(candidate).origin;
  } catch {
    return fallback;
  }
}

function resolveText(rawValue: string | undefined, fallback: string) {
  const candidate = rawValue?.trim();

  return candidate || fallback;
}

function resolveDigits(rawValue: string | undefined, fallback: string) {
  const candidate = (rawValue ?? fallback).replace(/\D/g, '');

  return candidate || fallback;
}

export const publicSiteUrl = resolveSiteUrl(
  process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL,
  DEFAULT_PUBLIC_SITE_URL,
);

export const businessSiteUrl = resolveSiteUrl(
  process.env.NEXT_PUBLIC_BUSINESS_SITE_URL,
  DEFAULT_BUSINESS_SITE_URL,
);

export const publicSiteHost = new URL(publicSiteUrl).hostname;
export const businessSiteHost = new URL(businessSiteUrl).hostname;

export const supportEmail = resolveText(
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? process.env.NEXT_PUBLIC_MARKETING_EMAIL,
  DEFAULT_SUPPORT_EMAIL,
);

export const supportEmailHref = `mailto:${supportEmail}`;

export const marketingWhatsappDigits = resolveDigits(
  process.env.NEXT_PUBLIC_MARKETING_WHATSAPP_DIGITS,
  DEFAULT_MARKETING_WHATSAPP_DIGITS,
);

export const marketingWhatsappMessage = resolveText(
  process.env.NEXT_PUBLIC_MARKETING_WHATSAPP_MESSAGE,
  DEFAULT_MARKETING_WHATSAPP_MESSAGE,
);

export const marketingWhatsappHref = marketingWhatsappDigits
  ? `https://wa.me/${marketingWhatsappDigits}?text=${encodeURIComponent(marketingWhatsappMessage)}`
  : supportEmailHref;

export const termsPagePath = '/terminos';
export const privacyPagePath = '/privacidad';
export const legalPagePaths = [termsPagePath, privacyPagePath] as const;

export const newsletterApiPath = '/api/newsletter';
export const newsletterSource = 'consumer-home-footer';