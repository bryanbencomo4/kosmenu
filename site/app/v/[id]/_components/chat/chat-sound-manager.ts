/**
 * Centralized chat UI sounds (Web Audio). Single AudioContext.
 * Default: original synthesized cues (no third-party samples).
 * Optional MP3s only when NEXT_PUBLIC_CHATBOT_SOUNDS_LICENSED=1.
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

/** Original short tones — not WhatsApp assets. */
const SYNTH_CUES: Record<
  ChatSoundEvent,
  { freqs: number[]; durationsMs: number[]; type?: OscillatorType }
> = {
  messageSent: { freqs: [880, 1175], durationsMs: [45, 55], type: 'sine' },
  messageReceived: { freqs: [660, 880], durationsMs: [55, 70], type: 'triangle' },
  recordingStart: { freqs: [520], durationsMs: [70], type: 'sine' },
  recordingStop: { freqs: [420], durationsMs: [55], type: 'square' },
  voiceSent: { freqs: [740, 990, 1180], durationsMs: [40, 45, 60], type: 'sine' },
  recordingCancel: { freqs: [300, 220], durationsMs: [70, 90], type: 'triangle' },
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

/** True when optional third-party MP3 samples may be loaded. */
export function areChatSoundsLicensed(): boolean {
  return (
    (process.env.NEXT_PUBLIC_CHATBOT_SOUNDS_LICENSED || '').trim() === '1'
  );
}

export function isChatSoundsEnabled(): boolean {
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

function playSynthCue(
  ctx: AudioContext,
  event: ChatSoundEvent,
): number {
  const cue = SYNTH_CUES[event];
  const master = ctx.createGain();
  master.gain.value = CHAT_SOUND_DEFAULT_GAIN;
  master.connect(ctx.destination);

  let t = ctx.currentTime;
  let totalMs = 0;
  for (let i = 0; i < cue.freqs.length; i++) {
    const dur = Math.max(0.02, (cue.durationsMs[i] || 50) / 1000);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = cue.type || 'sine';
    osc.frequency.value = cue.freqs[i]!;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.01);
    t += dur * 0.92;
    totalMs += cue.durationsMs[i] || 50;
  }
  return Math.max(1, totalMs);
}

async function loadBuffer(event: ChatSoundEvent): Promise<AudioBuffer | null> {
  if (!areChatSoundsLicensed()) return null;
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
  if (!areChatSoundsLicensed()) return;
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
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    if (areChatSoundsLicensed()) {
      const buf = await loadBuffer(event);
      if (buf) {
        startBuffer(ctx, buf);
        return Math.max(1, Math.round(buf.duration * 1000));
      }
    }

    return playSynthCue(ctx, event);
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
