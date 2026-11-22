import { describe, expect, it } from 'vitest';

import {
  chatThemeVars,
  CHAT_THEME_DARK,
  CHAT_THEME_LIGHT,
  resolvePreferredChatTheme,
} from '../app/v/[id]/_components/chat/chat-theme';

describe('chat theme', () => {
  it('resolves stored preference over system', () => {
    expect(resolvePreferredChatTheme('dark', false)).toBe('dark');
    expect(resolvePreferredChatTheme('light', true)).toBe('light');
    expect(resolvePreferredChatTheme(null, true)).toBe('dark');
    expect(resolvePreferredChatTheme(null, false)).toBe('light');
  });

  it('exposes messaging palette tokens', () => {
    expect(CHAT_THEME_LIGHT.bg.toLowerCase()).toBe('#efeae2');
    expect(CHAT_THEME_LIGHT.bubbleOut.toLowerCase()).toBe('#d9fdd3');
    expect(CHAT_THEME_DARK.bg.toLowerCase()).toBe('#0b141a');
    expect(CHAT_THEME_DARK.bubbleOut.toLowerCase()).toBe('#005c4b');
    const vars = chatThemeVars('light');
    expect(vars['--chat-bg']).toBe(CHAT_THEME_LIGHT.bg);
  });
});
