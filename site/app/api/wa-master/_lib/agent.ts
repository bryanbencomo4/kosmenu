/**
 * Master Gemini path — default simulate / deterministic tools.
 * Live Google calls require PLATFORM_WA_MASTER_ALLOW_GEMINI=1 + API key +
 * exclusive quota. This sprint never enables billable calls by default.
 */

import type { WaMasterConfig } from './config';
import type { WaMasterQuotaStore } from './quota';
import { WaMasterQuotaError, waMasterQuotaMonth } from './quota';
import { WA_MASTER_PERSONALITY } from './personality';
import type { WaMasterIdentity, WaMasterMemory } from './types';

export type WaMasterAgentMode = 'simulate' | 'live_refused' | 'live';

export type WaMasterAgentResult = {
  mode: WaMasterAgentMode;
  /** Optional NLU enrichment; specialists still own tools. */
  suggestedIntents: string[];
  naturalPreface: string | null;
  error?: string;
};

export async function runWaMasterAgentNlu(params: {
  config: WaMasterConfig;
  text: string;
  identity: WaMasterIdentity;
  memory: WaMasterMemory;
  quota: WaMasterQuotaStore;
  maxMonthlyRequests: number;
  forceSimulate?: boolean;
  /** Inject failure for tests */
  forceFail?: boolean;
}): Promise<WaMasterAgentResult> {
  const { config, text, identity, memory, quota, maxMonthlyRequests } = params;

  if (params.forceFail) {
    return {
      mode: 'simulate',
      suggestedIntents: [],
      naturalPreface: null,
      error: 'gemini_forced_fail',
    };
  }

  const wantLive = config.allowGemini && !params.forceSimulate;
  if (!wantLive) {
    return {
      mode: 'simulate',
      suggestedIntents: [],
      naturalPreface: null,
    };
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return {
      mode: 'live_refused',
      suggestedIntents: [],
      naturalPreface: null,
      error: 'missing_gemini_api_key',
    };
  }

  try {
    await quota.reserve(waMasterQuotaMonth(), maxMonthlyRequests);
  } catch (e) {
    const code = e instanceof WaMasterQuotaError ? e.code : 'quota_error';
    return {
      mode: 'live_refused',
      suggestedIntents: [],
      naturalPreface: null,
      error: code,
    };
  }

  // Live HTTP intentionally not implemented in this sprint without authorization.
  // Reserving quota then refusing prevents accidental unpaid traffic patterns in tests
  // that flip ALLOW_GEMINI without an explicit live runner.
  void WA_MASTER_PERSONALITY;
  void text;
  void identity;
  void memory;
  return {
    mode: 'live_refused',
    suggestedIntents: [],
    naturalPreface: null,
    error: 'live_gemini_not_authorized_this_sprint',
  };
}
