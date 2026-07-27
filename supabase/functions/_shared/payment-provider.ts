/// Payment provider abstraction for SaaS billing (Zeno first).

export type PaymentStatus =
  | 'open'
  | 'completed'
  | 'expired'
  | 'partially_paid'
  | 'failed';

export type CreateCheckoutInput = {
  orderId: string;
  priceAmount: number | string;
  priceCurrency: string;
  successRedirectUrl?: string;
};

export type CheckoutResult = {
  checkoutId: string;
  checkoutUrl: string;
  expiresAt: string | null;
  status: PaymentStatus;
  orderId: string;
  priceAmount: string;
  priceCurrency: string;
  paidAmount?: string;
  raw: Record<string, unknown>;
};

export type WebhookVerificationResult = {
  type: string;
  data: Record<string, unknown>;
};

export interface PaymentProvider {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  getCheckoutStatus(checkoutId: string): Promise<CheckoutResult>;
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookVerificationResult>;
  handleWebhook(
    event: WebhookVerificationResult,
  ): Promise<{ handled: boolean; action: string }>;
  mapPaymentStatus(providerStatus: string): PaymentStatus;
}

export function normalizeAmountString(amount: number | string): string {
  const n = typeof amount === 'number' ? amount : Number(String(amount).trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Invalid price amount');
  }
  return n.toFixed(2);
}
