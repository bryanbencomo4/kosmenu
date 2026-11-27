import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeSummary, WA_MASTER_TURN_CAP } from './memory';
import type { WaMasterMemoryStore } from './memory-store';
import type { WaMasterMemory, WaMasterSummary, WaMasterTurn } from './types';

/**
 * Preview/Postgres memory store (L1 turns + L2 summary + L3 profile).
 * Requires supabase/preview-bootstrap/13-wa-master-assistant.sql
 */
export function createSupabaseWaMasterMemoryStore(client: SupabaseClient): WaMasterMemoryStore {
  return {
    async get(fromDigits) {
      const { data: thread, error: threadErr } = await client
        .from('wa_master_threads')
        .select('summary_json,updated_at_ms,expires_at_ms')
        .eq('from_digits', fromDigits)
        .maybeSingle();
      if (threadErr || !thread) return null;

      const { data: profile } = await client
        .from('wa_master_profiles')
        .select('*')
        .eq('from_digits', fromDigits)
        .maybeSingle();

      const { data: turnRows } = await client
        .from('wa_master_turns')
        .select('role,text,at_ms,intent,specialist')
        .eq('from_digits', fromDigits)
        .order('at_ms', { ascending: true })
        .limit(WA_MASTER_TURN_CAP);

      const nowMs = Date.now();
      const summary = normalizeSummary(
        (thread.summary_json as Partial<WaMasterSummary>) || {},
        nowMs,
      );
      const turns: WaMasterTurn[] = (turnRows || []).map((row) => ({
        role: row.role as WaMasterTurn['role'],
        text: String(row.text || ''),
        atMs: Number(row.at_ms || 0),
        intent: (row.intent as WaMasterTurn['intent']) || undefined,
        specialist: (row.specialist as WaMasterTurn['specialist']) || undefined,
      }));

      const p = profile || {};
      return {
        turns,
        summary,
        profile: {
          fromDigits,
          roles: (p.roles as never[]) || ['unknown'],
          linkedComercioIds: (p.linked_comercio_ids as string[]) || [],
          preferences: (p.preferences as Record<string, string>) || {},
          preferenceProvenance: (p.preference_provenance as never) || {},
          lastIntent: (p.last_intent as never) || null,
          attentionState: (p.attention_state as 'ai' | 'human' | 'closed') || 'ai',
          lastActiveAtMs: Number(p.last_active_at_ms || nowMs),
          retentionUntilMs: p.retention_until_ms == null ? null : Number(p.retention_until_ms),
        },
      } satisfies WaMasterMemory;
    },

    async save(fromDigits, memory) {
      await client.from('wa_master_threads').upsert({
        from_digits: fromDigits,
        summary_json: memory.summary,
        updated_at_ms: memory.summary.updatedAtMs,
        expires_at_ms:
          memory.profile.retentionUntilMs || memory.summary.updatedAtMs + 7 * 86400000,
      });
      await client.from('wa_master_profiles').upsert({
        from_digits: fromDigits,
        roles: memory.profile.roles,
        linked_comercio_ids: memory.profile.linkedComercioIds,
        preferences: memory.profile.preferences,
        preference_provenance: memory.profile.preferenceProvenance,
        last_intent: memory.profile.lastIntent,
        attention_state: memory.profile.attentionState,
        last_active_at_ms: memory.profile.lastActiveAtMs,
        retention_until_ms: memory.profile.retentionUntilMs,
        updated_at: new Date().toISOString(),
      });
      await client.from('wa_master_turns').delete().eq('from_digits', fromDigits);
      const rows = memory.turns.slice(-WA_MASTER_TURN_CAP).map((t) => ({
        from_digits: fromDigits,
        role: t.role,
        text: t.text,
        at_ms: t.atMs,
        intent: t.intent ?? null,
        specialist: t.specialist ?? null,
      }));
      if (rows.length) await client.from('wa_master_turns').insert(rows);
    },

    async delete(fromDigits) {
      await client.from('wa_master_turns').delete().eq('from_digits', fromDigits);
      await client.from('wa_master_threads').delete().eq('from_digits', fromDigits);
      await client.from('wa_master_profiles').delete().eq('from_digits', fromDigits);
    },
  };
}

/** In-memory fake Postgres for dual-instance / restart tests without network. */
export function createDualProcessMemoryHarness() {
  const shared = new Map<string, WaMasterMemory>();
  const make = (): WaMasterMemoryStore => ({
    async get(fromDigits) {
      const v = shared.get(fromDigits);
      return v ? structuredClone(v) : null;
    },
    async save(fromDigits, memory) {
      shared.set(fromDigits, structuredClone(memory));
    },
    async delete(fromDigits) {
      shared.delete(fromDigits);
    },
  });
  return { makeStoreA: make, makeStoreB: make, shared };
}
