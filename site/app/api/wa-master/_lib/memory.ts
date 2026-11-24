import type {
  WaMasterIntent,
  WaMasterMemory,
  WaMasterProfile,
  WaMasterSummary,
  WaMasterTurn,
} from './types';

const DEFAULT_TURN_CAP = 20;

export function emptySummary(nowMs: number): WaMasterSummary {
  return {
    activeService: null,
    selectedComercioId: null,
    goal: null,
    pendingQuestion: null,
    proposedAction: null,
    askedFields: [],
    recentErrors: [],
    humanIntervened: false,
    lastIntent: null,
    updatedAtMs: nowMs,
    zone: null,
    lastRestaurants: [],
    signupDraft: null,
    pendingAdminProposal: null,
  };
}

/** Migrate older in-memory snapshots missing new L2 fields. */
export function normalizeSummary(raw: Partial<WaMasterSummary> | null | undefined, nowMs: number): WaMasterSummary {
  const base = emptySummary(nowMs);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    askedFields: Array.isArray(raw.askedFields) ? raw.askedFields : [],
    recentErrors: Array.isArray(raw.recentErrors) ? raw.recentErrors : [],
    lastRestaurants: Array.isArray(raw.lastRestaurants) ? raw.lastRestaurants : [],
    zone: raw.zone ?? null,
    signupDraft: raw.signupDraft ?? null,
    pendingAdminProposal: raw.pendingAdminProposal ?? null,
  };
}

export function emptyProfile(fromDigits: string, nowMs: number, ttlMs: number): WaMasterProfile {
  return {
    fromDigits,
    roles: ['unknown'],
    linkedComercioIds: [],
    preferences: {},
    preferenceProvenance: {},
    lastIntent: null,
    attentionState: 'ai',
    lastActiveAtMs: nowMs,
    retentionUntilMs: nowMs + ttlMs,
  };
}

export function createEmptyMemory(
  fromDigits: string,
  nowMs: number,
  profileTtlMs: number,
): WaMasterMemory {
  return {
    turns: [],
    summary: emptySummary(nowMs),
    profile: emptyProfile(fromDigits, nowMs, profileTtlMs),
  };
}

export function appendTurn(
  memory: WaMasterMemory,
  turn: WaMasterTurn,
  cap = DEFAULT_TURN_CAP,
): WaMasterMemory {
  const turns = [...memory.turns, turn].slice(-cap);
  return { ...memory, turns };
}

export function patchSummary(
  memory: WaMasterMemory,
  patch: Partial<WaMasterSummary>,
  nowMs: number,
): WaMasterMemory {
  return {
    ...memory,
    summary: {
      ...memory.summary,
      ...patch,
      updatedAtMs: nowMs,
    },
  };
}

export function rememberAskedField(memory: WaMasterMemory, field: string, nowMs: number): WaMasterMemory {
  if (memory.summary.askedFields.includes(field)) return memory;
  return patchSummary(
    memory,
    { askedFields: [...memory.summary.askedFields, field] },
    nowMs,
  );
}

export function setLastIntent(
  memory: WaMasterMemory,
  intent: WaMasterIntent,
  nowMs: number,
): WaMasterMemory {
  return {
    ...patchSummary(memory, { lastIntent: intent }, nowMs),
    profile: {
      ...memory.profile,
      lastIntent: intent,
      lastActiveAtMs: nowMs,
    },
  };
}

/** Compact text block for prompts / debugging — not a full transcript dump. */
export function formatMemoryForPrompt(memory: WaMasterMemory, maxTurns: number): string {
  const recent = memory.turns.slice(-maxTurns);
  const lines = recent.map((t) => `${t.role}: ${t.text}`);
  const s = memory.summary;
  return [
    `Resumen: servicio=${s.activeService ?? '—'}; meta=${s.goal ?? '—'}; comercio=${s.selectedComercioId ?? '—'}; pendiente=${s.pendingQuestion ?? '—'}; última_intención=${s.lastIntent ?? '—'}; humano=${s.humanIntervened ? 'sí' : 'no'}; ya_preguntado=${s.askedFields.join(',') || '—'}`,
    'Turnos recientes:',
    ...lines,
  ].join('\n');
}
