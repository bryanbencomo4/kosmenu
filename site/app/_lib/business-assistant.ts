/**
 * Business assistant — flags fail closed.
 * Canonical merchant URL: app.elmenuxfa.com/asistente (Flutter + Next API).
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

export const BUSINESS_ASSISTANT_CANONICAL_APP_PATH = 'https://app.elmenuxfa.com/asistente';
export const BUSINESS_ASSISTANT_NEXT_PATH = '/asistente-negocio';
