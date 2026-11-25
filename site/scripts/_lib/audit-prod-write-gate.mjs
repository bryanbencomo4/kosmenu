/**
 * Hard gate: refuse audit WRITE scripts against production Supabase.
 * Import and call assertAuditWriteTargetAllowed(url) before any mutation.
 */
export const AUDIT_PROD_SUPABASE_REF = 'qqhberaayhohxlbbhdyi';
export const AUDIT_PREVIEW_SUPABASE_REF = 'gsfxqzvmyzjjgpigrste';

export function supabaseProjectRefFromUrl(url) {
  try {
    const m = new URL(String(url || '')).host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

export function isProductionSupabaseUrl(url) {
  return supabaseProjectRefFromUrl(url) === AUDIT_PROD_SUPABASE_REF;
}

/**
 * @param {string} url
 * @param {{ allowRefs?: string[] }} [opts]
 */
export function assertAuditWriteTargetAllowed(url, opts = {}) {
  const ref = supabaseProjectRefFromUrl(url);
  const allow = opts.allowRefs || [AUDIT_PREVIEW_SUPABASE_REF];
  if (!ref) {
    throw new Error('AUDIT_WRITE_BLOCKED: invalid or missing Supabase URL');
  }
  if (ref === AUDIT_PROD_SUPABASE_REF) {
    throw new Error(
      `AUDIT_WRITE_BLOCKED: refusing writes to production Supabase (${AUDIT_PROD_SUPABASE_REF})`,
    );
  }
  if (!allow.includes(ref)) {
    throw new Error(
      `AUDIT_WRITE_BLOCKED: ref ${ref} not in allowlist [${allow.join(',')}]`,
    );
  }
  return ref;
}
