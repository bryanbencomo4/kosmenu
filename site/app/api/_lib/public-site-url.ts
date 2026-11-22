const fallbackPublicSiteUrl = 'https://elmenuxfa.com';
const fallbackAppSiteUrl = 'https://app.elmenuxfa.com';

/**
 * Empty strings in .env.local (SITE_URL="") must not win over the fallback.
 * `??` only skips null/undefined, so coerce blank values explicitly.
 */
function resolveSiteUrl(
  fallback: string,
  ...candidates: Array<string | undefined>
): string {
  for (const raw of candidates) {
    const trimmed = (raw ?? '').trim().replace(/\/$/, '');
    if (!trimmed) continue;
    try {
      return new URL(trimmed).origin;
    } catch {
      // ignore invalid candidates
    }
  }
  return fallback;
}

export const publicSiteUrl = resolveSiteUrl(
  fallbackPublicSiteUrl,
  process.env.SITE_URL,
  process.env.NEXT_PUBLIC_PUBLIC_SITE_URL,
  process.env.NEXT_PUBLIC_SITE_URL,
);

/** Merchant Flutter/web app host (chat supervision WaSender deep links). */
export const appSiteUrl = resolveSiteUrl(
  fallbackAppSiteUrl,
  process.env.NEXT_PUBLIC_APP_SITE_URL,
  process.env.APP_SITE_URL,
);
