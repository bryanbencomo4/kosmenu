'use client';

import { useLayoutEffect } from 'react';

import type { MenuThemeMode } from '../../_lib/menu-theme';

/**
 * iPhone/WhatsApp webviews paint html/body with a light canvas. Sync the
 * page chrome to the kiosk theme so the home footer has no white gap.
 */
export function useKioskPageChrome(options: {
  themeMode: MenuThemeMode;
}) {
  const { themeMode } = options;

  useLayoutEffect(() => {
    const host =
      document.querySelector<HTMLElement>('main[data-menu-theme]') ?? document.documentElement;
    const styles = getComputedStyle(host);
    const pageBackground = styles.getPropertyValue('--menu-background').trim();
    const chrome = pageBackground || (themeMode === 'dark' ? '#0B0F17' : '#F6F7F9');

    const root = document.documentElement;
    const body = document.body;
    const previousHtmlBg = root.style.backgroundColor;
    const previousBodyBg = body.style.backgroundColor;
    const previousScheme = root.style.colorScheme;
    const existingThemeMeta = document.querySelector('meta[name="theme-color"]');
    const previousTheme = existingThemeMeta?.getAttribute('content') ?? null;

    root.style.backgroundColor = chrome;
    body.style.backgroundColor = chrome;
    root.style.colorScheme = themeMode;

    let themeMeta = existingThemeMeta;
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute('content', chrome);

    return () => {
      root.style.backgroundColor = previousHtmlBg;
      body.style.backgroundColor = previousBodyBg;
      root.style.colorScheme = previousScheme;
      if (!existingThemeMeta) {
        themeMeta?.remove();
      } else if (previousTheme == null) {
        existingThemeMeta.removeAttribute('content');
      } else {
        existingThemeMeta.setAttribute('content', previousTheme);
      }
    };
  }, [themeMode]);
}
