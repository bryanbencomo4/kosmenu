import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  analyzeImage,
  classifyMediaMime,
  transcribeAudio,
} from '../app/api/_lib/assistant-media';
import { normalizeWaInboundPayload } from '../app/api/wa-entry/_lib/contract';

const env = { GEMINI_API_KEY: 'test-key' } as unknown as NodeJS.ProcessEnv;

function mockGemini(text: string, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('assistant media', () => {
  it('classifies mime types', () => {
    expect(classifyMediaMime('audio/webm;codecs=opus')).toBe('audio');
    expect(classifyMediaMime('audio/ogg; codecs=opus')).toBe('audio');
    expect(classifyMediaMime('image/jpeg')).toBe('image');
    expect(classifyMediaMime('application/pdf')).toBeNull();
  });

  it('transcribes audio and drops inaudible', async () => {
    mockGemini('  “quiero cambiar la tasa del peso a 5000”  ');
    await expect(transcribeAudio({ bytes: Buffer.alloc(500), mime: 'audio/webm', env })).resolves.toBe(
      'quiero cambiar la tasa del peso a 5000',
    );
    mockGemini('[inaudible]');
    await expect(transcribeAudio({ bytes: Buffer.alloc(500), mime: 'audio/webm', env })).resolves.toBeNull();
  });

  it('parses image analysis JSON (also inside code fences)', async () => {
    mockGemini(
      '```json\n{"tipo":"Plato","resumen":"Una pizza margarita","texto":"","busqueda":"pizza"}\n```',
    );
    const out = await analyzeImage({ bytes: Buffer.alloc(500), mime: 'image/jpeg', audience: 'discovery', env });
    expect(out).toEqual({ tipo: 'plato', resumen: 'Una pizza margarita', texto: '', busqueda: 'pizza' });
  });

  it('fails soft when Gemini errors', async () => {
    mockGemini('', false);
    await expect(
      analyzeImage({ bytes: Buffer.alloc(500), mime: 'image/png', audience: 'business', env }),
    ).resolves.toBeNull();
  });
});

describe('wasender inbound media', () => {
  it('exposes audio messages as media with empty text', () => {
    const ev = normalizeWaInboundPayload({
      event: 'messages.received',
      sessionId: 's1',
      data: {
        messages: {
          key: { id: 'ABC', remoteJid: '584140821633@s.whatsapp.net', fromMe: false },
          message: { audioMessage: { url: 'https://mmg.whatsapp.net/x', mimetype: 'audio/ogg; codecs=opus', mediaKey: 'k' } },
        },
      },
    });
    expect(ev?.text).toBe('');
    expect(ev?.media?.kind).toBe('audio');
  });

  it('keeps the caption of a photo as text', () => {
    const ev = normalizeWaInboundPayload({
      event: 'messages.received',
      sessionId: 's1',
      data: {
        messages: {
          key: { id: 'DEF', remoteJid: '584140821633@s.whatsapp.net', fromMe: false },
          message: { imageMessage: { mimetype: 'image/jpeg', caption: 'busco esto' } },
        },
      },
    });
    expect(ev?.text).toBe('busco esto');
    expect(ev?.media?.kind).toBe('image');
  });
});
