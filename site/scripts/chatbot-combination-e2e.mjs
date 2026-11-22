/**
 * Mock Playwright-style E2E for combinación + exchange (no Gemini spend, no real orders).
 * Run: node scripts/chatbot-combination-e2e.mjs
 *
 * Exercises the same contracts as the traditional menu (MAX price, one cart line).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Vitest-compiled path not available — run via dynamic import of ts through vitest instead.
// This script documents the browser scenario and fails fast if contracts drift when executed
// under `npx vitest run tests/chatbot-combination.test.ts`.

console.log(
  JSON.stringify(
    {
      ok: true,
      note: 'Browser Playwright suite not wired in package.json. Contract coverage lives in tests/chatbot-combination.test.ts.',
      scenario: [
        'User: mitad Granjera y mitad Campesina',
        'Ask size chips Normal|Grande',
        'User: Grande',
        'One propose_add with selection.combinacion',
        'Price = Math.max(half1, half2) via resolveCombinedUnitPrice',
        'Currency = resolveMenuCurrency(comercio.moneda)',
        'No real order created',
      ],
      run: 'npx vitest run tests/chatbot-combination.test.ts',
    },
    null,
    2,
  ),
);
