/**
 * Merchant authorization for Master Assistant admin tools.
 * Phone match alone NEVER grants write. Verified sessions are injected
 * (magic-link / panel OTP) via WaMasterAuthGate — not inferred.
 */

export type WaMasterAuthSession = {
  fromDigits: string;
  comercioId: string;
  /** True only after strong verification — never from phone match alone. */
  authorized: boolean;
  verifiedUntilMs: number;
  method: 'none' | 'panel_session' | 'magic_link' | 'test_inject';
};

export interface WaMasterAuthGate {
  getSession(fromDigits: string, comercioId: string, nowMs: number): Promise<WaMasterAuthSession | null>;
  grantForTests?(session: WaMasterAuthSession): Promise<void>;
}

export function createMemoryWaMasterAuthGate(): WaMasterAuthGate {
  const map = new Map<string, WaMasterAuthSession>();
  const key = (d: string, c: string) => `${d}:${c}`;
  return {
    async getSession(fromDigits, comercioId, nowMs) {
      const s = map.get(key(fromDigits, comercioId));
      if (!s) return null;
      if (s.verifiedUntilMs < nowMs) {
        map.delete(key(fromDigits, comercioId));
        return null;
      }
      return s;
    },
    async grantForTests(session) {
      map.set(key(session.fromDigits, session.comercioId), session);
    },
  };
}

export function unauthorizedAdminMessage(manageUrl: string): string {
  const panel = manageUrl || 'https://app.elmenuxfa.com/';
  return [
    'Para aplicar el cambio con seguridad entra al panel (no me pases contraseñas por WhatsApp):',
    panel,
    '',
    'O pide que te pase al asistente del negocio y lo hacemos ahí con tu sesión.',
  ].join('\n');
}
