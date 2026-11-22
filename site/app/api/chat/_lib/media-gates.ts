/**
 * Gates for chat media (voice STT / image analysis).
 * Default: simulate locally. Never bill Gemini unless explicitly enabled
 * AND simulation is off AND live hard caps allow it.
 *
 * Production: allowed only when CHATBOT_MEDIA_LIVE=1 and STT/vision flags
 * are on (same second lock as chatMediaLiveAllowed). Never silently bills.
 */

export type ChatMediaMode = 'disabled' | 'simulate' | 'live';

function flagOn(env: NodeJS.ProcessEnv, key: string): boolean {
  return ['1', 'true', 'yes'].includes((env[key] ?? '').trim().toLowerCase());
}

export function resolveChatMediaMode(
  env: NodeJS.ProcessEnv = process.env,
): ChatMediaMode {
  const simulate = flagOn(env, 'CHATBOT_SIMULATE_GEMINI');
  const stt = flagOn(env, 'CHATBOT_VOICE_STT');
  const vision = flagOn(env, 'CHATBOT_IMAGE_ANALYSIS');
  const mediaLive = flagOn(env, 'CHATBOT_MEDIA_LIVE');
  const nodeEnv = (env.NODE_ENV || '').trim().toLowerCase();

  // Prefer simulate whenever simulator is on — no billable media calls.
  if (simulate) return 'simulate';

  // Production requires the explicit media-live lock (pilot / Trueno).
  if (nodeEnv === 'production') {
    if (mediaLive && (stt || vision)) return 'live';
    return 'disabled';
  }

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
  if (!flagOn(env, 'CHATBOT_MEDIA_LIVE')) {
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
