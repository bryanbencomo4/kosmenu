import { describe, expect, it } from 'vitest';

import { alignDiscoveryRestaurantsToReplyText } from '../app/api/asistente/_lib/align-restaurants';
import type { DiscoveryRestaurantCard } from '../app/api/asistente/_lib/tools';
import { matchDirectoryEntry } from '../app/api/_lib/public-directory-featured';

function card(nombre: string, id = nombre): DiscoveryRestaurantCard {
  return {
    id,
    slug: id,
    nombre,
    logoUrl: null,
    categoria: null,
    zona: null,
    isOpen: true,
    openLabel: 'Abierto',
    menuUrl: `/v/${id}`,
    distanceKm: null,
    currencies: [],
    paymentChannels: [],
    acceptsVesBcv: false,
  };
}

describe('alignDiscoveryRestaurantsToReplyText', () => {
  it('keeps only restaurants named in the reply, in mention order', () => {
    const all = [
      card('Alegría', 'a'),
      card('MEAL4FIT', 'm'),
      card('LA TRIBU CAFÉ', 't'),
      card('El Parche del Gato — Arepas', 'p'),
    ];
    const text =
      'Opciones de arepas:\n* **El Parche del Gato — Arepas**\n* **LA TRIBU CAFÉ**\n¿Filtrar por zona?';
    const aligned = alignDiscoveryRestaurantsToReplyText(text, all);
    expect(aligned.map((r) => r.id)).toEqual(['p', 't']);
  });

  it('leaves the full set when the reply names none of them', () => {
    const all = [card('Alegría', 'a'), card('MEAL4FIT', 'm')];
    expect(alignDiscoveryRestaurantsToReplyText('¿Qué se te antoja?', all)).toEqual(all);
  });
});

describe('arepa query expansion', () => {
  it('does not match pastelitos pabellón when the query is only arepa', () => {
    const hit = matchDirectoryEntry(
      {
        id: 'tribu',
        slug: 'la-tribu-cafe',
        nombre: 'LA TRIBU CAFÉ',
        categoria: 'Cafetería',
        direccion: null,
        productNames: ['AM - Pastelitos Pabellón', 'Café con leche'],
      },
      'arepa',
    );
    expect(hit.score).toBe(0);
  });

  it('still matches real arepa dishes and arepitas', () => {
    const arepas = matchDirectoryEntry(
      {
        id: 'alegria',
        slug: 'alegria',
        nombre: 'Alegría',
        categoria: 'Restaurante',
        direccion: null,
        productNames: ['Arepas', 'Jugo'],
      },
      'arepa',
    );
    expect(arepas.score).toBeGreaterThan(50);

    const arepitas = matchDirectoryEntry(
      {
        id: 'toro',
        slug: 'toro-bravo',
        nombre: 'TORO BRAVO',
        categoria: 'Restaurante',
        direccion: null,
        productNames: ['Arepitas con Nata'],
      },
      'arepa',
    );
    expect(arepitas.score).toBeGreaterThan(40);
  });
});
