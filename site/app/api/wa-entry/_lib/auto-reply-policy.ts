/**
 * Single fail-closed policy: who may receive ANY automatic WA replies
 * (Master, receptionist, classic router, welcome, fallback, Gemini).
 *
 * Default allowlist: ONLY 584140821633.
 * Empty / invalid list ⇒ nobody (silence).
 * Orders / supervision notifications are out of scope (different send sources).
 */

export const PLATFORM_WA_OFFICIAL_EMITTER_DIGITS = '584220451906';
export const PLATFORM_WA_AUTO_REPLY_ONLY_DIGITS_DEFAULT = '584140821633';

function parseDigitsList(raw: string): string[] {
  return String(raw || '')
    .split(/[,\s;]+/)
    .map((d) => d.replace(/\D/g, ''))
    .filter((d) => d.length >= 10);
}

export function loadPlatformWaAutoReplyAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const raw = (env.PLATFORM_WA_AUTO_REPLY_DIGITS || '').trim();
  if (raw) return parseDigitsList(raw);
  // Fail-closed default: single authorized pilot number.
  return parseDigitsList(PLATFORM_WA_AUTO_REPLY_ONLY_DIGITS_DEFAULT);
}

export function isPlatformWaAutoReplyAllowed(
  fromDigits: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const digits = String(fromDigits || '').replace(/\D/g, '');
  if (!digits) return false;
  const raw = (env.PLATFORM_WA_AUTO_REPLY_DIGITS || '').trim();
  // Vitest-only escape. Never set PLATFORM_WA_AUTO_REPLY_DIGITS=* in production.
  if (
    raw === '*' &&
    (env.VITEST === 'true' || env.VITEST === '1' || env.NODE_ENV === 'test')
  ) {
    return true;
  }
  const list = loadPlatformWaAutoReplyAllowlist(env);
  if (list.length === 0) return false;
  return list.includes(digits);
}

/** Human return-to-AI must never enable auto replies for non-allowlisted contacts. */
export function canResumeAutoReplyForContact(
  fromDigits: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isPlatformWaAutoReplyAllowed(fromDigits, env);
}
