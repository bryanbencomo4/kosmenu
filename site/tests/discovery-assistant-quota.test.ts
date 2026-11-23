import { describe, expect, it } from 'vitest';

import { assertFilesystemAllowed, DiscoveryQuotaError } from '../app/api/asistente/_lib/quota';

describe('discovery quota filesystem guard', () => {
  it('throws in production', () => {
    expect(() =>
      assertFilesystemAllowed({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(DiscoveryQuotaError);
    try {
      assertFilesystemAllowed({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    } catch (err) {
      expect(err).toBeInstanceOf(DiscoveryQuotaError);
      expect((err as DiscoveryQuotaError).code).toBe(
        'filesystem_forbidden_in_production',
      );
    }
  });

  it('allows development and test', () => {
    expect(() =>
      assertFilesystemAllowed({ NODE_ENV: 'development' } as NodeJS.ProcessEnv),
    ).not.toThrow();
    expect(() =>
      assertFilesystemAllowed({ NODE_ENV: 'test' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
