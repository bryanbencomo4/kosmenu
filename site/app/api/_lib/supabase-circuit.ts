export type CircuitState = 'closed' | 'open' | 'half_open';

export class CircuitOpenError extends Error {
  constructor() {
    super('supabase_circuit_open');
    this.name = 'CircuitOpenError';
  }
}

export function isTransientSupabaseFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|aborted|fetch failed|circuit_open|UND_ERR|ECONNRESET|ETIMEDOUT|503|504/i.test(
    message,
  );
}

export class SupabaseCircuitBreaker {
  private failures = 0;
  private state: CircuitState = 'closed';
  private openedAt = 0;

  constructor(
    private readonly failureThreshold = 5,
    private readonly cooldownMs = 45_000,
  ) {}

  snapshot() {
    return {
      state: this.state,
      failures: this.failures,
      cooldownMs: this.cooldownMs,
    };
  }

  allow() {
    if (this.state !== 'open') return true;
    if (Date.now() - this.openedAt < this.cooldownMs) return false;
    this.state = 'half_open';
    return true;
  }

  recordSuccess() {
    this.failures = 0;
    this.state = 'closed';
    this.openedAt = 0;
  }

  recordFailure() {
    if (this.state === 'half_open') {
      this.state = 'open';
      this.openedAt = Date.now();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  reset() {
    this.failures = 0;
    this.state = 'closed';
    this.openedAt = 0;
  }
}

export const supabaseReadCircuit = new SupabaseCircuitBreaker(5, 45_000);
export const supabaseWriteCircuit = new SupabaseCircuitBreaker(5, 30_000);
