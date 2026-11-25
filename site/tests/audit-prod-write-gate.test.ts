import { describe, expect, it } from 'vitest';
import {
  assertAuditWriteTargetAllowed,
  isProductionSupabaseUrl,
  supabaseProjectRefFromUrl,
} from '../scripts/_lib/audit-prod-write-gate.mjs';

describe('audit prod write gate', () => {
  it('detects production ref', () => {
    expect(
      isProductionSupabaseUrl('https://qqhberaayhohxlbbhdyi.supabase.co'),
    ).toBe(true);
    expect(
      isProductionSupabaseUrl('https://gsfxqzvmyzjjgpigrste.supabase.co'),
    ).toBe(false);
  });

  it('allows preview and blocks production', () => {
    expect(
      assertAuditWriteTargetAllowed('https://gsfxqzvmyzjjgpigrste.supabase.co'),
    ).toBe('gsfxqzvmyzjjgpigrste');
    expect(() =>
      assertAuditWriteTargetAllowed('https://qqhberaayhohxlbbhdyi.supabase.co'),
    ).toThrow(/AUDIT_WRITE_BLOCKED/);
  });

  it('parses project ref', () => {
    expect(
      supabaseProjectRefFromUrl('https://gsfxqzvmyzjjgpigrste.supabase.co'),
    ).toBe('gsfxqzvmyzjjgpigrste');
  });
});
