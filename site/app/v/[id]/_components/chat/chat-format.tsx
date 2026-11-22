/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Fragment, type ReactNode } from 'react';

/**
 * WhatsApp-like inline formatting for chat bubbles.
 *   *bold*  _italic_  ~strike~  `code`
 * Output is a React node tree (text is escaped by React) — never raw HTML.
 * URLs are left untouched so underscores / tildes inside links survive.
 */

type Marker = '*' | '_' | '~' | '`';

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

const MARKER_TAG: Record<Marker, 'strong' | 'em' | 's' | 'code'> = {
  '*': 'strong',
  _: 'em',
  '~': 's',
  '`': 'code',
};

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
    // Content must be non-empty and not start/end with a space (WhatsApp rule).
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

/** Splits a line into URL / non-URL segments; only non-URL segments get formatted. */
function renderLine(line: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of line.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t${n}`}>
          {renderInline(line.slice(last, idx), `${keyPrefix}-t${n}`)}
        </Fragment>,
      );
    }
    nodes.push(<Fragment key={`${keyPrefix}-u${n}`}>{m[0]}</Fragment>);
    last = idx + m[0].length;
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
