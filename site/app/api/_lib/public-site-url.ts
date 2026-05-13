const fallbackPublicSiteUrl = 'https://elmenuxfa.com';

export const publicSiteUrl = (
  process.env.SITE_URL ??
  process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  fallbackPublicSiteUrl
)
  .trim()
  .replace(/\/$/, '');