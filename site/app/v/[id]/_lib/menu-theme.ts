/** Public menu visual theme: logo accents + neutral light/dark surfaces. */

export type MenuThemeMode = 'light' | 'dark';

export type MenuThemeTokens = {
  themeMode: MenuThemeMode;
  '--menu-primary': string;
  '--menu-primary-hover': string;
  '--menu-primary-pressed': string;
  '--menu-accent': string;
  '--menu-background': string;
  '--menu-surface': string;
  '--menu-surface-alt': string;
  '--menu-text': string;
  '--menu-text-muted': string;
  '--menu-border': string;
  '--menu-on-primary': string;
  '--menu-shadow': string;
  /** Back-compat aliases used by existing PublicMenuPage CSS. */
  '--primary-color': string;
  '--secondary-color': string;
  '--bg-color': string;
  '--card-surface': string;
  '--text-on-primary': string;
};

const SAFE_PRIMARY = '#2563EB';
const SAFE_ACCENT = '#0EA5E9';

const LIGHT = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3F5',
  text: '#111827',
  textMuted: '#64748B',
  border: '#E2E8F0',
  shadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
} as const;

const DARK = {
  background: '#0B0F17',
  surface: '#151B26',
  surfaceAlt: '#202938',
  text: '#F8FAFC',
  textMuted: '#A8B2C1',
  border: '#303B4D',
  shadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
} as const;

export function normalizeMenuThemeMode(value: unknown): MenuThemeMode {
  return String(value ?? '').trim().toLowerCase() === 'dark' ? 'dark' : 'light';
}

/** Flutter Color.value / signed int32 ARGB → #RRGGBB. */
export function argbToHex(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const unsigned = value < 0 ? value + 0x100000000 : value;
  if (!Number.isInteger(unsigned) || unsigned < 0 || unsigned > 0xffffffff) return null;
  const rgb = unsigned & 0x00ffffff;
  return `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;
}

export function normalizeHexColor(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const raw = input.trim();
  if (!raw) return fallback;
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(withHash)) return withHash.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex, '');
  if (!/^#[0-9A-F]{6}$/.test(normalized)) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${to(r)}${to(g)}${to(b)}`;
}

function srgbChannelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getAccessibleOnColor(background: string): string {
  const white = '#FFFFFF';
  const black = '#111827';
  return contrastRatio(white, background) >= contrastRatio(black, background) ? white : black;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
      break;
  }
  h /= 6;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

export function adjustLightness(hex: string, delta: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const next = hslToRgb(hsl.h, hsl.s, clamp01(hsl.l + delta));
  return rgbToHex(next.r, next.g, next.b);
}

export function adjustSaturation(hex: string, delta: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const next = hslToRgb(hsl.h, clamp01(hsl.s + delta), hsl.l);
  return rgbToHex(next.r, next.g, next.b);
}

/** Reject near-white / near-black / ultra-gray brand candidates. */
export function isUsableBrandColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (hsl.l < 0.12 || hsl.l > 0.92) return false;
  if (hsl.s < 0.08 && (hsl.l < 0.2 || hsl.l > 0.85)) return false;
  return true;
}

export function ensureContrast(fg: string, bg: string, minRatio = 4.5): string {
  if (contrastRatio(fg, bg) >= minRatio) return fg;
  const bgLum = relativeLuminance(bg);
  let best = fg;
  let bestRatio = contrastRatio(fg, bg);
  for (let step = 1; step <= 24; step += 1) {
    const delta = bgLum > 0.5 ? -0.035 * step : 0.035 * step;
    const candidate = adjustLightness(fg, delta);
    const ratio = contrastRatio(candidate, bg);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
    if (ratio >= minRatio) return candidate;
  }
  return bestRatio >= minRatio ? best : getAccessibleOnColor(bg) === '#FFFFFF' ? SAFE_PRIMARY : adjustLightness(SAFE_PRIMARY, -0.15);
}

export function adjustForTheme(primary: string, themeMode: MenuThemeMode): string {
  const rgb = hexToRgb(primary);
  if (!rgb) return SAFE_PRIMARY;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (themeMode === 'dark') {
    // Lift very dark accents; slightly desaturate neon.
    let next = primary;
    if (hsl.l < 0.35) next = adjustLightness(next, 0.18);
    if (hsl.s > 0.85) next = adjustSaturation(next, -0.12);
    return next;
  }
  let next = primary;
  if (hsl.l > 0.72) next = adjustLightness(next, -0.18);
  if (hsl.s < 0.2) next = adjustSaturation(next, 0.15);
  return next;
}

function deriveAccent(primary: string): string {
  return adjustSaturation(adjustLightness(primary, 0.06), 0.08);
}

export function resolvePublicBrandColors(input: {
  menuPalettePrimary?: unknown;
  menuPaletteAccent?: unknown;
  colorPrincipal?: unknown;
}): { primary: string; accent: string } {
  const fromPalette = argbToHex(
    typeof input.menuPalettePrimary === 'number'
      ? input.menuPalettePrimary
      : Number.isFinite(Number(input.menuPalettePrimary))
        ? Number(input.menuPalettePrimary)
        : null,
  );
  const fromPrincipal =
    typeof input.colorPrincipal === 'string'
      ? normalizeHexColor(input.colorPrincipal, '')
      : argbToHex(
          typeof input.colorPrincipal === 'number'
            ? input.colorPrincipal
            : Number.isFinite(Number(input.colorPrincipal))
              ? Number(input.colorPrincipal)
              : null,
        );

  let primary = fromPalette && isUsableBrandColor(fromPalette) ? fromPalette : null;
  if (!primary && fromPrincipal && isUsableBrandColor(fromPrincipal)) {
    primary = fromPrincipal.startsWith('#') ? fromPrincipal : normalizeHexColor(fromPrincipal, SAFE_PRIMARY);
  }
  if (!primary) primary = SAFE_PRIMARY;

  const accentRaw = argbToHex(
    typeof input.menuPaletteAccent === 'number'
      ? input.menuPaletteAccent
      : Number.isFinite(Number(input.menuPaletteAccent))
        ? Number(input.menuPaletteAccent)
        : null,
  );
  const accent =
    accentRaw && isUsableBrandColor(accentRaw) ? accentRaw : isUsableBrandColor(deriveAccent(primary)) ? deriveAccent(primary) : SAFE_ACCENT;

  return { primary, accent };
}

export function buildMenuTheme(input: {
  themeMode?: unknown;
  primary?: string | null;
  accent?: string | null;
  menuPalettePrimary?: unknown;
  menuPaletteAccent?: unknown;
  colorPrincipal?: unknown;
}): MenuThemeTokens {
  const themeMode = normalizeMenuThemeMode(input.themeMode);
  const resolved = resolvePublicBrandColors({
    menuPalettePrimary: input.menuPalettePrimary,
    menuPaletteAccent: input.menuPaletteAccent,
    colorPrincipal: input.colorPrincipal ?? input.primary,
  });
  const surfaces = themeMode === 'dark' ? DARK : LIGHT;
  let primary = adjustForTheme(
    normalizeHexColor(input.primary ?? resolved.primary, resolved.primary),
    themeMode,
  );
  let accent = adjustForTheme(
    normalizeHexColor(input.accent ?? resolved.accent, resolved.accent),
    themeMode,
  );
  if (!isUsableBrandColor(primary)) primary = SAFE_PRIMARY;
  if (!isUsableBrandColor(accent)) accent = SAFE_ACCENT;

  primary = ensureContrast(primary, surfaces.background, 3);
  const onPrimary = getAccessibleOnColor(primary);
  // Guarantee button label contrast.
  const primaryForButton =
    contrastRatio(onPrimary, primary) >= 4.5
      ? primary
      : ensureContrast(primary, onPrimary === '#FFFFFF' ? '#111827' : '#FFFFFF', 4.5);

  const hover = themeMode === 'dark' ? adjustLightness(primaryForButton, 0.08) : adjustLightness(primaryForButton, -0.08);
  const pressed = themeMode === 'dark' ? adjustLightness(primaryForButton, 0.14) : adjustLightness(primaryForButton, -0.14);

  return {
    themeMode,
    '--menu-primary': primaryForButton,
    '--menu-primary-hover': hover,
    '--menu-primary-pressed': pressed,
    '--menu-accent': accent,
    '--menu-background': surfaces.background,
    '--menu-surface': surfaces.surface,
    '--menu-surface-alt': surfaces.surfaceAlt,
    '--menu-text': surfaces.text,
    '--menu-text-muted': surfaces.textMuted,
    '--menu-border': surfaces.border,
    '--menu-on-primary': onPrimary,
    '--menu-shadow': surfaces.shadow,
    '--primary-color': primaryForButton,
    '--secondary-color': accent,
    '--bg-color': surfaces.background,
    '--card-surface': surfaces.surface,
    '--text-on-primary': onPrimary,
  };
}

export function menuThemeCssVars(tokens: MenuThemeTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (key === 'themeMode') continue;
    vars[key] = String(value);
  }
  return vars;
}
