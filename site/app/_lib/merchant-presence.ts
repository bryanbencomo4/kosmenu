export const MERCHANT_PRESENCE_COOKIE = 'elmenuxfa_merchant';

export type MerchantPresence = {
  name: string;
  logoUrl: string | null;
  slug: string | null;
};

const MAX_NAME = 80;
const MAX_SLUG = 80;
const MAX_LOGO = 500;
const SAFE_LOGO = /^https:\/\/[^\s]+$/i;

function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

export function sanitizeMerchantPresence(
  input: Partial<MerchantPresence> | null | undefined,
): MerchantPresence | null {
  const name = cleanText(input?.name, MAX_NAME);
  if (!name) return null;

  const slugRaw = cleanText(input?.slug, MAX_SLUG);
  const logoRaw = cleanText(input?.logoUrl, MAX_LOGO);
  const logoUrl = logoRaw && SAFE_LOGO.test(logoRaw) ? logoRaw : null;

  return {
    name,
    logoUrl,
    slug: slugRaw || null,
  };
}

export function serializeMerchantPresence(value: MerchantPresence): string {
  const safe = sanitizeMerchantPresence(value);
  if (!safe) {
    throw new Error('Invalid merchant presence.');
  }
  return encodeURIComponent(JSON.stringify(safe));
}

export function parseMerchantPresenceCookie(
  raw: string | undefined | null,
): MerchantPresence | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    const parsed = JSON.parse(decoded) as Partial<MerchantPresence>;
    return sanitizeMerchantPresence(parsed);
  } catch {
    return null;
  }
}

export function merchantPresenceCookieDomain(hostname: string): string | undefined {
  const host = hostname.trim().toLowerCase();
  if (host === 'elmenuxfa.com' || host.endsWith('.elmenuxfa.com')) {
    return '.elmenuxfa.com';
  }
  return undefined;
}

export function buildMerchantPresenceCookie(value: MerchantPresence, hostname: string): string {
  const parts = [
    `${MERCHANT_PRESENCE_COOKIE}=${serializeMerchantPresence(value)}`,
    'Path=/',
    'Max-Age=2592000',
    'SameSite=Lax',
  ];
  const domain = merchantPresenceCookieDomain(hostname);
  if (domain) parts.push(`Domain=${domain}`);
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearedMerchantPresenceCookie(hostname: string): string {
  const parts = [
    `${MERCHANT_PRESENCE_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'SameSite=Lax',
  ];
  const domain = merchantPresenceCookieDomain(hostname);
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
}

export function readMerchantPresenceFromDocumentCookie(cookieSource: string): MerchantPresence | null {
  const prefix = `${MERCHANT_PRESENCE_COOKIE}=`;
  const match = cookieSource
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!match) return null;
  return parseMerchantPresenceCookie(match.slice(prefix.length));
}

export function merchantInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'E';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'E';
}
