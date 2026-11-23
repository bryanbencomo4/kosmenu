import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('WhatsApp widget vs discovery composer', () => {
  it('hides the floating WA widget on /asistente so Enviar is not covered', () => {
    const src = readFileSync(
      path.join(root, 'components/WhatsAppChatWidget.tsx'),
      'utf8',
    );
    expect(src).toMatch(/pathname\.startsWith\('\/asistente'\)/);
  });

  it('keeps discovery composer shell above competing chrome', () => {
    const view = readFileSync(
      path.join(root, 'app/asistente/DiscoveryAssistantView.tsx'),
      'utf8',
    );
    const composer = readFileSync(
      path.join(root, 'app/asistente/DiscoveryComposer.tsx'),
      'utf8',
    );
    expect(view).toMatch(/data-discovery-composer-shell="1"/);
    expect(view).toMatch(/relative z-20/);
    expect(composer).toMatch(/relative z-30/);
  });
});
