/**
 * Smart numbered menus for platform WA Master (elmenuxfa.com).
 * Profile-aware, with universal 0 / 8 / 9.
 */

export type WaMenuProfile = 'unknown' | 'consumer' | 'prospect' | 'registered';

export type WaMenuId =
  | 'root_unknown'
  | 'root_consumer'
  | 'root_prospect'
  | 'root_registered'
  | 'biz_links'
  | 'biz_products'
  | 'biz_pricing'
  | 'biz_orders'
  | 'biz_config'
  | 'support_issue';

/** Soft TTL: after this, a bare number is NOT treated as belonging to the previous menu. */
export const WA_MENU_STALE_MS = 36 * 60 * 60 * 1000; // 36h

export type WaMenuNavState = {
  menuId: WaMenuId | null;
  menuProfile: WaMenuProfile;
  menuUpdatedAtMs: number;
  /** Consecutive unclear replies — escalate help path when high. */
  misunderstandCount: number;
  /** Support flow: user already described issue in free text. */
  supportIssueText: string | null;
};
