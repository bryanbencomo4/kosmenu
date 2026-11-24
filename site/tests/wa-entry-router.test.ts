import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { verifyWaEntryWebhook } from '../app/api/wa-entry/_lib/auth';
import {
  assertPreviewSupabaseTarget,
  loadWaEntryConfig,
  WA_ENTRY_PROD_PROJECT_REF,
  type WaEntryConfig,
} from '../app/api/wa-entry/_lib/config';
import { normalizeWaInboundPayload } from '../app/api/wa-entry/_lib/contract';
import {
  encodePollReply,
  POLL_OPTION_CONSUMER,
  tryDecodePollReply,
  welcomePoll,
} from '../app/api/wa-entry/_lib/interactive';
import {
  businessManageMessage,
  businessMenuMessage,
  businessRegisterMessage,
  consumerLinkMessage,
  welcomeMessage,
} from '../app/api/wa-entry/_lib/messages';
import { processWaEntryEvent } from '../app/api/wa-entry/_lib/process';
import {
  createPreparedWasenderSender,
  createRefusingWasenderSender,
  createSimWaEntrySender,
  resolveWasenderOutboundText,
} from '../app/api/wa-entry/_lib/sender';
import { createMemoryWaEntryStore } from '../app/api/wa-entry/_lib/store';

const FIXTURES = path.join(__dirname, 'fixtures', 'wa-entry');

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function testConfig(overrides: Partial<WaEntryConfig> = {}): WaEntryConfig {
  return {
    ...loadWaEntryConfig({
      PLATFORM_WA_INBOUND: '1',
      PLATFORM_WA_ROUTER: '1',
      PLATFORM_WA_ADAPTER: 'sim',
      PLATFORM_WA_WEBHOOK_SECRET: 'test-secret',
    } as NodeJS.ProcessEnv),
    ...overrides,
  };
}

function makePayload(opts: {
  id: string;
  text: string;
  from?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  isStatus?: boolean;
}): Record<string, unknown> {
  const from =
    opts.from ||
    (opts.isStatus
      ? 'status@broadcast'
      : opts.isGroup
        ? '120363000000000000@g.us'
        : '584120000001@s.whatsapp.net');
  return {
    event: 'messages.upsert',
    sessionId: 'ELMENUXFA1',
    data: {
      message: {
        id: opts.id,
        from,
        fromMe: Boolean(opts.fromMe),
        isGroup: Boolean(opts.isGroup),
        isStatus: Boolean(opts.isStatus),
        timestamp: Math.floor(Date.now() / 1000),
        text: opts.text,
      },
    },
  };
}

async function run(
  payload: unknown,
  opts: {
    config?: WaEntryConfig;
    store?: ReturnType<typeof createMemoryWaEntryStore>;
    forceSendFail?: boolean;
    nowMs?: number;
  } = {},
) {
  const config = opts.config ?? testConfig();
  const store = opts.store ?? createMemoryWaEntryStore();
  const sender = createSimWaEntrySender(store);
  const rawBody = JSON.stringify(payload);
  const result = await processWaEntryEvent({
    config,
    store,
    sender,
    rawBody,
    payload,
    forceSendFail: opts.forceSendFail,
    nowMs: opts.nowMs,
  });
  return { result, store, config };
}

describe('wa-entry router (local sim)', () => {
  let store: ReturnType<typeof createMemoryWaEntryStore>;

  beforeEach(() => {
    store = createMemoryWaEntryStore();
  });

  afterEach(() => {
    store.clear();
  });

  it('A) Hola → bienvenida', async () => {
    const { result } = await run(fixture('hello.json'), { store });
    expect(result.action).toBe('replied');
    expect(result.replies[0]?.text).toBe(welcomeMessage());
    expect(result.state).toBe('awaiting_audience');
  });

  it('B) 1 → enlace consumidor', async () => {
    await run(fixture('hello.json'), { store });
    const { result, config } = await run(fixture('choose-consumer.json'), { store });
    expect(result.action).toBe('replied');
    expect(result.replies[0]?.text).toBe(consumerLinkMessage(config));
    expect(result.replies[0]?.text).toContain('https://elmenuxfa.com/asistente?ref=wa');
    expect(result.state).toBe('consumer_link_sent');
  });

  it('C) 2 → submenú negocio', async () => {
    await run(fixture('hello.json'), { store });
    const { result } = await run(fixture('choose-business.json'), { store });
    expect(result.action).toBe('replied');
    expect(result.replies[0]?.text).toBe(businessMenuMessage());
    expect(result.state).toBe('awaiting_business_action');
  });

  it('D) Negocio/1 → registro', async () => {
    await run(fixture('hello.json'), { store });
    await run(fixture('choose-business.json'), { store });
    const { result, config } = await run(fixture('business-register.json'), { store });
    expect(result.action).toBe('replied');
    expect(result.replies[0]?.text).toBe(businessRegisterMessage(config));
    expect(result.replies[0]?.text).toContain('https://business.elmenuxfa.com/');
    expect(result.replies[0]?.text).toContain('https://app.elmenuxfa.com/?tab=register');
    expect(result.state).toBe('business_link_sent');
  });

  it('E) Negocio/2 → panel', async () => {
    await run(fixture('hello.json'), { store });
    await run(fixture('choose-business.json'), { store });
    const { result, config } = await run(fixture('business-manage.json'), { store });
    expect(result.action).toBe('replied');
    expect(result.replies[0]?.text).toBe(businessManageMessage(config));
    expect(result.replies[0]?.text).toContain('https://app.elmenuxfa.com/');
    expect(result.state).toBe('business_link_sent');
  });

  it('F) MENÚ → inicio', async () => {
    await run(fixture('hello.json'), { store });
    await run(fixture('choose-consumer.json'), { store });
    const { result } = await run(makePayload({ id: 'wamid.MENU1', text: 'MENÚ' }), { store });
    expect(result.action).toBe('replied');
    expect(result.replies[0]?.text).toBe(welcomeMessage());
    expect(result.state).toBe('awaiting_audience');
  });

  it('G) texto inesperado → ayuda breve', async () => {
    await run(fixture('hello.json'), { store });
    const { result } = await run(makePayload({ id: 'wamid.HELP1', text: 'asdfgh' }), { store });
    expect(result.action).toBe('replied');
    expect(result.replies[0]?.text).toMatch(/Responde \*1\*/);
  });

  it('H) mensaje repetido → sin respuesta duplicada', async () => {
    const first = await run(fixture('hello.json'), { store });
    expect(first.result.action).toBe('replied');
    const second = await run(fixture('hello.json'), { store });
    expect(second.result.action).toBe('ignored');
    expect(second.result.reason).toBe('duplicate');
    expect(store.listOutbound()).toHaveLength(1);
  });

  it('I) fromMe → ignorado + pausa humana', async () => {
    await run(fixture('hello.json'), { store });
    const { result } = await run(fixture('from-me.json'), { store });
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('from_me');
    const thread = store.getThread('584120000001');
    expect(thread?.state).toBe('human_handling');
    expect(thread?.humanPausedUntilMs).toBeGreaterThan(Date.now());
  });

  it('J) grupo → ignorado', async () => {
    const { result } = await run(fixture('group.json'), { store });
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('group');
  });

  it('K) status → ignorado', async () => {
    const { result } = await run(fixture('status.json'), { store });
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('status');
  });

  it('L) reconexión → conserva sesión (file/memory snapshot)', async () => {
    await run(fixture('hello.json'), { store });
    const snap = store.snapshot();
    const restored = createMemoryWaEntryStore(snap);
    const { result } = await run(fixture('choose-consumer.json'), { store: restored });
    expect(result.action).toBe('replied');
    expect(result.state).toBe('consumer_link_sent');
  });

  it('M) dos eventos simultáneos → una sola transición válida', async () => {
    const a = makePayload({ id: 'wamid.RACE_A', text: 'Hola' });
    const b = makePayload({ id: 'wamid.RACE_A', text: 'Hola' }); // same id
    const [r1, r2] = await Promise.all([run(a, { store }), run(b, { store })]);
    const actions = [r1.result.action, r2.result.action].sort();
    expect(actions).toEqual(['ignored', 'replied']);
    expect(store.listOutbound()).toHaveLength(1);
  });

  it('N) WaSender caído → reintento acotado', async () => {
    await run(fixture('hello.json'), { store });
    // First send fails, retry succeeds → still one logical reply path with retry outbound
    const { result } = await run(fixture('choose-consumer.json'), {
      store,
      forceSendFail: true,
    });
    expect(result.action).toBe('replied');
    const outbound = store.listOutbound();
    expect(outbound.some((o) => o.result === 'simulated_fail')).toBe(true);
    expect(outbound.some((o) => o.result === 'simulated_ok' && o.dedupeKey.includes('retry'))).toBe(
      true,
    );
  });

  it('O) operador humano activo → sin respuesta automática', async () => {
    await run(fixture('hello.json'), { store });
    await run(fixture('from-me.json'), { store });
    const { result } = await run(makePayload({ id: 'wamid.AFTERHUMAN', text: '1' }), { store });
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('human_handling');
  });

  it('P) kill switch OFF → sin acciones', async () => {
    const config = testConfig({ inboundEnabled: false, routerEnabled: false });
    const { result } = await run(fixture('hello.json'), { store, config });
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('kill_switch');
    expect(store.listOutbound()).toHaveLength(0);
  });

  it('P2) inbound on / router off → claim pasivo sin respuesta', async () => {
    const config = testConfig({ inboundEnabled: true, routerEnabled: false });
    const { result } = await run(fixture('hello.json'), { store, config });
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('router_off');
    expect(result.eventId).toBeTruthy();
    expect(store.listOutbound()).toHaveLength(0);
    expect(store.hasSeenMessage(String(result.eventId))).toBe(true);

    const dup = await run(fixture('hello.json'), { store, config });
    expect(dup.result.reason).toBe('duplicate');
  });

  it('Q) webhook inválido → rechazo seguro + firma Wasender oficial', () => {
    const config = testConfig();
    const rawBody = JSON.stringify(fixture('hello.json'));
    const bad = verifyWaEntryWebhook({
      config,
      headers: { 'x-platform-wa-secret': 'wrong' },
      rawBody,
    });
    expect(bad.ok).toBe(false);
    if (bad.ok === false) expect(bad.status).toBe(401);

    const goodShared = verifyWaEntryWebhook({
      config,
      headers: { 'x-platform-wa-secret': 'test-secret' },
      rawBody,
    });
    expect(goodShared.ok).toBe(true);

    const sig = createHmac('sha256', 'test-secret').update(rawBody).digest('hex');
    const goodHmac = verifyWaEntryWebhook({
      config,
      headers: { 'x-platform-wa-signature': sig },
      rawBody,
    });
    expect(goodHmac.ok).toBe(true);

    // Provider docs: X-Webhook-Signature === webhook secret (exact match)
    const wasender = verifyWaEntryWebhook({
      config,
      headers: { 'x-webhook-signature': 'test-secret' },
      rawBody,
    });
    expect(wasender.ok).toBe(true);
    if (wasender.ok) expect(wasender.mode).toBe('wasender_signature');
  });

  it('R) bot echo fromMe → bot_echo sin pausa humana', async () => {
    await run(fixture('hello.json'), { store });
    const { result } = await run(
      makePayload({
        id: 'wamid.ECHO_OUT',
        text: welcomeMessage(),
        fromMe: true,
      }),
      { store },
    );
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('bot_echo');
    expect(store.getThread('584120000001')?.state).not.toBe('human_handling');
    expect(store.listOutbound().filter((o) => o.result === 'simulated_ok')).toHaveLength(1);
  });

  it('R2) human fromMe → human_handling', async () => {
    await run(fixture('hello.json'), { store });
    const { result } = await run(fixture('wasender-fromme-upsert.json'), { store });
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('from_me');
    expect(store.getThread('584120000001')?.state).toBe('human_handling');
  });

  it('S) contrato oficial messages.received → bienvenida', async () => {
    const { result } = await run(fixture('wasender-official-received.json'), { store });
    expect(result.action).toBe('replied');
    expect(result.replies[0]?.text).toBe(welcomeMessage());
    const n = normalizeWaInboundPayload(fixture('wasender-official-received.json'));
    expect(n?.fromDigits).toBe('584120000001');
    expect(n?.text).toBe('Hola');
    expect(n?.eventType).toBe('messages.received');
  });

  it('T) contrato oficial messages.upsert array + opción 1', async () => {
    await run(fixture('wasender-official-received.json'), { store });
    const { result, config } = await run(fixture('wasender-official-upsert.json'), { store });
    expect(result.action).toBe('replied');
    expect(result.replies[0]?.text).toBe(consumerLinkMessage(config));
  });

  it('U) allowlist enforced → ignore outsiders', async () => {
    const config = testConfig({
      enforceAllowlist: true,
      allowlistDigits: ['584129999999'],
    });
    const { result } = await run(fixture('hello.json'), { store, config });
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('not_allowlisted');
  });

  it('V) prepared wasender sender refuses without flags; queues with allowlist+inject', async () => {
    const config = testConfig({
      adapter: 'wasender',
      allowRealWasender: true,
      allowlistDigits: ['584120000001'],
    });
    let enqueued = 0;
    const sender = createPreparedWasenderSender({
      config,
      store,
      enqueue: async () => {
        enqueued += 1;
        return { ok: true as const, queued: true, response: { queueId: 'q1' } };
      },
    });
    await sender.send({
      to: '584120000001',
      text: 'hola',
      eventId: 'e1',
      dedupeKey: 'd1',
    });
    expect(enqueued).toBe(1);
    expect(store.listOutbound()[0]?.origin).toBe('wa_entry_bot');
    expect(store.listOutbound()[0]?.result).toBe('queued');

    const refused = createPreparedWasenderSender({
      config: testConfig({ allowRealWasender: false }),
      store,
    });
    await expect(
      refused.send({ to: '584120000001', text: 'x', eventId: 'e2', dedupeKey: 'd2' }),
    ).rejects.toThrow(/ALLOW_REAL_WASENDER/);
  });

  it('W) Preview URL safety refuses production ref', () => {
    expect(() =>
      assertPreviewSupabaseTarget(
        testConfig({
          storeKind: 'supabase_preview',
          previewSupabaseUrl: `https://${WA_ENTRY_PROD_PROJECT_REF}.supabase.co`,
          previewServiceRoleKey: 'x',
          previewProjectRef: WA_ENTRY_PROD_PROJECT_REF,
        }),
      ),
    ).toThrow(/production/);
  });

  it('real wasender sender refuses in this phase', async () => {
    const sender = createRefusingWasenderSender();
    await expect(
      sender.send({
        to: '584120000001',
        text: 'nope',
        eventId: 'x',
        dedupeKey: 'x',
      }),
    ).rejects.toThrow(/wa_entry_refused/);
  });

  it('normalize rejects malformed payloads', () => {
    expect(normalizeWaInboundPayload(null)).toBeNull();
    expect(normalizeWaInboundPayload({ foo: 1 })).toBeNull();
    expect(normalizeWaInboundPayload(fixture('hello.json'))?.text).toBe('Hola');
  });

  it('isolation: sim never imports production wasender queue symbols', async () => {
    // Static isolation check — process path uses only local sender
    const src = readFileSync(
      path.join(__dirname, '../app/api/wa-entry/_lib/process.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/sendWhatsappText|wasender_message_queue|SUPABASE_SERVICE_ROLE/);
    const senderSrc = readFileSync(
      path.join(__dirname, '../app/api/wa-entry/_lib/sender.ts'),
      'utf8',
    );
    expect(senderSrc).not.toMatch(/wasenderapi\.com|service_role/);
  });

  it('interactive default is text; poll flag off', () => {
    const cfg = loadWaEntryConfig({} as NodeJS.ProcessEnv);
    expect(cfg.interactiveMode).toBe('text');
    expect(cfg.pollSendEnabled).toBe(false);
  });

  it('poll.results normalize: fromMe doc sample → customer vote, not human pause', () => {
    const n = normalizeWaInboundPayload(fixture('poll-results-consumer.json'));
    expect(n).not.toBeNull();
    expect(n?.fromMe).toBe(false);
    expect(n?.fromDigits).toBe('584120000001');
    expect(n?.text).toBe(POLL_OPTION_CONSUMER);
    expect(n?.eventType).toBe('poll.results');
    expect(n?.messageId).toContain('pollvote');
  });

  it('poll mode: Hola → encoded welcome poll; vote → consumer link', async () => {
    const config = testConfig({ interactiveMode: 'poll' });
    const { result: hello } = await run(fixture('hello.json'), { store, config });
    expect(hello.action).toBe('replied');
    const poll = tryDecodePollReply(hello.replies[0]?.text || '');
    expect(poll).toEqual(welcomePoll());

    const { result: voted, config: cfg } = await run(fixture('poll-results-consumer.json'), {
      store,
      config,
    });
    expect(voted.action).toBe('replied');
    expect(voted.reason).toBe('ok');
    expect(voted.replies[0]?.text).toBe(consumerLinkMessage(cfg));
    expect(voted.state).toBe('consumer_link_sent');
    expect(store.getThread('584120000001')?.state).not.toBe('human_handling');
  });

  it('poll mode: business vote → submenu poll; register vote → register URLs', async () => {
    const config = testConfig({ interactiveMode: 'poll' });
    await run(fixture('hello.json'), { store, config });
    const { result: biz } = await run(fixture('poll-results-business.json'), { store, config });
    expect(biz.action).toBe('replied');
    expect(biz.state).toBe('awaiting_business_action');
    expect(tryDecodePollReply(biz.replies[0]?.text || '')?.options).toEqual([
      'Registrar mi menú',
      'Gestionar mi menú',
    ]);

    const { result: reg, config: cfg } = await run(fixture('poll-results-biz-register.json'), {
      store,
      config,
    });
    expect(reg.action).toBe('replied');
    expect(reg.replies[0]?.text).toBe(businessRegisterMessage(cfg));
    expect(reg.replies[0]?.text).toContain('https://app.elmenuxfa.com/?tab=register');
  });

  it('poll mode keeps text 1/2 and MENÚ', async () => {
    const config = testConfig({ interactiveMode: 'poll' });
    await run(fixture('hello.json'), { store, config });
    const { result, config: cfg } = await run(fixture('choose-consumer.json'), { store, config });
    expect(result.replies[0]?.text).toBe(consumerLinkMessage(cfg));
  });

  it('wasender sender falls back poll encode → text menu; refuses armed poll send', async () => {
    expect(resolveWasenderOutboundText(encodePollReply(welcomePoll()))).toBe(welcomeMessage());

    const config = testConfig({
      adapter: 'wasender',
      allowRealWasender: true,
      allowlistDigits: ['584120000001'],
      interactiveMode: 'poll',
      pollSendEnabled: true,
    });
    const sender = createPreparedWasenderSender({
      config,
      store,
      enqueue: async () => ({ ok: true as const, queued: true, response: {} }),
    });
    await expect(
      sender.send({
        to: '584120000001',
        text: encodePollReply(welcomePoll()),
        eventId: 'e-poll',
        dedupeKey: 'd-poll',
      }),
    ).rejects.toThrow(/POLL_SEND/);

    const safe = createPreparedWasenderSender({
      config: { ...config, pollSendEnabled: false },
      store,
      enqueue: async (_phone, text) => {
        expect(text).toBe(welcomeMessage());
        return { ok: true as const, queued: true, response: {} };
      },
    });
    const out = await safe.send({
      to: '584120000001',
      text: encodePollReply(welcomePoll()),
      eventId: 'e-poll2',
      dedupeKey: 'd-poll2',
    });
    expect(out.ok).toBe(true);
    expect(out.record.text).toBe(welcomeMessage());
  });

  it('poll.results duplicate vote → deduped', async () => {
    const config = testConfig({ interactiveMode: 'poll' });
    await run(fixture('hello.json'), { store, config });
    const first = await run(fixture('poll-results-consumer.json'), { store, config });
    expect(first.result.action).toBe('replied');
    const second = await run(fixture('poll-results-consumer.json'), { store, config });
    expect(second.result.action).toBe('ignored');
    expect(second.result.reason).toBe('duplicate');
  });
});
