import type { WaMasterConfig } from './config';
import { classifyWaMasterIntents } from './intents';
import {
  appendTurn,
  patchSummary,
  rememberAskedField,
  setLastIntent,
} from './memory';
import { buildDeterministicReplies } from './replies';
import type {
  WaMasterIdentity,
  WaMasterMemory,
  WaMasterOrchestratorInput,
  WaMasterOrchestratorResult,
} from './types';

/**
 * Package 1 orchestrator: identity + memory + deterministic intents + natural replies.
 * Gemini path is intentionally gated (allowGemini) and not wired to production keys here.
 */
export function runWaMasterOrchestrator(
  input: WaMasterOrchestratorInput,
  config: WaMasterConfig,
): WaMasterOrchestratorResult {
  const { identity, text, messageId, nowMs } = input;
  let memory: WaMasterMemory = appendTurn(input.memory, {
    role: 'user',
    text,
    atMs: nowMs,
  });

  const classified = classifyWaMasterIntents({ text, identity, memory });
  const primary =
    classified.intents.find((i) => i !== 'multi' && i !== 'greeting') ||
    classified.intents[0] ||
    'unknown';

  // Gemini reserved for Package 2+; Package 1 always deterministic/fallback.
  const useGemini = Boolean(config.allowGemini && !input.forceDeterministic);
  void useGemini;

  const built = buildDeterministicReplies({
    intents: classified.intents,
    specialist: classified.specialist,
    identity,
    memory,
    config,
    text,
  });

  let replies = built.replies.slice(0, config.maxRepliesPerTurn);
  if (!replies.length) {
    replies = ['¡Claro! Cuéntame un poco más para ayudarte mejor.'];
  }

  for (const field of built.askedFields) {
    memory = rememberAskedField(memory, field, nowMs);
  }

  memory = setLastIntent(memory, primary, nowMs);
  memory = patchSummary(
    memory,
    {
      activeService: classified.specialist === 'orchestrator' ? memory.summary.activeService : classified.specialist,
      goal: memory.summary.goal || summarizeGoal(primary),
      pendingQuestion: built.askedFields[0]
        ? built.askedFields[0]
        : memory.summary.pendingQuestion,
      proposedAction: built.toolsUsed.includes('admin_propose_only')
        ? 'admin_change_requires_secure_api'
        : memory.summary.proposedAction,
      humanIntervened: built.escalateHuman || memory.summary.humanIntervened,
      recentErrors: memory.summary.recentErrors,
    },
    nowMs,
  );

  if (identity.comercios.length === 1 && !memory.summary.selectedComercioId) {
    memory = patchSummary(
      memory,
      { selectedComercioId: identity.comercios[0].comercioId },
      nowMs,
    );
  }

  if (identity.role !== 'unknown' && identity.role !== 'new_contact') {
    memory = {
      ...memory,
      profile: {
        ...memory.profile,
        roles: uniqueRoles([...(memory.profile.roles || []), identity.role]),
        linkedComercioIds: uniqueStrings([
          ...memory.profile.linkedComercioIds,
          ...identity.comercios.map((c) => c.comercioId),
        ]),
        attentionState: built.escalateHuman ? 'human' : 'ai',
        lastActiveAtMs: nowMs,
      },
    };
  }

  for (const reply of replies) {
    memory = appendTurn(memory, {
      role: 'assistant',
      text: reply,
      atMs: nowMs,
      intent: primary,
      specialist: classified.specialist,
    });
  }

  return {
    replies,
    intents: classified.intents,
    specialist: classified.specialist,
    memory,
    escalateHuman: built.escalateHuman,
    toolsUsed: built.toolsUsed,
    mode: 'deterministic',
    dedupeKey: `wa-master:${classified.specialist}:${primary}:${input.fromDigits}:${messageId}`,
  };
}

function summarizeGoal(intent: string): string {
  if (intent.startsWith('consumer')) return 'encontrar_comida';
  if (intent.startsWith('commercial')) return 'conocer_o_registrar_negocio';
  if (intent.startsWith('admin')) return 'gestionar_menu';
  if (intent.startsWith('support')) return 'soporte';
  return intent;
}

function uniqueRoles(roles: WaMasterIdentity['role'][]): WaMasterIdentity['role'][] {
  return [...new Set(roles.filter((r) => r && r !== 'unknown'))] as WaMasterIdentity['role'][];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
