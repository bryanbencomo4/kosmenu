import { afterEach, describe, expect, it } from 'vitest';

import {
  issueComprobantePermit,
  verifyComprobantePermit,
} from '../../app/api/_lib/comprobante-permit';

const COMERCIO = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('comprobante upload permit', () => {
  const originalSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalDedicated = process.env.COMPROBANTE_UPLOAD_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalSecret;
    if (originalDedicated === undefined) delete process.env.COMPROBANTE_UPLOAD_SECRET;
    else process.env.COMPROBANTE_UPLOAD_SECRET = originalDedicated;
  });

  it('issues a permit that verifies for the same comercio', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret-value';
    const { permit, expiresAt } = issueComprobantePermit(COMERCIO, 1_700_000_000_000);
    expect(expiresAt).toBeGreaterThan(1_700_000_000_000);
    expect(verifyComprobantePermit(permit, COMERCIO, 1_700_000_000_000)).toEqual({ ok: true });
  });

  it('rejects a permit for another comercio', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret-value';
    const { permit } = issueComprobantePermit(COMERCIO);
    expect(verifyComprobantePermit(permit, OTHER).ok).toBe(false);
  });

  it('rejects an expired permit', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret-value';
    const now = 1_700_000_000_000;
    const { permit } = issueComprobantePermit(COMERCIO, now);
    expect(verifyComprobantePermit(permit, COMERCIO, now + 16 * 60 * 1000).ok).toBe(false);
  });

  it('rejects a tampered signature', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret-value';
    const { permit } = issueComprobantePermit(COMERCIO);
    const tampered = `${permit.slice(0, -2)}aa`;
    expect(verifyComprobantePermit(tampered, COMERCIO).ok).toBe(false);
  });
});
