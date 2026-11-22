import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { formatChatText } from '../app/v/[id]/_components/chat/chat-format';

function html(text: string): string {
  return renderToStaticMarkup(formatChatText(text) as never);
}

describe('formatChatText (WhatsApp-like)', () => {
  it('formats bold, italic, strike and code', () => {
    expect(html('*hola*')).toContain('<strong>hola</strong>');
    expect(html('**hola**')).toContain('<strong>hola</strong>');
    expect(html('_hola_')).toContain('<em>hola</em>');
    expect(html('~hola~')).toContain('<s>hola</s>');
    expect(html('`hola`')).toContain('<code>hola</code>');
  });

  it('formats inside a sentence and supports nesting', () => {
    const out = html('Pide una *pizza grande* y _bien_ caliente, *_ya_*');
    expect(out).toContain('<strong>pizza grande</strong>');
    expect(out).toContain('<em>bien</em>');
    expect(out).toContain('<strong><em>ya</em></strong>');
  });

  it('does not format code contents', () => {
    const out = html('`*no* _format_`');
    expect(out).toContain('<code>*no* _format_</code>');
    expect(out).not.toContain('<strong>');
  });

  it('preserves newlines and paragraphs', () => {
    const out = html('uno\ndos\n\ntres');
    expect(out).toContain('uno<br/>dos');
    expect(out.match(/data-chat-paragraph/g)).toHaveLength(2);
  });

  it('escapes HTML (no raw injection)', () => {
    const out = html('<img src=x onerror=alert(1)> *ok*');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    expect(out).toContain('<strong>ok</strong>');
  });

  it('linkifies URLs without formatting their internals', () => {
    const out = html('mira https://x.com/a_b_c/~me/*y* ya');
    expect(out).toContain('href="https://x.com/a_b_c/~me/*y*"');
    expect(out).toContain('data-chat-link="url"');
    expect(out).not.toContain('<em>');
    expect(out).not.toContain('<s>');
    expect(out).not.toContain('<strong>');
  });

  it('linkifies phones and emails like WhatsApp', () => {
    const phone = html('WhatsApp: +58 414-0821633');
    expect(phone).toContain('data-chat-link="phone"');
    expect(phone).toContain('href="tel:+584140821633"');
    const email = html('escribe a hola@negocio.com');
    expect(email).toContain('data-chat-link="email"');
    expect(email).toContain('href="mailto:hola@negocio.com"');
  });

  it('ignores unmatched, spaced and intra-word markers', () => {
    expect(html('2 * 3 * 4')).not.toContain('<strong>');
    expect(html('solo *abierto')).not.toContain('<strong>');
    expect(html('snake_case_name')).not.toContain('<em>');
    expect(html('** **')).not.toContain('<strong>');
  });

  it('returns null for empty text', () => {
    expect(formatChatText('   ')).toBeNull();
  });
});
