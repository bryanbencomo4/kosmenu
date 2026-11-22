const fallbackPublicSiteUrl = 'https://elmenuxfa.com';

/**
 * Empty strings in .env.local (SITE_URL="") must not win over the fallback.
 * `??` only skips null/undefined, so coerce blank values explicitly.
 */
function resolvePublicSiteUrl(
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
  return fallbackPublicSiteUrl;
}

export const publicSiteUrl = resolvePublicSiteUrl(
  process.env.SITE_URL,
  process.env.NEXT_PUBLIC_PUBLIC_SITE_URL,
  process.env.NEXT_PUBLIC_SITE_URL,
);