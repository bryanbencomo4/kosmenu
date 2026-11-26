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
import { formatPublishedPricing } from './knowledge/platform';
import { detectMerchantHelpTopic } from './merchant-guide';
import { buildDeterministicReplies } from './replies';
import { shouldOfferVoiceNote } from './voice';
import {
  runAdminSpecialist,
  type AdminMenuLoader,
  type WaMasterMenuSnapshot,
} from './specialists/admin';
import { runCommercialSpecialist } from './specialists/commercial';
import { runConsumerSpecialist } from './specialists/consumer';
import { tryHandleSmartMenu } from './menus';
import { runCentralBrain } from './brain/respond';
import type {
  WaMasterIdentity,
  WaMasterIntent,
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

  const discoveryCtx: WaMasterDiscoveryCtx = deps.discoveryCtx ?? { pageSize: 5 };
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

  // Central brain (natural language, DB-backed) replaces the numbered smart menus.
  const brainHit = config.brainEnabled
    ? await runCentralBrain({
        text,
        identity,
        memory,
        config,
        nowMs,
        fromDigits: input.fromDigits,
        handoffStore: deps.handoffStore,
        discoveryCtx,
        executeDiscovery,
      })
    : null;
  const brainOwned = Boolean(brainHit && !brainHit.delegate);

  // Legacy smart numbered menus (0/8/9 + profile roots) — only when the brain is off.
  const menuHit = config.brainEnabled
    ? {
        handled: false,
        replies: [] as string[],
        memoryPatch: {},
        escalateHuman: false,
        specialist: 'orchestrator' as const,
        intents: ['unknown'] as WaMasterIntent[],
        toolsUsed: [] as string[],
        skipGeminiPolish: false,
        delegate: undefined,
      }
    : await tryHandleSmartMenu({
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
  if (brainHit) {
    memory = patchSummary(memory, brainHit.memoryPatch, nowMs);
    intents = [brainHit.delegate?.intent ?? brainHit.intent];
    specialist = brainHit.delegate?.specialist ?? brainHit.specialist;
  }

  // Legacy intent overrides (skipped when the brain already owns this turn).
  if (!brainOwned) {
  // Phone-linked shops + merchant ops (tasa/precios/…) → admin guide, even if NLU missed.
  const merchantTopic = detectMerchantHelpTopic(text);
  if (
    merchantTopic &&
    identity.comercios.length > 0 &&
    !intents.some((i) => i.startsWith('consumer') || i === 'support.human')
  ) {
    const mapped =
      merchantTopic === 'fx'
        ? ('admin.fx' as const)
        : merchantTopic === 'price'
          ? ('admin.edit_price' as const)
          : merchantTopic === 'product'
            ? ('admin.edit_product' as const)
            : merchantTopic === 'delivery'
              ? ('admin.delivery' as const)
              : merchantTopic === 'links'
                ? ('admin.menu_links' as const)
                : ('admin.settings' as const);
    if (!intents.includes(mapped)) intents = [...intents.filter((i) => i !== 'multi'), mapped];
    specialist = 'admin';
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
  // Resume signup when pending business_name — allow clear intent escapes
  // without trapping food words inside a business name ("Se llama Pizza Nova").
  const namingAnswer = /\b(se llama|mi negocio|mi restaurante)\b/i.test(text);
  const escapeSignup =
    !namingAnswer &&
    (/\b(mejor (quiero|pido)|olvidalo|cancelar (el )?registro|a domicilio|delivery|buscar restaurante|cerca de mi|humano|asesor|persona|soporte|reportar|cuanto cuesta|cuánto cuesta|precios? del (plan|servicio))\b/i.test(
      text,
    ) ||
      intents.some(
        (i) =>
          i.startsWith('consumer') ||
          i === 'support.human' ||
          i === 'support.issue' ||
          i === 'commercial.pricing',
      ));
  if (memory.summary.pendingQuestion === 'business_name' && !escapeSignup) {
    intents = ['commercial.register'];
    specialist = 'commercial';
  } else if (memory.summary.pendingQuestion === 'business_name' && escapeSignup) {
    memory = patchSummary(memory, { pendingQuestion: null }, nowMs);
  } else if (
    memory.summary.signupDraft &&
    !intents.some((i) => i.startsWith('commercial')) &&
    /\b(se llama|continuar (mi )?registro|retomar (el )?registro|seguir con (el )?registro)\b/i.test(
      text,
    ) &&
    !/\b(pedir|delivery|domicilio|hamburg|pizza|buscar|cerca)\b/i.test(text)
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
  // Require explicit confirm — "dale/ok" are too loose for stale proposals.
  if (memory.summary.pendingAdminProposal && /\b(confirmo|confirmado)\b/i.test(text)) {
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
  const loadMenu = deps.loadMenu ?? defaultMenuLoader;

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
    if (brainOwned && brainHit) {
      replies = brainHit.replies;
      toolsUsed = brainHit.toolsUsed;
      specialist = brainHit.specialist;
      skipGeminiPolish = true;
      escalateHuman = Boolean(brainHit.escalateHuman);
      if (escalateHuman && !replies.length) {
        // Final copy is decided after durable ticket registration (wa-entry).
        const built = buildDeterministicReplies({
          intents: ['support.human'],
          specialist: 'support',
          identity,
          memory,
          config,
          text,
        });
        replies = built.replies.length
          ? built.replies
          : [
              'Claro, registro tu solicitud con el contexto de esta conversación para que un asesor se comunique contigo lo antes posible.',
            ];
        toolsUsed = [...toolsUsed, ...built.toolsUsed];
      }
    } else if (
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
        identity,
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
        identity,
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

  // Live Gemini polish: natural wording grounded in specialist facts (DB/tools).
  // Skipped for admin writes path, greetings, and human escalate.
  const softForGemini =
    !primary.startsWith('admin') &&
    primary !== 'support.human' &&
    primary !== 'greeting' &&
    !escalateHuman &&
    !skipGeminiPolish;
  if (!input.forceDeterministic && softForGemini && replies.length) {
    const factsBlock = replies.join('\n');
    const agent = await runWaMasterAgentNlu({
      config,
      text: [
        `Mensaje del usuario: ${text}`,
        '',
        'HECHOS VERIFICADOS (úsalos tal cual; no inventes nada fuera de este bloque):',
        factsBlock,
        '',
        'Escribe UNA respuesta breve y natural en español para WhatsApp basada SOLO en esos hechos.',
        'Prohibido inventar: ciudad/zona, productos, precios, estado del menú, restaurantes o acciones completadas.',
        'Si el hecho no menciona una ciudad, no asumas ninguna.',
        'Prohibido: “error al escribir”, corregir ortografía del usuario, pedir contraseñas.',
        'Si no hay hechos claros: “Disculpa, no te entendí. Explícame mejor qué necesitas, porfa.”',
      ].join('\n'),
      identity,
      memory,
      quota,
      maxMonthlyRequests: deps.maxMonthlyGeminiRequests ?? config.maxMonthlyGeminiRequests,
      forceSimulate: deps.forceSimulateAgent ?? (!config.allowGemini || config.simulateAgent),
      forceFail: deps.forceAgentFail,
      enableTools: false,
      // Polish must not re-inject stale zone/shop claims from prior turns.
      omitMemoryPrompt: true,
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

  // Multi-intent: append secondary published pricing when user also asked cost
  // but primary went to another specialist (e.g. search + precios).
  if (
    intents.includes('multi') &&
    intents.includes('commercial.pricing') &&
    !primary.startsWith('commercial') &&
    replies.length > 0 &&
    !/Kit Portamenú|\$10\/mes/i.test(replies.join('\n'))
  ) {
    replies = [...replies, formatPublishedPricing(config.businessLandingUrl)];
  }

  replies = replies.filter(Boolean).slice(0, config.maxRepliesPerTurn);
  if (!replies.length) {
    replies = ['Disculpa, no te entendí. Explícame mejor qué necesitas, porfa.'];
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

  const voiceScript =
    config.voiceNotesEnabled &&
    !escalateHuman &&
    replies[0] &&
    shouldOfferVoiceNote(replies[0])
      ? replies[0]
      : null;

  return {
    replies,
    intents,
    specialist,
    memory,
    escalateHuman,
    toolsUsed,
    mode,
    dedupeKey: `wa-master:${specialist}:${primary}:${input.fromDigits}:${messageId}`,
    voiceScript,
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
