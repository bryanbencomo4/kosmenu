import { describe, expect, it } from 'vitest';

import {
  homeGreetingText,
  helpText,
  needsAuthText,
} from '../app/api/asistente-negocio/_lib/copy';
import {
  adminCatalogChips,
  suggestBusinessChips,
} from '../app/api/asistente-negocio/_lib/chips';
import { mapGeminiClassifyToTurn } from '../app/api/asistente-negocio/_lib/gemini-nlu';
import {
  isConcreteBusinessIntent,
  parseBusinessIntent,
  type BusinessIntent,
} from '../app/api/asistente-negocio/_lib/intents';
import { buildMenuView } from '../app/api/asistente-negocio/_lib/menu-view';
import { syntheticBusinessAssistantDigits } from '../app/api/asistente-negocio/_lib/escalate-id';
import type { BusinessShop } from '../app/api/asistente-negocio/_lib/auth';

const shop: BusinessShop = {
  comercioId: 'c-trueno',
  nombre: 'pizzas el trueno',
  slug: 'pizzas-el-trueno',
  role: 'owner',
  moneda: 'USD',
  tasa: '42',
  enLinea: true,
  horarios: null,
};

function kind(text: string, opts?: { pendingOp?: string | null }) {
  return parseBusinessIntent(text, opts).kind;
}

function assertNeverListMenu(phrases: string[]) {
  for (const p of phrases) {
    expect(kind(p), `MUST NOT list_menu ← "${p}"`).not.toBe('list_menu');
  }
}

function assertKind(phrases: string[], expected: BusinessIntent['kind']) {
  for (const p of phrases) {
    expect(kind(p), `"${p}" → ${expected}`).toBe(expected);
  }
}

describe('business assistant · strict intelligence battery', () => {
  describe('A. Never open the menu for capability / business questions', () => {
    it('rejects false-positive menú phrases from the real bug report', () => {
      assertNeverListMenu([
        'es posible crear otro menú para mi otro negocio ?',
        'puedo crear otro menu para otra tienda',
        'quiero otro menú en otro local',
        'necesito un segundo menú para mi otro negocio',
        'cómo hago un menú nuevo para otra cuenta',
        'se puede tener dos menús / dos negocios',
        'me ayudan a montar el menú de mi segundo negocio',
      ]);
    });

    it('maps those to register (or escalate), never browse', () => {
      assertKind(
        [
          'es posible crear otro menú para mi otro negocio ?',
          'quiero otro negocio',
          'registrar un local nuevo',
          'crear un negocio',
        ],
        'register',
      );
    });

    it('only opens menu on explicit browse', () => {
      assertKind(
        ['ver menú', 'Ver menú', 'mostrar el menú', 'ver productos', 'ver carta', 'productos'],
        'list_menu',
      );
      // Ambiguous single "menú" alone was historically dangerous — must not browse.
      expect(kind('menú')).not.toBe('list_menu');
      expect(kind('el menú está caro')).not.toBe('list_menu');
    });
  });

  describe('B. Price / availability / hours must not steal unrelated verbs', () => {
    it('cambiar sin precio no es propose_price', () => {
      expect(kind('cambiar el menú')).not.toBe('propose_price');
      expect(kind('cambiar el horario')).toBe('propose_hours');
      expect(kind('cambiar foto de la margarita')).toBe('change_image');
    });

    it('precio explícito sí clasifica', () => {
      const i = parseBusinessIntent('cambiar precio margarita a 12');
      expect(i.kind).toBe('propose_price');
      if (i.kind === 'propose_price') {
        expect(i.newPrice).toBe(12);
      }
    });

    it('cerrar negocio ≠ cerrar producto', () => {
      expect(kind('cerrar')).toBe('propose_en_linea');
      expect(kind('cerrar el local')).toBe('propose_en_linea');
      expect(kind('agotar margarita')).toBe('propose_availability');
      expect(kind('ocultar producto campesina')).toBe('propose_availability');
    });

    it('abrir/cerrar no confunde con horario', () => {
      expect(kind('abrir horario')).toBe('read_hours'); // contains horario → hours path
      expect(kind('abrir el negocio')).toBe('propose_en_linea');
      expect(kind('horario')).toBe('read_hours');
    });
  });

  describe('C. Human escalation paths', () => {
    it('detects explicit human requests', () => {
      assertKind(
        [
          'hablar con un humano',
          'necesito ayuda humana',
          'pasar a un asesor',
          'contactar soporte',
          'soporte humano por favor',
        ],
        'escalate_human',
      );
    });

    it('Gemini help/chat-empty stays in-chat (no auto-escalate)', () => {
      expect(mapGeminiClassifyToTurn({ intent: 'help' })?.intent.kind).toBe('help');
      expect(mapGeminiClassifyToTurn({ intent: 'chat' })?.intent.kind).toBe('help');
      expect(
        mapGeminiClassifyToTurn({ intent: 'help', reply: 'Usa la barra de abajo 😊' })
          ?.intent.kind,
      ).toBe('chat');
    });

    it('Gemini chat with reply stays chat; strips panel URLs', () => {
      const turn = mapGeminiClassifyToTurn({
        intent: 'chat',
        reply: 'Claro 😊 mira https://app.elmenuxfa.com/panel y te ayudo',
      });
      expect(turn?.intent.kind).toBe('chat');
      expect(turn?.reply).not.toMatch(/https?:\/\//);
      expect(turn?.reply).toMatch(/Claro/);
    });

    it('rejects dangerous / unknown Gemini intents', () => {
      expect(mapGeminiClassifyToTurn({ intent: 'delete_all' })).toBeNull();
      expect(mapGeminiClassifyToTurn({ intent: 'set_price' })).toBeNull();
      expect(mapGeminiClassifyToTurn({ intent: 'apply_confirm' })).toBeNull();
    });

    it('synthetic digits are stable and long enough for inbox', () => {
      const a = syntheticBusinessAssistantDigits('user-1');
      const b = syntheticBusinessAssistantDigits('user-1');
      const c = syntheticBusinessAssistantDigits('user-2');
      expect(a).toBe(b);
      expect(a).not.toBe(c);
      expect(a.length).toBeGreaterThanOrEqual(10);
      expect(a.startsWith('900')).toBe(true);
    });
  });

  describe('D. Confirm / cancel stay ultra-local (never Gemini tools)', () => {
    it('short confirmations', () => {
      assertKind(['sí', 'si', 'confirmar', 'dale', 'ok', 'acepto'], 'confirm_apply');
      assertKind(['no', 'cancelar', 'cancela', 'descartar'], 'cancel_confirm');
    });

    it('long sentences with sí do not false-confirm', () => {
      // Leading "sí" currently matches — document desired: only short confirms.
      // Strict policy: "sí pero primero dime el menú" should NOT confirm blindly.
      expect(kind('sí pero primero ver menú')).not.toBe('confirm_apply');
    });
  });

  describe('E. Concrete vs Gemini gate', () => {
    it('chips / clear ops skip Gemini', () => {
      for (const p of [
        'ver menú',
        'cambiar precio',
        'pedidos',
        'horario',
        'abrir',
        'cerrar',
        'hablar con un humano',
        'tasa de cambio',
        'mi membresía',
        'cuanto tiempo falta para pagar mi membresía ?',
      ]) {
        expect(isConcreteBusinessIntent(parseBusinessIntent(p)), p).toBe(true);
      }
    });

    it('membership questions do not escalate by rules', () => {
      assertKind(
        [
          'mi membresía',
          'cuanto tiempo falta para pagar mi membresía ?',
          'cuánto me toca pagar',
          'cuándo vence mi plan',
          'fecha de corte',
          'próximo pago',
        ],
        'membership',
      );
    });

    it('account / password / email stay concrete in-chat', () => {
      expect(kind('mi cuenta')).toBe('account');
      expect(kind('cambiar contraseña')).toBe('account');
      expect(kind('cambiar email')).toBe('account');
      expect(isConcreteBusinessIntent(parseBusinessIntent('mi cuenta'))).toBe(true);
    });

    it('vague chat goes to help (Gemini lane, not auto-human)', () => {
      expect(kind('hola')).toBe('help');
      expect(kind('qué puedes hacer exactamente con IA generativa')).toBe('help');
      expect(kind('eres una ia?')).toBe('help');
    });
  });

  describe('F. Chips coherence (no product dump after menu; human always reachable)', () => {
    it('boot catalog starts with Ver menú and includes soporte', () => {
      const chips = suggestBusinessChips({ phase: 'boot', shop });
      expect(chips[0]?.text).toBe('ver menú');
      expect(chips.map((c) => c.text)).toContain('hablar con un humano');
    });

    it('after list_menu chips are manage actions, not product names', () => {
      const chips = suggestBusinessChips({
        phase: 'turn',
        shop,
        intent: { kind: 'list_menu' },
        result: {
          text: 'menu',
          productsSample: [
            { id: '1', nombre: 'Margarita', precio: 10, disponible: true },
            { id: '2', nombre: 'Campesina', precio: 12, disponible: true },
          ],
        },
      });
      const texts = chips.map((c) => c.text);
      expect(texts.some((t) => /Margarita|Campesina/i.test(t))).toBe(false);
      expect(texts).toContain('cambiar precio');
      expect(texts).toContain('agotar');
      expect(texts).not.toContain('ver menú');
    });

    it('catalog never omits critical daily ops', () => {
      const texts = adminCatalogChips().map((c) => c.text);
      for (const need of [
        'ver menú',
        'pedidos',
        'cambiar precio',
        'tasa de cambio',
        'cambiar foto',
        'agotar',
        'activar',
        'ocultar producto',
        'mi cuenta',
        'hablar con un humano',
      ]) {
        expect(texts).toContain(need);
      }
    });

    it('after membership, chips prefer ops over human invite', () => {
      const chips = suggestBusinessChips({
        phase: 'turn',
        shop,
        intent: { kind: 'membership' },
        result: { text: 'membresía ok' },
      });
      const texts = chips.map((c) => c.text);
      expect(texts.slice(0, 3)).toEqual(
        expect.arrayContaining(['pedidos', 'ver menú', 'mi membresía']),
      );
      expect(texts[0]).not.toBe('hablar con un humano');
    });
  });

  describe('G. Copy hygiene (no panel leaks, no option dump in greeting)', () => {
    it('home greeting has metrics CTA without listing options', () => {
      const text = homeGreetingText(shop, {
        ordersToday: 0,
        salesToday: 0,
        customersToday: 0,
      });
      expect(text).toMatch(/pizzas el trueno/i);
      expect(text).not.toMatch(/Desde aquí puedes/);
      expect(text).not.toMatch(/app\.elmenuxfa\.com\/panel/i);
      expect(text).toMatch(/barra de abajo|escríbeme/i);
    });

    it('help text points to bar, not a bullet OS menu', () => {
      const text = helpText(shop.nombre, true);
      expect(text).not.toMatch(/• 📋 ver menú/);
      expect(text).toMatch(/barra de abajo/i);
    });

    it('auth copy keeps merchant in chat', () => {
      expect(needsAuthText(false)).toMatch(/tarjetita|abajo|chat/i);
      expect(needsAuthText(false)).not.toMatch(/https?:\/\//);
    });
  });

  describe('H. Menu view grouping integrity', () => {
    it('builds category carousels without dropping uncategorized', () => {
      const view = buildMenuView(
        shop,
        [
          { id: 'p', nombre: 'Pizzas' },
          { id: 'b', nombre: 'Bebidas' },
        ],
        [
          {
            id: '1',
            nombre: 'Margarita',
            precio: 10,
            disponible: true,
            categoria_id: 'p',
          },
          {
            id: '2',
            nombre: 'Agua',
            precio: 1,
            disponible: false,
            categoria_id: 'b',
          },
          {
            id: '3',
            nombre: 'Extra',
            precio: 2,
            disponible: true,
            categoria_id: null,
          },
        ],
      );
      expect(view.categories.map((c) => c.name)).toEqual([
        'Pizzas',
        'Bebidas',
        'Sin categoría',
      ]);
      expect(view.categories.find((c) => c.id === 'b')?.availableCount).toBe(0);
      expect(view.products).toHaveLength(3);
    });
  });

  describe('I. Gemini must not invent writes', () => {
    it('propose_price requires mapped fields only', () => {
      const turn = mapGeminiClassifyToTurn({
        intent: 'propose_price',
        productHint: 'Margarita',
        newPrice: -5,
      });
      expect(turn?.intent.kind).toBe('propose_price');
      if (turn?.intent.kind === 'propose_price') {
        // Invalid price dropped — tools will ask again
        expect(turn.intent.newPrice).toBeUndefined();
      }
    });

    it('false list_menu from model for “otro negocio” is a policy smell — register preferred', () => {
      // If model mislabels, product code path still has rules first for clear phrases.
      expect(kind('puedo crear otro menú para mi otro negocio')).toBe('register');
      // And mapping register works:
      expect(mapGeminiClassifyToTurn({ intent: 'register' })?.intent.kind).toBe(
        'register',
      );
    });
  });
});
