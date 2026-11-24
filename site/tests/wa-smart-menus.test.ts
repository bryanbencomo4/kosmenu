import { describe, expect, it } from 'vitest';

import { loadWaMasterConfig } from '../app/api/wa-master/_lib/config';
import { createEmptyMemory } from '../app/api/wa-master/_lib/memory';
import {
  assistantReturnNotice,
  buildMenuText,
  humanTakeNotice,
  isUniversalBack,
  isUniversalHuman,
  isUniversalSupport,
  parseMenuDigit,
  resolveMenuProfile,
  tryHandleSmartMenu,
} from '../app/api/wa-master/_lib/menus';
import type { WaMasterIdentity } from '../app/api/wa-master/_lib/types';

function identity(partial: Partial<WaMasterIdentity> = {}): WaMasterIdentity {
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

describe('wa smart menus', () => {
  it('parses digits and universal intents', () => {
    expect(parseMenuDigit('1')).toBe(1);
    expect(parseMenuDigit('8️⃣')).toBe(8);
    expect(parseMenuDigit('hola')).toBeNull();
    expect(isUniversalBack('0')).toBe(true);
    expect(isUniversalBack('volver')).toBe(true);
    expect(isUniversalBack('inicio')).toBe(true);
    expect(isUniversalHuman('9')).toBe(true);
    expect(isUniversalHuman('quiero hablar con un asesor')).toBe(true);
    expect(isUniversalSupport('8')).toBe(true);
    expect(isUniversalSupport('tengo un problema')).toBe(true);
    expect(isUniversalSupport('no me funciona')).toBe(true);
    expect(isUniversalSupport('ayuda')).toBe(true);
    expect(isUniversalSupport('necesito ayuda para pedir pizza')).toBe(false);
    expect(isUniversalSupport('necesito ayuda para registrar mi negocio')).toBe(false);
  });

  it('register mi restaurante is commercial, not consumer shortcut', async () => {
    const now = Date.now();
    const config = loadWaMasterConfig({
      PLATFORM_WA_MASTER: '1',
    } as unknown as NodeJS.ProcessEnv);
    const memory = createEmptyMemory('584140821633', now, 86_400_000);
    const out = await tryHandleSmartMenu({
      text: 'Quiero registrar mi restaurante',
      identity: identity(),
      memory,
      config,
      nowMs: now,
      fromDigits: '584140821633',
    });
    expect(out.handled).toBe(true);
    expect(out.delegate?.specialist).toBe('commercial');
    expect(out.intents).toContain('commercial.register');
  });

  it('resolves menu profiles from identity', () => {
    const now = Date.now();
    const mem = createEmptyMemory('584140821633', now, 86_400_000);
    expect(resolveMenuProfile(identity(), mem)).toBe('unknown');
    expect(
      resolveMenuProfile(identity({ possibleConsumer: true, role: 'possible_consumer' }), mem),
    ).toBe('consumer');
    expect(
      resolveMenuProfile(
        identity({
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
        mem,
      ),
    ).toBe('registered');
  });

  it('shows unknown root on greeting', async () => {
    const now = Date.now();
    const config = loadWaMasterConfig({
      PLATFORM_WA_MASTER: '1',
      PLATFORM_WA_MASTER_RECEPTIONIST: '0',
    } as unknown as NodeJS.ProcessEnv);
    const memory = createEmptyMemory('584140821633', now, 86_400_000);
    const out = await tryHandleSmartMenu({
      text: 'Hola',
      identity: identity(),
      memory,
      config,
      nowMs: now,
      fromDigits: '584140821633',
    });
    expect(out.handled).toBe(true);
    expect(out.replies[0]).toMatch(/elmenuxfa\.com/);
    expect(out.replies[0]).toMatch(/1️⃣/);
    expect(out.replies[0]).toMatch(/8️⃣/);
    expect(out.replies[0]).toMatch(/9️⃣/);
    expect(out.memoryPatch.menuId).toBe('root_unknown');
  });

  it('Hola re-opens root even when a menuId is already active', async () => {
    const now = Date.now();
    const config = loadWaMasterConfig({
      PLATFORM_WA_MASTER: '1',
    } as unknown as NodeJS.ProcessEnv);
    const memory = createEmptyMemory('584140821633', now, 86_400_000);
    memory.summary.menuId = 'support_issue';
    memory.summary.menuProfile = 'registered';
    memory.summary.menuUpdatedAtMs = now;
    memory.summary.humanIntervened = true;
    const out = await tryHandleSmartMenu({
      text: 'Hola',
      identity: identity({
        role: 'merchant_candidate',
        comercios: [
          {
            comercioId: 'c1',
            publicName: 'pizzas el trueno',
            slug: 'pizzas-el-trueno',
            matchField: 'whatsapp',
            provenance: 'inferred_ai',
          },
        ],
      }),
      memory,
      config,
      nowMs: now,
      fromDigits: '584140821633',
    });
    expect(out.handled).toBe(true);
    expect(out.skipGeminiPolish).toBe(true);
    expect(out.memoryPatch.menuId).toBe('root_registered');
    expect(out.replies[0]).toMatch(/pizzas el trueno/);
    expect(out.replies[0]).toMatch(/1️⃣/);
    expect(out.replies[0]).toMatch(/9️⃣/);
  });

  it('0 returns to profile root without wiping signup memory', async () => {
    const now = Date.now();
    const config = loadWaMasterConfig({
      PLATFORM_WA_MASTER: '1',
    } as unknown as NodeJS.ProcessEnv);
    const memory = createEmptyMemory('584140821633', now, 86_400_000);
    memory.summary.signupDraft = {
      businessName: 'Pizza Demo',
      city: null,
      category: null,
      stage: 'pricing',
    };
    memory.summary.menuId = 'biz_links';
    memory.summary.menuProfile = 'registered';
    memory.summary.menuUpdatedAtMs = now;
    const out = await tryHandleSmartMenu({
      text: '0',
      identity: identity({
        role: 'merchant_candidate',
        comercios: [
          {
            comercioId: 'c1',
            publicName: 'Pizza Demo',
            slug: 'pizza-demo',
            matchField: 'whatsapp',
            provenance: 'inferred_ai',
          },
        ],
      }),
      memory,
      config,
      nowMs: now,
      fromDigits: '584140821633',
    });
    expect(out.handled).toBe(true);
    expect(out.memoryPatch.menuId).toBe('root_registered');
    expect(memory.summary.signupDraft?.businessName).toBe('Pizza Demo');
  });

  it('9 escalates human without claiming success in menu layer', async () => {
    const now = Date.now();
    const config = loadWaMasterConfig({
      PLATFORM_WA_MASTER: '1',
    } as unknown as NodeJS.ProcessEnv);
    const memory = createEmptyMemory('584140821633', now, 86_400_000);
    memory.summary.menuId = 'root_unknown';
    memory.summary.menuUpdatedAtMs = now;
    const out = await tryHandleSmartMenu({
      text: '9',
      identity: identity(),
      memory,
      config,
      nowMs: now,
      fromDigits: '584140821633',
    });
    expect(out.escalateHuman).toBe(true);
    expect(out.replies).toEqual([]);
    expect(out.intents).toContain('support.human');
  });

  it('8 opens support menu', async () => {
    const now = Date.now();
    const config = loadWaMasterConfig({
      PLATFORM_WA_MASTER: '1',
    } as unknown as NodeJS.ProcessEnv);
    const memory = createEmptyMemory('584140821633', now, 86_400_000);
    memory.summary.menuId = 'root_consumer';
    memory.summary.menuUpdatedAtMs = now;
    const out = await tryHandleSmartMenu({
      text: '8',
      identity: identity({ possibleConsumer: true }),
      memory,
      config,
      nowMs: now,
      fromDigits: '584140821633',
    });
    expect(out.handled).toBe(true);
    expect(out.memoryPatch.menuId).toBe('support_issue');
    expect(out.replies[0]).toMatch(/No puedo entrar/);
  });

  it('stale digit does not apply old menu', async () => {
    const now = Date.now();
    const config = loadWaMasterConfig({
      PLATFORM_WA_MASTER: '1',
    } as unknown as NodeJS.ProcessEnv);
    const memory = createEmptyMemory('584140821633', now, 86_400_000);
    memory.summary.menuId = 'biz_products';
    memory.summary.menuUpdatedAtMs = now - 40 * 60 * 60 * 1000;
    const out = await tryHandleSmartMenu({
      text: '1',
      identity: identity(),
      memory,
      config,
      nowMs: now,
      fromDigits: '584140821633',
    });
    expect(out.handled).toBe(true);
    expect(out.toolsUsed).toContain('stale_menu_reset');
    expect(out.replies[0]).toMatch(/menú actual/);
  });

  it('builds registered and consumer menus', () => {
    expect(buildMenuText('root_registered', { businessName: 'Trueno' })).toMatch(/Trueno/);
    expect(buildMenuText('root_consumer')).toMatch(/Buscar restaurantes/);
    expect(buildMenuText('support_issue')).toMatch(/pagos o suscripción/);
  });

  it('attention notices are italic with emoji', () => {
    expect(humanTakeNotice('admin:ops@x.com')).toMatch(/^_⚠️/);
    expect(humanTakeNotice('admin:ops@x.com')).toMatch(/ops@x\.com/);
    expect(assistantReturnNotice()).toMatch(/^_🤖/);
    expect(assistantReturnNotice()).toMatch(/asistente virtual/);
  });
});
