import type { WaMasterIdentity, WaMasterMemory } from '../types';
import type { WaMenuProfile } from './types';

/**
 * Map Master identity + memory to a menu profile.
 * Phone-linked comercios are commercial context, not admin authorization.
 */
export function resolveMenuProfile(
  identity: WaMasterIdentity,
  memory: WaMasterMemory,
): WaMenuProfile {
  const hasComercio = (identity.comercios?.length || 0) > 0;
  const roles = new Set([identity.role, ...(memory.profile.roles || [])]);
  const signup = memory.summary.signupDraft;
  const inSignup =
    Boolean(signup) &&
    signup!.stage !== 'intro' &&
    (Boolean(signup!.businessName) || signup!.stage === 'waiting_panel');

  // Prefer current need when mixed: recent commercial/signup or consumer activity.
  const lastIntent = memory.summary.lastIntent || '';
  const lastService = memory.summary.activeService;
  if (roles.has('mixed') || (hasComercio && identity.possibleConsumer)) {
    if (lastService === 'consumer' || String(lastIntent).startsWith('consumer')) {
      return 'consumer';
    }
    if (hasComercio) return 'registered';
    if (inSignup) return 'prospect';
  }

  if (hasComercio || roles.has('merchant_candidate') || roles.has('merchant_member')) {
    return 'registered';
  }
  if (inSignup || roles.has('merchant_candidate')) return 'prospect';
  if (identity.possibleConsumer || identity.consumerOrderSignal || roles.has('possible_consumer')) {
    return 'consumer';
  }
  return 'unknown';
}
