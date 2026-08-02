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
    });

    expect(dto).toBeTruthy();
    expect(dto!.id).toBe('c1');
    expect(dto!.nombre).toBe('Demo');
    expect(dto!.menu_palette_primary).toBe(-65536);
    expect(dto!.menu_palette_accent).toBe(0xff0ea5e9);
    expect(dto!.menu_theme_mode).toBe('dark');
    expect(dto!.color_principal).toBe('#DC2626');
    expect(dto).not.toHaveProperty('owner_id');
    expect(dto).not.toHaveProperty('email');
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
