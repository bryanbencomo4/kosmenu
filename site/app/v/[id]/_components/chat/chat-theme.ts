/**
 * Chat UI theme — closely matches WhatsApp light/dark messaging colors
 * (bubbles, composer, link blue) without copying WhatsApp branding assets.
 */

export type ChatThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'elmenuxfa:chat-theme-v1';

export const CHAT_THEME_LIGHT = {
  bg: '#EFEAE2',
  header: '#F0F2F5',
  headerBorder: 'rgba(0,0,0,0.06)',
  bubbleIn: '#FFFFFF',
  bubbleOut: '#D9FDD3',
  text: '#111B21',
  textMuted: '#667781',
  /** WhatsApp light link blue */
  link: '#027EB5',
  composer: '#F0F2F5',
  input: '#FFFFFF',
  send: '#00A884',
  sendFg: '#FFFFFF',
  system: 'rgba(255,255,255,0.82)',
  card: '#FFFFFF',
  cardBorder: 'rgba(0,0,0,0.08)',
  pattern: 'rgba(0,0,0,0.03)',
} as const;

export const CHAT_THEME_DARK = {
  bg: '#0B141A',
  header: '#1F2C34',
  headerBorder: 'rgba(255,255,255,0.06)',
  bubbleIn: '#202C33',
  /** Official WA dark outgoing green */
  bubbleOut: '#005C4B',
  text: '#E9EDEF',
  textMuted: '#8696A0',
  /** WhatsApp dark link cyan */
  link: '#53BDEB',
  composer: '#1F2C34',
  input: '#2A3942',
  send: '#00A884',
  sendFg: '#FFFFFF',
  system: 'rgba(32,44,51,0.92)',
  card: '#202C33',
  cardBorder: 'rgba(255,255,255,0.08)',
  pattern: 'rgba(255,255,255,0.03)',
} as const;

export function resolvePreferredChatTheme(
  stored: string | null | undefined,
  prefersDark?: boolean,
): ChatThemeMode {
  if (stored === 'light' || stored === 'dark') return stored;
  if (typeof prefersDark === 'boolean') return prefersDark ? 'dark' : 'light';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'light';
}

export function loadStoredChatTheme(): ChatThemeMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function saveChatTheme(mode: ChatThemeMode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function chatThemeVars(mode: ChatThemeMode): Record<string, string> {
  const t = mode === 'dark' ? CHAT_THEME_DARK : CHAT_THEME_LIGHT;
  return {
    '--chat-bg': t.bg,
    '--chat-header': t.header,
    '--chat-header-border': t.headerBorder,
    '--chat-bubble-in': t.bubbleIn,
    '--chat-bubble-out': t.bubbleOut,
    '--chat-text': t.text,
    '--chat-text-muted': t.textMuted,
    '--chat-link': t.link,
    '--chat-composer': t.composer,
    '--chat-input': t.input,
    '--chat-send': t.send,
    '--chat-send-fg': t.sendFg,
    '--chat-system': t.system,
    '--chat-card': t.card,
    '--chat-card-border': t.cardBorder,
    '--chat-pattern': t.pattern,
  };
}
