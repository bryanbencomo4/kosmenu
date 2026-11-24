#!/usr/bin/env node
/**
 * Mint a one-time handoff code into Preview Postgres only (never production).
 *
 *   CONFIRM_WA_HANDOFF_PREVIEW=1 node site/scripts/wa-handoff-preview-mint.mjs \
 *     --destination=consumer_discovery --query=hamburguesas --zone=Caracas
 *
 *   CONFIRM_WA_HANDOFF_PREVIEW=1 node site/scripts/wa-handoff-preview-mint.mjs \
 *     --destination=business_assistant --hint="cambiar precio Margarita" --op=edit_price
 */
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const PROD = 'qqhberaayhohxlbbhdyi';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const envPath = path.join(root, 'site/.wa-entry-preview-deploy/vercel-preview.env');

if (process.env.CONFIRM_WA_HANDOFF_PREVIEW !== '1') {
  console.error('Refused: set CONFIRM_WA_HANDOFF_PREVIEW=1');
  process.exit(1);
}
if (!existsSync(envPath)) {
  console.error('Missing', envPath);
  process.exit(1);
}

const map = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = (map.PLATFORM_WA_PREVIEW_SUPABASE_URL || '').trim();
const key = (map.PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY || '').trim();
if (!url.includes(PREVIEW) || url.includes(PROD) || !key) {
  console.error('Refused: Preview credentials invalid');
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), '1'];
  }),
);

const destination = args.destination || 'consumer_discovery';
const code = randomBytes(18).toString('base64url');
const now = Date.now();
const ttl = Number(args.ttlMs || 5 * 60 * 1000);
const payload = {
  query: args.query || null,
  zone: args.zone || null,
  conversationHint: args.hint || null,
  pendingOperation: args.op || null,
  intent: args.intent || (args.op === 'edit_price' ? 'admin.edit_price' : null),
  businessNameDraft: args.business || null,
};

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error } = await client.from('wa_handoff_codes').insert({
  code,
  destination,
  payload_json: payload,
  from_digits_hash: createHash('sha256').update('wa_handoff:preview_mint').digest('hex'),
  expires_at_ms: now + ttl,
  consumed_at_ms: null,
  revoked_at_ms: null,
  created_at_ms: now,
});

if (error) {
  console.error('insert_failed', error.message);
  process.exit(1);
}

const consumerBase = 'https://elmenuxfa.com/asistente';
const businessBase = args.flutterBase || 'http://127.0.0.1:8080/asistente';
const handoffUrl =
  destination === 'consumer_discovery'
    ? `${consumerBase}?ref=wa#h=${encodeURIComponent(code)}`
    : `${businessBase.replace(/\/$/, '')}?h=${encodeURIComponent(code)}`;

console.log(
  JSON.stringify(
    {
      ok: true,
      code,
      destination,
      expiresAtMs: now + ttl,
      payload,
      url: handoffUrl,
      previewOnly: true,
    },
    null,
    2,
  ),
);
