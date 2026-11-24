import path from 'node:path';

import {
  assertSafeLocalConfig,
  loadWaEntryConfig,
  type WaEntryConfig,
} from './config';
import {
  createPreparedWasenderSender,
  createRefusingWasenderSender,
  createSimWaEntrySender,
  type WaEntrySender,
} from './sender';
import { createIsolatedPreviewSender } from './sender-isolated';
import {
  createFileWaEntryStore,
  createMemoryWaEntryStore,
  type WaEntryStore,
} from './store';
import type { WaEntryAsyncStore } from './store-async';
import {
  createSupabasePreviewAsyncStore,
  createSupabaseProdAsyncStore,
} from './store-supabase';
import {
  tryCreateProdWaMasterRuntime,
  type WaMasterRuntimeDeps,
} from './master-runtime';

export type WaEntryRuntime = {
  config: WaEntryConfig;
  store: WaEntryStore | WaEntryAsyncStore;
  sender: WaEntrySender;
  /** Production Master deps (memory/identity/quota). Never Preview for pilot users. */
  master?: WaMasterRuntimeDeps | null;
};

let singleton: WaEntryRuntime | null = null;

/**
 * Process-local runtime for the wa-entry module.
 * preview_isolated → Preview Supabase store + isolated sender (no prod queue).
 * supabase store → production project only (asserted).
 * wasender real remains refuse-by-default.
 */
export function getWaEntryRuntime(env: NodeJS.ProcessEnv = process.env): WaEntryRuntime {
  if (singleton) return singleton;

  const config = loadWaEntryConfig(env);

  // While inbound is off, skip durable-store asserts so health/deploy can stay
  // fail-closed without requiring service-role wiring on every cold start.
  if (config.inboundEnabled) {
    assertSafeLocalConfig(config, env);
  }

  let store: WaEntryStore | WaEntryAsyncStore;
  if (
    !config.inboundEnabled ||
    config.storeKind === 'memory' ||
    env.NODE_ENV === 'test'
  ) {
    store = createMemoryWaEntryStore();
  } else if (config.storeKind === 'supabase_preview') {
    store = createSupabasePreviewAsyncStore(config);
  } else if (config.storeKind === 'supabase') {
    store = createSupabaseProdAsyncStore(config, env);
  } else {
    const dataDir = path.isAbsolute(config.localDataDir)
      ? config.localDataDir
      : path.join(process.cwd(), config.localDataDir);
    store = createFileWaEntryStore(dataDir);
  }

  let sender: WaEntrySender;
  if (config.adapter === 'preview_isolated') {
    sender = createIsolatedPreviewSender(store);
  } else if (config.adapter === 'sim') {
    sender = createSimWaEntrySender(store);
  } else if (config.allowRealWasender) {
    // Still prepared-but-gated; not used for Preview isolation path.
    sender = createPreparedWasenderSender({ config, store });
  } else {
    sender = createRefusingWasenderSender();
  }

  const master =
    config.storeKind === 'supabase' && config.inboundEnabled
      ? tryCreateProdWaMasterRuntime(config, env)
      : null;

  singleton = { config, store, sender, master };
  return singleton;
}

export function resetWaEntryRuntime() {
  singleton = null;
}

export function setWaEntryRuntime(runtime: WaEntryRuntime | null) {
  singleton = runtime;
}
