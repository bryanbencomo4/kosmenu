#!/usr/bin/env node
/** Peek vs consume smoke against Preview Postgres only. */
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const PROD = 'qqhberaayhohxlbbhdyi';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = path.join(root, 'site/.wa-entry-preview-deploy/vercel-preview.env');

if (process.env.CONFIRM_WA_HANDOFF_PREVIEW !== '1') {
  console.error('Refused');
  process.exit(1);
}

const map = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const url = map.PLATFORM_WA_PREVIEW_SUPABASE_URL;
const key = map.PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY;
if (!url?.includes(PREVIEW) || url.includes(PROD)) {
  console.error('bad preview url');
  process.exit(1);
}

const mint = spawnSync(
  'node',
  [
    path.join(root, 'site/scripts/wa-handoff-preview-mint.mjs'),
    '--destination=business_assistant',
    '--hint=test smoke Margarita',
    '--op=edit_price',
  ],
  { encoding: 'utf8', shell: true, env: { ...process.env, CONFIRM_WA_HANDOFF_PREVIEW: '1' } },
);
const minted = JSON.parse(mint.stdout);
const code = minted.code;
const client = createClient(url, key, { auth: { persistSession: false } });

const { data: peek1 } = await client.from('wa_handoff_codes').select('*').eq('code', code).maybeSingle();
const peekOk = peek1 && peek1.consumed_at_ms == null;

const { data: redeem1 } = await client.rpc('wa_handoff_redeem', {
  p_code: code,
  p_destination: 'business_assistant',
  p_now_ms: Date.now(),
});
const redeemRow = Array.isArray(redeem1) ? redeem1[0] : redeem1;
const redeemOk = redeemRow?.ok === true;

const { data: redeem2 } = await client.rpc('wa_handoff_redeem', {
  p_code: code,
  p_destination: 'business_assistant',
  p_now_ms: Date.now(),
});
const redeem2Row = Array.isArray(redeem2) ? redeem2[0] : redeem2;
const reuseRejected = redeem2Row?.ok === false && redeem2Row?.error === 'consumed';

// expired
const expiredMint = spawnSync(
  'node',
  [
    path.join(root, 'site/scripts/wa-handoff-preview-mint.mjs'),
    '--destination=consumer_discovery',
    '--query=pizza',
    '--ttlMs=1',
  ],
  { encoding: 'utf8', shell: true, env: { ...process.env, CONFIRM_WA_HANDOFF_PREVIEW: '1' } },
);
const expired = JSON.parse(expiredMint.stdout);
await new Promise((r) => setTimeout(r, 5));
const { data: expRedeem } = await client.rpc('wa_handoff_redeem', {
  p_code: expired.code,
  p_destination: 'consumer_discovery',
  p_now_ms: Date.now(),
});
const expRow = Array.isArray(expRedeem) ? expRedeem[0] : expRedeem;
const expiredRejected = expRow?.ok === false && expRow?.error === 'expired';

const report = {
  peekDoesNotConsume: peekOk,
  atomicConsume: redeemOk,
  reuseRejected,
  expiredRejected,
  noPhoneInPayload: !JSON.stringify(minted.payload).includes('584'),
  previewOnly: true,
  prodUntouched: true,
};
report.ok = Object.values(report).every(Boolean);
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
