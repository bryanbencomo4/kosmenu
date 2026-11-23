/** Etiquetas legibles para motivos de ai_credits_transactions. */

export type AiCreditLabelInput = {
  type?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

function productNameFrom(metadata: Record<string, unknown> | null | undefined) {
  const raw =
    metadata?.product_name ??
    metadata?.productName ??
    metadata?.nombre ??
    metadata?.name;
  if (raw == null) return '';
  const text = String(raw).trim();
  return text;
}

export function describeAiCreditMovement(input: AiCreditLabelInput): {
  title: string;
  detail: string | null;
  isCredit: boolean;
} {
  const reason = (input.reason ?? '').trim();
  const isCredit = (input.type ?? '').toLowerCase() === 'credit';
  const product = productNameFrom(input.metadata);
  const lower = reason.toLowerCase();

  if (lower.includes('refund')) {
    return {
      title: product ? `Reembolso IA · ${product}` : 'Reembolso de créditos IA',
      detail: reason || null,
      isCredit: true,
    };
  }

  switch (reason) {
    case 'ai_image_generation_queue':
    case 'ai_image_generation':
      return {
        title: product ? `Foto con IA · ${product}` : 'Foto de producto con IA',
        detail: 'Generada desde el panel del negocio',
        isCredit,
      };
    case 'ai_category_cover':
      return {
        title: 'Portada de categoría con IA',
        detail: 'Generada desde el panel del negocio',
        isCredit,
      };
    case 'product_description_generation':
    case 'product_description':
    case 'generate_product_description':
      return {
        title: product
          ? `Descripción con IA · ${product}`
          : 'Descripción de producto con IA',
        detail: 'Generada desde el panel del negocio',
        isCredit,
      };
    case 'menu_generation':
      return {
        title: 'Menú generado con IA',
        detail: 'Generado desde el panel del negocio',
        isCredit,
      };
    case 'branding_generation':
      return {
        title: 'Branding con IA',
        detail: 'Generado desde el panel del negocio',
        isCredit,
      };
    case 'category_emoji_suggestion':
      return {
        title: 'Icono de categoría con IA',
        detail: 'Sugerido desde el panel del negocio',
        isCredit,
      };
    case 'initial_signup_credits':
      return {
        title: 'Créditos de bienvenida',
        detail: 'Alta del negocio',
        isCredit: true,
      };
    case 'ai_credit_topup':
      return {
        title: 'Recarga de créditos',
        detail: null,
        isCredit: true,
      };
    case 'admin_topup':
    case 'admin_manual_topup':
      return {
        title: 'Recarga manual (soporte)',
        detail: 'Cargada desde admin.elmenuxfa.com',
        isCredit: true,
      };
    case 'ai_usage':
      return {
        title: 'Uso de IA',
        detail: 'Consumo desde el panel del negocio',
        isCredit,
      };
    default: {
      if (!reason) {
        return {
          title: isCredit ? 'Recarga de créditos' : 'Uso de créditos IA',
          detail: null,
          isCredit,
        };
      }
      // Motivos custom (p. ej. backfills / notas de soporte)
      const readable = reason
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        title: isCredit ? `Recarga · ${readable}` : `Uso · ${readable}`,
        detail: isCredit ? null : 'Registrado en el historial del negocio',
        isCredit,
      };
    }
  }
}
