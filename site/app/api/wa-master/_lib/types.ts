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
  | 'admin.menu_links'
  | 'support.issue'
  | 'support.question'
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

export type WaMasterRestaurantRef = {
  id: string;
  slug: string;
  nombre: string;
  menuUrl: string;
  chatUrl?: string | null;
};

export type WaMasterSignupDraft = {
  businessName: string | null;
  city: string | null;
  category: string | null;
  stage: 'intro' | 'need' | 'pricing' | 'ready_register' | 'waiting_panel';
};

export type WaMasterAdminProposal = {
  comercioId: string;
  action: 'edit_price' | 'add_product' | 'set_availability' | 'set_fx' | 'set_hours' | 'set_delivery';
  label: string;
  currentValue: string | null;
  proposedValue: string;
  /** Only executable when auth.authorized + confirm. */
  requiresAuth: true;
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
  /**
   * Last zone the user asserted in a message. Store only — never echo into
   * replies unless the current message also states the city.
   */
  zone: string | null;
  lastRestaurants: WaMasterRestaurantRef[];
  signupDraft: WaMasterSignupDraft | null;
  pendingAdminProposal: WaMasterAdminProposal | null;
  /** Last issued handoff URL (avoid repeat spam). */
  lastHandoffUrl: string | null;
  lastHandoffAtMs: number | null;
  /** Smart menu navigation (numbered, contextual). */
  menuId: string | null;
  menuProfile: string | null;
  menuUpdatedAtMs: number;
  misunderstandCount: number;
  supportIssueText: string | null;
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
  /** Accepts partial L2 summaries; orchestrator normalizes missing fields. */
  memory: Omit<WaMasterMemory, 'summary'> & {
    summary: Partial<WaMasterSummary> & Pick<WaMasterSummary, 'updatedAtMs'>;
  };
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
