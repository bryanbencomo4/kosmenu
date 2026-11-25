import { describe, expect, it } from 'vitest';

import {
  evaluateCorpus250,
  loadCorpus250,
  TAG_TOOL_MAP,
} from '../app/api/asistente-negocio/_lib/corpus-coverage';
import {
  parseBusinessIntent,
  parseBusinessIntents,
  splitMultiUtterance,
} from '../app/api/asistente-negocio/_lib/intents';

describe('corpus-250 structure', () => {
  it('has exactly 250 items with unique ids and known tags', () => {
    const items = loadCorpus250();
    expect(items).toHaveLength(250);
    expect(new Set(items.map((i) => i.id)).size).toBe(250);
    for (const item of items) {
      expect(item.text.length).toBeGreaterThan(2);
      expect(TAG_TOOL_MAP).toHaveProperty(item.tag);
    }
  });
});

describe('corpus-250 safety + human', () => {
  it('seguridad_limites → refuse_sensitive (never account leak path)', () => {
    const items = loadCorpus250().filter((i) => i.tag === 'seguridad_limites');
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) {
      expect(parseBusinessIntent(item.text).kind, item.text).toBe('refuse_sensitive');
    }
  });

  it('humano → escalate_human', () => {
    const items = loadCorpus250().filter((i) => i.tag === 'humano');
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) {
      expect(parseBusinessIntent(item.text).kind, item.text).toBe('escalate_human');
    }
  });
});

describe('corpus-250 safe capability samples', () => {
  it('maps core happy paths to concrete tools', () => {
    expect(parseBusinessIntent('Hola, muéstrame todos los productos que tengo publicados en mi menú.').kind).toBe(
      'list_menu',
    );
    expect(parseBusinessIntent('¿Cuánto cuesta actualmente la hamburguesa especial?').kind).toBe(
      'propose_price',
    );
    expect(
      parseBusinessIntent('Necesito que pongas como agotada la pizza margarita hasta nuevo aviso.')
        .kind,
    ).toBe('propose_availability');
    expect(parseBusinessIntent('¿Cuántos pedidos tengo pendientes por preparar?')).toMatchObject({
      kind: 'recent_orders',
      filter: 'pending',
    });
    expect(parseBusinessIntent('¿Cuánto he vendido hoy en total?')).toMatchObject({
      kind: 'home_metrics',
      focus: 'sales',
    });
    expect(parseBusinessIntent('Pásame el enlace de mi menú para compartirlo por WhatsApp.').kind).toBe(
      'share_menu',
    );
    expect(parseBusinessIntent('Quiero cambiar el correo con el que inicio sesión.')).toMatchObject({
      kind: 'account',
      mode: 'email',
    });
  });

  it('splits simple multi without breaking product names', () => {
    expect(splitMultiUtterance('arepa y queso a 5')).toHaveLength(1);
    const parts = splitMultiUtterance(
      'Cierra el restaurante y dime cuánto vendimos hoy',
    );
    expect(parts).toHaveLength(2);
    const intents = parseBusinessIntents(
      'Cierra el restaurante y dime cuánto vendimos hoy',
    );
    expect(intents.map((i) => i.kind).sort()).toEqual(
      ['home_metrics', 'propose_en_linea'].sort(),
    );
  });
});

describe('corpus-250 coverage report', () => {
  it('produces coverage summary and keeps safety/human covered', () => {
    const { rows, summary } = evaluateCorpus250();
    expect(summary.total).toBe(250);
    expect(summary.covered + summary.partial + summary.gap).toBe(250);

    const secure = rows.filter((r) => r.tag === 'seguridad_limites');
    expect(secure.every((r) => r.level === 'covered')).toBe(true);

    const human = rows.filter((r) => r.tag === 'humano');
    expect(human.every((r) => r.level === 'covered')).toBe(true);

    // Soft floor: after safe gaps, at least half should not be hard gaps.
    expect(summary.covered + summary.partial).toBeGreaterThanOrEqual(120);

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          covered: summary.covered,
          partial: summary.partial,
          gap: summary.gap,
          byTag: summary.byTag,
        },
        null,
        2,
      ),
    );
  });
});
