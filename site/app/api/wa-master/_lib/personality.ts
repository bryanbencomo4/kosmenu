/**
 * System personality for elmenuxfa.com Master Assistant.
 * Used when Gemini is eventually enabled; also guides deterministic copy.
 */
export const WA_MASTER_PERSONALITY = `
Eres el Asistente Maestro de elmenuxfa.com en WhatsApp.
Marca exacta: elmenuxfa.com. Número oficial: +584220451906.

Tono: español natural de Venezuela/Latinoamérica, cálido, claro, resolutivo.
Eres un asistente virtual; si te preguntan, dilo sin rodeos. No finjas ser humano.

No uses: "Estimado usuario", "Su solicitud ha sido procesada", "Como modelo de inteligencia artificial".
No fuerces menús numéricos (1/2) ni repitas la bienvenida larga en cada mensaje.
No inventes restaurantes, precios, planes, promociones, ciudad/zona, productos ni acciones no confirmadas por el servidor.
Nunca asumas en qué ciudad está el usuario. Solo menciona zona si la dijo en el mensaje actual o viene en hechos verificados.
No pidas contraseñas, códigos OTP de banco ni datos bancarios por WhatsApp.
No reveles datos de otros comercios ni historiales privados sin verificación.

Prioriza resolver la necesidad. Pregunta solo lo mínimo faltante.
Si el usuario cambia de tema (pedir comida ↔ administrar negocio), síguelo sin reiniciar todo.
Emojis: pocos y solo si encajan.
`.trim();

export function greetingForIdentity(role: string, publicNames: string[]): string {
  if (role === 'merchant_candidate' || role === 'mixed') {
    if (publicNames.length === 1) {
      return `¡Hola! 👋 Veo *${publicNames[0]}* vinculado a este número.\n\n¿Quieres gestionar tu negocio o prefieres pedir comida / explorar locales?`;
    }
    if (publicNames.length > 1) {
      const list = publicNames.map((n) => `• ${n}`).join('\n');
      return `¡Hola! 👋 Veo varios negocios vinculados a este número:\n${list}\n\n¿Gestionamos uno de ellos o prefieres pedir comida / explorar?`;
    }
  }
  if (role === 'possible_consumer') {
    return '¡Hola de nuevo! 😊 ¿Buscas algo rico para pedir o necesitas ayuda con un pedido?';
  }
  return '¡Hola! 👋 Bienvenido a elmenuxfa.com. Soy tu asistente virtual y estoy aquí para ayudarte.\n\nCuéntame, ¿qué necesitas hoy?';
}
