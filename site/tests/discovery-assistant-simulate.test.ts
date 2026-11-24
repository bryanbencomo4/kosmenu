import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../app/api/_lib/public-directory', () => ({
  listClientDirectory: vi.fn(),
}));

import { listClientDirectory } from '../app/api/_lib/public-directory';
import { runSimulatedDiscovery } from '../app/api/asistente/_lib/simulate';

const listMock = vi.mocked(listClientDirectory);

describe('discovery simulate', () => {
  beforeEach(() => {
    listMock.mockReset();
    listMock.mockResolvedValue({
      results: [
        {
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
          lat: null,
          lng: null,
          ratingAverage: 4.6,
          ratingCount: 26,
          promovido: false,
          distanceKm: null,
          isOpen: true,
          openLabel: 'Abierto',
          productNames: [],
          showcaseDishes: [],
          currencies: ['USD'],
          paymentChannels: ['Efectivo'],
          acceptsVesBcv: false,
        },
      ],
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

  it('maps pizza intent to category search without Gemini', async () => {
    const result = await runSimulatedDiscovery({
      messages: [{ role: 'user', text: 'quiero pizza' }],
      ctx: { pageSize: 24 },
    });
    expect(result.skippedLlm).toBe(true);
    expect(result.geminiHttpCalls).toBe(0);
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'pizzas' }),
    );
    expect(result.restaurants.length).toBe(1);
  });

  it('asks for geo when cerca de mí has no coords', async () => {
    const result = await runSimulatedDiscovery({
      messages: [{ role: 'user', text: 'cerca de mi' }],
      ctx: { pageSize: 24 },
    });
    expect(result.restaurants).toHaveLength(0);
    expect(result.text).toMatch(/ubicaci[oó]n|zona/i);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('returns empty copy when directory has no hits', async () => {
    listMock.mockResolvedValueOnce({
      results: [],
      promoted: [],
      topRated: [],
      total: 0,
      regions: [],
      categories: [],
      offset: 0,
      limit: 24,
      hasMore: false,
    });
    const result = await runSimulatedDiscovery({
      messages: [{ role: 'user', text: 'xyzzy-no-match' }],
      ctx: { pageSize: 24 },
    });
    expect(result.restaurants).toHaveLength(0);
    expect(result.text).toMatch(/No encontré/i);
  });
});
