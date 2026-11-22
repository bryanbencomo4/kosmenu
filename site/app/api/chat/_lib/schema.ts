import { z } from 'zod';

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().min(1).max(2000),
});

const cartSelectionBaseSchema = z.object({
  tamanoId: z.string().optional(),
  tamanoLabel: z.string().optional(),
  servicioAdicional: z.boolean().optional(),
  ajusteIds: z.array(z.string()).optional(),
  grupos: z.record(z.string(), z.array(z.string())).optional(),
  textos: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  exclusionesIds: z.array(z.string()).optional(),
});

/** One nesting level for traditional-menu combinación (partner selection). */
const cartSelectionSchema = cartSelectionBaseSchema
  .extend({
    combinacion: z
      .object({
        productId: z.string().trim().min(1).max(80),
        seleccion: cartSelectionBaseSchema.default({}),
      })
      .optional(),
  })
  .strict()
  .optional();

export const chatCartSnapshotLineSchema = z.object({
  productId: z.string().trim().min(1).max(80),
  quantity: z.number().finite().positive().max(99),
  selection: cartSelectionSchema.default({}),
});

export const pendingConfigurationSchema = z.object({
  product_id: z.string().trim().min(1).max(80),
  product_name: z.string().trim().max(120).optional(),
  combine_with_product_id: z.string().trim().min(1).max(80),
  combine_with_product_name: z.string().trim().max(120).optional(),
  quantity: z.number().finite().positive().max(99).default(1),
  option_labels: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  exclude_ingredients: z
    .array(z.string().trim().min(1).max(40))
    .max(8)
    .default([]),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(40),
  sessionId: z
    .string()
    .trim()
    .min(8)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  /** Ignored for tenant resolution — path param wins. Present only to detect spoofing attempts. */
  comercio_id: z.string().optional(),
  commerce_id: z.string().optional(),
  /** Shared cart from PublicMenuPage — authoritative for get_cart_snapshot. */
  cart_snapshot: z.array(chatCartSnapshotLineSchema).max(40).optional(),
  /**
   * Structured client intents that skip Gemini (cost control).
   * Free-text NLU still goes through Gemini.
   */
  deterministic_action: z
    .enum(['summarize_cart', 'delivery_info', 'complete_pending_config'])
    .optional(),
  /** Completes a pending combinación / size ask without Gemini. */
  pending_configuration: pendingConfigurationSchema.optional(),
});

export type ChatRequestBody = z.infer<typeof chatRequestSchema>;

export function createSessionId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  return `s_${rand.slice(0, 24)}`;
}

export function createRequestId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  return `r_${rand.slice(0, 20)}`;
}
