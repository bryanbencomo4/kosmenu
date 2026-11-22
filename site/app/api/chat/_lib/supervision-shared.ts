import { createHmac } from 'node:crypto';

import { appSiteUrl } from '../../_lib/public-site-url';

export function sessionPepper(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.CHAT_SUPERVISION_SESSION_PEPPER?.trim() ||
    env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'local-dev-pepper'
  );
}

export function hashConsumerSession(
  comercioId: string,
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  return createHmac('sha256', sessionPepper(env))
    .update(`${comercioId.trim()}:${sessionId.trim()}`)
    .digest('hex');
}

/** WaSender deep link → Flutter merchant host (native inbox). */
export function merchantConversationHref(conversationId: string) {
  const base = appSiteUrl.replace(/\/$/, '');
  return `${base}/panel/conversaciones/${encodeURIComponent(conversationId)}`;
}

export const ESCALATION_RE =
  /\b(humano|hablar con|encargad[oa]|reclamo|queja|no me est[aá]s entendiendo|pedido (lleg[oó]|vino) mal|atenci[oó]n)\b/i;

export function detectNeedsHuman(text: string) {
  return ESCALATION_RE.test(text);
}
