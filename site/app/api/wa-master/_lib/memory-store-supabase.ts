import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeSummary, WA_MASTER_TURN_CAP } from './memory';
import { WaMasterMemoryStoreError, type WaMasterMemoryStore } from './memory-store';
import type { WaMasterMemory, WaMasterSummary, WaMasterTurn } from './types';

type DbResult<T> = { data: T | null; error: { message?: string } | null };

/**
 * Awaits a Supabase call and turns BOTH a returned `{ error }` and a thrown network error into a
 * WaMasterMemoryStoreError. The old code ignored `error` entirely, which made a failed read look like
 * "new user" and a failed write look like success.
 */
async function run<T>(op: string, call: () => PromiseLike<DbResult<T>>): Promise<T | null> {
  let res: DbResult<T>;
  try {
    res = await call();
  } catch (err) {
    throw new WaMasterMemoryStoreError(op, err instanceof Error ? err.message : 'request_failed');
  }
  if (res.error) throw new WaMasterMemoryStoreError(op, res.error.message || 'db_error');
  return res.data;
}

/**
 * Preview/Postgres memory store (L1 turns + L2 summary + L3 profile).
 * Requires supabase/preview-bootstrap/13-wa-master-assistant.sql
 *
 * Failure contract: `get` returns null ONLY when the session truly does not exist; any database
 * failure THROWS WaMasterMemoryStoreError (callers use loadMemorySafe / saveMemorySafe).
 * `save` never deletes history before the new history is stored, so a failure at any step leaves the
 * previous session intact; it is idempotent, so retrying is safe.
 */
export function createSupabaseWaMasterMemoryStore(client: SupabaseClient): WaMasterMemoryStore {
  return {
    async get(fromDigits) {
      const thread = await run('get_thread', () =>
        client
          .from('wa_master_threads')
          .select('summary_json,updated_at_ms,expires_at_ms')
          .eq('from_digits', fromDigits)
          .maybeSingle(),
      );
      if (!thread) return null;

      const p = (await run('get_profile', () =>
        client.from('wa_master_profiles').select('*').eq('from_digits', fromDigits).maybeSingle(),
      )) as Record<string, unknown> | null;

      // Newest N turns (desc), returned oldest→newest. The old ascending+limit read returned the OLDEST
      // 40 rows whenever more than 40 existed. `id` breaks ties between turns that share an at_ms.
      const rows =
        (await run('get_turns', () =>
          client
            .from('wa_master_turns')
            .select('role,text,at_ms,intent,specialist')
            .eq('from_digits', fromDigits)
            .order('at_ms', { ascending: false })
            .order('id', { ascending: false })
            .limit(WA_MASTER_TURN_CAP * 2),
        )) ?? [];

      // Interleaved/retried writes can leave the same turn twice: collapse exact duplicates.
      const seen = new Set<string>();
      const newestFirst: WaMasterTurn[] = [];
      for (const row of rows as Array<Record<string, unknown>>) {
        const turn: WaMasterTurn = {
          role: row.role as WaMasterTurn['role'],
          text: String(row.text || ''),
          atMs: Number(row.at_ms || 0),
          intent: (row.intent as WaMasterTurn['intent']) || undefined,
          specialist: (row.specialist as WaMasterTurn['specialist']) || undefined,
        };
        const key = `${turn.role}|${turn.atMs}|${turn.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        newestFirst.push(turn);
        if (newestFirst.length >= WA_MASTER_TURN_CAP) break;
      }
      const turns = newestFirst.reverse();

      const nowMs = Date.now();
      const summary = normalizeSummary(
        ((thread as { summary_json?: unknown }).summary_json as Partial<WaMasterSummary>) || {},
        nowMs,
      );
      const prof = p || {};
      return {
        turns,
        summary,
        profile: {
          fromDigits,
          roles: (prof.roles as never[]) || ['unknown'],
          linkedComercioIds: (prof.linked_comercio_ids as string[]) || [],
          preferences: (prof.preferences as Record<string, string>) || {},
          preferenceProvenance: (prof.preference_provenance as never) || {},
          lastIntent: (prof.last_intent as never) || null,
          attentionState: (prof.attention_state as 'ai' | 'human' | 'closed') || 'ai',
          lastActiveAtMs: Number(prof.last_active_at_ms || nowMs),
          retentionUntilMs: prof.retention_until_ms == null ? null : Number(prof.retention_until_ms),
        },
      } satisfies WaMasterMemory;
    },

    async save(fromDigits, memory) {
      // 1) New turns first. If this fails nothing was deleted: the previous history is intact.
      const rows = memory.turns.slice(-WA_MASTER_TURN_CAP).map((t) => ({
        from_digits: fromDigits,
        role: t.role,
        text: t.text,
        at_ms: t.atMs,
        intent: t.intent ?? null,
        specialist: t.specialist ?? null,
      }));
      let newIds: Array<number | string> = [];
      if (rows.length) {
        const inserted = (await run('insert_turns', () =>
          client.from('wa_master_turns').insert(rows).select('id'),
        )) as Array<{ id: number | string }> | null;
        newIds = (inserted ?? []).map((r) => r.id);
      }

      // 2) Summary (the commit point) and profile.
      await run('upsert_thread', () =>
        client.from('wa_master_threads').upsert({
          from_digits: fromDigits,
          summary_json: memory.summary,
          updated_at_ms: memory.summary.updatedAtMs,
          expires_at_ms:
            memory.profile.retentionUntilMs || memory.summary.updatedAtMs + 7 * 86400000,
        }),
      );
      await run('upsert_profile', () =>
        client.from('wa_master_profiles').upsert({
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
        }),
      );

      // 3) Drop everything that is not the rows just written. A failure here only leaves stale rows,
      //    which `get` ignores (newest-first window + exact-duplicate collapse) and the next save removes.
      await run('prune_turns', () => {
        const q = client.from('wa_master_turns').delete().eq('from_digits', fromDigits);
        return newIds.length ? q.not('id', 'in', `(${newIds.join(',')})`) : q;
      });
    },

    async delete(fromDigits) {
      await run('delete_turns', () => client.from('wa_master_turns').delete().eq('from_digits', fromDigits));
      await run('delete_thread', () => client.from('wa_master_threads').delete().eq('from_digits', fromDigits));
      await run('delete_profile', () => client.from('wa_master_profiles').delete().eq('from_digits', fromDigits));
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
