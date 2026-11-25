/**
 * Business assistant — flags fail closed.
 * Login / panel home: app.elmenuxfa.com/ (never /asistente for auth).
 * Assistant surface after session: app.elmenuxfa.com/asistente.
 * /asistente-negocio remains an internal Next fallback only.
 */

function envFlagOn(raw: string | null | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isBusinessAssistantUiEnabled(
  env: { publicFlag?: string | null } = {
    publicFlag: process.env.NEXT_PUBLIC_BUSINESS_ASSISTANT,
  },
): boolean {
  return envFlagOn(env.publicFlag);
}

export function isBusinessAssistantApiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envFlagOn(env.BUSINESS_ASSISTANT_ENABLED);
}

export function normalizeHandoffCode(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v || v.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return null;
  return v;
}

/** App home — login and panel live here. */
export const BUSINESS_ASSISTANT_APP_HOME = 'https://app.elmenuxfa.com/';
/** Login URL (root). Optional `?next=/asistente` returns to the assistant after auth. */
export const BUSINESS_ASSISTANT_LOGIN_URL = 'https://app.elmenuxfa.com/?next=/asistente';
/** Authenticated assistant route (not a login page). */
export const BUSINESS_ASSISTANT_CANONICAL_APP_PATH = 'https://app.elmenuxfa.com/asistente';
export const BUSINESS_ASSISTANT_NEXT_PATH = '/asistente-negocio';
