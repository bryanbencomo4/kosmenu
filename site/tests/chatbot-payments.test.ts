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
        {
          id: 'pm3',
          nombre: 'Nequi',
          tipo: 'nequi',
          telefono: '+573001112233',
        },
      ],
      'USD',
    );
    expect(methods).toHaveLength(3);
    expect(methods[0].kind).toBe('pago_movil');
    expect(methods[0].currency).toBe('VES');
    expect(methods[0].summary).toMatch(/Banesco|0412/);
    expect(methods[1].kind).toBe('cash');
    expect(methods[1].currency).toBe('USD');
    // No menu-base fallback: undeclared currency stays null (not USD).
    expect(methods[2].currency).toBeNull();
  });

  it('dedupes identical Efectivo rows and never stamps USD on everything', () => {
    const methods = toChatPaymentMethods(
      [
        {
          id: 'a',
          nombre: 'Efectivo',
          tipo: 'efectivo',
          nota: 'Por favor, usa billetes en buen estado.',
        },
        {
          id: 'b',
          nombre: 'Efectivo',
          tipo: 'efectivo',
          nota: 'Por favor, usa billetes en buen estado.',
        },
        {
          id: 'c',
          nombre: 'Efectivo',
          tipo: 'efectivo',
          nota: 'Por favor, usa billetes en buen estado.',
        },
        {
          id: 'd',
          nombre: 'Pago Movil',
          tipo: 'pago_movil',
          banco: 'Banco de Venezuela',
          telefono: '+584247177958',
        },
      ],
      'USD',
    );
    expect(methods.filter((m) => m.kind === 'cash')).toHaveLength(1);
    expect(methods).toHaveLength(2);
    expect(methods.every((m) => m.currency !== 'USD' || m.kind === 'cash')).toBe(
      true,
    );
    expect(methods.find((m) => m.kind === 'pago_movil')?.currency).toBeNull();
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
