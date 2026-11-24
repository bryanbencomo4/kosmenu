/**
 * Backward-compatible Preview store entrypoint.
 * Implementation lives in store-supabase.ts (shared Preview + production schema).
 */
export {
  assertUrlIsPreviewNotProd,
  createSupabasePreviewAsyncStore,
} from './store-supabase';
