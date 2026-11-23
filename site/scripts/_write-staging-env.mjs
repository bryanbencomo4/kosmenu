/**
 * Build site/.env.staging.local from .env.local with staging live caps.
 * Does not print secrets. Does not modify production deploy.
 *
 * Preview Supabase has no Trueno → keep prod URL for catalog READ via
 * CHATBOT_STAGING_MODE read-only wrapper + CHATBOT_BLOCK_ORDERS.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '.env.local');
const dest = join(root, '.env.staging.local');

if (!existsSync(src)) {
  console.error('missing .env.local');
  process.exit(1);
}

const base = readFileSync(src, 'utf8');
const overrides = `
# --- staging live session (generated) ---
CHATBOT_STAGING_MODE=1
CHATBOT_BLOCK_ORDERS=1
CHATBOT_SIMULATE_GEMINI=0
CHATBOT_MEDIA_LIVE=1
CHATBOT_VOICE_STT=1
CHATBOT_IMAGE_ANALYSIS=1
CHATBOT_LIVE_HARD_CAPS=1
CHATBOT_LIVE_MAX_GEMINI_CALLS=28
CHATBOT_LIVE_MAX_COST_USD=0.10
CHATBOT_LIVE_MAX_MEDIA_CALLS=6
CHATBOT_LIVE_MAX_MEDIA_COST_USD=0.03
CHATBOT_PRICE_INPUT_PER_1M=0.25
CHATBOT_PRICE_AUDIO_INPUT_PER_1M=0.50
CHATBOT_PRICE_OUTPUT_PER_1M=1.50
CHATBOT_MAX_OUTPUT_TOKENS=256
# Technical exception: 2 rounds hits tool_round_limit on multi-line Hawaiana proposals.
CHATBOT_MAX_TOOL_ROUNDS=3
CHATBOT_LIVE_BUDGET_FILE=${join(root, '.data', 'chatbot-live-budget-staging.json').replace(/\\/g, '/')}
CHATBOT_MEDIA_STAGING_DIR=${join(root, '.data', 'chat-media-staging').replace(/\\/g, '/')}
CHATBOT_USAGE_DIR=${join(root, '.data', 'chatbot-usage-staging').replace(/\\/g, '/')}
CHATBOT_QUOTA_BACKEND=filesystem
CHATBOT_ALLOW_OFFLINE_LOCAL=1
# RESET must stay 0 after the first authorized session boot — workers reloading with RESET=1 wipe counters.
CHATBOT_LIVE_BUDGET_RESET=0
`;

writeFileSync(dest, `${base.trimEnd()}\n${overrides}\n`, 'utf8');
console.log(
  JSON.stringify({
    wrote: '.env.staging.local',
    stagingMode: true,
    maxCalls: 28,
    maxCostUsd: 0.1,
    maxMediaCalls: 6,
    maxMediaCostUsd: 0.03,
    note: 'Preview Supabase has no Trueno; staging uses prod catalog under read-only + order block',
  }),
);
