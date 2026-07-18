import { createHash } from 'crypto';

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function normalizeIdempotencyKey(raw: string | null): string | null {
  const key = (raw ?? '').trim();
  if (!key) return null;
  if (!KEY_PATTERN.test(key)) return null;
  return key;
}

export function hashOrderIdempotencyPayload(payload: unknown): string {
  const canonical = JSON.stringify(payload ?? {});
  return createHash('sha256').update(canonical).digest('hex');
}
