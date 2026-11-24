/**
 * Asistente Maestro — shared types (Package 1).
 * Identity provenance must never silently upgrade inferred → verified.
 */

export type WaMasterProvenance = 'verified_db' | 'confirmed_user' | 'inferred_ai' | 'unknown';

export type WaMasterRole =
  | 'unknown'
  | 'new_contact'
  | 'possible_consumer'
  | 'merchant_candidate'
  | 'merchant_member'
  | 'mixed';

export type WaMasterIntent =
  | 'greeting'
  | 'clarify_role'
  | 'consumer.search'
  | 'consumer.product'
  | 'consumer.hours'
  | 'consumer.delivery'
  | 'consumer.order_help'
  | 'consumer.complaint'
  | 'commercial.info'
  | 'commercial.pricing'
  | 'commercial.register'
  | 'commercial.resume_signup'
  | 'admin.view_menu'
  | 'admin.edit_product'
  | 'admin.edit_price'
  | 'admin.availability'
  | 'admin.hours'
  | 'admin.fx'
  | 'admin.delivery'
  | 'admin.settings'
  | 'support.issue'
  | 'support.human'
  | 'privacy.rectify'
  | 'privacy.delete'
  | 'multi'
  | 'unknown';

export type WaMasterSpecialist = 'consumer' | 'commercial' | 'admin' | 'support' | 'orchestrator';

export type WaMasterComercioRef = {
  comercioId: string;
  publicName: string;
  slug: string | null;
  matchField: 'whatsapp' | 'telefonos' | 'supervision_whatsapp' | 'owner_auth' | 'user_confirmed';
  provenance: WaMasterProvenance;
};

export type WaMasterIdentity = {
  fromDigits: string;
  role: WaMasterRole;
  comercios: WaMasterComercioRef[];
  possibleConsumer: boolean;
  consumerOrderSignal: boolean;
  provenanceNotes: string[];
};

/** L1 — recent turns */
export type WaMasterTurn = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
  atMs: number;
  intent?: WaMasterIntent;
  specialist?: WaMasterSpecialist;
};

/** L2 — compact rolling summary */
export type WaMasterSummary = {
  activeService: WaMasterSpecialist | null;
  selectedComercioId: string | null;
  goal: string | null;
  pendingQuestion: string | null;
  proposedAction: string | null;
  askedFields: string[];
  recentErrors: string[];
  humanIntervened: boolean;
  lastIntent: WaMasterIntent | null;
  updatedAtMs: number;
};

/** L3 — durable contact profile (no secrets) */
export type WaMasterProfile = {
  fromDigits: string;
  roles: WaMasterRole[];
  linkedComercioIds: string[];
  preferences: Record<string, string>;
  preferenceProvenance: Record<string, WaMasterProvenance>;
  lastIntent: WaMasterIntent | null;
  attentionState: 'ai' | 'human' | 'closed';
  lastActiveAtMs: number;
  retentionUntilMs: number | null;
};

export type WaMasterMemory = {
  turns: WaMasterTurn[];
  summary: WaMasterSummary;
  profile: WaMasterProfile;
};

export type WaMasterOrchestratorInput = {
  fromDigits: string;
  text: string;
  messageId: string;
  nowMs: number;
  identity: WaMasterIdentity;
  memory: WaMasterMemory;
  /** When Gemini path is disabled or exhausted. */
  forceDeterministic?: boolean;
};

export type WaMasterOrchestratorResult = {
  replies: string[];
  intents: WaMasterIntent[];
  specialist: WaMasterSpecialist;
  memory: WaMasterMemory;
  escalateHuman: boolean;
  toolsUsed: string[];
  mode: 'deterministic' | 'gemini' | 'fallback';
  dedupeKey: string;
};
