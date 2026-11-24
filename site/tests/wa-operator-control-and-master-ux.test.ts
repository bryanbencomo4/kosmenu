import { beforeEach, describe, expect, it } from 'vitest';

import { loadWaEntryConfig, isMasterPilotAllowlisted } from '../app/api/wa-entry/_lib/config';
import {
  describeConversationControl,
  readGlobalBotMute,
  resetOperatorControlMemoryForTests,
  returnConversationToAssistant,
  setGlobalBotMute,
  shouldDiscardInFlightBotReply,
  takeConversation,
} from '../app/api/wa-entry/_lib/operator-control';
import { processWaEntryEvent } from '../app/api/wa-entry/_lib/process';
import { createSimWaEntrySender } from '../app/api/wa-entry/_lib/sender';
import { createMemoryWaEntryStore } from '../app/api/wa-entry/_lib/store';
import { asAsyncStore } from '../app/api/wa-entry/_lib/store-async';
import {
  createSupportTicket,
  listPendingSupportTickets,
  resetSupportTicketsForTests,
} from '../app/api/wa-entry/_lib/support-tickets';
import { classifyWaMasterIntents } from '../app/api/wa-master/_lib/intents';
import { buildPublicMenuLinks, formatMenuLinksReply } from '../app/api/wa-master/_lib/menu-links';
import { buildDeterministicReplies } from '../app/api/wa-master/_lib/replies';
import { runCommercialSpecialist } from '../app/api/wa-master/_lib/specialists/commercial';
import { runAdminSpecialist } from '../app/api/wa-master/_lib/specialists/admin';
import { loadWaMasterConfig } from '../app/api/wa-master/_lib/config';
import type { WaMasterIdentity, WaMasterMemory } from '../app/api/wa-master/_lib/types';

function env(partial: Record<string, string>): NodeJS.ProcessEnv {
  return { ...process.env, ...partial };
}

function emptyMemory(fromDigits: string): WaMasterMemory {
  return {
    profile: {
      fromDigits,
      roles: [],
      linkedComercioIds: [],
      preferences: {},
      preferenceProvenance: {},
      lastIntent: null,
      attentionState: 'ai',
      lastActiveAtMs: Date.now(),
      retentionUntilMs: null,
    },
    summary: {
      activeService: null,
      selectedComercioId: null,
      goal: null,
      pendingQuestion: null,
      proposedAction: null,
      askedFields: [],
      recentErrors: [],
      humanIntervened: false,
      lastIntent: null,
      updatedAtMs: Date.now(),
      zone: null,
      lastRestaurants: [],
      signupDraft: null,
      pendingAdminProposal: null,
      lastHandoffUrl: null,
      lastHandoffAtMs: null,
    },
    turns: [],
  };
}

const merchantIdentity: WaMasterIdentity = {
  fromDigits: '584140821633',
  role: 'merchant_candidate',
  comercios: [
    {
      comercioId: 'c1',
      publicName: 'Pizzas El Trueno',
      slug: 'pizzas-el-trueno',
      matchField: 'whatsapp',
      provenance: 'verified_db',
    },
  ],
  possibleConsumer: false,
  consumerOrderSignal: false,
  provenanceNotes: [],
};

function inbound(fromDigits: string, text: string, messageId: string, fromMe = false) {
  return {
    event: 'messages.received',
    sessionId: 'ELMENUXFA1',
    data: {
      messages: {
        key: {
          id: messageId,
          fromMe,
          remoteJid: `${fromDigits}@s.whatsapp.net`,
          cleanedSenderPn: fromDigits,
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
        messageBody: text,
      },
    },
  };
}

describe('operator control + master UX (sim)', () => {
  beforeEach(() => {
    resetOperatorControlMemoryForTests();
    resetSupportTicketsForTests();
  });

  it('builds real public QR and orders menu URLs', () => {
    const links = buildPublicMenuLinks({ slug: 'pizzas-el-trueno', permiteDelivery: true });
    expect(links.qrUrl).toContain('elmenuxfa.com/v/pizzas-el-trueno');
    expect(links.qrUrl).toContain('src=qr');
    expect(links.ordersUrl).toContain('elmenuxfa.com/v/pizzas-el-trueno');
    expect(links.ordersUrl).not.toContain('app.elmenuxfa.com');
    const both = formatMenuLinksReply({
      businessName: 'Pizzas El Trueno',
      links,
      which: 'both',
    });
    expect(both).toContain('Menú para QR');
    expect(both).toContain('src=qr');
  });

  it('answers open question and pricing naturally', async () => {
    const cfg = loadWaMasterConfig(env({ PLATFORM_WA_MASTER_RECEPTIONIST: '0' }));
    const mem = emptyMemory('584100000001');
    const identity: WaMasterIdentity = {
      fromDigits: '584100000001',
      role: 'new_contact',
      comercios: [],
      possibleConsumer: true,
      consumerOrderSignal: false,
      provenanceNotes: [],
    };
    const q = classifyWaMasterIntents({
      text: 'Hola, tengo una pregunta.',
      identity,
      memory: mem,
    });
    expect(q.intents).toContain('support.question');
    const det = buildDeterministicReplies({
      intents: q.intents,
      specialist: q.specialist,
      identity,
      memory: mem,
      config: cfg,
      text: 'Hola, tengo una pregunta.',
    });
    expect(det.replies[0]).toMatch(/dime/i);

    const pricing = await runCommercialSpecialist({
      text: 'Quiero saber cuánto cuesta tener un menú.',
      memory: mem,
      config: cfg,
      intent: 'commercial.pricing',
    });
    expect(pricing.replies[0]).toMatch(/\$10/);
    expect(pricing.replies[0]).toMatch(/mes/);
  });

  it('returns merchant menu links without app panel URL as primary', async () => {
    const cfg = loadWaMasterConfig(env({}));
    const mem = emptyMemory(merchantIdentity.fromDigits);
    const result = await runAdminSpecialist({
      text: 'Pásame los enlaces de mi menú.',
      intent: 'admin.menu_links',
      identity: merchantIdentity,
      memory: mem,
      config: cfg,
      authGate: { getSession: async () => null },
      loadMenu: async () => ({
        comercioId: 'c1',
        publicName: 'Pizzas El Trueno',
        currencyLabel: 'USD',
        exchangeRate: '36',
        products: [],
        openLabel: 'Abierto',
        permiteDelivery: true,
      }),
      nowMs: Date.now(),
    });
    expect(result.replies[0]).toContain('elmenuxfa.com/v/pizzas-el-trueno');
    expect(result.replies[0]).toContain('src=qr');
    expect(result.replies[0]).not.toMatch(/^https:\/\/app\.elmenuxfa\.com\/?$/m);
  });

  it('take conversation suppresses bot; return restores; race discard works', async () => {
    const sync = createMemoryWaEntryStore();
    const store = asAsyncStore(sync);
    const now = Date.now();
    const digits = '584199900001';

    const before = await takeConversation({
      store,
      fromDigits: digits,
      controllerId: 'op1',
      nowMs: now,
    });
    expect(before.humanHandling).toBe(true);
    expect(before.aiActive).toBe(false);

    const cfg = loadWaEntryConfig(
      env({
        PLATFORM_WA_INBOUND: '1',
        PLATFORM_WA_ROUTER: '1',
        PLATFORM_WA_ADAPTER: 'sim',
        PLATFORM_WA_STORE: 'memory',
        PLATFORM_WA_MASTER: '0',
        PLATFORM_WA_ENFORCE_ALLOWLIST: '0',
      }),
    );
    const sender = createSimWaEntrySender(sync);
    const blocked = await processWaEntryEvent({
      config: cfg,
      store: sync,
      sender,
      rawBody: '',
      payload: inbound(digits, 'Hola', `m-take-${now}`),
      nowMs: now + 10,
    });
    expect(blocked.reason).toMatch(/human_handling|paused|closed/);
    expect(blocked.replies).toHaveLength(0);

    await returnConversationToAssistant({
      store,
      fromDigits: digits,
      controllerId: 'op1',
      nowMs: now + 20,
    });

    const v0 = describeConversationControl(digits, await store.getThread(digits), now + 30);
    await takeConversation({
      store,
      fromDigits: digits,
      controllerId: 'op2',
      nowMs: now + 40,
    });
    const race = await shouldDiscardInFlightBotReply({
      store,
      fromDigits: digits,
      expectedAttentionVersion: v0.attentionVersion,
      nowMs: now + 50,
    });
    expect(race.discard).toBe(true);
    expect(race.reason).toBeTruthy();
  });

  it('global mute stops bot replies and measures elapsed', async () => {
    const sync = createMemoryWaEntryStore();
    const store = asAsyncStore(sync);
    const now = Date.now();
    const started = Date.now();
    await setGlobalBotMute({
      store,
      muted: true,
      controllerId: 'admin',
      nowMs: now,
    });
    const elapsedMs = Date.now() - started;
    expect(elapsedMs).toBeLessThan(2000);

    const mute = await readGlobalBotMute(store, now + 1);
    expect(mute.effective).toBe(true);

    const cfg = loadWaEntryConfig(
      env({
        PLATFORM_WA_INBOUND: '1',
        PLATFORM_WA_ROUTER: '1',
        PLATFORM_WA_ADAPTER: 'sim',
        PLATFORM_WA_STORE: 'memory',
        PLATFORM_WA_MASTER: '0',
        PLATFORM_WA_ENFORCE_ALLOWLIST: '0',
      }),
    );
    const sender = createSimWaEntrySender(sync);
    const res = await processWaEntryEvent({
      config: cfg,
      store: sync,
      sender,
      rawBody: '',
      payload: inbound('584188800001', 'Hola', `m-mute-${now}`),
      nowMs: now + 5,
    });
    expect(res.reason).toBe('global_bot_mute');

    await setGlobalBotMute({
      store,
      muted: false,
      controllerId: 'admin',
      nowMs: now + 10,
    });
  });

  it('fromMe human take is indefinite; bot echo does not take', async () => {
    const sync = createMemoryWaEntryStore();
    const cfg = loadWaEntryConfig(
      env({
        PLATFORM_WA_INBOUND: '1',
        PLATFORM_WA_ROUTER: '1',
        PLATFORM_WA_ADAPTER: 'sim',
        PLATFORM_WA_STORE: 'memory',
        PLATFORM_WA_MASTER: '0',
        PLATFORM_WA_ENFORCE_ALLOWLIST: '0',
      }),
    );
    const sender = createSimWaEntrySender(sync);
    const now = Date.now();
    const digits = '584177700001';

    await sender.send({
      to: digits,
      text: 'eco bot',
      eventId: 'e1',
      dedupeKey: 'd1',
    });
    const echo = await processWaEntryEvent({
      config: cfg,
      store: sync,
      sender,
      rawBody: '',
      payload: inbound(digits, 'eco bot', `echo-${now}`, true),
      nowMs: now + 1,
    });
    expect(echo.reason).toBe('bot_echo');

    const human = await processWaEntryEvent({
      config: cfg,
      store: sync,
      sender,
      rawBody: '',
      payload: inbound(digits, 'Hola cliente, te ayudo yo', `human-${now}`, true),
      nowMs: now + 2,
    });
    expect(human.reason).toBe('from_me');
    const thread = await asAsyncStore(sync).getThread(digits);
    expect(thread?.state).toBe('human_handling');
    expect(thread?.humanPausedUntilMs).toBeGreaterThan(now + 1000 * 60 * 60 * 24 * 365);
  });

  it('support ticket is created and listed', () => {
    const t = createSupportTicket({
      fromDigits: '584166600001',
      text: 'No sé cómo facturar',
      context: 'unknown',
    });
    expect(t.id).toBeTruthy();
    expect(listPendingSupportTickets().some((x) => x.id === t.id)).toBe(true);
  });

  it('master public flag remains fail-closed by default', () => {
    const off = loadWaEntryConfig(
      env({
        PLATFORM_WA_MASTER: '1',
        PLATFORM_WA_MASTER_ALLOWLIST_DIGITS: '',
      }),
    );
    expect(isMasterPilotAllowlisted(off, '584140821633')).toBe(false);
    const on = loadWaEntryConfig(
      env({
        PLATFORM_WA_MASTER: '1',
        PLATFORM_WA_MASTER_PUBLIC: '1',
        PLATFORM_WA_MASTER_ALLOWLIST_DIGITS: '',
      }),
    );
    expect(isMasterPilotAllowlisted(on, '584140821633')).toBe(true);
  });
});
