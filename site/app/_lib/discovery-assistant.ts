/**
 * Consumer discovery assistant (/asistente) — public flag helpers.
 * UI flags never authorize billed Gemini; server gates live in api/asistente/_lib/config.
 */

import {
  isChatbotPreviewEnabled,
  isChatbotUxEnabledForSlug,
} from './chatbot-preview';

function envFlagOn(raw: string | null | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Show /asistente shell (soft-unavailable page when off). */
export function isDiscoveryAssistantUiEnabled(
  env: {
    publicFlag?: string | null;
  } = {
    publicFlag: process.env.NEXT_PUBLIC_DISCOVERY_ASSISTANT,
  },
): boolean {
  return envFlagOn(env.publicFlag);
}

/** Authorize POST /api/asistente agent path (still subject to simulate / Gemini gates). */
export function isDiscoveryAssistantApiEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return envFlagOn(env.DISCOVERY_ASSISTANT_ENABLED);
}

/** Deterministic mock agent — never calls Google. Forced off in production. */
export function isDiscoveryAssistantSimulate(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if ((env.NODE_ENV ?? '').trim().toLowerCase() === 'production') return false;
  return envFlagOn(env.DISCOVERY_ASSISTANT_SIMULATE);
}

/**
 * Offer "Hablar con el asistente" only when the restaurant UX allowlist
 * AND the effective preview/runtime env both allow opening ?chatbot=1.
 * Slug allowlist alone is not enough in production with preview off.
 */
export function canOfferDiscoveryChatLink(
  slug: string | null | undefined,
  env: {
    nodeEnv?: string | null;
    publicPreviewFlag?: string | null;
  } = {
    nodeEnv: process.env.NODE_ENV,
    publicPreviewFlag: process.env.NEXT_PUBLIC_CHATBOT_PREVIEW,
  },
): boolean {
  if (!isChatbotUxEnabledForSlug(slug)) return false;
  return isChatbotPreviewEnabled({
    nodeEnv: env.nodeEnv,
    publicPreviewFlag: env.publicPreviewFlag,
  });
}

/** Sanitize share/origin refs for future analytics (e.g. ?ref=wa). Non-sensitive only. */
export function normalizeDiscoveryRef(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase().slice(0, 32);
  if (!v) return null;
  if (!/^[a-z0-9_-]+$/.test(v)) return null;
  return v;
}

export function buildDiscoveryChatUrl(slug: string): string {
  const safe = (slug || '').trim();
  return `/v/${encodeURIComponent(safe)}?chatbot=1`;
}
