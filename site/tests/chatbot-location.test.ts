import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildBusinessLocation,
  matchLocationIntent,
} from '../app/v/[id]/_components/chat/chat-location';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('chat business location', () => {
  it('matches location / directions questions', () => {
    for (const t of [
      'dónde están',
      'como llego',
      'envíame la ubicación',
      'manda la ubicacion',
      'quiero el mapa',
    ]) {
      expect(matchLocationIntent(t)).toBe(true);
    }
    expect(matchLocationIntent('quiero una hawaiana')).toBe(false);
  });

  it('builds a maps pin when coords exist', () => {
    const loc = buildBusinessLocation({
      lat: 7.838,
      lng: -72.225,
      name: 'pizzas el trueno',
      address: 'Palmira, Táchira',
    });
    expect(loc).not.toBeNull();
    expect(loc!.mapsUrl).toContain('7.838');
    expect(loc!.directionsUrl).toContain('destination');
    expect(
      buildBusinessLocation({
        lat: null,
        lng: null,
        name: 'x',
        address: null,
      }),
    ).toBeNull();
  });

  it('wires location intent + map preview + no yellow input ring', () => {
    const view = readFileSync(
      path.join(root, 'app/v/[id]/_components/chat/ChatAssistantView.tsx'),
      'utf8',
    );
    const bubble = readFileSync(
      path.join(root, 'app/v/[id]/_components/chat/ChatMessageBubble.tsx'),
      'utf8',
    );
    const css = readFileSync(path.join(root, 'app/globals.css'), 'utf8');
    expect(view).toMatch(/answerLocationIntent/);
    expect(view).toMatch(/businessLocation/);
    expect(bubble).toMatch(/staticMapPreviewUrl/);
    expect(bubble).toMatch(/data-chat-location-kind/);
    expect(css).toMatch(/data-chat-composer-input-shell/);
    expect(css).toMatch(/#chatbot-composer-input:focus/);
  });
});
