import { describe, expect, it } from 'vitest';

import {
  argbToHex,
  buildMenuTheme,
  contrastRatio,
  getAccessibleOnColor,
  isUsableBrandColor,
  normalizeMenuThemeMode,
  resolvePublicBrandColors,
} from '../app/v/[id]/_lib/menu-theme';

describe('menu theme helpers', () => {
  it('normalizes theme mode to light/dark only', () => {
    expect(normalizeMenuThemeMode('dark')).toBe('dark');
    expect(normalizeMenuThemeMode(' DARK ')).toBe('dark');
    expect(normalizeMenuThemeMode('light')).toBe('light');
    expect(normalizeMenuThemeMode(null)).toBe('light');
    expect(normalizeMenuThemeMode('neon')).toBe('light');
  });

  it('converts Flutter signed ARGB int32 to hex', () => {
    // 0xFFFF0000 as signed int32
    expect(argbToHex(-65536)).toBe('#FF0000');
    expect(argbToHex(0xff2563eb)).toBe('#2563EB');
    expect(argbToHex(null)).toBeNull();
    expect(argbToHex(Number.NaN)).toBeNull();
  });

  it('resolves primary from menu_palette then color_principal', () => {
    const fromPalette = resolvePublicBrandColors({
      menuPalettePrimary: 0xffdc2626,
      colorPrincipal: '#00FF00',
    });
    expect(fromPalette.primary).toBe('#DC2626');

    const fromPrincipal = resolvePublicBrandColors({
      menuPalettePrimary: null,
      colorPrincipal: '#0F766E',
    });
    expect(fromPrincipal.primary).toBe('#0F766E');
  });

  it('falls back safely for unusable brand colors', () => {
    expect(isUsableBrandColor('#FFFFFF')).toBe(false);
    expect(isUsableBrandColor('#000000')).toBe(false);
    const fallback = resolvePublicBrandColors({
      menuPalettePrimary: 0xffffffff,
      colorPrincipal: '#000000',
    });
    expect(fallback.primary).toBe('#2563EB');
  });

  it('builds neutral light and dark backgrounds with brand accents', () => {
    const light = buildMenuTheme({
      themeMode: 'light',
      menuPalettePrimary: 0xffb45309,
    });
    expect(light.themeMode).toBe('light');
    expect(light['--menu-background']).toBe('#F6F7F9');
    expect(light['--menu-surface']).toBe('#FFFFFF');
    expect(light['--menu-primary']).not.toBe(light['--menu-background']);
    expect(light['--primary-color']).toBe(light['--menu-primary']);

    const dark = buildMenuTheme({
      themeMode: 'dark',
      menuPalettePrimary: 0xffb45309,
    });
    expect(dark.themeMode).toBe('dark');
    expect(dark['--menu-background']).toBe('#0B0F17');
    expect(dark['--menu-surface']).toBe('#151B26');
    expect(dark['--menu-text']).toBe('#F8FAFC');
  });

  it('ensures on-primary contrast for yellow-like primaries', () => {
    const theme = buildMenuTheme({
      themeMode: 'light',
      primary: '#FACC15',
    });
    const onPrimary = theme['--menu-on-primary'];
    expect(contrastRatio(onPrimary, theme['--menu-primary'])).toBeGreaterThanOrEqual(4.5);
    expect(getAccessibleOnColor('#FACC15')).toBe('#111827');
  });

  it('defaults missing theme mode to light with same token shape for preview/public', () => {
    const a = buildMenuTheme({
      menuPalettePrimary: 0xff2563eb,
    });
    const b = buildMenuTheme({
      themeMode: undefined,
      menuPalettePrimary: 0xff2563eb,
    });
    expect(a.themeMode).toBe('light');
    expect(b['--menu-background']).toBe(a['--menu-background']);
    expect(b['--menu-primary']).toBe(a['--menu-primary']);
  });
});
