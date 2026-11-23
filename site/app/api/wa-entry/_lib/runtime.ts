import path from 'node:path';

import {
  assertSafeLocalConfig,
  loadWaEntryConfig,
  type WaEntryConfig,
} from './config';
import {
  createRefusingWasenderSender,
  createSimWaEntrySender,
  type WaEntrySender,
} from './sender';
import {
  createFileWaEntryStore,
  createMemoryWaEntryStore,
  type WaEntryStore,
} from './store';

export type WaEntryRuntime = {
  config: WaEntryConfig;
  store: WaEntryStore;
  sender: WaEntrySender;
};

let singleton: WaEntryRuntime | null = null;

/**
 * Process-local runtime for the wa-entry module.
 * Sim adapter → file store under PLATFORM_WA_LOCAL_DIR (never Supabase).
 * Wasender adapter → refused unless allow flags are set (still no prod writes in this phase).
 */
export function getWaEntryRuntime(env: NodeJS.ProcessEnv = process.env): WaEntryRuntime {
  if (singleton) return singleton;

  const config = loadWaEntryConfig(env);
  assertSafeLocalConfig(config, env);

  const dataDir = path.isAbsolute(config.localDataDir)
    ? config.localDataDir
    : path.join(process.cwd(), config.localDataDir);

  const store =
    config.adapter === 'sim' || env.NODE_ENV === 'test'
      ? env.NODE_ENV === 'test'
        ? createMemoryWaEntryStore()
        : createFileWaEntryStore(dataDir)
      : createFileWaEntryStore(dataDir);

  const sender =
    config.adapter === 'sim'
      ? createSimWaEntrySender(store)
      : createRefusingWasenderSender();

  singleton = { config, store, sender };
  return singleton;
}

/** Test helper — reset singleton between suites. */
export function resetWaEntryRuntime() {
  singleton = null;
}

/** Inject a custom runtime (tests / simulator). */
export function setWaEntryRuntime(runtime: WaEntryRuntime | null) {
  singleton = runtime;
}
