/**
 * Natural composer: dynamic wording on top of verified facts, never inventing data.
 */
import { describe, expect, it } from 'vitest';

import {
  createEmptyMemory,
  loadWaMasterConfig,
  resolveWaMasterIdentity,
  runWaMasterOrchestrator,
  type WaMasterIdentityCatalogRow,
  type WaMasterMemory,
} from '../app/api/wa-master/_lib';
import { composeNatural, validateComposed, type ComposeFn } from '../app/api/wa-master/_lib/brain/compose';
import { createMemoryWaHandoffStore } from '../app/api/_lib/wa-handoff';

const OWNER = '584140821633';
const CATALOG: WaMasterIdentityCatalogRow[] = [
  {
    comercioId: '0aa8c53b-1111-4111-8111-aaaaaaaaaaaa',
    publicName: 'Pizzas El Trueno',
    slug: 'pizzas-el-trueno',
    whatsapp: '+584140821633',
    telefonos: null,
    supervisionWhatsapp: null,
  },
];

const cfg = () =>
  loadWaMasterConfig({
    PLATFORM_WA_MASTER: '1',
    PLATFORM_WA_MASTER_RECEPTIONIST: '1',
    PLATFORM_WA_MASTER_BRAIN: '1',
  } as unknown as NodeJS.ProcessEnv);

async function say(text: string, memory: WaMasterMemory, compose?: ComposeFn) {
  const identity = resolveWaMasterIdentity({ fromDigits: OWNER, catalog: CATALOG });
  return runWaMasterOrchestrator(
    { fromDigits: OWNER, text, messageId: `m_${Math.random().toString(36).slice(2)}`, nowMs: Date.now(), identity, memory },
    cfg(),
    {
      executeDiscovery: async (name) => ({ ok: true, tool: name, restaurants: [] }),
      handoffStore: createMemoryWaHandoffStore(),
      compose,
    },
  );
}

describe('validateComposed', () => {
  const draft = ['Pizzas El Trueno abre hoy. Menú: https://elmenuxfa.com/v/pizzas-el-trueno', 'Cuesta 12 USD.'];
  it('accepts a faithful rewrite', () => {
    expect(
      validateComposed(draft, 'Sí, *Pizzas El Trueno* abre hoy 🍕 Aquí el menú: https://elmenuxfa.com/v/pizzas-el-trueno (12 USD)', 'abre?'),
    ).toBe(true);
  });
  it('rejects dropped / invented links, invented numbers or names, numbered menus and credential asks', () => {
    expect(validateComposed(draft, 'Abre hoy, mira su menú.', 'x')).toBe(false);
    expect(validateComposed(draft, 'Menú https://otro.com y https://elmenuxfa.com/v/pizzas-el-trueno', 'x')).toBe(false);
    expect(validateComposed(draft, 'Cuesta 15 USD https://elmenuxfa.com/v/pizzas-el-trueno', 'x')).toBe(false);
    expect(validateComposed(draft, '*Pizzería Inventada* https://elmenuxfa.com/v/pizzas-el-trueno 12', 'x')).toBe(false);
    expect(validateComposed(draft, '1. Menú https://elmenuxfa.com/v/pizzas-el-trueno 12\n2. otro', 'x')).toBe(false);
    expect(validateComposed(draft, 'Pásame tu contraseña https://elmenuxfa.com/v/pizzas-el-trueno 12', 'x')).toBe(false);
  });
});

describe('dynamic replies in the Master', () => {
  it('falls back to the verified draft when the composer fails or breaks the facts', async () => {
    const m = createEmptyMemory(OWNER, Date.now(), 86_400_000);
    const broken = await say('quiero cambiar la tasa', m, async () => ['Entra a https://phishing.example']);
    expect(broken.replies.join('\n')).toMatch(/app\.elmenuxfa\.com\/asistente\?h=/);
    const failed = await say('quiero cambiar la tasa', m, async () => null);
    expect(failed.replies.join('\n')).toMatch(/app\.elmenuxfa\.com\/asistente\?h=/);
  });

  it('uses the composer output when it respects the facts, with the conversation as context', async () => {
    let seenTranscript = '';
    const compose: ComposeFn = async (input) => {
      seenTranscript = input.memory.turns.map((t) => t.text).join('|');
      const link = input.drafts.join('\n').match(/https?:\/\/\S+/)?.[0] ?? '';
      return [`Dale, eso lo resolvemos aquí mismo 💬 ${link}`];
    };
    let m = createEmptyMemory(OWNER, Date.now(), 86_400_000);
    const first = await say('quiero cambiar la tasa', m, compose);
    m = first.memory;
    const second = await say('ahora quiero cambiar una imagen', m, compose);
    expect(second.replies[0]).toMatch(/^Dale, eso lo resolvemos/);
    expect(seenTranscript).toMatch(/cambiar la tasa/);
    expect(second.mode).toBe('gemini');
  });

  it('understands "cambiar una imagen" right after a tasa request (owner thread) and does not repeat the tasa answer', async () => {
    let m = createEmptyMemory(OWNER, Date.now(), 86_400_000);
    const a = await say('quiero cambiar la tasa', m);
    m = a.memory;
    const b = await say('ahora quiero cambiar una imagen', m);
    const text = b.replies.join('\n');
    expect(text).toMatch(/foto|imagen/i);
    expect(text).not.toMatch(/tasa/i);
    expect(b.specialist).toBe('admin');
    // Wording rotates instead of replaying the first answer.
    expect(text.split('\n')[0]).not.toBe(a.replies.join('\n').split('\n')[0]);
  });
});

describe('composeNatural', () => {
  it('returns null when there is nothing to say', async () => {
    const m = createEmptyMemory(OWNER, Date.now(), 86_400_000);
    const identity = resolveWaMasterIdentity({ fromDigits: OWNER, catalog: CATALOG });
    expect(await composeNatural({ userText: 'hola', drafts: [], memory: m, identity })).toBeNull();
  });
});
