import { describe, expect, it } from 'vitest';

import {
  mergePanelMessages,
  panelMessageRichness,
  toPanelChatMessages,
  type PanelMessageRow,
} from '../app/panel/_lib/panel-chat-messages';

const base = (over: Partial<PanelMessageRow> & Pick<PanelMessageRow, 'id'>): PanelMessageRow => ({
  id: over.id,
  seq: over.seq ?? 1,
  role: over.role ?? 'assistant',
  body: over.body ?? 'hola',
  created_at: over.created_at ?? '2026-01-01T00:00:00.000Z',
  payload: over.payload,
});

describe('panel chat message mapping', () => {
  it('maps product_cards and cart_actions from supervision payload', () => {
    const rows = [
      base({
        id: 'a1',
        role: 'assistant',
        body: 'Te recomiendo esto',
        payload: {
          product_cards: [
            {
              product_id: 'p1',
              name: 'Hawaiana',
              description: null,
              image_url: null,
              currency: 'USD',
              price_base: 10,
              price_unit: 10,
              price_label: '10 USD',
              available: true,
              requires_configuration: false,
              option_hints: [],
            },
          ],
          cart_actions: [
            {
              type: 'propose_add',
              requires_confirmation: true,
              cart_key: 'k1',
              product_id: 'p1',
              quantity: 1,
              selection: {},
              unit_price: 10,
              line_total: 10,
              currency: 'USD',
              label: 'Hawaiana',
              proposal_id: 'pr1',
              catalog_fingerprint: null,
              product_card: {
                product_id: 'p1',
                name: 'Hawaiana',
                description: null,
                image_url: null,
                currency: 'USD',
                price_base: 10,
                price_unit: 10,
                price_label: '10 USD',
                available: true,
                requires_configuration: false,
                option_hints: [],
              },
            },
          ],
          category_cards: [
            {
              id: 'c1',
              name: 'Pizzas',
              imageUrl: null,
              productCount: 3,
              availableCount: 3,
            },
          ],
        },
      }),
    ];

    const mapped = toPanelChatMessages(rows);
    expect(mapped[0]?.senderLabel).toBe('Asistente');
    expect(mapped[0]?.productCards?.[0]?.name).toBe('Hawaiana');
    expect(mapped[0]?.cartActions?.[0]?.type).toBe('propose_add');
    expect(mapped[0]?.catalogCategories?.[0]?.name).toBe('Pizzas');
  });

  it('prefers richer payload when merging the same message id', () => {
    const lean = base({ id: 'm1', seq: 2, payload: {} });
    const rich = base({
      id: 'm1',
      seq: 2,
      payload: {
        product_cards: [
          {
            product_id: 'p1',
            name: 'Coke',
            description: null,
            image_url: null,
            currency: 'USD',
            price_base: 2,
            price_unit: 2,
            price_label: '2 USD',
            available: true,
            requires_configuration: false,
            option_hints: [],
          },
        ],
      },
    });
    expect(panelMessageRichness(rich)).toBeGreaterThan(panelMessageRichness(lean));
    const merged = mergePanelMessages([lean], [rich]);
    expect(merged).toHaveLength(1);
    expect(
      (merged[0]?.payload as { product_cards?: unknown[] })?.product_cards,
    ).toHaveLength(1);
  });

  it('labels consumer and staff for the merchant mirror layout', () => {
    const mapped = toPanelChatMessages([
      base({ id: 'c', role: 'consumer', body: 'quiero pizza' }),
      base({ id: 's', role: 'staff', seq: 2, body: 'ya te ayudo' }),
    ]);
    expect(mapped[0]?.role).toBe('assistant');
    expect(mapped[0]?.senderLabel).toBe('Cliente');
    expect(mapped[1]?.role).toBe('user');
    expect(mapped[1]?.deliveryStatus).toBe('delivered');
  });

  it('maps voice and image attachments from payload', () => {
    const mapped = toPanelChatMessages([
      base({
        id: 'v1',
        role: 'staff',
        body: '🎤 Nota de voz (3s)',
        payload: {
          voiceUrl: 'data:audio/webm;base64,AAA',
          voiceDurationMs: 3000,
          attachments: [
            {
              id: 'a1',
              kind: 'audio',
              name: 'Nota de voz',
              mime: 'audio/webm',
              size: 12,
              url: 'data:audio/webm;base64,AAA',
            },
          ],
        },
      }),
      base({
        id: 'i1',
        role: 'staff',
        seq: 2,
        body: '📷 foto.jpg',
        payload: {
          attachments: [
            {
              id: 'img1',
              kind: 'image',
              name: 'foto.jpg',
              mime: 'image/jpeg',
              size: 100,
              url: 'data:image/jpeg;base64,/9j/',
            },
          ],
        },
      }),
    ]);
    expect(mapped[0]?.voiceUrl).toContain('data:audio');
    expect(mapped[0]?.voiceDurationMs).toBe(3000);
    expect(mapped[1]?.attachments?.[0]?.kind).toBe('image');
  });
});
