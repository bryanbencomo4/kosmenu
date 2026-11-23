import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildChatSystemPrompt } from '../app/api/chat/_lib/prompt';
import {
  executeChatTool,
  type ChatToolContext,
} from '../app/api/chat/_lib/tools';
import type { LoadedPublicMenu } from '../app/api/menu/_lib/load-public-menu';
import {
  buildFulfillmentReplyText,
  buildPlatformPitchText,
  buildRestaurantContactCard,
  matchContactIntent,
  matchFulfillmentIntent,
  matchPlatformIntent,
} from '../app/v/[id]/_components/chat/chat-contact';
import {
  buildChatHoursSnapshot,
  matchHoursIntent,
} from '../app/v/[id]/_components/chat/chat-hours';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixtureMenu(): LoadedPublicMenu {
  const commerceId = '11111111-1111-4111-8111-111111111111';
  return {
    resolvedComercioId: commerceId,
    ownerId: 'owner-1',
    isOnline: true,
    comercioRow: { id: commerceId },
    comercio: {
      id: commerceId,
      slug: 'demo-rest',
      nombre: 'Demo Rest',
      moneda: 'USD',
      en_linea: true,
      permite_delivery: true,
      recibe_pedidos_whatsapp: true,
      direccion: 'Calle 1',
      whatsapp: '+584140000000',
      horarios: {
        timezone: 'America/Caracas',
        days: {
          monday: { open: true, ranges: [{ start: '09:00', end: '22:00' }] },
          tuesday: { open: true, ranges: [{ start: '09:00', end: '22:00' }] },
          wednesday: { open: true, ranges: [{ start: '09:00', end: '22:00' }] },
          thursday: { open: true, ranges: [{ start: '09:00', end: '22:00' }] },
          friday: { open: true, ranges: [{ start: '09:00', end: '22:00' }] },
          saturday: { open: true, ranges: [{ start: '10:00', end: '23:00' }] },
          sunday: { open: false, ranges: [] },
        },
      },
    } as any,
    categorias: [],
    productos: [],
  } as unknown as LoadedPublicMenu;
}

describe('chat hours + contact + platform intelligence', () => {
  it('matches hours / contact / platform / fulfillment intents', () => {
    expect(matchHoursIntent('cuál es el horario')).toBe(true);
    expect(matchHoursIntent('están abiertos')).toBe(true);
    expect(matchHoursIntent('quiero una pizza')).toBe(false);

    expect(matchContactIntent('pásame el whatsapp')).toBe(true);
    expect(matchContactIntent('quiero hablar con un humano')).toBe(true);
    expect(matchContactIntent('dame una hawaiana')).toBe(false);

    expect(matchPlatformIntent('cómo creo un menú en elmenuxfa')).toBe(true);
    expect(matchPlatformIntent('quiero un menú como este')).toBe(true);
    expect(matchPlatformIntent('horario de hoy')).toBe(false);

    expect(matchFulfillmentIntent('tienen delivery')).toBe(true);
    expect(matchFulfillmentIntent('puedo pasar a recoger')).toBe(true);
    expect(matchFulfillmentIntent('cuánto cuesta la pizza')).toBe(false);
  });

  it('builds a weekly hours snapshot when configured', () => {
    const snap = buildChatHoursSnapshot(fixtureMenu().comercio.horarios);
    expect(snap).not.toBeNull();
    expect(snap!.status.configured).toBe(true);
    expect(snap!.days).toHaveLength(7);
    expect(snap!.days.some((d) => d.label === 'Domingo' && d.closed)).toBe(true);
  });

  it('builds WhatsApp contact + platform pitch + fulfillment copy', () => {
    const card = buildRestaurantContactCard({
      whatsappUrl: 'https://api.whatsapp.com/send?phone=584140000000',
      phoneDisplay: '+58 414 0000000',
      businessName: 'Demo Rest',
    });
    expect(card?.label).toMatch(/Demo Rest/);
    expect(buildPlatformPitchText()).toMatch(/elmenuxfa/i);
    expect(buildPlatformPitchText()).toMatch(/business\.elmenuxfa\.com/);
    expect(
      buildFulfillmentReplyText({ delivery: true, pickup: true, dineIn: false }),
    ).toMatch(/delivery/i);
    expect(
      buildFulfillmentReplyText({ delivery: true, pickup: true, dineIn: false }),
    ).toMatch(/recoger|llevar/i);
  });

  it('enriches get_business_information with hours_status and whatsapp_url', () => {
    const ctx: ChatToolContext = {
      menu: fixtureMenu(),
      commerceId: '11111111-1111-4111-8111-111111111111',
    };
    const info = executeChatTool(ctx, 'get_business_information', {}) as any;
    expect(info.hours_status.configured).toBe(true);
    expect(info.hours_week.length).toBe(7);
    expect(info.whatsapp_url).toContain('584140000000');
  });

  it('prompt covers hours, handoff, elmenuxfa, receipts and fulfillment', () => {
    const prompt = buildChatSystemPrompt({
      businessName: 'Demo Rest',
      currency: 'USD',
    });
    expect(prompt).toMatch(/hours_status/);
    expect(prompt).toMatch(/whatsapp_url/);
    expect(prompt).toMatch(/elmenuxfa/i);
    expect(prompt).toMatch(/comprobante_pago/);
    expect(prompt).toMatch(/pasar a recoger|para llevar/i);
    expect(prompt).toMatch(/get_available_fulfillment_methods/);
  });

  it('wires client intents + hours/contact cards + media receipt prompt', () => {
    const view = readFileSync(
      path.join(root, 'app/v/[id]/_components/chat/ChatAssistantView.tsx'),
      'utf8',
    );
    expect(view).toMatch(/answerHoursIntent/);
    expect(view).toMatch(/answerContactIntent/);
    expect(view).toMatch(/answerPlatformIntent/);
    expect(view).toMatch(/answerFulfillmentIntent/);
    expect(
      readFileSync(
        path.join(root, 'app/v/[id]/_components/chat/ChatMessageBubble.tsx'),
        'utf8',
      ),
    ).toMatch(/ChatHoursCard/);
    expect(
      readFileSync(
        path.join(root, 'app/v/[id]/_components/chat/ChatMessageBubble.tsx'),
        'utf8',
      ),
    ).toMatch(/ChatContactCard/);
    expect(
      readFileSync(
        path.join(root, 'app/api/chat/[comercioId]/media/route.ts'),
        'utf8',
      ),
    ).toMatch(/comprobante_pago/);
  });
});
