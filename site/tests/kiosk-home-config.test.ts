import { describe, expect, it } from 'vitest';

import {
  DEFAULT_KIOSK_HOME_CONFIG,
  parseKioskHomeConfig,
  kioskHomeConfigToJson,
} from '../app/_lib/kiosk-home-config';

describe('kiosk home config', () => {
  it('keeps current restaurants unchanged when missing', () => {
    expect(parseKioskHomeConfig(undefined)).toEqual(DEFAULT_KIOSK_HOME_CONFIG);
    expect(parseKioskHomeConfig(null)).toEqual(DEFAULT_KIOSK_HOME_CONFIG);
    expect(parseKioskHomeConfig({})).toEqual(DEFAULT_KIOSK_HOME_CONFIG);
  });

  it('reads only-menu and hidden rating', () => {
    expect(
      parseKioskHomeConfig({
        ver_menu: true,
        comer_aqui: false,
        para_llevar: false,
        delivery: false,
        calificacion: false,
      }),
    ).toEqual({
      verMenu: true,
      comerAqui: false,
      paraLlevar: false,
      delivery: false,
      calificacion: false,
      ubicacion: true,
      redes: true,
    });
  });

  it('round-trips the public payload', () => {
    const parsed = parseKioskHomeConfig({
      ver_menu: true,
      comer_aqui: true,
      para_llevar: false,
      delivery: false,
      calificacion: false,
      ubicacion: false,
      redes: true,
    });
    expect(parseKioskHomeConfig(kioskHomeConfigToJson(parsed))).toEqual(parsed);
  });

  it('reads nested inicio_menu without dropping other config_negocio keys', () => {
    expect(
      parseKioskHomeConfig({
        social_links: { instagram: 'https://instagram.com/demo' },
        inicio_menu: {
          ver_menu: true,
          comer_aqui: false,
          para_llevar: false,
          delivery: true,
          calificacion: false,
          ubicacion: false,
          redes: false,
        },
      }),
    ).toEqual({
      verMenu: true,
      comerAqui: false,
      paraLlevar: false,
      delivery: true,
      calificacion: false,
      ubicacion: false,
      redes: false,
    });
  });
});
