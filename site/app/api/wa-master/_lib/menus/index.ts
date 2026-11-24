export {
  buildMenuText,
  humanEscalateSuccessReply,
  humanTakeNotice,
  assistantReturnNotice,
  rootMenuIdForProfile,
} from './copy';
// Notices remain available for optional operator-authored sends; inbox take/return does not auto-send them.
export { resolveMenuProfile } from './profile';
export {
  tryHandleSmartMenu,
  parseMenuDigit,
  isUniversalBack,
  isUniversalHuman,
  isUniversalSupport,
  type SmartMenuResult,
} from './navigate';
export type { WaMenuId, WaMenuProfile, WaMenuNavState } from './types';
export { WA_MENU_STALE_MS } from './types';
