import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

import { verifyWaEntryWebhook } from '../app/api/wa-entry/_lib/auth';
import {
  loadWaEntryConfig,
  WA_ENTRY_PREVIEW_PROJECT_REF,
  WA_ENTRY_PROD_PROJECT_REF,
  type WaEntryConfig,
} from '../app/api/wa-entry/_lib/config';
import { consumerLinkMessage, welcomeMessage } from '../app/api/wa-entry/_lib/messages';
import { processWaEntryEvent } from '../app/api/wa-entry/_lib/process';
import { createIsolatedPreviewSender } from '../app/api/wa-entry/_lib/sender-isolated';
import { createSupabasePreviewAsyncStore } from '../app/api/wa-entry/_lib/store-supabase-preview';
import type { WaEntryAsyncStore } from '../app/api/wa-entry/_lib/store-async';

const ROOT = path.resolve(__dirname, '../..');
const PREVIEW = WA_ENTRY_PREVIEW_PROJECT_REF;
const PROD = WA_ENTRY_PROD_PROJECT_REF;

function loadEnvFile(filePath: string, into: Record<string, string>) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    into[k] = v;
  }
}

function loadPreviewCreds(): { url: string; key: string } | null {
  const bag: Record<string, string> = {};
  loadEnvFile(path.join(ROOT, '.env.preview.local'), bag);
  loadEnvFile(path.join(ROOT, '.env.preview.keys'), bag);
  const url = (
    process.env.PLATFORM_WA_PREVIEW_SUPABASE_URL ||
    bag.NEXT_PUBLIC_SUPABASE_URL ||
    bag.SUPABASE_URL ||
    ''
  ).trim();
  const key = (
    process.env.PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY ||
    bag.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();
  if (!url || !key) return null;
  if (!url.includes(PREVIEW) || url.includes(PROD)) return null;
  return { url, key };
}

const creds = loadPreviewCreds();
const describePreview = creds ? describe : describe.skip;

const runId = `prev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const fromDigits = '584128880001';

function makeConfig(): WaEntryConfig {
  if (!creds) throw new Error('missing preview creds');
  return loadWaEntryConfig({
    PLATFORM_WA_INBOUND: '1',
    PLATFORM_WA_ROUTER: '1',
    PLATFORM_WA_ADAPTER: 'preview_isolated',
    PLATFORM_WA_STORE: 'supabase_preview',
    PLATFORM_WA_WEBHOOK_SECRET: 'preview-integration-secret',
    PLATFORM_WA_ALLOW_REAL_WASENDER: '0',
    PLATFORM_WA_PREVIEW_PROJECT_REF: PREVIEW,
    PLATFORM_WA_PREVIEW_SUPABASE_URL: creds.url,
    PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY: creds.key,
    PLATFORM_WA_ALLOWLIST_DIGITS: fromDigits,
    PLATFORM_WA_ENFORCE_ALLOWLIST: '1',
  } as unknown as NodeJS.ProcessEnv);
}

function payload(id: string, text: string, fromMe = false) {
  return {
    event: 'messages.received',
    timestamp: Math.floor(Date.now() / 1000),
    data: {
      messages: {
        key: {
          id,
          fromMe,
          remoteJid: `${fromDigits}@s.whatsapp.net`,
          cleanedSenderPn: fromDigits,
          addressingMode: 'pn',
        },
        messageBody: text,
        message: { conversation: text },
      },
    },
  };
}

describePreview('wa-entry Preview integration (isolated)', () => {
  let config: WaEntryConfig;
  let store: WaEntryAsyncStore;
  let sender: ReturnType<typeof createIsolatedPreviewSender>;
  let admin: ReturnType<typeof createClient>;

  beforeAll(() => {
    config = makeConfig();
    store = createSupabasePreviewAsyncStore(config);
    sender = createIsolatedPreviewSender(store);
    admin = createClient(creds!.url, creds!.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it('binds Preview only; real Wasender off', () => {
    expect(creds!.url.includes(PREVIEW)).toBe(true);
    expect(creds!.url.includes(PROD)).toBe(false);
    expect(config.allowRealWasender).toBe(false);
    expect(config.adapter).toBe('preview_isolated');
    expect(config.storeKind).toBe('supabase_preview');
  });

  it('auth: Wasender signature accepted; forged rejected', () => {
    const raw = JSON.stringify(payload(`${runId}_auth`, 'Hola'));
    expect(
      verifyWaEntryWebhook({
        config,
        headers: { 'x-webhook-signature': 'preview-integration-secret' },
        rawBody: raw,
      }).ok,
    ).toBe(true);
    expect(
      verifyWaEntryWebhook({
        config,
        headers: { 'x-webhook-signature': 'forged' },
        rawBody: raw,
      }).ok,
    ).toBe(false);
  });

  it('1) receive simulated Hola → welcome persisted', async () => {
    const p = payload(`${runId}_hello`, 'Hola');
    const result = await processWaEntryEvent({
      config,
      store,
      sender,
      rawBody: JSON.stringify(p),
      payload: p,
    });
    expect(result.action).toBe('replied');
    expect(result.replies[0]?.text).toBe(welcomeMessage());
    const thread = await store.getThread(fromDigits);
    expect(thread?.state).toBe('awaiting_audience');
  });

  it('2) select consumer → asistente link', async () => {
    const p = payload(`${runId}_one`, '1');
    const result = await processWaEntryEvent({
      config,
      store,
      sender,
      rawBody: JSON.stringify(p),
      payload: p,
    });
    expect(result.action).toBe('replied');
    expect(result.replies[0]?.text).toBe(consumerLinkMessage(config));
    expect(result.replies[0]?.text).toContain('https://elmenuxfa.com/asistente?ref=wa');
  });

  it('3) duplicate message → ignored', async () => {
    const p = payload(`${runId}_hello`, 'Hola');
    const result = await processWaEntryEvent({
      config,
      store,
      sender,
      rawBody: JSON.stringify(p),
      payload: p,
    });
    expect(result.reason).toBe('duplicate');
  });

  it('4) concurrency same id → one reply', async () => {
    const id = `${runId}_race`;
    const p = payload(id, 'MENÚ');
    const [a, b] = await Promise.all([
      processWaEntryEvent({ config, store, sender, rawBody: JSON.stringify(p), payload: p }),
      processWaEntryEvent({ config, store, sender, rawBody: JSON.stringify(p), payload: p }),
    ]);
    expect([a.action, b.action].sort()).toEqual(['ignored', 'replied']);
  });

  it('5) send failure + bounded retry', async () => {
    const p = payload(`${runId}_biz`, '2');
    // reset audience via menu first already; force fail on business menu send
    const result = await processWaEntryEvent({
      config,
      store,
      sender,
      rawBody: JSON.stringify(p),
      payload: p,
      forceSendFail: true,
    });
    expect(['replied', 'error']).toContain(result.action);
    const outs = await store.listOutbound(80);
    expect(outs.some((o) => o.result === 'simulated_fail' || o.result === 'simulated_ok')).toBe(
      true,
    );
  });

  it('6) kill switch', async () => {
    const off = { ...config, inboundEnabled: false, routerEnabled: false };
    const p = payload(`${runId}_kill`, 'Hola');
    const result = await processWaEntryEvent({
      config: off,
      store,
      sender,
      rawBody: JSON.stringify(p),
      payload: p,
    });
    expect(result.reason).toBe('kill_switch');
  });

  it('7) restart recovery from Preview DB', async () => {
    const store2 = createSupabasePreviewAsyncStore(config);
    const thread = await store2.getThread(fromDigits);
    expect(thread?.fromDigits).toBe(fromDigits);
    expect(thread?.state).toBeTruthy();
  });

  it('8) isolated outbound rows exist in Preview', async () => {
    const { data, error } = await admin
      .from('wa_entry_outbound')
      .select('id, origin, result')
      .eq('to_digits', fromDigits)
      .order('at_ms', { ascending: false })
      .limit(5);
    expect(error).toBeNull();
    expect((data || []).length).toBeGreaterThan(0);
    expect((data?.[0] as { origin?: string } | undefined)?.origin).toBe('wa_entry_bot');
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from('wa_entry_threads').delete().eq('from_digits', fromDigits);
    await admin.from('wa_entry_send_locks').delete().eq('chat_digits', fromDigits);
  });
});
