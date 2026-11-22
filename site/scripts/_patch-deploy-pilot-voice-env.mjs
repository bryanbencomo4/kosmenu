/**
 * New persistent budget for deploy-pilot live voice (do not wipe prior budgets).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.staging.local');
const budget = join(root, '.data', 'chatbot-live-budget-deploy-pilot-voice.json');

let text = readFileSync(envPath, 'utf8');
const replacements = {
  CHATBOT_LIVE_BUDGET_FILE: budget.replace(/\\/g, '/'),
  CHATBOT_LIVE_MAX_GEMINI_CALLS: '6',
  CHATBOT_LIVE_MAX_COST_USD: '0.02',
  CHATBOT_LIVE_MAX_MEDIA_CALLS: '1',
  CHATBOT_LIVE_MAX_MEDIA_COST_USD: '0.008',
  CHATBOT_LIVE_BUDGET_RESET: '0',
  CHATBOT_MAX_TOOL_ROUNDS: '4',
  CHATBOT_MAX_OUTPUT_TOKENS: '256',
  CHATBOT_STAGING_MODE: '1',
  CHATBOT_BLOCK_ORDERS: '1',
  CHATBOT_SIMULATE_GEMINI: '0',
  CHATBOT_MEDIA_LIVE: '1',
  CHATBOT_VOICE_STT: '1',
  CHATBOT_LIVE_HARD_CAPS: '1',
};
for (const [k, v] of Object.entries(replacements)) {
  const re = new RegExp(`^${k}=.*$`, 'gm');
  if (re.test(text)) text = text.replace(re, `${k}=${v}`);
  else text += `\n${k}=${v}\n`;
}
writeFileSync(envPath, text);

if (!existsSync(budget)) {
  writeFileSync(
    budget,
    JSON.stringify(
      {
        geminiHttpCalls: 0,
        tokensInput: 0,
        tokensOutput: 0,
        estimatedCostUsd: 0,
        reportedCostUsd: 0,
        maxGeminiHttpCalls: 6,
        maxEstimatedCostUsd: 0.02,
        mediaHttpCalls: 0,
        mediaEstimatedCostUsd: 0,
        maxMediaHttpCalls: 1,
        maxMediaCostUsd: 0.008,
        recentCalls: [],
        hardGuarantee: false,
        label: 'deploy-pilot-voice',
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

console.log(JSON.stringify({ ok: true, budget: 'chatbot-live-budget-deploy-pilot-voice.json', maxCalls: 6, maxCost: 0.02 }));
