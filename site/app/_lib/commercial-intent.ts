/** Client-safe commercial / admin intent detection for Discovery → business handoff. */

export function detectCommercialIntentFromText(text: string): {
  commercial: boolean;
  kind: 'register' | 'admin' | 'pricing' | null;
} {
  const t = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (
    /\b(registrar|poner mi menu|crear.*negocio|tengo un restaurante|unirme a la plataforma)\b/.test(
      t,
    )
  ) {
    return { commercial: true, kind: 'register' };
  }
  if (/\b(plan|planes|cuanto cuesta|tarifa)\b/.test(t) && /\b(negocio|menu|plataforma)\b/.test(t)) {
    return { commercial: true, kind: 'pricing' };
  }
  if (
    /\b(editar mis productos|cambiar (el )?precio|actualizar (la )?tasa|agregar (un )?producto|ya tengo un negocio|mi menu digital)\b/.test(
      t,
    )
  ) {
    return { commercial: true, kind: 'admin' };
  }
  return { commercial: false, kind: null };
}
