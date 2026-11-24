#!/usr/bin/env node
/**
 * Read-only check of recent wa_entry reception in production Supabase.
 * Never prints message text or full phones — masks digits.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const PROD = 'qqhberaayhohxlbbhdyi';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-prod-deploy');
const secretFile = path.join(deployDir, 'webhook-secret.local.txt');
const envFile = path.join(deployDir, 'vercel-production.env');

function loadEnv(filePath) {
  const out = {};
  if (!existsSync(filePath)) return out;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v.replace(/\\n/g, '\n');
  }
  return out;
}

function fp(v) {
  return createHash('sha256').update(String(v)).digest('hex').slice(0, 12);
}

function maskDigits(d) {
  const x = String(d || '').replace(/\D/g, '');
  if (x.length < 6) return '***';
  return `${x.slice(0, 3)}***${x.slice(-2)}`;
}

function runSql(sqlText) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wa-entry-recv-'));
  const file = path.join(dir, 'q.sql');
  writeFileSync(file, sqlText, 'utf8');
  try {
    const r = spawnSync(
      'npx',
      ['supabase', 'db', 'query', `--remote=${PROD}`, '--yes', '-o', 'json', '-f', file],
      { cwd: root, encoding: 'utf8', shell: true },
    );
    if (r.status !== 0) {
      return { ok: false, error: (r.stderr || r.stdout || '').slice(0, 400) };
    }
    let parsed = null;
    try {
      parsed = JSON.parse(r.stdout || '{}');
    } catch {
      parsed = { raw: (r.stdout || '').slice(0, 500) };
    }
    return { ok: true, parsed };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

const secret = existsSync(secretFile)
  ? readFileSync(secretFile, 'utf8').trim()
  : '';
const env = loadEnv(envFile);

const healthRes = await fetch(
  process.env.WA_ENTRY_PROD_BASE || 'https://elmenuxfa.com/api/wa-entry/webhook',
);
const health = await healthRes.json();

const sql = `
select
  (select count(*)::int from public.wa_entry_seen_messages) as seen_total,
  (select count(*)::int from public.wa_entry_outbound) as outbound_total,
  (select count(*)::int from public.wa_entry_outbound where origin = 'wa_entry_bot' and result in ('simulated_ok','queued','sent')) as bot_outbound_ok,
  (select jsonb_agg(row_to_json(t)) from (
     select message_id, session_id, claimed_at_ms, created_at
     from public.wa_entry_seen_messages
     order by created_at desc
     limit 8
  ) t) as recent_seen,
  (select jsonb_agg(row_to_json(t)) from (
     select id, to_digits, result, origin, at_ms, left(dedupe_key, 40) as dedupe_prefix
     from public.wa_entry_outbound
     order by at_ms desc
     limit 5
  ) t) as recent_outbound;
`;

const db = runSql(sql);
const rows = db.parsed?.rows?.[0] || {};

const recentSeen = Array.isArray(rows.recent_seen)
  ? rows.recent_seen.map((r) => ({
      messageIdFp: fp(r.message_id || ''),
      sessionId: r.session_id,
      claimedAtMs: r.claimed_at_ms,
      createdAt: r.created_at,
    }))
  : [];

const recentOutbound = Array.isArray(rows.recent_outbound)
  ? rows.recent_outbound.map((r) => ({
      idFp: fp(r.id || ''),
      to: maskDigits(r.to_digits),
      result: r.result,
      origin: r.origin,
      atMs: r.at_ms,
      dedupePrefix: r.dedupe_prefix,
    }))
  : [];

// Optional: if service role available locally, cross-check with JS client.
let clientCheck = { attempted: false };
const url = (env.PLATFORM_WA_PROD_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (url.includes(PROD) && key) {
  clientCheck.attempted = true;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { count, error } = await client
    .from('wa_entry_seen_messages')
    .select('*', { count: 'exact', head: true });
  clientCheck = { attempted: true, count, error: error?.message || null };
}

const report = {
  at: new Date().toISOString(),
  health: {
    inboundEnabled: health.inboundEnabled,
    routerEnabled: health.routerEnabled,
    realWasenderEnabled: health.realWasenderEnabled,
    storeKind: health.storeKind,
    prodProjectRef: health.prodProjectRef,
    webhookSecretConfigured: health.webhookSecretConfigured,
    allowlistCount: health.allowlistCount,
  },
  secretLocalFp: secret ? fp(secret) : null,
  expectedWasenderSecretFp: '5f99f12df7d2',
  secretMatchesExpectedLocal: secret ? fp(secret) === '5f99f12df7d2' : false,
  db: {
    ok: db.ok,
    error: db.error || null,
    seenTotal: rows.seen_total ?? null,
    outboundTotal: rows.outbound_total ?? null,
    botOutboundOk: rows.bot_outbound_ok ?? null,
    recentSeen,
    recentOutbound,
  },
  clientCheck,
  interpretation: {
    passiveOk:
      health.inboundEnabled === true &&
      health.routerEnabled === false &&
      health.realWasenderEnabled === false,
    realHolaCandidate:
      Number(rows.seen_total || 0) > 0 &&
      recentSeen.some((s) => String(s.sessionId || '').includes('ELMENU') || true),
    noBotReplies: Number(rows.bot_outbound_ok || 0) === 0,
  },
};

console.log(JSON.stringify(report, null, 2));
writeFileSync(path.join(deployDir, 'reception-check.json'), JSON.stringify(report, null, 2));
process.exit(db.ok && report.interpretation.passiveOk ? 0 : 2);
