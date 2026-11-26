/**
 * Build non-sensitive handoff payload fields from Master memory + turns.
 * Never include phones, passwords, or tokens.
 */

import type { WaHandoffPayload } from '../../../_lib/wa-handoff';
import type { WaMasterIdentity, WaMasterMemory } from '../types';

export function buildHandoffContextFromMemory(params: {
  memory: WaMasterMemory;
  identity: WaMasterIdentity;
  text: string;
  intent?: string | null;
  pendingOperation?: string | null;
  slug?: string | null;
  comercioId?: string | null;
  profile?: WaHandoffPayload['profile'];
  extra?: Partial<WaHandoffPayload>;
}): WaHandoffPayload {
  const { memory, identity, text, intent, pendingOperation, slug, comercioId, profile, extra } =
    params;
  const draft = memory.summary.signupDraft;
  const zone =
    memory.summary.zone ||
    (memory.profile.preferences as { zone?: string } | undefined)?.zone ||
    null;
  const selected =
    comercioId ||
    memory.summary.selectedComercioId ||
    identity.comercios[0]?.comercioId ||
    null;
  const selectedSlug =
    slug ||
    identity.comercios.find((c) => c.comercioId === selected)?.slug ||
    identity.comercios[0]?.slug ||
    null;

  const lastUser = memory.turns
    .filter((t) => t.role === 'user')
    .slice(-3)
    .map((t) => t.text)
    .filter(Boolean);
  const lastAssistant = memory.turns
    .filter((t) => t.role === 'assistant')
    .slice(-2)
    .map((t) => t.text)
    .filter(Boolean);

  const openQuestions: string[] = [];
  if (memory.summary.pendingQuestion) {
    openQuestions.push(`pending:${memory.summary.pendingQuestion}`);
  }
  if (memory.summary.goal) openQuestions.push(`goal:${String(memory.summary.goal).slice(0, 80)}`);

  const transcriptParts = [
    ...lastUser.map((t) => `U: ${t.slice(0, 120)}`),
    ...lastAssistant.map((t) => `A: ${t.slice(0, 120)}`),
    `U: ${text.slice(0, 200)}`,
  ];

  const restaurants = memory.summary.lastRestaurants || [];
  const restaurantHint = restaurants.length
    ? restaurants
        .slice(0, 3)
        .map((r) => r.nombre || r.slug)
        .filter(Boolean)
        .join(', ')
    : null;

  const summaryBits = [
    intent || null,
    draft?.businessName ? `negocio:${draft.businessName}` : null,
    zone ? `zona:${zone}` : null,
    restaurantHint ? `locales:${restaurantHint}` : null,
    memory.summary.lastIntent ? `prev:${memory.summary.lastIntent}` : null,
  ].filter(Boolean);

  return {
    profile: profile || null,
    comercioId: selected,
    slug: selectedSlug,
    intent: intent || memory.summary.lastIntent || null,
    summary: summaryBits.join(' · ').slice(0, 280) || null,
    query: text.slice(0, 160) || null,
    zone: zone ? String(zone).slice(0, 80) : null,
    pendingOperation: pendingOperation || null,
    businessNameDraft: draft?.businessName || null,
    conversationHint:
      extra?.conversationHint ||
      (draft?.businessName
        ? `Registro / gestión: ${draft.businessName}`
        : restaurantHint
          ? `Interés en: ${restaurantHint}`
          : null),
    openQuestions: openQuestions.length ? openQuestions : null,
    transcriptExcerpt: transcriptParts.join('\n').slice(0, 800),
    preferences: zone ? `zona=${zone}` : null,
    source: 'wa_platform',
    ...extra,
  };
}
