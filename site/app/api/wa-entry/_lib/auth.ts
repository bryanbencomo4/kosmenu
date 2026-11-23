import { createHmac, timingSafeEqual } from 'node:crypto';

import type { WaEntryConfig } from './config';

/**
 * Webhook authenticity.
 *
 * Provider (WasenderApi docs — webhook-setup):
 *   Header `X-Webhook-Signature` must equal the session Webhook Secret
 *   (exact string comparison; NOT an HMAC of the body).
 *
 * Platform-local modes (sim / tunnel):
 *   - `X-Platform-Wa-Secret: <secret>`
 *   - `X-Platform-Wa-Signature: hex(hmac_sha256(secret, rawBody))`
 *
 * Fail closed when secret empty, except sim + ALLOW_INSECURE_LOCAL in test/dev.
 */
export function verifyWaEntryWebhook(params: {
  config: WaEntryConfig;
  headers: Headers | Record<string, string | null | undefined>;
  rawBody: string;
  env?: NodeJS.ProcessEnv;
}): { ok: true; mode?: string } | { ok: false; status: number; error: string } {
  const env = params.env ?? process.env;
  const secret = params.config.webhookSecret;

  const getHeader = (name: string): string => {
    if (params.headers instanceof Headers) {
      return params.headers.get(name) || params.headers.get(name.toLowerCase()) || '';
    }
    const key = Object.keys(params.headers).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? String(params.headers[key] || '') : '';
  };

  if (!secret) {
    const insecureLocal =
      (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') &&
      params.config.adapter === 'sim' &&
      (env.PLATFORM_WA_ALLOW_INSECURE_LOCAL || '').trim() === '1';
    if (insecureLocal) return { ok: true, mode: 'insecure_local' };
    return { ok: false, status: 401, error: 'webhook_secret_required' };
  }

  // Wasender official: X-Webhook-Signature === webhook secret
  const wasenderSig = getHeader('x-webhook-signature').trim();
  if (wasenderSig && safeEqual(wasenderSig, secret)) {
    return { ok: true, mode: 'wasender_signature' };
  }

  // Platform shared secret (local / dual-dispatch)
  const shared = getHeader('x-platform-wa-secret').trim();
  if (shared && safeEqual(shared, secret)) {
    return { ok: true, mode: 'platform_secret' };
  }

  // Platform HMAC (local tests)
  const platformHmac = getHeader('x-platform-wa-signature').trim().toLowerCase();
  if (platformHmac) {
    const expected = createHmac('sha256', secret).update(params.rawBody).digest('hex');
    if (safeEqual(platformHmac, expected)) {
      return { ok: true, mode: 'platform_hmac' };
    }
  }

  return { ok: false, status: 401, error: 'webhook_unauthorized' };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
