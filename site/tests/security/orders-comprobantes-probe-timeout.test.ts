import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('orders/comprobantes probe timeout contract', () => {
  it('probe script uses AbortController timeout (no indefinite hang)', () => {
    const src = readFileSync(
      join(__dirname, '../../scripts/probe-orders-comprobantes.mjs'),
      'utf8',
    );
    expect(src).toMatch(/AbortController/);
    expect(src).toMatch(/PROBE_TIMEOUT_MS|TIMEOUT_MS/);
    expect(src).toMatch(/comprobantes/);
    expect(src).toMatch(/timedOut/);
  });
});
