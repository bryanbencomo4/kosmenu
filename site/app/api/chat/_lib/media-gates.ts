/**
 * Gates for chat media (voice STT / image analysis).
 * Default: simulate locally. Never bill Gemini unless explicitly enabled
 * AND simulation is off AND live hard caps allow it.
 */

export type ChatMediaMode = 'disabled' | 'simulate' | 'live';

export function resolveChatMediaMode(
  env: NodeJS.ProcessEnv = process.env,
): ChatMediaMode {
  const nodeEnv = (env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'production') return 'disabled';

  const simulate = ['1', 'true', 'yes'].includes(
    (env.CHATBOT_SIMULATE_GEMINI ?? '').trim().toLowerCase(),
  );
  const stt = ['1', 'true', 'yes'].includes(
    (env.CHATBOT_VOICE_STT ?? '').trim().toLowerCase(),
  );
  const vision = ['1', 'true', 'yes'].includes(
    (env.CHATBOT_IMAGE_ANALYSIS ?? '').trim().toLowerCase(),
  );

  // Prefer simulate whenever simulator is on — no billable media calls.
  if (simulate) return 'simulate';
  if (stt || vision) return 'live';
  return 'simulate';
}

export function chatMediaLiveAllowed(
  env: NodeJS.ProcessEnv = process.env,
): { ok: boolean; reason?: string } {
  if (resolveChatMediaMode(env) !== 'live') {
    return { ok: false, reason: 'media_not_live' };
  }
  if (!(env.GEMINI_API_KEY || '').trim()) {
    return { ok: false, reason: 'gemini_unconfigured' };
  }
  // Explicit second lock: require CHATBOT_MEDIA_LIVE=1 for any billable media.
  const live = ['1', 'true', 'yes'].includes(
    (env.CHATBOT_MEDIA_LIVE ?? '').trim().toLowerCase(),
  );
  if (!live) {
    return { ok: false, reason: 'media_live_locked' };
  }
  return { ok: true };
}

export const CHAT_MEDIA_MAX_AUDIO_BYTES = 2_500_000; // ~2.5 MB
export const CHAT_MEDIA_MAX_IMAGE_BYTES = 4_000_000;
export const CHAT_MEDIA_MAX_FILE_BYTES = 4_000_000;

export const CHAT_ALLOWED_AUDIO_MIME = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-m4a',
  'audio/aac',
];

export const CHAT_ALLOWED_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

export const CHAT_ALLOWED_FILE_MIME = [
  ...CHAT_ALLOWED_IMAGE_MIME,
  'application/pdf',
];
