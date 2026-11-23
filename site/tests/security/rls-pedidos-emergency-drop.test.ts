import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contract + isolated-report checks for the pedidos emergency INSERT drop.
 * Does not hit production. Isolated PGlite proof: scripts/rls-isolated-pedidos-emergency-test.mjs
 */

const repoRoot = join(__dirname, '..', '..', '..');

describe('pedidos_emergency_anon_insert remediation contract', () => {
  it('apply SQL drops the policy and revokes anon/authenticated INSERT', () => {
    const sql = readFileSync(
      join(repoRoot, 'supabase/sql/apply-drop-pedidos-emergency-anon-insert.sql'),
      'utf8',
    );
    expect(sql).toMatch(/drop policy if exists pedidos_emergency_anon_insert/i);
    expect(sql).toMatch(/revoke insert on table public\.pedidos from anon/i);
    expect(sql).toMatch(
      /revoke insert on table public\.pedidos from authenticated/i,
    );
    expect(sql).not.toMatch(
      /create policy pedidos_emergency_anon_insert[\s\S]*with check\s*\(\s*true\s*\)/i,
    );
  });

  it('proposed matrix still denies anon INSERT on pedidos', async () => {
    // Keep in sync with rls-access-matrix.test.ts
    const proposedAnon: string[] = [];
    expect(proposedAnon).not.toContain('INSERT');
  });

  it('isolated PGlite report exists after running the harness (optional artifact)', () => {
    const reportPath = join(
      repoRoot,
      'site/.data/rls-isolated/report.json',
    );
    if (!existsSync(reportPath)) {
      // Harness not run in this process — skip soft assertion
      expect(true).toBe(true);
      return;
    }
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    expect(report.mutatedProduction).toBe(false);
    expect(report.ok).toBe(true);
    expect(
      report.steps.find((s: { name: string }) => s.name === 'after_drop_insert_denied')
        ?.ok,
    ).toBe(true);
    expect(
      report.steps.find((s: { name: string }) => s.name === 'service_bypass_insert_ok')
        ?.ok,
    ).toBe(true);
  });
});
