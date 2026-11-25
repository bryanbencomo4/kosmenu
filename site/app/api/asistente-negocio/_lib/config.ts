/**
 * Business admin assistant — server config (fail-closed flags live in business-assistant.ts).
 */

export type BusinessAllowedOp =
  | 'set_price'
  | 'set_availability'
  | 'set_hours'
  | 'set_en_linea';

export const BUSINESS_ALLOWED_OPS: readonly BusinessAllowedOp[] = [
  'set_price',
  'set_availability',
  'set_hours',
  'set_en_linea',
] as const;

export type BusinessAssistantRuntimeConfig = {
  rateLimitPerIpPerMinute: number;
  rateLimitPerUserPerMinute: number;
  confirmTtlMs: number;
  maxProductsSample: number;
  maxRecentOrders: number;
  panelUrl: string;
  /** Login at app root; `next` resumes assistant after auth. */
  loginUrl: string;
  registerUrl: string;
  canonicalAppUrl: string;
  auditDir: string;
};

function envInt(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getBusinessAssistantRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): BusinessAssistantRuntimeConfig {
  return {
    rateLimitPerIpPerMinute: envInt('BUSINESS_ASSISTANT_RATE_LIMIT_PER_IP_PER_MIN', 30, env),
    rateLimitPerUserPerMinute: envInt('BUSINESS_ASSISTANT_RATE_LIMIT_PER_USER_PER_MIN', 40, env),
    confirmTtlMs: envInt('BUSINESS_ASSISTANT_CONFIRM_TTL_MS', 10 * 60 * 1000, env),
    maxProductsSample: envInt('BUSINESS_ASSISTANT_MAX_PRODUCTS_SAMPLE', 40, env),
    maxRecentOrders: envInt('BUSINESS_ASSISTANT_MAX_RECENT_ORDERS', 8, env),
    panelUrl: 'https://app.elmenuxfa.com/',
    loginUrl: 'https://app.elmenuxfa.com/?next=/asistente',
    registerUrl: 'https://app.elmenuxfa.com/?tab=register',
    canonicalAppUrl: 'https://app.elmenuxfa.com/asistente',
    auditDir:
      (env.BUSINESS_ASSISTANT_AUDIT_DIR ?? '').trim() ||
      `${process.cwd()}/.data/business-assistant-audit`,
  };
}

export function isBusinessAllowedOp(op: string): op is BusinessAllowedOp {
  return (BUSINESS_ALLOWED_OPS as readonly string[]).includes(op);
}
