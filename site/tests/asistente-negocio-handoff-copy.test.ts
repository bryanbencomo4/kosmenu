import { describe, expect, it } from 'vitest';

import {
  greetingText,
  handoffOperationLabel,
  humanHandoffHint,
} from '../app/api/asistente-negocio/_lib/copy';
import type { WaHandoffPayload } from '../app/api/_lib/wa-handoff';

const payload = (extra: Record<string, unknown>) => extra as unknown as WaHandoffPayload;

describe('business assistant handoff copy', () => {
  it('never leaks internal operation keys', () => {
    expect(handoffOperationLabel('set_fx')).toBe('el cambio de tasa');
    const hint = humanHandoffHint(
      payload({ pendingOperation: 'set_fx', summary: 'set_fx · Pizzas El Trueno', conversationHint: 'Quiero cambiar la tasa' }),
    );
    expect(hint).toBe('el cambio de tasa');
    expect(hint).not.toMatch(/set_fx/);
  });

  it('falls back to the merchant words, skipping snake_case keys', () => {
    expect(
      humanHandoffHint(payload({ pendingOperation: 'unknown_op', summary: 'unknown_op · Shop', conversationHint: 'Necesito ayuda con mi menú' })),
    ).toBe('Necesito ayuda con mi menú');
    expect(humanHandoffHint(null)).toBeNull();
  });

  it('greets once, without raw keys', () => {
    const t = greetingText(payload({ pendingOperation: 'set_fx', conversationHint: 'Quiero cambiar la tasa' }), true);
    expect(t).toMatch(/Seguimos con \*el cambio de tasa\*/);
    expect(t).not.toMatch(/set_fx|Retomamos/);
  });
});
