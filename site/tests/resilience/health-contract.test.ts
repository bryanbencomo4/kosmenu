import { describe, expect, it } from 'vitest';

import { CircuitOpenError } from '../../app/api/_lib/supabase-circuit';

describe('health and menu failure contract', () => {
  it('exposes a machine-readable circuit error for 503 mapping', () => {
    const error = new CircuitOpenError();
    expect(error.message).toBe('supabase_circuit_open');
    expect(error.name).toBe('CircuitOpenError');
  });
});
