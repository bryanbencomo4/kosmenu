import { describe, expect, it } from 'vitest';

import {
  extractMissingColumn,
  selectWithMissingColumnFallback,
} from '../app/admin/_lib/admin-safe-query';

describe('admin-safe-query', () => {
  it('extracts missing column names from postgres/postgrest messages', () => {
    expect(
      extractMissingColumn('column comercios.correo does not exist'),
    ).toBe('correo');
    expect(
      extractMissingColumn('column comercios.user_id does not exist'),
    ).toBe('user_id');
    expect(
      extractMissingColumn(`Could not find the 'email' column of 'comercios' in the schema cache`),
    ).toBe('email');
  });

  it('retries selects while stripping missing columns including embeds', async () => {
    const attempts: string[] = [];
    const { data, stripped } = await selectWithMissingColumnFallback(
      async (select) => {
        attempts.push(select);
        if (select.includes('correo')) {
          return {
            data: null,
            error: { message: 'column comercios.correo does not exist' },
          };
        }
        if (select.includes('name')) {
          return {
            data: null,
            error: { message: 'column plans.name does not exist' },
          };
        }
        return {
          data: { ok: true, select },
          error: null,
        };
      },
      'id,correo,plan:plans(code,name),owner_id',
    );

    expect(data).toEqual({
      ok: true,
      select: 'id,plan:plans(code),owner_id',
    });
    expect(stripped).toEqual(['correo', 'name']);
    expect(attempts).toHaveLength(3);
  });
});
