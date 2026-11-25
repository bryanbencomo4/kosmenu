import { createHash } from 'crypto';

/** Stable synthetic WA-style id so web escalations still land in /admin/wa-control. */
export function syntheticBusinessAssistantDigits(userId: string): string {
  const h = createHash('sha256').update(`ba:${userId}`).digest('hex');
  // 900 + 10 hex→decimal digits ≈ valid length for inbox keys.
  const body = String(parseInt(h.slice(0, 8), 16) % 10_000_000_000).padStart(10, '0');
  return `900${body}`.slice(0, 13);
}
