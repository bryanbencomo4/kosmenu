/**
 * Home screen options for the public kiosk.
 * Missing config keeps today's behavior so existing restaurants do not change.
 */

export type KioskHomeConfig = {
  verMenu: boolean;
  comerAqui: boolean;
  paraLlevar: boolean;
  delivery: boolean;
  calificacion: boolean;
  ubicacion: boolean;
  redes: boolean;
};

export const DEFAULT_KIOSK_HOME_CONFIG: KioskHomeConfig = {
  verMenu: false,
  comerAqui: true,
  paraLlevar: true,
  delivery: true,
  calificacion: true,
  ubicacion: true,
  redes: true,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readBool(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

export function parseKioskHomeConfig(raw: unknown): KioskHomeConfig {
  const row = asRecord(raw);
  const nested = asRecord(row?.inicio_menu) ?? asRecord(row?.kiosk_home) ?? row;
  const actions = asRecord(nested?.acciones) ?? nested;
  const display = asRecord(nested?.mostrar) ?? nested;
  const source = nested ?? {};
  const actionSource = actions ?? source;
  const displaySource = display ?? source;

  return {
    verMenu: readBool(
      actionSource?.ver_menu ?? source.ver_menu ?? source.verMenu,
      DEFAULT_KIOSK_HOME_CONFIG.verMenu,
    ),
    comerAqui: readBool(
      actionSource?.comer_aqui ?? source.comer_aqui ?? source.comerAqui,
      DEFAULT_KIOSK_HOME_CONFIG.comerAqui,
    ),
    paraLlevar: readBool(
      actionSource?.para_llevar ?? source.para_llevar ?? source.paraLlevar,
      DEFAULT_KIOSK_HOME_CONFIG.paraLlevar,
    ),
    delivery: readBool(
      actionSource?.delivery ?? source.delivery,
      DEFAULT_KIOSK_HOME_CONFIG.delivery,
    ),
    calificacion: readBool(
      displaySource?.calificacion ?? source.calificacion,
      DEFAULT_KIOSK_HOME_CONFIG.calificacion,
    ),
    ubicacion: readBool(
      displaySource?.ubicacion ?? source.ubicacion,
      DEFAULT_KIOSK_HOME_CONFIG.ubicacion,
    ),
    redes: readBool(displaySource?.redes ?? source.redes, DEFAULT_KIOSK_HOME_CONFIG.redes),
  };
}

export function toPublicKioskHomeConfig(raw: unknown): KioskHomeConfig {
  return parseKioskHomeConfig(raw);
}

export function kioskHomeConfigToJson(config: KioskHomeConfig) {
  return {
    ver_menu: config.verMenu,
    comer_aqui: config.comerAqui,
    para_llevar: config.paraLlevar,
    delivery: config.delivery,
    calificacion: config.calificacion,
    ubicacion: config.ubicacion,
    redes: config.redes,
  };
}
