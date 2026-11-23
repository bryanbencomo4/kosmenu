import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('middleware /asistente exclusion', () => {
  it('lists /asistente in EXCLUDED_PREFIXES', () => {
    const src = readFileSync(path.join(root, 'middleware.ts'), 'utf8');
    expect(src).toMatch(/EXCLUDED_PREFIXES\s*=\s*\[[\s\S]*'\/asistente'/);
  });
});
