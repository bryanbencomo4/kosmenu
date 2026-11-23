/**
 * Staging isolation for chatbot live/media smokes.
 * When CHATBOT_STAGING_MODE=1:
 * - Orders and mutating order APIs are server-blocked
 * - Supabase clients should be wrapped read-only (see supabase-server)
 * Never enable in production NODE_ENV.
 */

export function isChatbotStagingMode(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const nodeEnv = (env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'production') return false;
  return ['1', 'true', 'yes'].includes(
    (env.CHATBOT_STAGING_MODE ?? '').trim().toLowerCase(),
  );
}

export function isChatbotOrdersBlocked(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isChatbotStagingMode(env)) return true;
  return ['1', 'true', 'yes'].includes(
    (env.CHATBOT_BLOCK_ORDERS ?? '').trim().toLowerCase(),
  );
}

export class StagingWriteBlockedError extends Error {
  code = 'staging_readonly_write_blocked';
  constructor(detail = 'Write blocked in chatbot staging mode') {
    super(detail);
    this.name = 'StagingWriteBlockedError';
  }
}
