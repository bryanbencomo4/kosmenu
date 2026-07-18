import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('log_delivery_invitation_event hardening migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      '..',
      'supabase',
      'migrations',
      '20260718194100_harden_log_delivery_invitation_event.sql',
    ),
    'utf8',
  );

  it('rejects arbitrary event types via allow-list', () => {
    expect(sql).toContain('EVENT_TYPE_NOT_ALLOWED');
    expect(sql).toContain("'arrived'");
    expect(sql).toContain('INVITATION_NOT_FOUND');
    expect(sql).toContain('COMERCIO_MISMATCH');
  });

  it('revokes direct client execute', () => {
    expect(sql.toLowerCase()).toContain('revoke execute');
    expect(sql.toLowerCase()).toContain('from anon, authenticated, public');
    expect(sql.toLowerCase()).toContain('to service_role');
  });
});
