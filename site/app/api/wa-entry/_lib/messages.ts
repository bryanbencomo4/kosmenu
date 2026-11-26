import type { WaEntryConfig } from './config';

export function welcomeMessage(): string {
  return [
    '¡Hola! 👋 Bienvenido a *elmenuxfa.com*.',
    '',
    '¿Qué te gustaría hacer hoy? 😊',
    '',
    '*1️⃣ Quiero pedir comida* 🍔',
    '*2️⃣ Tengo un negocio* 🏪',
    '',
    'Responde con el número de tu opción.',
  ].join('\n');
}

export function consumerLinkMessage(config: WaEntryConfig): string {
  return [
    '¡Perfecto! 😋🍕',
    '',
    'En *elmenuxfa.com* puedes descubrir restaurantes, buscar tus comidas favoritas y explorar sus menús desde un solo lugar.',
    '',
    '🤖 Nuestro asistente virtual te ayudará a encontrar lo que se te antoja.',
    '',
    '👇 *¡Encuentra tu próximo antojo aquí!*',
    '',
    config.consumerAssistantUrl,
  ].join('\n');
}

export function businessMenuMessage(): string {
  return [
    '¡Qué bueno tenerte por aquí! 🏪😊',
    '',
    '¿Qué te gustaría hacer con tu negocio?',
    '',
    '*1️⃣ Registrar mi menú*',
    '*2️⃣ Gestionar mi menú*',
    '',
    'Responde con el número de tu opción.',
  ].join('\n');
}

export function businessRegisterMessage(config: WaEntryConfig): string {
  return [
    '¡Genial! 🏪',
    '',
    'Para registrar tu menú digital, empieza por aquí:',
    '',
    `ℹ️ Info del servicio: ${config.businessLandingUrl}`,
    `📝 Crear cuenta: ${config.businessRegisterUrl}`,
    '',
    'Ahí puedes registrarte y armar tu menú. Escribe *MENÚ* si quieres volver al inicio.',
  ].join('\n');
}

export function businessManageMessage(config: WaEntryConfig): string {
  return [
    'Perfecto 👍',
    '',
    'Para gestionar tu menú e inicia sesión en tu panel:',
    '',
    config.businessManageUrl,
    '',
    'El acceso es con tu cuenta (no pedimos contraseñas por WhatsApp). Escribe *MENÚ* para volver al inicio.',
  ].join('\n');
}

export function unexpectedAudienceMessage(): string {
  return 'Disculpa, no te entendí. Explícame mejor qué necesitas, porfa. También puedes escribir *MENÚ*.';
}

export function unexpectedBusinessMessage(): string {
  return 'Responde *1* para registrar tu menú o *2* para gestionarlo. También puedes escribir *MENÚ* para volver al inicio.';
}

export function alreadyHelpedMessage(): string {
  return 'Si necesitas otra cosa, escribe *MENÚ* para volver al inicio 🙂';
}
