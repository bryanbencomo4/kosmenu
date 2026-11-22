import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const store = new Map<string, string>();
vi.stubGlobal('window', {});
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
});

import { buildDeliveryLocationReply } from '../app/v/[id]/_components/chat/chat-delivery-quote';
import { isPersistedMediaUrl } from '../app/v/[id]/_components/chat/chat-media-persist';
import {
  loadChatHistory,
  saveChatHistory,
  clearChatHistory,
} from '../app/_lib/chatbot-session';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('chat delivery location replies', () => {
  it('explains no delivery / out of zone / quoted fee', () => {
    expect(
      buildDeliveryLocationReply({
        supportsDelivery: false,
        pickupAvailable: true,
        quote: null,
        feeLabel: null,
      }).kind,
    ).toBe('no_delivery');

    expect(
      buildDeliveryLocationReply({
        supportsDelivery: true,
        quote: {
          applied: true,
          fee: 0,
          free: false,
          method: 'area_zones',
          blocked: true,
          blockReason: 'Tu dirección está fuera de la zona de cobertura.',
          outOfZone: true,
          distanceKm: 12,
          snapshot: null,
        },
        feeLabel: null,
      }).message,
    ).toMatch(/fuera de la zona/i);

    const quoted = buildDeliveryLocationReply({
      supportsDelivery: true,
      quote: {
        applied: true,
        fee: 2.5,
        free: false,
        method: 'fixed',
        blocked: false,
        blockReason: null,
        outOfZone: false,
        distanceKm: 3,
        snapshot: null,
      },
      feeLabel: '2,50 USD',
    });
    expect(quoted.kind).toBe('quoted');
    expect(quoted.openCheckout).toBe(true);
    expect(quoted.message).toMatch(/2,50 USD/);
  });
});

describe('chat media persistence', () => {
  beforeEach(() => {
    store.clear();
  });

  it('recognizes persisted image urls', () => {
    expect(isPersistedMediaUrl('data:image/jpeg;base64,abc')).toBe(true);
    expect(isPersistedMediaUrl('https://cdn.example/x.jpg')).toBe(true);
    expect(isPersistedMediaUrl('blob:http://localhost/x')).toBe(false);
    expect(isPersistedMediaUrl('')).toBe(false);
  });

  it('keeps data-url image attachments across save/load', () => {
    clearChatHistory('media-persist');
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ';
    saveChatHistory('media-persist', [
      {
        id: 'u1',
        role: 'user',
        text: '📷 foto',
        createdAt: 1,
        attachments: [
          {
            id: 'a1',
            kind: 'image',
            name: 'foto.jpg',
            mime: 'image/jpeg',
            size: 12,
            url: dataUrl,
            analysis: null,
          },
        ],
      },
    ]);
    const loaded = loadChatHistory('media-persist');
    expect(loaded?.[0]?.attachments?.[0]?.url).toBe(dataUrl);
    clearChatHistory('media-persist');
  });
});

describe('chat profile + lightbox wiring', () => {
  it('wires header profile/avatar, lightbox, and image notice', () => {
    const view = read('app/v/[id]/_components/chat/ChatAssistantView.tsx');
    expect(view).toMatch(/ChatBusinessProfileSheet/);
    expect(view).toMatch(/ChatMediaLightbox/);
    expect(view).toMatch(/onOpenAvatar/);
    expect(view).toMatch(/onOpenProfile/);
    expect(view).toMatch(/comprobante de pago/);
    expect(view).toMatch(/onQuoteDeliveryAt/);
    expect(view).toMatch(/fileToPersistedDataUrl/);
    expect(read('app/v/[id]/_components/chat/ChatHeader.tsx')).toMatch(
      /data-chat-header-profile/,
    );
    expect(read('app/v/[id]/_components/chat/ChatProductCarousel.tsx')).toMatch(
      /data-chat-product-image/,
    );
  });
});
