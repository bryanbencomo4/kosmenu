/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Fragment, type ReactNode } from 'react';

/**
 * WhatsApp-like inline formatting for chat bubbles.
 *   *bold*  _italic_  ~strike~  `code`
 * Also linkifies URLs, emails and phone numbers with WA-style color + underline.
 * Output is a React node tree (text is escaped by React) — never raw HTML.
 */

type Marker = '*' | '_' | '~' | '`';

type LinkKind = 'url' | 'email' | 'phone';

type LinkMatch = {
  start: number;
  end: number;
  kind: LinkKind;
  raw: string;
};

const MARKER_TAG: Record<Marker, 'strong' | 'em' | 's' | 'code'> = {
  '*': 'strong',
  _: 'em',
  '~': 's',
  '`': 'code',
};

const LINK_CLASS =
  'break-all text-[var(--chat-link)] underline decoration-[var(--chat-link)] underline-offset-2';

/** Characters that may sit right before an opening marker (word boundary-ish). */
function isOpenBoundary(prev: string | undefined): boolean {
  return prev === undefined || /[\s([{>¡¿"'“‘,.;:!?-]/.test(prev);
}

/** Characters that may sit right after a closing marker. */
function isCloseBoundary(next: string | undefined): boolean {
  return next === undefined || /[\s)\]}<,.;:!?"'”’-]/.test(next);
}

/** Finds the closing marker index for an opener at `start`, or -1. */
function findClose(text: string, marker: Marker, start: number): number {
  for (let j = start + 1; j < text.length; j++) {
    if (text[j] === '\n') return -1;
    if (text[j] !== marker) continue;
    if (j === start + 1) return -1;
    if (/\s/.test(text[start + 1]!) || /\s/.test(text[j - 1]!)) return -1;
    if (!isCloseBoundary(text[j + 1])) continue;
    return j;
  }
  return -1;
}

function renderInline(text: string, keyPrefix: string, depth = 0): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = '';
  let key = 0;
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = '';
    }
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '*' || ch === '_' || ch === '~' || ch === '`') {
      const marker = ch as Marker;
      if (isOpenBoundary(text[i - 1])) {
        const close = findClose(text, marker, i);
        if (close > i) {
          const inner = text.slice(i + 1, close);
          flush();
          const Tag = MARKER_TAG[marker];
          const k = `${keyPrefix}-${key++}`;
          if (marker === '`' || depth >= 2) {
            out.push(<Tag key={k}>{inner}</Tag>);
          } else {
            out.push(<Tag key={k}>{renderInline(inner, k, depth + 1)}</Tag>);
          }
          i = close + 1;
          continue;
        }
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D+/g, '');
}

/** Digits for `tel:` (keeps country code when the raw text had `+`). */
export function phoneDigitsForCall(raw: string): string {
  const digits = digitsOnly(raw);
  if (!digits) return '';
  return digits;
}

/**
 * Digits for WhatsApp (`api.whatsapp.com`). Local VE mobiles like
 * `0414…` are normalized to `58414…`.
 */
export function phoneDigitsForWhatsApp(raw: string): string {
  const digits = digitsOnly(raw);
  if (!digits) return '';
  if (raw.trim().startsWith('+')) return digits;
  // Common VE local form: 04XXXXXXXXX → 584XXXXXXXXX
  if (/^0(412|414|416|424|426)\d{7}$/.test(digits)) {
    return `58${digits.slice(1)}`;
  }
  if (digits.startsWith('0') && digits.length >= 10 && digits.length <= 11) {
    return `58${digits.slice(1)}`;
  }
  return digits;
}

function collectLinkMatches(line: string): LinkMatch[] {
  const found: LinkMatch[] = [];

  const pushAll = (re: RegExp, kind: LinkKind, ok?: (raw: string) => boolean) => {
    re.lastIndex = 0;
    for (const m of line.matchAll(re)) {
      const raw = m[0];
      const start = m.index ?? 0;
      if (ok && !ok(raw)) continue;
      found.push({ start, end: start + raw.length, kind, raw });
    }
  };

  pushAll(/\bhttps?:\/\/[^\s<>"']+/gi, 'url');
  pushAll(/\b(?:www\.)[a-z0-9][\w.-]*\.[a-z]{2,}(?:\/[^\s<>"']*)?/gi, 'url');
  pushAll(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, 'email');
  // +58 414-0821633, 0414-0821633, (0414) 082 1633 — require 10–15 digits.
  pushAll(
    /(?:\+\d{1,3}(?:[\s().-]*\d+){2,}|\b0\d{2,4}(?:[\s().-]*\d+){2,}\b)/g,
    'phone',
    (raw) => {
      const d = digitsOnly(raw);
      return d.length >= 10 && d.length <= 15;
    },
  );

  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: LinkMatch[] = [];
  let cursor = 0;
  for (const m of found) {
    if (m.start < cursor) continue;
    merged.push(m);
    cursor = m.end;
  }
  return merged;
}

function hrefFor(kind: LinkKind, raw: string): string {
  if (kind === 'email') return `mailto:${raw}`;
  if (kind === 'phone') {
    const digits = digitsOnly(raw);
    // Keep international "+" when the displayed number had a country code.
    return raw.trim().startsWith('+') ? `tel:+${digits}` : `tel:${digits}`;
  }
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function renderLink(
  kind: LinkKind,
  raw: string,
  key: string,
): ReactNode {
  if (kind === 'phone') {
    // Keep tel: as progressive-enhancement fallback; the chat shell intercepts
    // clicks to show the WhatsApp-like call/chat action sheet.
    return (
      <a
        key={key}
        href={hrefFor('phone', raw)}
        className={LINK_CLASS}
        data-chat-link="phone"
        data-chat-phone-raw={raw}
        data-chat-phone-display={raw}
      >
        {raw}
      </a>
    );
  }
  return (
    <a
      key={key}
      href={hrefFor(kind, raw)}
      className={LINK_CLASS}
      data-chat-link={kind}
      target={kind === 'url' ? '_blank' : undefined}
      rel={kind === 'url' ? 'noreferrer noopener' : undefined}
    >
      {raw}
    </a>
  );
}

/** Splits a line into linkables / plain text; only plain segments get *bold* etc. */
function renderLine(line: string, keyPrefix: string): ReactNode[] {
  const matches = collectLinkMatches(line);
  if (matches.length === 0) {
    return renderInline(line, keyPrefix);
  }

  const nodes: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of matches) {
    if (m.start > last) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t${n}`}>
          {renderInline(line.slice(last, m.start), `${keyPrefix}-t${n}`)}
        </Fragment>,
      );
    }
    nodes.push(renderLink(m.kind, m.raw, `${keyPrefix}-l${n}`));
    last = m.end;
    n += 1;
  }
  if (last < line.length) {
    nodes.push(
      <Fragment key={`${keyPrefix}-t${n}`}>
        {renderInline(line.slice(last), `${keyPrefix}-t${n}`)}
      </Fragment>,
    );
  }
  return nodes;
}

/**
 * Formats chat text. Paragraphs (blank-line separated) become block-level
 * wrappers; single newlines become `<br />`.
 */
export function formatChatText(text: string): ReactNode {
  // Gemini often emits **bold**; WhatsApp-style UI expects *bold*.
  const normalized = (text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*');
  if (!normalized.trim()) return null;
  const paragraphs = normalized.split(/\n{2,}/);
  return (
    <>
      {paragraphs.map((para, pi) => {
        const lines = para.split('\n');
        return (
          <span
            key={`p${pi}`}
            className={`block break-words ${pi > 0 ? 'mt-2' : ''}`}
            data-chat-paragraph="1"
          >
            {lines.map((line, li) => (
              <Fragment key={`p${pi}-l${li}`}>
                {li > 0 ? <br /> : null}
                {renderLine(line, `p${pi}-l${li}`)}
              </Fragment>
            ))}
          </span>
        );
      })}
    </>
  );
}
