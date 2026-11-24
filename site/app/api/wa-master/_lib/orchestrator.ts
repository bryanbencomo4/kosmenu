import { runWaMasterAgentNlu } from './agent';
import type { WaMasterAuthGate } from './auth';
import { createMemoryWaMasterAuthGate } from './auth';
import type { WaMasterConfig } from './config';
import {
  loadDefaultDiscoveryExecute,
  type WaMasterDiscoveryCtx,
  type WaMasterDiscoveryExecute,
} from './discovery-bridge';
import { classifyWaMasterIntents } from './intents';
import {
  appendTurn,
  normalizeSummary,
  patchSummary,
  rememberAskedField,
  setLastIntent,
} from './memory';
import type { WaHandoffStore } from '../../_lib/wa-handoff';
import { createMemoryWaMasterQuotaStore, type WaMasterQuotaStore } from './quota';
import { buildDeterministicReplies } from './replies';
import {
  runAdminSpecialist,
  type AdminMenuLoader,
  type WaMasterMenuSnapshot,
} from './specialists/admin';
import { runCommercialSpecialist } from './specialists/commercial';
import { runConsumerSpecialist } from './specialists/consumer';
import { tryHandleSmartMenu } from './menus';
import type {
  WaMasterIdentity,
  WaMasterMemory,
  WaMasterOrchestratorInput,
  WaMasterOrchestratorResult,
} from './types';

export type WaMasterOrchestratorDeps = {
  discoveryCtx?: WaMasterDiscoveryCtx;
  executeDiscovery?: WaMasterDiscoveryExecute;
  authGate?: WaMasterAuthGate;
  loadMenu?: AdminMenuLoader;
  quota?: WaMasterQuotaStore;
  handoffStore?: WaHandoffStore;
  maxMonthlyGeminiRequests?: number;
  forceSimulateAgent?: boolean;
  forceAgentFail?: boolean;
  forceQuotaExhausted?: boolean;
};

async function defaultMenuLoader(): Promise<WaMasterMenuSnapshot | null> {
  return null;
}

/**
 * Full Master orchestrator (Packages 1–5 local): classify → optional NLU → specialist tools → memory.
 */
export async function runWaMasterOrchestrator(
  input: WaMasterOrchestratorInput,
  config: WaMasterConfig,
  deps: WaMasterOrchestratorDeps = {},
): Promise<WaMasterOrchestratorResult> {
  const { identity, text, messageId, nowMs } = input;
  let memory: WaMasterMemory = {
    ...input.memory,
    summary: normalizeSummary(input.memory.summary, nowMs),
  };
  memory = appendTurn(memory, { role: 'user', text, atMs: nowMs });

  // Smart numbered menus (0/8/9 + profile roots) — before specialists.
  const menuHit = await tryHandleSmartMenu({
    text,
    identity,
    memory,
    config,
    nowMs,
    fromDigits: input.fromDigits,
    handoffStore: deps.handoffStore,
    fastHumanCoverage: true,
  });
  if (menuHit.handled && !menuHit.delegate) {
    memory = patchSummary(memory, menuHit.memoryPatch, nowMs);
    for (const r of menuHit.replies) {
      memory = appendTurn(memory, {
        role: 'assistant',
        text: r,
        atMs: nowMs,
        specialist: menuHit.specialist,
      });
    }
    memory = setLastIntent(memory, menuHit.intents[0] || 'greeting', nowMs);
    return {
      replies: menuHit.replies.slice(0, config.maxRepliesPerTurn),
      intents: menuHit.intents,
      specialist: menuHit.specialist,
      memory,
      escalateHuman: menuHit.escalateHuman,
      toolsUsed: menuHit.toolsUsed,
      mode: 'deterministic',
      dedupeKey: `menu:${messageId}:${menuHit.intents.join(',')}`,
    };
  }
  if (menuHit.handled && menuHit.delegate) {
    memory = patchSummary(memory, menuHit.memoryPatch, nowMs);
  }

  const classified = classifyWaMasterIntents({ text, identity, memory });
  let intents = classified.intents;
  let specialist = classified.specialist;
  if (menuHit.delegate) {
    intents = [menuHit.delegate.intent];
    specialist = menuHit.delegate.specialist;
  }

  const looksCommercial =
    /\b(registrar|poner mi|poner el men[uú]|crear.*men[uú]|plataforma|tengo una? (pizzer|hamburg|restaurante|negocio)|planes|precios del servicio|men[uú] de mi restaurante)\b/i.test(
      text,
    );
  const looksZoneOnly =
    text.trim().length < 48 &&
    !looksCommercial &&
    !/\b(precio|confirmo|queja|humano|persona)\b/i.test(text);

  // Resume pending clarifications without trapping later intent switches.
  if (
    memory.summary.pendingQuestion === 'zone' &&
    looksZoneOnly &&
    !intents.some((i) => i.startsWith('commercial') || i.startsWith('admin') || i.startsWith('support'))
  ) {
    intents = ['consumer.search'];
    specialist = 'consumer';
  }
  if (
    memory.summary.pendingQuestion === 'business_name' ||
    (memory.summary.signupDraft &&
      !intents.some((i) => i.startsWith('commercial')) &&
      /se llama|negocio|restaurante/i.test(text))
  ) {
    intents = ['commercial.register'];
    specialist = 'commercial';
  }
  if (
    (memory.summary.lastRestaurants?.length || 0) > 0 &&
    /\b(la )?(primera|segunda|tercera|esa|ese)\b|\bm[aá]ndame el men[uú]\b/i.test(text)
  ) {
    intents = ['consumer.search'];
    specialist = 'consumer';
  }
  if (memory.summary.pendingAdminProposal && /\b(confirmo|confirmado|dale|hazlo)\b/i.test(text)) {
    intents = ['admin.edit_price'];
    specialist = 'admin';
  }
  if (looksCommercial) {
    intents = intents.filter((i) => !i.startsWith('consumer'));
    if (!intents.some((i) => i.startsWith('commercial'))) intents.push('commercial.register');
    specialist = 'commercial';
  }
  if (
    memory.summary.pendingQuestion === 'comercio_select' &&
    identity.comercios.some((c) => text.toLowerCase().includes(c.publicName.toLowerCase()))
  ) {
    const hit = identity.comercios.find((c) =>
      text.toLowerCase().includes(c.publicName.toLowerCase()),
    );
    if (hit) {
      memory = patchSummary(memory, { selectedComercioId: hit.comercioId, pendingQuestion: null }, nowMs);
      intents = ['admin.view_menu'];
      specialist = 'admin';
    }
  }

  const primary =
    intents.find((i) => i !== 'multi' && i !== 'greeting') || intents[0] || 'unknown';

  const quota = deps.quota ?? createMemoryWaMasterQuotaStore();
  if (deps.forceQuotaExhausted) {
    // Saturate for test
    for (let i = 0; i < 3; i += 1) {
      try {
        await quota.reserve('2099-01', 1);
      } catch {
        break;
      }
    }
  }

  const authGate = deps.authGate ?? createMemoryWaMasterAuthGate();
  const discoveryCtx: WaMasterDiscoveryCtx = deps.discoveryCtx ?? { pageSize: 5 };
  const loadMenu = deps.loadMenu ?? defaultMenuLoader;
  const executeDiscovery: WaMasterDiscoveryExecute =
    deps.executeDiscovery ||
    (async (name, args, ctx) => {
      try {
        const real = await loadDefaultDiscoveryExecute();
        return real(name, args, ctx);
      } catch {
        return {
          ok: false,
          tool: name,
          restaurants: [],
          error: 'discovery_unavailable',
        };
      }
    });

  let mode: WaMasterOrchestratorResult['mode'] = 'deterministic';
  let agentError: string | undefined;
  let geminiHttpCalls = 0;
  let liveCompose: string | null = null;

  let replies: string[] = [];
  let toolsUsed: string[] = [];
  let escalateHuman = false;
  let askedFields: string[] = [];
  let skipGeminiPolish = false;

  try {
    // Simple memory answers first (receptionist + legacy) — no link spam.
    if (
      /\b(recuerdas|como se llama|cómo se llama|nombre de mi (negocio|restaurante))\b/i.test(
        text,
      ) &&
      memory.summary.signupDraft?.businessName
    ) {
      replies = [
        `¡Sí! 😊 Me comentaste que se llama *${memory.summary.signupDraft.businessName}*.\n\n¿Quieres que continuemos con su registro?`,
      ];
      toolsUsed = ['memory_recall'];
      skipGeminiPolish = true;
      specialist = 'orchestrator';
    } else if (intents.includes('support.human') || primary === 'support.human') {
      const built = buildDeterministicReplies({
        intents: ['support.human'],
        specialist: 'support',
        identity,
        memory,
        config,
        text,
      });
      replies = built.replies;
      toolsUsed = built.toolsUsed;
      escalateHuman = true;
      specialist = 'support';
    } else if (
      intents.includes('consumer.complaint') ||
      intents.includes('consumer.order_help') ||
      primary === 'consumer.order_help'
    ) {
      const built = buildDeterministicReplies({
        intents: intents.includes('consumer.complaint') ? ['consumer.complaint'] : intents,
        specialist: 'support',
        identity,
        memory,
        config,
        text,
      });
      replies = built.replies;
      toolsUsed = built.toolsUsed;
      specialist = 'support';
    } else if (primary.startsWith('consumer') || specialist === 'consumer') {
      const out = await runConsumerSpecialist({
        text,
        memory,
        config,
        discoveryCtx,
        executeTool: executeDiscovery,
        fromDigits: input.fromDigits,
        handoffStore: deps.handoffStore,
        nowMs,
      });
      replies = out.replies;
      toolsUsed = out.toolsUsed;
      memory = patchSummary(memory, out.memoryPatch, nowMs);
      specialist = 'consumer';
      skipGeminiPolish = Boolean(out.skipGeminiPolish);
      if (out.memoryPatch.pendingQuestion === 'zone') askedFields.push('zone');
    } else if (
      primary === 'commercial.info' ||
      primary === 'clarify_role' ||
      (primary === 'unknown' && identity.role === 'new_contact')
    ) {
      // Ambiguous info for new contacts → natural clarify (not hard sales).
      const built = buildDeterministicReplies({
        intents: primary === 'unknown' ? ['clarify_role'] : intents,
        specialist: 'orchestrator',
        identity,
        memory,
        config,
        text,
      });
      replies = built.replies;
      toolsUsed = built.toolsUsed;
      askedFields = built.askedFields;
      specialist = 'orchestrator';
      skipGeminiPolish = config.receptionistMode;
    } else if (primary.startsWith('commercial') || specialist === 'commercial') {
      const out = await runCommercialSpecialist({
        text,
        memory,
        config,
        intent: primary,
        fromDigits: input.fromDigits,
        handoffStore: deps.handoffStore,
        nowMs,
      });
      replies = out.replies;
      toolsUsed = out.toolsUsed;
      memory = patchSummary(memory, out.memoryPatch, nowMs);
      skipGeminiPolish = Boolean(out.skipGeminiPolish);
      if (out.memoryPatch.pendingQuestion === 'business_name') askedFields.push('business_name');
      specialist = 'commercial';
    } else if (primary.startsWith('admin') || specialist === 'admin') {
      const out = await runAdminSpecialist({
        text,
        intent: primary,
        identity,
        memory,
        config,
        authGate,
        loadMenu,
        nowMs,
        handoffStore: deps.handoffStore,
      });
      replies = out.replies;
      toolsUsed = out.toolsUsed;
      memory = patchSummary(memory, out.memoryPatch, nowMs);
      escalateHuman = Boolean(out.escalateHuman);
      skipGeminiPolish = Boolean(out.skipGeminiPolish);
      specialist = 'admin';
    } else if (primary === 'support.issue' || primary === 'consumer.complaint' || primary.startsWith('privacy')) {
      const built = buildDeterministicReplies({
        intents,
        specialist: 'support',
        identity,
        memory,
        config,
        text,
      });
      replies = built.replies;
      toolsUsed = built.toolsUsed;
      specialist = 'support';
    } else {
      const built = buildDeterministicReplies({
        intents,
        specialist,
        identity,
        memory,
        config,
        text,
      });
      replies = built.replies;
      toolsUsed = built.toolsUsed;
      askedFields = built.askedFields;
      escalateHuman = built.escalateHuman;
      if (built.askedFields.includes('role_clarify')) {
        memory = rememberAskedField(memory, 'role_clarify', nowMs);
      }
    }
  } catch (err) {
    mode = 'fallback';
    agentError = err instanceof Error ? err.message : 'specialist_error';
    memory = patchSummary(
      memory,
      { recentErrors: [...memory.summary.recentErrors, agentError].slice(-5) },
      nowMs,
    );
    replies = [
      'Tuve un problema técnico revisando eso. Puedo reintentar o dejarte el asistente web: ' +
        config.consumerAssistantUrl,
    ];
  }

  // Live Gemini polish (1 HTTP typical): natural wording grounded in specialist facts.
  // Skipped for admin/auth, human escalate, and receptionist handoff replies.
  const softForGemini =
    !primary.startsWith('admin') &&
    primary !== 'support.human' &&
    !escalateHuman &&
    !skipGeminiPolish &&
    !config.receptionistMode;
  if (!input.forceDeterministic && softForGemini && replies.length) {
    const factsBlock = replies.join('\n');
    const agent = await runWaMasterAgentNlu({
      config,
      text: [
        `Mensaje del usuario: ${text}`,
        '',
        'HECHOS VERIFICADOS (úsalos tal cual; no inventes restaurantes ni acciones completadas):',
        factsBlock,
        '',
        'Escribe UNA respuesta breve y natural en español para WhatsApp basada solo en esos hechos.',
      ].join('\n'),
      identity,
      memory,
      quota,
      maxMonthlyRequests: deps.maxMonthlyGeminiRequests ?? config.maxMonthlyGeminiRequests,
      forceSimulate: deps.forceSimulateAgent ?? (!config.allowGemini || config.simulateAgent),
      forceFail: deps.forceAgentFail,
      enableTools: false,
      maxHttpCalls: config.maxGeminiHttpPerTurn,
      requestId: `wm_${messageId}`,
    });
    geminiHttpCalls = agent.geminiHttpCalls || 0;
    if (agent.error === 'quota_exhausted' || agent.error === 'gemini_forced_fail') {
      agentError = agent.error;
      mode = 'fallback';
    } else if (agent.mode === 'simulate') {
      mode = mode === 'fallback' ? 'fallback' : 'deterministic';
    } else if (agent.mode === 'live_refused') {
      mode = 'fallback';
      agentError = agent.error;
    } else if (agent.mode === 'live' && agent.composedReply) {
      mode = 'gemini';
      liveCompose = agent.composedReply;
      replies = [agent.composedReply];
      toolsUsed = [...toolsUsed, 'gemini'];
    } else if (agent.mode === 'fallback') {
      mode = 'fallback';
      agentError = agent.error || 'gemini_fallback';
    }
  } else if (!input.forceDeterministic && deps.forceAgentFail) {
    // Preserve test hook when soft path skipped
    mode = 'fallback';
    agentError = 'gemini_forced_fail';
  }

  if (agentError === 'quota_exhausted') {
    replies = [
      'Ahora mismo no puedo usar el modelo de IA (cuota del Asistente Maestro). Sigo con respuestas básicas. ' +
        (replies[0] || ''),
    ];
  }

  void liveCompose;
  void geminiHttpCalls;

  replies = replies.filter(Boolean).slice(0, config.maxRepliesPerTurn);
  if (!replies.length) {
    replies = ['¡Claro! Cuéntame un poco más para ayudarte mejor.'];
  }

  for (const field of askedFields) {
    memory = rememberAskedField(memory, field, nowMs);
  }

  memory = setLastIntent(memory, primary, nowMs);
  memory = patchSummary(
    memory,
    {
      activeService:
        specialist === 'orchestrator' ? memory.summary.activeService : specialist,
      goal: memory.summary.goal || summarizeGoal(primary),
      humanIntervened: escalateHuman || memory.summary.humanIntervened,
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
        attentionState: escalateHuman ? 'human' : 'ai',
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
      specialist,
    });
  }

  return {
    replies,
    intents,
    specialist,
    memory,
    escalateHuman,
    toolsUsed,
    mode,
    dedupeKey: `wa-master:${specialist}:${primary}:${input.fromDigits}:${messageId}`,
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
