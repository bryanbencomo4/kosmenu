export { loadWaMasterConfig, type WaMasterConfig } from './config';
export {
  resolveWaMasterIdentity,
  type WaMasterIdentityCatalogRow,
  type WaMasterIdentityHints,
} from './identity';
export { classifyWaMasterIntents } from './intents';
export {
  createEmptyMemory,
  appendTurn,
  patchSummary,
  normalizeSummary,
  formatMemoryForPrompt,
  WA_MASTER_TURN_CAP,
} from './memory';
export {
  createMemoryWaMasterStore,
  loadOrCreateMemory,
  loadMemorySafe,
  saveMemorySafe,
  WaMasterMemoryStoreError,
  type SafeMemoryLoad,
  type WaMasterMemoryStore,
} from './memory-store';
export { createFileWaMasterMemoryStore } from './memory-store-file';
export {
  createSupabaseWaMasterMemoryStore,
  createDualProcessMemoryHarness,
} from './memory-store-supabase';
export {
  loadWaMasterIdentity,
  createSupabaseWaMasterIdentitySource,
  WA_MASTER_IDENTITY_FIXTURES,
  WA_MASTER_CONSUMER_ORDER_FIXTURES,
  type WaMasterIdentitySource,
} from './identity-loader';
export {
  runWaMasterOrchestrator,
  type WaMasterOrchestratorDeps,
} from './orchestrator';
export { phonesMatchDigits, waMasterDigitsKey } from './phone';
export { WA_MASTER_PERSONALITY, greetingForIdentity } from './personality';
export {
  createMemoryWaMasterQuotaStore,
  createSupabaseWaMasterQuotaStore,
  WaMasterQuotaError,
  waMasterQuotaMonth,
  type WaMasterQuotaStore,
} from './quota';
export {
  createMemoryWaMasterAuthGate,
  unauthorizedAdminMessage,
  type WaMasterAuthGate,
  type WaMasterAuthSession,
} from './auth';
export { runWaMasterAgentNlu } from './agent';
export { issueMasterHandoff, getDefaultWaHandoffStore } from './handoff';
export {
  formatPublishedPricing,
  PLATFORM_WHAT_IS,
  PLATFORM_PLANS,
  openWelcomeUnknown,
} from './knowledge/platform';
export { buildHandoffContextFromMemory } from './knowledge/handoff-context';
export type * from './types';
