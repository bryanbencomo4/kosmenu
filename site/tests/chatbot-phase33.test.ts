import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  allowsLocalOfflineChatbotCommerce,
  LOCAL_OFFLINE_CHATBOT_COMMERCE_ID,
} from '../app/api/chat/_lib/commerce-auth';
import {
  getChatbotConfig,
  isChatbotRuntimeAllowed,
} from '../app/api/chat/_lib/config';
import {
  prepareCartLineProposal,
} from '../app/api/chat/_lib/cart-proposals';
import { isGeminiSimulationEnabled } from '../app/api/chat/_lib/simulate-gemini';
import type { LoadedPublicMenu } from '../app/api/menu/_lib/load-public-menu';

const COMMERCE = LOCAL_OFFLINE_CHATBOT_COMMERCE_ID;

const sizeGrupos = {
  activadas: true,
  grupos: [
    {
      id: 'tam',
      nombre: 'Tamaños',
      tipo: 'unica',
      obligatorio: true,
      min: 1,
      max: 1,
      opciones: [
        { id: 'n', nombre: 'Normal', precio: 0, activo: true },
        { id: 'g', nombre: 'Grande', precio: 5.25, activo: true },
      ],
    },
  ],
};

function menu(): LoadedPublicMenu {
  return {
    resolvedComercioId: COMMERCE,
    ownerId: 'o',
    isOnline: false,
    comercioRow: { branding_ia: { config_negocio: {} } },
    comercio: {
      nombre: 'pizzas el trueno',
      moneda: 'USD',
      en_linea: false,
      permite_delivery: true,
    } as any,
    categorias: [{ id: 'c-pizza', nombre: 'PIZZAS' }],
    productos: [
      {
        id: 'p-haw',
        categoria_id: 'c-pizza',
        nombre: 'Hawaiana',
        descripcion: 'Jamón, Queso, Piña',
        precio: 3.5,
        disponible: true,
        opciones_menu: sizeGrupos,
        imagen_url: 'https://cdn.example/haw.jpg',
      },
    ],
    metodosPago: [],
    checkoutExchange: {} as any,
    marketRates: null,
    upsellSettings: null,
    upsellRules: [],
    bundles: [],
    preCheckoutUpsell: null as any,
  };
}

describe('Phase 3.3 live prep gates (no billable calls)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('offline Trueno exception is local-only', () => {
    expect(
      allowsLocalOfflineChatbotCommerce({
        commerceId: COMMERCE,
        nodeEnv: 'development',
        allowOfflineLocalFlag: '1',
      }),
    ).toBe(true);
    expect(
      allowsLocalOfflineChatbotCommerce({
        commerceId: COMMERCE,
        nodeEnv: 'production',
        allowOfflineLocalFlag: '1',
      }),
    ).toBe(false);
  });

  it('with SIMULATE=0 runtime still requires Gemini key', () => {
    vi.stubEnv('CHATBOT_ENABLED', '1');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CHATBOT_QUOTA_BACKEND', 'filesystem');
    vi.stubEnv('CHATBOT_SIMULATE_GEMINI', '0');
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(isGeminiSimulationEnabled(process.env)).toBe(false);
    expect(isChatbotRuntimeAllowed(getChatbotConfig(process.env)).ok).toBe(
      false,
    );
    expect(isChatbotRuntimeAllowed(getChatbotConfig(process.env)).reason).toBe(
      'gemini_unconfigured',
    );

    vi.stubEnv('GEMINI_API_KEY', 'fake-key-for-gate-only');
    expect(isChatbotRuntimeAllowed(getChatbotConfig(process.env)).ok).toBe(
      true,
    );
  });

  it('Hawaiana Normal/Grande prices come from catalog math (not hardcoded refs)', () => {
    const normal = prepareCartLineProposal(menu(), COMMERCE, {
      product_name: 'Hawaiana',
      quantity: 1,
      option_labels: ['Normal'],
    });
    const grande = prepareCartLineProposal(menu(), COMMERCE, {
      product_name: 'Hawaiana',
      quantity: 1,
      option_labels: ['Grande'],
    });
    expect(normal.status).toBe('ready');
    expect(grande.status).toBe('ready');
    if (normal.status !== 'ready' || grande.status !== 'ready') return;
    expect(normal.action.unit_price).toBe(3.5);
    expect(grande.action.unit_price).toBe(8.75);
    expect(normal.action.requires_confirmation).toBe(true);
    expect(grande.action.requires_confirmation).toBe(true);
    expect(normal.action.product_id).toBe(grande.action.product_id);
    expect(normal.action.cart_key).not.toBe(grande.action.cart_key);
    const subtotal =
      normal.action.line_total + grande.action.line_total;
    expect(subtotal).toBe(12.25);
  });

  it('production allow flag stays off by default in config', () => {
    vi.stubEnv('CHATBOT_ENABLED', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CHATBOT_ALLOW_PRODUCTION', '');
    vi.stubEnv('CHATBOT_QUOTA_BACKEND', 'postgres');
    vi.stubEnv('GEMINI_API_KEY', 'x');
    expect(isChatbotRuntimeAllowed(getChatbotConfig(process.env)).ok).toBe(
      false,
    );
  });
});
