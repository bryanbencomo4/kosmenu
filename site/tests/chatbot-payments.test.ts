import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  matchPaymentIntent,
  toChatPaymentMethods,
} from '../app/v/[id]/_components/chat/chat-payments';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('chat payment methods', () => {
  it('matches common payment questions', () => {
    for (const t of [
      'cómo pago',
      'Como pagar?',
      'métodos de pago',
      'formas de pago',
      'aceptan transferencia',
      'pago móvil',
    ]) {
      expect(matchPaymentIntent(t)).toBe(true);
    }
    expect(matchPaymentIntent('quiero una hawaiana')).toBe(false);
  });

  it('builds slim chat payment methods from menu rows', () => {
    const methods = toChatPaymentMethods(
      [
        {
          id: 'pm1',
          nombre: 'Pago móvil',
          tipo: 'pago_movil',
          banco: 'Banesco',
          telefono: '04121234567',
          moneda_codigo: 'VES',
        },
        {
          id: 'pm2',
          nombre: 'Efectivo',
          tipo: 'efectivo',
          moneda_codigo: 'USD',
        },
      ],
      'USD',
    );
    expect(methods).toHaveLength(2);
    expect(methods[0].label.toLowerCase()).toContain('pago');
    expect(methods[0].kind).toBe('pago_movil');
    expect(methods[0].summary).toMatch(/Banesco|0412/);
    expect(methods[1].kind).toBe('cash');
  });

  it('wires carousel icons, primary Agregar, and payment card', () => {
    const carousel = readFileSync(
      path.join(root, 'app/v/[id]/_components/chat/ChatProductCarousel.tsx'),
      'utf8',
    );
    const view = readFileSync(
      path.join(root, 'app/v/[id]/_components/chat/ChatAssistantView.tsx'),
      'utf8',
    );
    expect(carousel).toMatch(/<Plus /);
    expect(carousel).toMatch(/<Settings2 /);
    expect(carousel).toMatch(/<LayoutGrid /);
    expect(carousel).toMatch(/data-chat-add-simple/);
    expect(carousel).toMatch(/bg-\[var\(--chat-send\)\]/);
    expect(carousel).not.toMatch(/bg-\[var\(--chat-input\)\].*Agregar|Agregar[\s\S]*bg-\[var\(--chat-input\)\]/);
    expect(view).toMatch(/answerPaymentIntent/);
    expect(view).toMatch(/paymentMethods/);
    expect(view).toMatch(/type: 'payments'|case 'payments'/);
  });
});
