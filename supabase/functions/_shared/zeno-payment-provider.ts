import { Webhook } from 'https://esm.sh/svix@1.37.0';
import type {
  CheckoutResult,
  CreateCheckoutInput,
  PaymentProvider,
  PaymentStatus,
  WebhookVerificationResult,
} from './payment-provider.ts';
import { normalizeAmountString } from './payment-provider.ts';

const DEFAULT_BASE_URL = 'https://api.zenobank.io/api/v1';
const DEFAULT_TIMEOUT_MS = 15_000;

export type ZenoPaymentProviderOptions = {
  apiKey: string;
  webhookSecret?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Optional hook used by handleWebhook after mapping; edge function supplies DB apply. */
  onVerifiedEvent?: (
    event: WebhookVerificationResult,
  ) => Promise<{ handled: boolean; action: string }>;
};

export class ZenoPaymentProvider implements PaymentProvider {
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly onVerifiedEvent?: ZenoPaymentProviderOptions['onVerifiedEvent'];

  constructor(options: ZenoPaymentProviderOptions) {
    this.apiKey = options.apiKey.trim();
    this.webhookSecret = (options.webhookSecret ?? '').trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onVerifiedEvent = options.onVerifiedEvent;

    if (!this.apiKey) {
      throw new Error('ZENO_API_KEY is required');
    }
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const body = {
      orderId: input.orderId,
      priceAmount: normalizeAmountString(input.priceAmount),
      priceCurrency: input.priceCurrency.toUpperCase(),
      ...(input.successRedirectUrl
        ? { successRedirectUrl: input.successRedirectUrl }
        : {}),
    };

    const payload = await this.requestJson('POST', '/checkouts', body);
    return this.mapCheckout(payload);
  }

  async getCheckoutStatus(checkoutId: string): Promise<CheckoutResult> {
    const id = checkoutId.trim();
    if (!id) {
      throw new Error('checkoutId is required');
    }
    const payload = await this.requestJson('GET', `/checkouts/${encodeURIComponent(id)}`);
    return this.mapCheckout(payload);
  }

  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookVerificationResult> {
    if (!this.webhookSecret) {
      throw new Error('ZENO_WEBHOOK_SECRET is required');
    }

    const svixHeaders = {
      'svix-id': headers['svix-id'] ?? headers['Svix-Id'] ?? '',
      'svix-timestamp': headers['svix-timestamp'] ?? headers['Svix-Timestamp'] ?? '',
      'svix-signature': headers['svix-signature'] ?? headers['Svix-Signature'] ?? '',
    };

    if (!svixHeaders['svix-id'] || !svixHeaders['svix-timestamp'] || !svixHeaders['svix-signature']) {
      throw new Error('Missing Svix webhook headers');
    }

    const wh = new Webhook(this.webhookSecret);
    const msg = wh.verify(rawBody, svixHeaders) as {
      type?: string;
      data?: Record<string, unknown>;
    };

    if (!msg?.type || !msg?.data || typeof msg.data !== 'object') {
      throw new Error('Invalid webhook payload shape');
    }

    return { type: msg.type, data: msg.data };
  }

  async handleWebhook(
    event: WebhookVerificationResult,
  ): Promise<{ handled: boolean; action: string }> {
    if (this.onVerifiedEvent) {
      return this.onVerifiedEvent(event);
    }

    switch (event.type) {
      case 'checkout.completed':
      case 'checkout.expired':
      case 'checkout.partially_paid':
        return { handled: true, action: event.type };
      default:
        return { handled: false, action: 'ignored' };
    }
  }

  mapPaymentStatus(providerStatus: string): PaymentStatus {
    switch (String(providerStatus ?? '').trim().toUpperCase()) {
      case 'OPEN':
        return 'open';
      case 'COMPLETED':
        return 'completed';
      case 'EXPIRED':
        return 'expired';
      case 'PARTIALLY_PAID':
        return 'partially_paid';
      case 'CANCELLED':
      case 'FAILED':
        return 'failed';
      default:
        return 'open';
    }
  }

  private mapCheckout(payload: Record<string, unknown>): CheckoutResult {
    const checkoutId = String(payload.id ?? '').trim();
    const checkoutUrl = String(payload.checkoutUrl ?? '').trim();
    const orderId = String(payload.orderId ?? '').trim();
    if (!checkoutId || !checkoutUrl || !orderId) {
      throw new Error('Zeno checkout response missing id, checkoutUrl, or orderId');
    }

    return {
      checkoutId,
      checkoutUrl,
      expiresAt: payload.expiresAt ? String(payload.expiresAt) : null,
      status: this.mapPaymentStatus(String(payload.status ?? 'OPEN')),
      orderId,
      priceAmount: String(payload.priceAmount ?? ''),
      priceCurrency: String(payload.priceCurrency ?? ''),
      paidAmount: payload.paidAmount != null ? String(payload.paidAmount) : undefined,
      raw: payload,
    };
  }

  private async requestJson(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let json: Record<string, unknown> = {};
      if (text) {
        try {
          json = JSON.parse(text) as Record<string, unknown>;
        } catch {
          throw new Error(`Zeno API returned non-JSON (${response.status})`);
        }
      }

      if (!response.ok) {
        const message =
          String(json.message ?? json.error ?? json.detail ?? text).slice(0, 500) ||
          `Zeno API error ${response.status}`;
        throw new Error(message);
      }

      return json;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Zeno API timeout after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function extractCheckoutFields(data: Record<string, unknown>): {
  orderId: string;
  checkoutId: string;
  paidAmount: number;
  priceAmount: number;
  currency: string;
} {
  return {
    orderId: String(data.orderId ?? '').trim(),
    checkoutId: String(data.id ?? '').trim(),
    paidAmount: Number(data.paidAmount ?? 0),
    priceAmount: Number(data.priceAmount ?? 0),
    currency: String(data.priceCurrency ?? '').trim().toUpperCase(),
  };
}
