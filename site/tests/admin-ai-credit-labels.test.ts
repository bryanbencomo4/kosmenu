import { describe, expect, it } from 'vitest';

import { describeAiCreditMovement } from '../app/admin/_lib/admin-ai-credit-labels';

describe('describeAiCreditMovement', () => {
  it('labels image queue debits with product name', () => {
    const label = describeAiCreditMovement({
      type: 'debit',
      reason: 'ai_image_generation_queue',
      metadata: { product_name: 'Hamburguesa' },
    });
    expect(label.title).toBe('Foto con IA · Hamburguesa');
    expect(label.detail).toMatch(/panel del negocio/i);
    expect(label.isCredit).toBe(false);
  });

  it('labels product description generation', () => {
    const label = describeAiCreditMovement({
      type: 'debit',
      reason: 'product_description_generation',
      metadata: {},
    });
    expect(label.title).toBe('Descripción de producto con IA');
  });

  it('labels admin topups', () => {
    const label = describeAiCreditMovement({
      type: 'credit',
      reason: 'admin_topup',
    });
    expect(label.title).toMatch(/soporte/i);
    expect(label.isCredit).toBe(true);
  });
});
