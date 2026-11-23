/**
 * Local/E2E panel bearer must never activate on production hosts, even if
 * NEXT_PUBLIC_CHAT_SUPERVISION_E2E_BEARER was accidentally set in a build.
 */
export function resolveE2ePanelBearer(
  envBearer: string | undefined | null,
  hostname?: string | null,
): string | null {
  const token = String(envBearer || '').trim();
  if (!token) return null;
  const host = String(hostname || '').trim().toLowerCase();
  if (
    host === 'elmenuxfa.com' ||
    host.endsWith('.elmenuxfa.com') ||
    host === 'www.elmenuxfa.com'
  ) {
    return null;
  }
  return token;
}
