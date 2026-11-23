export type DayPart = 'morning' | 'afternoon' | 'evening';

const GENERIC_GREETINGS = [
  '¡Bienvenido! 👋 ¿Qué te gustaría pedir?',
  'Hola 👋 ¿Qué se te antoja hoy?',
  '¡Qué gusto tenerte aquí! 😊 ¿Qué pedimos?',
  'Bienvenido 🙌 toma tu tiempo.',
  '¿Listo para pedir algo rico? 😋',
  'Pide a tu ritmo 🍽️ nosotros nos encargamos.',
  '¿Qué te provoca comer hoy? 🤤',
  '¡Hola! 👋 Elige tu favorito.',
  '¡Bienvenido! ✨ Tu mesa digital está lista.',
];

const MORNING_GREETINGS = [
  'Buenos días ☀️ ¿Qué te gustaría pedir?',
  'Buenos días 🌅 toma tu tiempo.',
  'Buenos días ☕ ¿qué se te antoja?',
];

const AFTERNOON_GREETINGS = [
  'Buenas tardes 🌤️ ¿qué se te antoja?',
  'Buenas tardes 👋 ¿Qué vamos a pedir?',
  'Buenas tardes 😊 listos para atenderte.',
];

const EVENING_GREETINGS = [
  'Buenas noches 🌙 listos para atenderte.',
  'Buenas noches ✨ ¿Qué te provoca?',
  'Buenas noches 🍽️ pide a tu ritmo.',
];

export function getDayPart(now = new Date()): DayPart {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 19) return 'afternoon';
  return 'evening';
}

export function pickKioskGreeting(now = new Date()): string {
  const part = getDayPart(now);
  const timed =
    part === 'morning'
      ? MORNING_GREETINGS
      : part === 'afternoon'
        ? AFTERNOON_GREETINGS
        : EVENING_GREETINGS;
  const pool = [...GENERIC_GREETINGS, ...timed];
  return pool[Math.floor(Math.random() * pool.length)] ?? GENERIC_GREETINGS[0];
}
