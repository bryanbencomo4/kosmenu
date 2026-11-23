/**
 * Point staging env at a NEW closure budget file without touching prior budget history.
 * Does not print secrets.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.staging.local');
const prevBudget = join(root, '.data', 'chatbot-live-budget-staging.json');
const archive = join(root, '.data', 'chatbot-live-budget-staging-prior.json');
const closureBudget = join(root, '.data', 'chatbot-live-budget-closure-final.json');

if (!existsSync(envPath)) {
  console.error('missing .env.staging.local');
  process.exit(1);
}

// Preserve prior budget history (copy, do not delete original).
if (existsSync(prevBudget) && !existsSync(archive)) {
  copyFileSync(prevBudget, archive);
}

let text = readFileSync(envPath, 'utf8');
const replacements = {
  CHATBOT_LIVE_BUDGET_FILE: closureBudget.replace(/\\/g, '/'),
  CHATBOT_LIVE_MAX_GEMINI_CALLS: '12',
  CHATBOT_LIVE_MAX_COST_USD: '0.03',
  CHATBOT_LIVE_MAX_MEDIA_CALLS: '2',
  CHATBOT_LIVE_MAX_MEDIA_COST_USD: '0.01',
  CHATBOT_LIVE_BUDGET_RESET: '0',
  CHATBOT_MAX_TOOL_ROUNDS: '4',
  CHATBOT_MAX_OUTPUT_TOKENS: '256',
  CHATBOT_STAGING_MODE: '1',
  CHATBOT_BLOCK_ORDERS: '1',
  CHATBOT_SIMULATE_GEMINI: '0',
  CHATBOT_MEDIA_LIVE: '1',
  CHATBOT_VOICE_STT: '1',
  CHATBOT_IMAGE_ANALYSIS: '1',
  CHATBOT_LIVE_HARD_CAPS: '1',
};

for (const [k, v] of Object.entries(replacements)) {
  const re = new RegExp(`^${k}=.*$`, 'm');
  if (re.test(text)) {
    // Replace ALL occurrences so earlier .env.local values don't win visually;
    // process loader uses last write in our start script.
    text = text.replace(new RegExp(`^${k}=.*$`, 'gm'), `${k}=${v}`);
  } else {
    text += `\n${k}=${v}\n`;
  }
}

// Ensure closure marker
if (!text.includes('CHATBOT_CLOSURE_FINAL=1')) {
  text += '\nCHATBOT_CLOSURE_FINAL=1\n';
}

writeFileSync(envPath, text, 'utf8');

// Seed empty closure budget only if missing (never wipe if already started).
if (!existsSync(closureBudget)) {
  writeFileSync(
    closureBudget,
    JSON.stringify(
      {
        geminiHttpCalls: 0,
        tokensInput: 0,
        tokensOutput: 0,
        estimatedCostUsd: 0,
        reportedCostUsd: 0,
        maxGeminiHttpCalls: 12,
        maxEstimatedCostUsd: 0.03,
        mediaHttpCalls: 0,
        mediaEstimatedCostUsd: 0,
        maxMediaHttpCalls: 2,
        maxMediaCostUsd: 0.01,
        recentCalls: [],
        hardGuarantee: false,
        label: 'closure-final',
        priorBudgetArchive: existsSync(archive)
          ? 'chatbot-live-budget-staging-prior.json'
          : null,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

console.log(
  JSON.stringify({
    ok: true,
    closureBudget: 'chatbot-live-budget-closure-final.json',
    priorArchived: existsSync(archive),
    priorIntact: existsSync(prevBudget),
    maxCalls: 12,
    maxCostUsd: 0.03,
    maxMediaCalls: 2,
    reset: 0,
  }),
);
