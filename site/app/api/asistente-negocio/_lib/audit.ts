import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { BusinessAllowedOp } from './config';

export type BusinessAuditEvent = {
  at: string;
  userId: string;
  comercioId: string;
  op: BusinessAllowedOp;
  data: Record<string, unknown>;
  auditId: string;
  ok: boolean;
  error?: string;
};

export function appendBusinessAudit(
  auditDir: string,
  event: Omit<BusinessAuditEvent, 'at' | 'auditId'> & { auditId?: string },
): string {
  const auditId =
    event.auditId ||
    `ba_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const row: BusinessAuditEvent = {
    at: new Date().toISOString(),
    userId: event.userId,
    comercioId: event.comercioId,
    op: event.op,
    data: event.data,
    auditId,
    ok: event.ok,
    error: event.error,
  };
  try {
    mkdirSync(auditDir, { recursive: true });
    const day = row.at.slice(0, 10);
    appendFileSync(join(auditDir, `${day}.jsonl`), `${JSON.stringify(row)}\n`, 'utf8');
  } catch {
    /* never block the apply path on audit IO */
  }
  return auditId;
}
