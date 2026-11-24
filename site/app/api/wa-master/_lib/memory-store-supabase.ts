import type { WaMasterMemory, WaMasterSummary, WaMasterTurn } from './types';
import { normalizeSummary } from './memory';
import type { WaMasterMemoryStore } from './memory-store';

type QueryResult<T> = { data: T | null; error: { message: string } | null };

/** Minimal Supabase-like client surface for Preview persistence. */
export type WaMasterSupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<QueryResult<Record<string, unknown>>>;
        order?: (col: string, opts: { ascending: boolean }) => {
          limit: (n: number) => Promise<QueryResult<Record<string, unknown>[]>>;
        };
        limit?: (n: number) => Promise<QueryResult<Record<string, unknown>[]>>;
      };
    };
    upsert: (row: Record<string, unknown>) => Promise<QueryResult<unknown>>;
    delete: () => {
      eq: (col: string, val: string) => Promise<QueryResult<unknown>>;
    };
    insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => Promise<QueryResult<unknown>>;
  };
};

/**
 * Preview Supabase memory store. Requires tables from
 * supabase/preview-bootstrap/13-wa-master-assistant.sql
 */
export function createSupabaseWaMasterMemoryStore(client: WaMasterSupabaseLike): WaMasterMemoryStore {
  return {
    async get(fromDigits) {
      const thread = await client
        .from('wa_master_threads')
        .select('summary_json,updated_at_ms,expires_at_ms')
        .eq('from_digits', fromDigits)
        .maybeSingle();
      if (thread.error || !thread.data) return null;

      const profileRes = await client
        .from('wa_master_profiles')
        .select('*')
        .eq('from_digits', fromDigits)
        .maybeSingle();

      const turnsRes = await client
        .from('wa_master_turns')
        .select('role,text,at_ms,intent,specialist')
        .eq('from_digits', fromDigits);

      // Support both chained order/limit and plain eq→promise shapes in mocks.
      let turns: WaMasterTurn[] = [];
      const eqTurns = turnsRes as unknown as {
        order?: (c: string, o: { ascending: boolean }) => {
          limit: (n: number) => Promise<QueryResult<Record<string, unknown>[]>>;
        };
        data?: Record<string, unknown>[] | null;
        error?: { message: string } | null;
      };
      if (typeof eqTurns.order === 'function') {
        const listed = await eqTurns.order('at_ms', { ascending: false }).limit(20);
        turns = ((listed.data || []) as Record<string, unknown>[])
          .reverse()
          .map((row) => ({
            role: row.role as WaMasterTurn['role'],
            text: String(row.text || ''),
            atMs: Number(row.at_ms || 0),
            intent: (row.intent as WaMasterTurn['intent']) || undefined,
            specialist: (row.specialist as WaMasterTurn['specialist']) || undefined,
          }));
      }

      const nowMs = Date.now();
      const summary = normalizeSummary(
        (thread.data.summary_json as Partial<WaMasterSummary>) || {},
        nowMs,
      );
      const p = profileRes.data || {};
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
        expires_at_ms: memory.profile.retentionUntilMs || memory.summary.updatedAtMs + 7 * 86400000,
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
      });
      // Replace recent turns simply: delete + insert last N (Preview-safe pattern).
      await client.from('wa_master_turns').delete().eq('from_digits', fromDigits);
      const rows = memory.turns.slice(-20).map((t) => ({
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
