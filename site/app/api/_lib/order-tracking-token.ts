import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const TOKEN_BYTES = 32;

export function generatePublicTrackingToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashPublicTrackingToken(token: string): string {
  return createHash('sha256').update(token.trim(), 'utf8').digest('hex');
}

export function verifyPublicTrackingToken(token: string, expectedHash: string | null | undefined): boolean {
  const provided = (token ?? '').trim();
  const expected = (expectedHash ?? '').trim().toLowerCase();
  if (!provided || !expected || !/^[a-f0-9]{64}$/.test(expected)) {
    return false;
  }

  const providedHash = hashPublicTrackingToken(provided);
  const a = Buffer.from(providedHash, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Mask token for safe logs (never log full value). */
export function maskTrackingToken(token: string): string {
  const value = token.trim();
  if (value.length < 8) return '[redacted]';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
