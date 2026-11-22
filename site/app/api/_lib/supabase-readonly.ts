/**
 * Best-effort Proxy that rejects mutating Supabase operations.
 * Used under CHATBOT_STAGING_MODE so a service-role key cannot write.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { StagingWriteBlockedError } from './staging-guards';

const MUTATING = new Set([
  'insert',
  'update',
  'upsert',
  'delete',
  'upload',
  'uploadToSignedUrl',
  'move',
  'copy',
  'remove',
  'createSignedUploadUrl',
  'updateUserById',
  'createUser',
  'deleteUser',
  'inviteUserByEmail',
]);

function block(method: string): never {
  throw new StagingWriteBlockedError(`Blocked mutating call: ${method}`);
}

function wrapThenable(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  return new Proxy(value as object, {
    get(target, prop, receiver) {
      const key = String(prop);
      if (MUTATING.has(key)) {
        return () => block(key);
      }
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig === 'function') {
        return (...args: unknown[]) => {
          const result = orig.apply(target, args);
          // Chainable builders / promises
          if (result && typeof result === 'object') {
            return wrapThenable(result);
          }
          return result;
        };
      }
      if (orig && typeof orig === 'object') {
        return wrapThenable(orig);
      }
      return orig;
    },
  });
}

export function asReadOnlySupabaseClient<T extends SupabaseClient>(
  client: T,
): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const key = String(prop);
      if (key === 'rpc') {
        return (fn: string, ...rest: unknown[]) => {
          // Fail closed: staging must not invoke mutating RPCs.
          const name = String(fn || '').toLowerCase();
          const allowReadish =
            name.startsWith('get_') ||
            name.startsWith('list_') ||
            name.includes('select') ||
            name.includes('quote') ||
            name.includes('menu');
          if (!allowReadish) {
            return block(`rpc:${fn}`);
          }
          const orig = Reflect.get(target, prop, receiver) as (
            ...a: unknown[]
          ) => unknown;
          return wrapThenable(orig.apply(target, [fn, ...rest]));
        };
      }
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig === 'function') {
        return (...args: unknown[]) => {
          const result = orig.apply(target, args);
          if (result && typeof result === 'object') {
            return wrapThenable(result);
          }
          return result;
        };
      }
      if (orig && typeof orig === 'object') {
        return wrapThenable(orig);
      }
      return orig;
    },
  }) as T;
}
