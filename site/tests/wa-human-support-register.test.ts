import { describe, expect, it, beforeEach } from 'vitest';

import { __resetInboxStoreForTests, getInboxConversation, listInboxMessages } from '../app/api/wa-entry/_lib/inbox-store';
import {
  HUMAN_SUPPORT_SUCCESS_REPLY,
  registerHumanSupportRequest,
} from '../app/api/wa-entry/_lib/register-human-support';
import {
  listPendingSupportTickets,
  resetSupportTicketsForTests,
} from '../app/api/wa-entry/_lib/support-tickets';
import { loadWaMasterConfig } from '../app/api/wa-master/_lib/config';
import { createEmptyMemory } from '../app/api/wa-master/_lib/memory';
import { tryHandleSmartMenu } from '../app/api/wa-master/_lib/menus';
import type { WaMasterIdentity } from '../app/api/wa-master/_lib/types';

function id(partial: Partial<WaMasterIdentity> = {}): WaMasterIdentity {
  return {
    fromDigits: '584140821633',
    role: 'new_contact',
    comercios: [],
    possibleConsumer: false,
    consumerOrderSignal: false,
    provenanceNotes: [],
    ...partial,
  };
}

describe('human support registration', () => {
  beforeEach(() => {
    resetSupportTicketsForTests();
    __resetInboxStoreForTests();
  });

  it('registers ticket + inbox needs_attention before success copy is allowed', async () => {
    const now = Date.now();
    const result = await registerHumanSupportRequest({
      fromDigits: '584140821633',
      text: '9',
      context: 'smart_menu · support.human',
      nowMs: now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ticket.id).toMatch(/^sup_/);
    expect(listPendingSupportTickets()).toHaveLength(1);

    const conv = await getInboxConversation('584140821633');
    expect(conv?.status).toBe('needs_attention');
    expect(conv?.contextNote).toMatch(/Solicitud humana/);
    expect(conv?.contextRole).toBe('support_human');

    const msgs = await listInboxMessages({ fromDigits: '584140821633' });
    expect(msgs.some((m) => m.role === 'system' && m.text.includes(result.ticket.id))).toBe(
      true,
    );
    expect(HUMAN_SUPPORT_SUCCESS_REPLY).toMatch(/Hemos recibido tu solicitud/);
  });

  it('rejects short digits', async () => {
    const result = await registerHumanSupportRequest({
      fromDigits: '123',
      text: 'ayuda',
    });
    expect(result.ok).toBe(false);
  });
});

describe('smart menu navigation coverage', () => {
  it('unknown → 1 opens consumer root; 2 opens prospect; registered links submenu', async () => {
    const now = Date.now();
    const config = loadWaMasterConfig({
      PLATFORM_WA_MASTER: '1',
    } as unknown as NodeJS.ProcessEnv);

    const mem = createEmptyMemory('584140821633', now, 86_400_000);
    const greet = await tryHandleSmartMenu({
      text: 'Hola',
      identity: id(),
      memory: mem,
      config,
      nowMs: now,
      fromDigits: '584140821633',
    });
    expect(greet.memoryPatch.menuId).toBe('root_unknown');

    Object.assign(mem.summary, greet.memoryPatch);
    const toConsumer = await tryHandleSmartMenu({
      text: '1',
      identity: id(),
      memory: mem,
      config,
      nowMs: now + 1,
      fromDigits: '584140821633',
    });
    expect(toConsumer.memoryPatch.menuId).toBe('root_consumer');

    const mem2 = createEmptyMemory('584140821633', now, 86_400_000);
    mem2.summary.menuId = 'root_unknown';
    mem2.summary.menuUpdatedAtMs = now;
    const toProspect = await tryHandleSmartMenu({
      text: '2',
      identity: id(),
      memory: mem2,
      config,
      nowMs: now + 1,
      fromDigits: '584140821633',
    });
    expect(toProspect.memoryPatch.menuId).toBe('root_prospect');

    const merchant = id({
      role: 'merchant_candidate',
      comercios: [
        {
          comercioId: 'c1',
          publicName: 'Demo',
          slug: 'demo',
          matchField: 'whatsapp',
          provenance: 'inferred_ai',
        },
      ],
    });
    const mem3 = createEmptyMemory('584140821633', now, 86_400_000);
    mem3.summary.menuId = 'root_registered';
    mem3.summary.menuProfile = 'registered';
    mem3.summary.menuUpdatedAtMs = now;
    const links = await tryHandleSmartMenu({
      text: '1',
      identity: merchant,
      memory: mem3,
      config,
      nowMs: now + 1,
      fromDigits: '584140821633',
    });
    expect(links.memoryPatch.menuId).toBe('biz_links');

    Object.assign(mem3.summary, links.memoryPatch);
    const qr = await tryHandleSmartMenu({
      text: '1',
      identity: merchant,
      memory: mem3,
      config,
      nowMs: now + 2,
      fromDigits: '584140821633',
    });
    expect(qr.handled).toBe(true);
    expect(qr.replies[0]).toMatch(/QR|qr|enlace/i);
  });

  it('products submenu digit stays on current menu actions', async () => {
    const now = Date.now();
    const config = loadWaMasterConfig({
      PLATFORM_WA_MASTER: '1',
      PLATFORM_WA_MASTER_RECEPTIONIST: '0',
    } as unknown as NodeJS.ProcessEnv);
    const mem = createEmptyMemory('584140821633', now, 86_400_000);
    mem.summary.menuId = 'biz_products';
    mem.summary.menuProfile = 'registered';
    mem.summary.menuUpdatedAtMs = now;
    const out = await tryHandleSmartMenu({
      text: '1',
      identity: id({
        role: 'merchant_candidate',
        comercios: [
          {
            comercioId: 'c1',
            publicName: 'Demo',
            slug: 'demo',
            matchField: 'whatsapp',
            provenance: 'inferred_ai',
          },
        ],
      }),
      memory: mem,
      config,
      nowMs: now + 1,
      fromDigits: '584140821633',
    });
    expect(out.handled).toBe(true);
    expect(out.replies[0]).toMatch(/asistente empresarial|app\.elmenuxfa\.com\/asistente/i);
  });
});
