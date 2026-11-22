/**
 * Feature flags for merchant chat supervision.
 * Independent kill switches — chat continues if supervision fails.
 */
import { parseAllowedCommerceIds } from './commerce-auth';

export type ChatSupervisionConfig = {
  enabled: boolean;
  wasenderNotify: boolean;
  humanTakeover: boolean;
  allowedCommerceIds: ReadonlySet<string>;
  reopenAfterHours: number;
  retentionDays: number;
};

function envBool(name: string, fallback = false, env: NodeJS.ProcessEnv = process.env) {
  const raw = (env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function envInt(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env) {
  const n = Number(env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getChatSupervisionConfig(
  env: NodeJS.ProcessEnv = process.env,
): ChatSupervisionConfig {
  return {
    enabled: envBool('CHAT_SUPERVISION_ENABLED', false, env),
    wasenderNotify: envBool('CHAT_SUPERVISION_WASENDER', false, env),
    humanTakeover: envBool('CHAT_SUPERVISION_HUMAN_TAKEOVER', false, env),
    allowedCommerceIds: parseAllowedCommerceIds(
      env.CHAT_SUPERVISION_COMMERCE_IDS || env.CHATBOT_ALLOWED_COMMERCE_IDS,
    ),
    reopenAfterHours: envInt('CHAT_SUPERVISION_REOPEN_HOURS', 12, env),
    retentionDays: envInt('CHAT_SUPERVISION_RETENTION_DAYS', 30, env),
  };
}

export function isSupervisionEnabledForCommerce(
  commerceId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const cfg = getChatSupervisionConfig(env);
  if (!cfg.enabled) return false;
  const id = commerceId.trim().toLowerCase();
  if (!id) return false;
  if (cfg.allowedCommerceIds.size === 0) {
    // Fail-closed in production; allow all only outside production when empty.
    return (env.NODE_ENV || '').toLowerCase() !== 'production';
  }
  return cfg.allowedCommerceIds.has(id);
}
