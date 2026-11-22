import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('POST /api/orders/comprobantes content-type guard', () => {
  it('rejects non-multipart before formData (hang fix)', () => {
    const src = readFileSync(
      join(__dirname, '../../app/api/orders/comprobantes/route.ts'),
      'utf8',
    );
    expect(src).toMatch(/Expected multipart\/form-data/);
    expect(src).toMatch(/status:\s*415/);
    // Guard must appear before formData() to avoid runtime hangs on JSON bodies.
    const guardIdx = src.indexOf('Expected multipart/form-data');
    const formIdx = src.indexOf('await request.formData()');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(formIdx).toBeGreaterThan(guardIdx);
  });
});

