import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('WhatsApp-like phone action sheet', () => {
  it('renders chat + call choices for tapped phone numbers', () => {
    const sheet = read(
      'app/v/[id]/_components/chat/ChatPhoneActionSheet.tsx',
    );
    expect(sheet).toMatch(/Este número de teléfono está en WhatsApp/);
    expect(sheet).toMatch(/Chatear con/);
    expect(sheet).toMatch(/Llamar en WhatsApp/);
    expect(sheet).toMatch(/openWhatsAppChat/);
    expect(sheet).toMatch(/tel:/);
  });

  it('intercepts phone link taps in the chat shell', () => {
    const view = read(
      'app/v/[id]/_components/chat/ChatAssistantView.tsx',
    );
    expect(view).toMatch(/ChatPhoneActionSheet/);
    expect(view).toMatch(/data-chat-link="phone"/);
    expect(view).toMatch(/setPhoneAction/);
    const format = read('app/v/[id]/_components/chat/chat-format.tsx');
    expect(format).toMatch(/data-chat-phone-raw/);
  });
});
