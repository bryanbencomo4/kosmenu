import {
  openWelcomeConsumer,
  openWelcomeProspect,
  openWelcomeRegistered,
  openWelcomeUnknown,
} from '../knowledge/platform';
import type { WaMenuId, WaMenuProfile } from './types';

export function rootMenuIdForProfile(profile: WaMenuProfile): WaMenuId {
  if (profile === 'consumer') return 'root_consumer';
  if (profile === 'prospect') return 'root_prospect';
  if (profile === 'registered') return 'root_registered';
  return 'root_unknown';
}

export function formatMenu(title: string, lines: string[], footer?: string): string {
  const body = [title, '', ...lines].join('\n');
  if (!footer) return body;
  return `${body}\n\n${footer}`;
}

const FOOTER_NUM =
  'Puedes responder con un número o contarme directamente qué necesitas. 😊';

export function buildMenuText(menuId: WaMenuId, opts?: { businessName?: string | null }): string {
  const name = opts?.businessName?.trim();
  switch (menuId) {
    case 'root_unknown':
      // NL-first welcome; numbered digits still work via navigate.
      return openWelcomeUnknown();
    case 'root_consumer':
      return openWelcomeConsumer();
    case 'root_prospect':
      return openWelcomeProspect();
    case 'root_registered':
      return openWelcomeRegistered(name);
    case 'biz_links':
      return formatMenu('Enlaces de tu menú 🔗', [
        '1️⃣ Enlace para QR',
        '2️⃣ Enlace para recibir pedidos',
        '3️⃣ Enlace del menú para compartir',
        '4️⃣ Gestionar mi menú',
        '8️⃣ Reportar un problema',
        '9️⃣ Hablar con un asesor',
        '0️⃣ Menú principal',
      ]);
    case 'biz_products':
      return formatMenu('Productos 📦', [
        '1️⃣ Agregar producto',
        '2️⃣ Modificar producto',
        '3️⃣ Consultar precios',
        '4️⃣ Cambiar disponibilidad',
        '5️⃣ Consultar categorías',
        '8️⃣ Reportar un problema',
        '9️⃣ Hablar con un asesor',
        '0️⃣ Menú principal',
      ]);
    case 'biz_pricing':
      return formatMenu('Precios, tasas y pagos 💱', [
        '1️⃣ Consultar precios',
        '2️⃣ Consultar tasa de cambio',
        '3️⃣ Solicitar cambio de tasa',
        '4️⃣ Consultar métodos de pago',
        '8️⃣ Reportar un problema',
        '9️⃣ Hablar con un asesor',
        '0️⃣ Menú principal',
      ]);
    case 'biz_orders':
      return formatMenu('Pedidos y delivery 🛵', [
        '1️⃣ Consultar configuración de delivery',
        '2️⃣ Obtener enlace de pedidos',
        '3️⃣ Consultar modalidades de entrega',
        '4️⃣ Ayuda con pedidos',
        '8️⃣ Reportar un problema',
        '9️⃣ Hablar con un asesor',
        '0️⃣ Menú principal',
      ]);
    case 'biz_config':
      return formatMenu('Configuración del negocio ⚙️', [
        '1️⃣ Datos del negocio',
        '2️⃣ Horarios',
        '3️⃣ Disponibilidad / menú',
        '4️⃣ Categorías',
        '5️⃣ Abrir asistente empresarial',
        '8️⃣ Reportar un problema',
        '9️⃣ Hablar con un asesor',
        '0️⃣ Menú principal',
      ]);
    case 'support_issue':
      return formatMenu(
        'Lamento que haya un problema. 🙏 ¿Cuál se parece más?',
        [
          '1️⃣ No puedo entrar a mi cuenta',
          '2️⃣ Problema con mi menú',
          '3️⃣ Problema con un pedido',
          '4️⃣ Problema con pagos o suscripción',
          '5️⃣ Otro problema',
          '9️⃣ Hablar con un asesor',
          '0️⃣ Menú principal',
        ],
        'Si ya lo describiste, también puedes escribir más detalle.',
      );
    default:
      return buildMenuText('root_unknown');
  }
}

export function invalidChoiceReply(menuId: WaMenuId, opts?: { businessName?: string | null }): string {
  return `Esa opción no está disponible ahora. 😊\n\n${buildMenuText(menuId, opts)}`;
}

export function humanEscalateSuccessReply(params: { fastCoverage: boolean }): string {
  const when = params.fastCoverage ? 'En unos momentos' : 'Lo antes posible';
  return (
    `¡Claro! 😊 Hemos recibido tu solicitud.\n\n` +
    `${when}, alguien de nuestro equipo se pondrá en contacto contigo por este mismo WhatsApp.\n\n` +
    `Gracias por tu paciencia. 💚`
  );
}

/** WhatsApp italic + warning — operator took the chat. */
export function humanTakeNotice(operatorLabel?: string | null): string {
  const who = operatorLabel?.trim() ? ` (${operatorLabel.trim()})` : '';
  return `_⚠️ Un asesor de elmenuxfa.com${who} está atendiendo esta conversación._`;
}

/** WhatsApp italic — AI resumed. */
export function assistantReturnNotice(): string {
  return `_🤖 El asistente virtual retomó la atención. Escribe *0* para el menú o cuéntame qué necesitas._`;
}
