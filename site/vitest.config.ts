import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      // Unit tests use fixture phones; production default remains 584140821633 only.
      PLATFORM_WA_AUTO_REPLY_DIGITS: '*',
    },
  },
});
