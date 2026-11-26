import type { BusinessToolResult } from './tools';

/** Deterministic replies for Vitest without Supabase/Google. */
export function simulateBusinessAssistant(input: {
  authenticated: boolean;
  text?: string;
}): BusinessToolResult & { authenticated: boolean; needsAuth?: boolean } {
  if (!input.authenticated) {
    return {
      authenticated: false,
      needsAuth: true,
      text:
        'Soy el asistente de elmenuxfa.com para administrar tu negocio. Inicia sesión para continuar de forma segura.',
    };
  }
  const t = (input.text || '').toLowerCase();
  if (t.includes('confirmar')) {
    return {
      authenticated: true,
      text: 'Simulado: cambio aplicado.',
      auditId: 'ba_sim_1',
    };
  }
  if (t.includes('precio')) {
    return {
      authenticated: true,
      text: 'Simulado: propongo cambiar Margarita a 12 USD. Confirma para aplicar.',
      proposal: {
        action: 'set_price',
        confirmToken: 'sim.token',
        expiresAt: Date.now() + 60_000,
        summary: 'Cambiar Margarita a 12',
        details: { productName: 'Margarita', newPrice: 12 },
        panelUrl: 'https://app.elmenuxfa.com/',
      },
    };
  }
  return {
    authenticated: true,
    text: 'Simulado: ¿Consultamos menú, precios, horario, pedidos o abrir/cerrar el local?',
  };
}
