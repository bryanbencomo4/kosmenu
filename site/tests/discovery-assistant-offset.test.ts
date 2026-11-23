import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('directory offset pagination', () => {
  it('route accepts offset for mode=clientes', () => {
    const src = readFileSync(
      path.join(root, 'app/api/comercios/directory/route.ts'),
      'utf8',
    );
    expect(src).toMatch(/searchParams\.get\('offset'\)/);
    expect(src).toMatch(/offset:/);
  });

  it('listClientDirectory documents offset/hasMore in implementation', () => {
    const src = readFileSync(
      path.join(root, 'app/api/_lib/public-directory.ts'),
      'utf8',
    );
    expect(src).toMatch(/offset\?: number/);
    expect(src).toMatch(/hasMore:/);
    expect(src).toMatch(/slice\(offset,\s*offset \+ limit\)/);
  });
});
