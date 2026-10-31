/**
 * Shared admin exclusions for Ops + Dashboard.
 * Cookie is readable on SSR; localStorage keeps the Ops UI snappy.
 */

export const ADMIN_EXCLUSIONS_COOKIE = 'elmenuxfa_admin_exclusions';
export const ADMIN_EXCLUSIONS_STORAGE_KEY = 'elmenuxfa:admin-ops-exclusions';

export type AdminExclusions = {
  excludeDemos: boolean;
  excludedIds: string[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function defaultAdminExclusions(): AdminExclusions {
  return { excludeDemos: true, excludedIds: [] };
}

export function parseAdminExclusions(raw: string | null | undefined): AdminExclusions {
  if (!raw?.trim()) return defaultAdminExclusions();
  try {
    const parsed = JSON.parse(raw) as {
      excludeDemos?: boolean;
      excludedIds?: unknown;
    };
    const excludedIds = Array.isArray(parsed.excludedIds)
      ? parsed.excludedIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter((id) => UUID_RE.test(id))
      : [];
    return {
      excludeDemos: parsed.excludeDemos !== false,
      excludedIds: [...new Set(excludedIds)].slice(0, 200),
    };
  } catch {
    return defaultAdminExclusions();
  }
}

export function serializeAdminExclusions(value: AdminExclusions): string {
  return JSON.stringify({
    excludeDemos: value.excludeDemos !== false,
    excludedIds: value.excludedIds.filter((id) => UUID_RE.test(id)).slice(0, 200),
  });
}

/** Write cookie so SSR pages (dashboard) share Ops exclusions. */
export function writeAdminExclusionsCookie(value: AdminExclusions) {
  if (typeof document === 'undefined') return;
  const encoded = encodeURIComponent(serializeAdminExclusions(value));
  const maxAge = 60 * 60 * 24 * 180;
  document.cookie = `${ADMIN_EXCLUSIONS_COOKIE}=${encoded}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function readAdminExclusionsFromLocalStorage(): AdminExclusions {
  if (typeof window === 'undefined') return defaultAdminExclusions();
  try {
    return parseAdminExclusions(
      window.localStorage.getItem(ADMIN_EXCLUSIONS_STORAGE_KEY),
    );
  } catch {
    return defaultAdminExclusions();
  }
}

export function persistAdminExclusions(value: AdminExclusions) {
  if (typeof window === 'undefined') return;
  const normalized = parseAdminExclusions(serializeAdminExclusions(value));
  window.localStorage.setItem(
    ADMIN_EXCLUSIONS_STORAGE_KEY,
    serializeAdminExclusions(normalized),
  );
  writeAdminExclusionsCookie(normalized);
}
