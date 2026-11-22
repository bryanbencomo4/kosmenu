import { describe, expect, it } from 'vitest';
import {
  detectNeedsHuman,
  hashConsumerSession,
  merchantConversationHref,
} from '../app/api/chat/_lib/supervision-shared';
import {
  getChatSupervisionConfig,
  isSupervisionEnabledForCommerce,
} from '../app/api/chat/_lib/supervision-config';

describe('chat supervision helpers', () => {
  it('detects human escalation phrases', () => {
    expect(detectNeedsHuman('Quiero hablar con un humano')).toBe(true);
    expect(detectNeedsHuman('Tengo un reclamo')).toBe(true);
    expect(detectNeedsHuman('¿Tienen pizza grande?')).toBe(false);
  });

  it('hashes consumer sessions stably per commerce', () => {
    const a = hashConsumerSession('c1', 's_abc');
    const b = hashConsumerSession('c1', 's_abc');
    const c = hashConsumerSession('c2', 's_abc');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('builds authenticated panel deep link without secrets', () => {
    const href = merchantConversationHref('11111111-1111-4111-8111-111111111111');
    expect(href).toContain('/panel/conversaciones/11111111-1111-4111-8111-111111111111');
    expect(href).not.toMatch(/service_role|apikey|Bearer/i);
  });

  it('feature flags default off and fail-closed in production allowlist', () => {
    const cfg = getChatSupervisionConfig({
      CHAT_SUPERVISION_ENABLED: '',
      NODE_ENV: 'test',
    });
    expect(cfg.enabled).toBe(false);
    expect(
      isSupervisionEnabledForCommerce('0aa8c53b-07f1-446e-8b88-66c2b7ae89ea', {
        CHAT_SUPERVISION_ENABLED: '1',
        CHAT_SUPERVISION_COMMERCE_IDS: '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea',
        NODE_ENV: 'production',
      }),
    ).toBe(true);
    expect(
      isSupervisionEnabledForCommerce('00000000-0000-4000-8000-000000000099', {
        CHAT_SUPERVISION_ENABLED: '1',
        CHAT_SUPERVISION_COMMERCE_IDS: '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea',
        NODE_ENV: 'production',
      }),
    ).toBe(false);
  });
});
