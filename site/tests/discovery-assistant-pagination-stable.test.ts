import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('directory pagination stability', () => {
  it('sorts with id tiebreaker so offset pages do not reshuffle', () => {
    const src = readFileSync(
      path.join(root, 'app/api/_lib/public-directory.ts'),
      'utf8',
    );
    expect(src).toMatch(/left\.id\.localeCompare\(right\.id\)/);
    expect(src).toMatch(/slice\(offset,\s*offset \+ limit\)/);
    expect(src).toMatch(/hasMore:/);
  });

  it('route forwards the same filter params with offset', () => {
    const src = readFileSync(
      path.join(root, 'app/api/comercios/directory/route.ts'),
      'utf8',
    );
    expect(src).toMatch(/searchParams\.get\('offset'\)/);
    expect(src).toMatch(/category:/);
    expect(src).toMatch(/region:/);
    expect(src).toMatch(/query,/);
  });
});
