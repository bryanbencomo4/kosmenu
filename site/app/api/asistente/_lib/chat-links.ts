/**
 * Server-side chat CTA gating for discovery cards.
 * Client helpers only know UX slug + preview; production also requires
 * the commerce UUID in CHATBOT_ALLOWED_COMMERCE_IDS (same effective allowlist
 * as restaurant Gemini — not slug-only).
 */
import {
  buildDiscoveryChatUrl,
  canOfferDiscoveryChatLink,
} from '../../../_lib/discovery-assistant';
import { parseAllowedCommerceIds } from '../../chat/_lib/commerce-auth';

export function canOfferDiscoveryChatLinkServer(
  slug: string | null | undefined,
  commerceId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (
    !canOfferDiscoveryChatLink(slug, {
      nodeEnv: env.NODE_ENV,
      publicPreviewFlag: env.NEXT_PUBLIC_CHATBOT_PREVIEW,
    })
  ) {
    return false;
  }

  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  if (nodeEnv !== 'production') {
    return true;
  }

  const id = (commerceId ?? '').trim().toLowerCase();
  if (!id) return false;

  const allowed = parseAllowedCommerceIds(env.CHATBOT_ALLOWED_COMMERCE_IDS);
  // Fail-closed: empty allowlist denies chat CTAs in production.
  if (allowed.size === 0) return false;
  return allowed.has(id);
}

export function buildServerDiscoveryChatUrl(
  slug: string,
  commerceId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!canOfferDiscoveryChatLinkServer(slug, commerceId, env)) return null;
  return buildDiscoveryChatUrl(slug);
}
