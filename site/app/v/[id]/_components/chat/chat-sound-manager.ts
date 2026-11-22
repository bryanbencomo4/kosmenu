/**
 * Centralized chat UI sounds (Web Audio). Single AudioContext, lazy decode,
 * cached AudioBuffers. Failures never break chat.
 */

export type ChatSoundEvent =
  | 'messageSent'
  | 'messageReceived'
  | 'recordingStart'
  | 'recordingStop'
  | 'voiceSent'
  | 'recordingCancel';

const SOUND_URLS: Record<ChatSoundEvent, string> = {
  messageSent: '/sounds/chat/message-sent.mp3',
  messageReceived: '/sounds/chat/message-received.mp3',
  recordingStart: '/sounds/chat/recording-start.mp3',
  recordingStop: '/sounds/chat/recording-stop.mp3',
  voiceSent: '/sounds/chat/voice-sent.mp3',
  recordingCancel: '/sounds/chat/recording-cancel.mp3',
};

const STORAGE_KEY = 'elmenuxfa:chat-sounds-v1';
/** ~20% — moderate default; user can mute via header menu. */
export const CHAT_SOUND_DEFAULT_GAIN = 0.2;

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext || w.webkitAudioContext || null;
}

let sharedCtx: AudioContext | null = null;
const buffers = new Map<ChatSoundEvent, AudioBuffer>();
const inflight = new Map<ChatSoundEvent, Promise<AudioBuffer | null>>();
let unlockBound = false;
let enabledCache: boolean | null = null;

/** True only when sounds are explicitly licensed for distribution. */
export function areChatSoundsLicensed(): boolean {
  return (
    (process.env.NEXT_PUBLIC_CHATBOT_SOUNDS_LICENSED || '').trim() === '1'
  );
}

export function isChatSoundsEnabled(): boolean {
  // Unlicensed WhatsApp-derived cues stay silent in public builds.
  if (!areChatSoundsLicensed()) return false;
  if (typeof window === 'undefined') return true;
  if (enabledCache !== null) return enabledCache;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    enabledCache = v !== '0';
  } catch {
    enabledCache = true;
  }
  return enabledCache;
}

export function setChatSoundsEnabled(on: boolean) {
  enabledCache = on;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function getCtx(): AudioContext | null {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  if (!sharedCtx) {
    try {
      sharedCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return sharedCtx;
}

/** Call from a user gesture so browsers allow playback. */
export function unlockChatSounds(): void {
  if (unlockBound) return;
  const ctx = getCtx();
  if (!ctx) return;
  unlockBound = true;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
}

async function loadBuffer(event: ChatSoundEvent): Promise<AudioBuffer | null> {
  const cached = buffers.get(event);
  if (cached) return cached;
  const pending = inflight.get(event);
  if (pending) return pending;

  const job = (async () => {
    try {
      const ctx = getCtx();
      if (!ctx) return null;
      const res = await fetch(SOUND_URLS[event], { cache: 'force-cache' });
      if (!res.ok) return null;
      const raw = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(raw.slice(0));
      buffers.set(event, buf);
      return buf;
    } catch {
      return null;
    } finally {
      inflight.delete(event);
    }
  })();

  inflight.set(event, job);
  return job;
}

function startBuffer(ctx: AudioContext, buf: AudioBuffer): void {
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = CHAT_SOUND_DEFAULT_GAIN;
  src.buffer = buf;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(0);
}

/** Prefetch without blocking UI. Safe to call anytime after unlock. */
export function prefetchChatSounds(events?: ChatSoundEvent[]): void {
  if (typeof window === 'undefined' || !isChatSoundsEnabled()) return;
  const list = events || (Object.keys(SOUND_URLS) as ChatSoundEvent[]);
  for (const ev of list) {
    void loadBuffer(ev);
  }
}

/**
 * Play a chat UI sound. Never throws. Does not await network if already cached;
 * schedules decode+play in background when cold.
 */
export function playChatSound(event: ChatSoundEvent): void {
  void playChatSoundAsync(event);
}

/**
 * Awaitable play — use when ordering matters (e.g. recording-start before MediaRecorder).
 * Resolves after the cue has been scheduled (and buffer loaded). Never throws.
 * Returns approximate playback duration in ms (0 if skipped/failed).
 */
export async function playChatSoundAsync(
  event: ChatSoundEvent,
): Promise<number> {
  if (typeof window === 'undefined') return 0;
  if (!isChatSoundsEnabled()) return 0;
  try {
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden' &&
      event === 'messageReceived'
    ) {
      return 0;
    }
  } catch {
    /* ignore */
  }

  try {
    const ctx = getCtx();
    if (!ctx) return 0;
    const buf = await loadBuffer(event);
    if (!buf) return 0;
    startBuffer(ctx, buf);
    return Math.max(1, Math.round(buf.duration * 1000));
  } catch {
    return 0;
  }
}

/** Test helpers */
export function __chatSoundUrlMapForTests() {
  return { ...SOUND_URLS };
}

export function __resetChatSoundManagerForTests() {
  sharedCtx = null;
  buffers.clear();
  inflight.clear();
  unlockBound = false;
  enabledCache = null;
}
