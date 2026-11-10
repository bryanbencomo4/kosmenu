import { Poppins } from 'next/font/google';

/**
 * Single app typeface — Poppins via next/font (self-hosted at build time).
 * Weights cover UI hierarchy: body 400/500, labels 600, buttons 700, titles 800.
 * One family for --font-display and --font-body (no second download).
 */
export const appFont = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
});
