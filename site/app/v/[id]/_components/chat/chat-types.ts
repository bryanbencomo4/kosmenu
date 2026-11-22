import type { CartLineSelection } from '../../../../_lib/menu-product-options';

export type ChatRole = 'assistant' | 'user' | 'system';

export type ChatProductCardData = {
  product_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  currency: string;
  price_base: number | null;
  price_unit: number | null;
  price_label: string | null;
  line_total?: number | null;
  line_total_label?: string | null;
  available: boolean;
  requires_configuration: boolean;
  option_hints: string[];
  selected_options?: string[];
  quantity?: number;
};

type ProposalMeta = {
  proposal_id: string;
  catalog_fingerprint: string | null;
};

export type ChatCartActionData =
  | ({
      type: 'propose_add';
      requires_confirmation: true;
      cart_key: string;
      product_id: string;
      quantity: number;
      selection: CartLineSelection;
      unit_price: number;
      line_total: number;
      currency: string;
      label: string;
      product_card: ChatProductCardData;
    } & ProposalMeta)
  | ({
      type: 'propose_update_qty';
      requires_confirmation: true;
      cart_key: string;
      product_id: string;
      quantity: number;
      selection: CartLineSelection;
      unit_price: number;
      line_total: number;
      currency: string;
      label: string;
    } & ProposalMeta)
  | ({
      type: 'propose_remove';
      requires_confirmation: true;
      cart_key: string;
      product_id: string;
      label: string;
    } & ProposalMeta)
  | ({
      type: 'open_checkout';
      requires_confirmation: true;
      label: string;
    } & ProposalMeta);

/**
 * Honest outbound receipts (not fake WhatsApp “read by a person”):
 * - sent: queued in UI, request not yet accepted
 * - delivered: server/API accepted the turn
 * - read: assistant finished processing and replied (or failed after accept)
 */
export type ChatDeliveryStatus = 'sent' | 'delivered' | 'read';

export type ChatAttachment = {
  id: string;
  kind: 'image' | 'file' | 'audio';
  name: string;
  mime: string;
  size: number;
  /** Object URL for preview/playback in this session. */
  url: string;
  /** Optional server analysis / transcript text. */
  analysis?: string | null;
};

/**
 * Slim category shape for conversational catalog UI.
 * Defined here (re-exported from chat-catalog) to avoid import cycles.
 */
export type ChatCatalogCategory = {
  id: string;
  name: string;
  imageUrl: string | null;
  productCount: number;
  availableCount: number;
};

/**
 * Lightweight pointer to the message being quoted/replied to.
 * `preview` is already clamped plain text (see `buildChatReplyRef`).
 */
export type ChatReplyRef = {
  messageId: string;
  role: ChatRole;
  preview: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
  /** Quoted message this bubble replies to (rendered as a mini quote above the text). */
  replyTo?: ChatReplyRef | null;
  /** Marks demo / non-AI copy so UI can style it without pretending it is live AI. */
  demo?: boolean;
  /** First assistant bubble; refreshed when welcome copy/version changes. */
  isWelcome?: boolean;
  welcomeVersion?: number;
  /** User-message delivery ticks (grey / blue). */
  deliveryStatus?: ChatDeliveryStatus;
  /** Optional voice note attached to a user bubble. */
  voiceUrl?: string | null;
  voiceDurationMs?: number;
  /**
   * True while the voice note is uploading / being transcribed.
   * UI shows a WhatsApp-like spinner instead of a "0:00" audio control.
   */
  voicePending?: boolean;
  attachments?: ChatAttachment[];
  /** Shared GPS for delivery (user-authorized). */
  location?: { lat: number; lng: number; label?: string } | null;
  productCards?: ChatProductCardData[];
  cartActions?: ChatCartActionData[];
  /** Category carousel rendered under the bubble. */
  catalogCategories?: ChatCatalogCategory[];
  /** Product carousel rendered under the bubble (compact vertical cards). */
  catalogProducts?: ChatProductCardData[];
  /** Category the catalogProducts belong to (null = all / mixed). */
  catalogCategoryId?: string | null;
  /** Sticker sent as a message (id + accessible label). */
  sticker?: { id: string; label: string } | null;
};

export type ChatSharedLocation = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  label?: string | null;
};

/** System notice after ProductOptionsSheet adds directly (no second confirm). */
export type ChatAppliedAddNotice = {
  label: string;
  productCard?: ChatProductCardData;
};
