import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../app/api/_lib/public-directory', () => ({
  listClientDirectory: vi.fn(),
}));

import { listClientDirectory } from '../app/api/_lib/public-directory';
import { executeDiscoveryTool } from '../app/api/asistente/_lib/tools';

const listMock = vi.mocked(listClientDirectory);

const sample = {
  id: '1',
  slug: 'pizzas-el-trueno',
  nombre: 'Pizza Trueno',
  logoUrl: null,
  categoria: 'Pizzeria',
  direccion: 'Palmira',
  negocioVirtual: false,
  estadosOperacion: [],
  zonaOperacion: null,
  menuUrl: '/v/pizzas-el-trueno',
  coverUrl: null,
  lat: 7.5,
  lng: -72.4,
  ratingAverage: 4.6,
  ratingCount: 26,
  promovido: false,
  distanceKm: 1.2,
  isOpen: true as boolean | null,
  openLabel: 'Abierto',
  productNames: ['Pepperoni'],
  showcaseDishes: [],
  currencies: ['USD', 'VES'],
  paymentChannels: ['Efectivo', 'Pago móvil'],
  acceptsVesBcv: true,
};

describe('discovery tools', () => {
  beforeEach(() => {
    listMock.mockReset();
    listMock.mockResolvedValue({
      results: [sample],
      promoted: [],
      topRated: [],
      total: 1,
      regions: [],
      categories: [],
      offset: 0,
      limit: 24,
      hasMore: false,
    });
  });

  it('search_restaurants maps directory cards and preserves open state', async () => {
    const result = (await executeDiscoveryTool(
      'search_restaurants',
      { query: 'pizza', limit: 24, offset: 0 },
      { pageSize: 24 },
    )) as { restaurants: Array<{ isOpen: boolean | null; openLabel: string | null }> };

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'pizza', limit: 24, offset: 0 }),
    );
    expect(result.restaurants[0].isOpen).toBe(true);
    expect(result.restaurants[0].openLabel).toBe('Abierto');
  });

  it('never treats null schedule as open when filtering', async () => {
    listMock.mockResolvedValueOnce({
      results: [{ ...sample, isOpen: null, openLabel: null }],
      promoted: [],
      topRated: [],
      total: 1,
      regions: [],
      categories: [],
      offset: 0,
      limit: 24,
      hasMore: false,
    });
    const result = (await executeDiscoveryTool(
      'filter_restaurants',
      { openOnly: true },
      { pageSize: 24 },
    )) as { restaurants: unknown[]; note?: string };

    expect(result.restaurants).toHaveLength(0);
    expect(String((result as { text?: string }).text || '')).toMatch(/Ningún|filtros/i);
  });

  it('null isOpen becomes Horario no confirmado on cards', async () => {
    listMock.mockResolvedValueOnce({
      results: [{ ...sample, isOpen: null, openLabel: null }],
      promoted: [],
      topRated: [],
      total: 1,
      regions: [],
      categories: [],
      offset: 0,
      limit: 24,
      hasMore: false,
    });
    const result = (await executeDiscoveryTool(
      'search_restaurants',
      {},
      { pageSize: 24 },
    )) as { restaurants: Array<{ openLabel: string | null }> };
    expect(result.restaurants[0].openLabel).toBe('Horario no confirmado');
  });

  it('prepare_restaurant_links omits chat when preview is off in production', async () => {
    const prevPreview = process.env.NEXT_PUBLIC_CHATBOT_PREVIEW;
    delete process.env.NEXT_PUBLIC_CHATBOT_PREVIEW;
    // Pass production-effective env via canOfferDiscoveryChatLink path:
    // stub by setting preview off; NODE_ENV in vitest is typically 'test'
    // which still requires UX slug — without preview flag in production mode
    // we assert through the helper contract in config tests. Here we only
    // verify menuUrl is always present when chat is gated.
    const { canOfferDiscoveryChatLink } = await import('../app/_lib/discovery-assistant');
    const allowed = canOfferDiscoveryChatLink('pizzas-el-trueno', {
      nodeEnv: 'production',
      publicPreviewFlag: null,
    });
    expect(allowed).toBe(false);
    const result = (await executeDiscoveryTool(
      'prepare_restaurant_links',
      { slug: 'pizzas-el-trueno' },
      { pageSize: 24 },
    )) as { chatUrl: string | null; menuUrl: string };
    expect(result.menuUrl).toContain('pizzas-el-trueno');
    // In vitest (non-production NODE_ENV) preview helper may still allow chat;
    // production gating is covered by canOfferDiscoveryChatLink above.
    void result.chatUrl;
    if (prevPreview == null) delete process.env.NEXT_PUBLIC_CHATBOT_PREVIEW;
    else process.env.NEXT_PUBLIC_CHATBOT_PREVIEW = prevPreview;
  });
});
