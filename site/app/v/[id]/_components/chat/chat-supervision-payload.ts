import type { ChatMessage } from './chat-types';

/**
 * Serialize a consumer-chat bubble into supervision `payload` jsonb
 * so the merchant panel can render the same cards/carousels.
 */
export function chatMessageToSupervisionPayload(
  msg: ChatMessage,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (msg.productCards?.length) payload.product_cards = msg.productCards;
  if (msg.cartActions?.length) payload.cart_actions = msg.cartActions;
  if (msg.catalogCategories?.length) {
    payload.category_cards = msg.catalogCategories;
  }
  if (msg.catalogProducts?.length) {
    payload.catalog_products = msg.catalogProducts;
  }
  if (msg.catalogCategoryId != null) {
    payload.catalog_category_id = msg.catalogCategoryId;
  }
  if (msg.attachments?.length) payload.attachments = msg.attachments;
  if (msg.voiceUrl) payload.voiceUrl = msg.voiceUrl;
  if (msg.voiceDurationMs) payload.voiceDurationMs = msg.voiceDurationMs;
  if (msg.location) payload.location = msg.location;
  if (msg.paymentMethods?.length) {
    payload.payment_methods = msg.paymentMethods;
  }
  if (msg.hoursSchedule) payload.hours_schedule = msg.hoursSchedule;
  if (msg.contactCard) payload.contact_card = msg.contactCard;
  if (msg.sticker) payload.sticker = msg.sticker;
  if (msg.closeSale) payload.close_sale = msg.closeSale;
  return payload;
}

export function supervisionPayloadHasUi(payload: Record<string, unknown>) {
  return Object.keys(payload).length > 0;
}
