import { describe, expect, it } from 'vitest';

import {
  assertNoSensitivePublicComercioFields,
  toPublicComercioDto,
  toPublicMetodoPagoDto,
} from '../../app/api/_lib/public-menu-dto';

describe('public menu DTO', () => {
  it('strips owner_id and other sensitive comercio fields', () => {
    const dto = toPublicComercioDto({
      id: 'c1',
      slug: 'demo',
      nombre: 'Demo',
      logo_url: 'https://example.com/logo.png',
      owner_id: 'user-secret',
      email: 'owner@example.com',
      branding_ia: { secret: true },
      en_linea: true,
      menu_palette_primary: -65536,
      menu_palette_accent: 0xff0ea5e9,
      menu_theme_mode: 'dark',
      color_principal: '#DC2626',
      upsell_config: { pre_checkout: { activo: true }, secret: 'no' },
    });

    expect(dto).toBeTruthy();
    expect(dto!.id).toBe('c1');
    expect(dto!.nombre).toBe('Demo');
    expect(dto!.menu_palette_primary).toBe(-65536);
    expect(dto!.menu_palette_accent).toBe(0xff0ea5e9);
    expect(dto!.menu_theme_mode).toBe('dark');
    expect(dto).not.toHaveProperty('upsell_config');
    expect(dto!.color_principal).toBe('#DC2626');
    expect(dto).not.toHaveProperty('owner_id');
    expect(dto).not.toHaveProperty('email');
    expect(dto).not.toHaveProperty('branding_ia');
    expect(dto!.inicio_menu).toEqual({
      verMenu: false,
      comerAqui: true,
      paraLlevar: true,
      delivery: true,
      catalogo: false,
      calificacion: true,
      ubicacion: true,
      redes: true,
      verMetodosPago: false,
    });
    expect(dto!.delivery_tarifas).toEqual({ enabled: false });
    assertNoSensitivePublicComercioFields(dto!);
  });

  it('exposes inicio_menu and social links from config_negocio without leaking branding_ia', () => {
    const dto = toPublicComercioDto({
      id: 'c2',
      slug: 'solo-menu',
      nombre: 'Solo menú',
      branding_ia: {
        config_negocio: {
          social_links: { instagram: 'https://instagram.com/solo' },
          inicio_menu: {
            ver_menu: true,
            comer_aqui: false,
            para_llevar: false,
            delivery: false,
            calificacion: false,
          },
        },
      },
    });

    expect(dto).toBeTruthy();
    expect(dto!.social_links).toEqual({ instagram: 'https://instagram.com/solo' });
    expect(dto!.inicio_menu).toEqual({
      verMenu: true,
      comerAqui: false,
      paraLlevar: false,
      delivery: false,
      catalogo: false,
      calificacion: false,
      ubicacion: true,
      redes: true,
      verMetodosPago: false,
    });
    expect(dto!.delivery_tarifas).toEqual({ enabled: false });
    expect(dto).not.toHaveProperty('branding_ia');
    assertNoSensitivePublicComercioFields(dto!);
  });

  it('exposes delivery tariffs only after the merchant enables them', () => {
    const dto = toPublicComercioDto({
      id: 'c3',
      slug: 'con-delivery',
      nombre: 'Con delivery',
      branding_ia: {
        config_negocio: {
          delivery_config: {
            enabled: true,
            pricing_type: 'fixed',
            fixed_price: 3,
            internal_note: 'no',
          },
        },
      },
    });
    expect(dto!.delivery_tarifas).toMatchObject({
      enabled: true,
      pricing_type: 'fixed',
      fixed_price: 3,
    });
    expect(dto).not.toHaveProperty('branding_ia');
    assertNoSensitivePublicComercioFields(dto!);
  });

  it('keeps public payment fields and drops private ones', () => {
    const dto = toPublicMetodoPagoDto({
      id: 'm1',
      comercio_id: 'c1',
      nombre: 'Pago Movil',
      tipo: 'pago_movil__usd',
      descripcion: 'Visible',
      detalles: '{"banco":"X"}',
      notas_internas: 'nunca',
      verificado: true,
      metadata: { admin: true },
    });

    expect(dto).toBeTruthy();
    expect(dto!.nombre).toBe('Pago Movil');
    expect(dto).not.toHaveProperty('notas_internas');
    expect(dto).not.toHaveProperty('verificado');
    expect(dto).not.toHaveProperty('metadata');
  });
});
