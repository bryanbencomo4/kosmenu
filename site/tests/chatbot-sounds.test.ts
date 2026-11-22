import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  __chatSoundUrlMapForTests,
  __resetChatSoundManagerForTests,
  areChatSoundsLicensed,
  CHAT_SOUND_DEFAULT_GAIN,
  isChatSoundsEnabled,
  playChatSound,
  playChatSoundAsync,
  setChatSoundsEnabled,
} from '../app/v/[id]/_components/chat/chat-sound-manager';

const publicChatSounds = join(__dirname, '../public/sounds/chat');

describe('chat sound assets + manager', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CHATBOT_SOUNDS_LICENSED', '1');
    __resetChatSoundManagerForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    __resetChatSoundManagerForTests();
  });

  it('maps six events to static mp3 paths (no base64)', () => {
    const map = __chatSoundUrlMapForTests();
    expect(Object.keys(map)).toHaveLength(6);
    expect(map.messageSent).toBe('/sounds/chat/message-sent.mp3');
    expect(map.messageReceived).toBe('/sounds/chat/message-received.mp3');
    expect(map.recordingStart).toBe('/sounds/chat/recording-start.mp3');
    expect(map.recordingStop).toBe('/sounds/chat/recording-stop.mp3');
    expect(map.voiceSent).toBe('/sounds/chat/voice-sent.mp3');
    expect(map.recordingCancel).toBe('/sounds/chat/recording-cancel.mp3');
    for (const url of Object.values(map)) {
      expect(url.startsWith('data:')).toBe(false);
      expect(url.endsWith('.mp3')).toBe(true);
    }
  });

  it('ships wired MP3 files and documents efecto sources', () => {
    for (const name of [
      'message-sent.mp3',
      'message-received.mp3',
      'recording-start.mp3',
      'recording-stop.mp3',
      'voice-sent.mp3',
      'recording-cancel.mp3',
      'manifest.json',
    ]) {
      expect(existsSync(join(publicChatSounds, name))).toBe(true);
    }
    const manifest = JSON.parse(
      readFileSync(join(publicChatSounds, 'manifest.json'), 'utf8'),
    );
    expect(manifest.events.messageSent.source).toBe('efecto-01.mp3');
    expect(manifest.events.messageReceived.source).toBe('efecto-02.mp3');
    expect(manifest.events.recordingStart.source).toBe('efecto-05.mp3');
    expect(manifest.events.recordingStop.source).toBe('efecto-03.mp3');
    expect(manifest.events.voiceSent.source).toBe('efecto-06.mp3');
    expect(manifest.events.recordingCancel.source).toBe('efecto-07.mp3');
    expect(manifest.unused?.[0]?.source).toBe('efecto-04.mp3');
  });

  it('default gain is ~20%', () => {
    expect(CHAT_SOUND_DEFAULT_GAIN).toBeCloseTo(0.2, 5);
  });

  it('stays enabled with original synth when MP3s are not licensed', () => {
    vi.stubEnv('NEXT_PUBLIC_CHATBOT_SOUNDS_LICENSED', '0');
    stubLocalStorage(new Map());
    __resetChatSoundManagerForTests();
    expect(areChatSoundsLicensed()).toBe(false);
    expect(isChatSoundsEnabled()).toBe(true);
  });

  it('persists mute preference (default on)', () => {
    const store = new Map<string, string>();
    stubLocalStorage(store);
    __resetChatSoundManagerForTests();
    expect(isChatSoundsEnabled()).toBe(true);
    setChatSoundsEnabled(false);
    __resetChatSoundManagerForTests();
    expect(isChatSoundsEnabled()).toBe(false);
  });

  it('playChatSoundAsync is a no-op when muted (no throw)', async () => {
    stubLocalStorage(new Map([['elmenuxfa:chat-sounds-v1', '0']]));
    __resetChatSoundManagerForTests();
    await expect(playChatSoundAsync('messageSent')).resolves.toBe(0);
  });

  it('playChatSoundAsync uses synth when unlicensed (no throw)', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHATBOT_SOUNDS_LICENSED', '0');
    stubLocalStorage(new Map());
    const ctx = {
      state: 'running',
      currentTime: 0,
      resume: async () => {},
      createGain: () => ({
        gain: {
          value: 1,
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      }),
      createOscillator: () => ({
        type: 'sine',
        frequency: { value: 440 },
        connect() {},
        start() {},
        stop() {},
      }),
      destination: {},
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => null,
          setItem: () => {},
        },
        AudioContext: function AudioContext() {
          return ctx;
        },
      },
    });
    __resetChatSoundManagerForTests();
    await expect(playChatSoundAsync('messageSent')).resolves.toBeGreaterThan(0);
  });

  it('playChatSound tolerates missing AudioContext (autoplay blocked)', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => null,
          setItem: () => {},
        },
        // no AudioContext / webkitAudioContext
      },
    });
    __resetChatSoundManagerForTests();
    expect(() => playChatSound('messageReceived')).not.toThrow();
  });
});

function stubLocalStorage(store: Map<string, string>) {
  const localStorageMock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: localStorageMock },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorageMock,
  });
}
