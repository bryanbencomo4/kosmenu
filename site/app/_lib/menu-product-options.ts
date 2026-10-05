export type MenuSizeOption = {
  id: string;
  label: string;
  precio: number;
};

export type MenuAdjustmentOption = {
  id: string;
  label: string;
  precio: number;
  tipo?: 'toggle' | 'checkbox';
};

export type MenuPriceRule = {
  grupo: string;
  opcion: string;
  precio: number;
};

export type MenuOptionGroupChoice = {
  id: string;
  nombre: string;
  /** Fallback / fixed price when no rule matches. */
  precio: number;
  reglasPrecio?: MenuPriceRule[];
  /** Opt-in: pre-select this option when the sheet opens. */
  predeterminada?: boolean;
  /** Opt-in: customer types a value instead of picking a listed extra. */
  textoLibre?: boolean;
};

export type MenuOptionGroup = {
  id: string;
  nombre: string;
  tipo: 'unica' | 'multiple';
  obligatorio: boolean;
  min: number;
  max: number;
  /** Active options only; inactive ones are dropped while parsing. */
  opciones: MenuOptionGroupChoice[];
  /** Opt-in, optional groups only: options stay hidden until the shopper checks this question. */
  pregunta?: string;
  /** Opt-in, single free-text option question groups: checking the question selects it and shows its field. */
  preguntaDirecta?: boolean;
};

export const OPTION_GROUP_QUESTION_MAX_LENGTH = 80;

export function defaultOptionGroupQuestion(groupName: string) {
  return `¿Quieres agregar ${groupName.trim().toLowerCase()}?`;
}

export type ProductMenuOptions = {
  tamanos?: MenuSizeOption[];
  ajustes?: MenuAdjustmentOption[];
  grupos?: MenuOptionGroup[];
  personalizacion?: ProductPersonalization;
};

export type ProductPersonalization = {
  /** `pregunta` (opt-in) hides the section behind a checkbox question, like option groups. */
  combinacion?: { titulo: string; productosCompatibles: string[]; reglaPrecio: 'max'; pregunta?: string };
  exclusiones?: { titulo: string; ingredientes: Array<{ id: string; nombre: string }>; pregunta?: string };
};

export const DEFAULT_COMBINATION_QUESTION = '¿Quieres combinar con otro producto?';
export const DEFAULT_REMOVAL_QUESTION = '¿Quieres quitar algún ingrediente?';

function parseSectionQuestion(row: Record<string, unknown>, fallback: string) {
  if (row.pregunta_activada !== true) return {};
  const text = (row.pregunta ?? '').toString().replace(/\s+/g, ' ').trim().slice(0, OPTION_GROUP_QUESTION_MAX_LENGTH);
  return { pregunta: text || fallback };
}

export function parseProductPersonalization(raw: unknown): ProductPersonalization | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const config = (raw as Record<string, unknown>).personalizacion;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const value = config as Record<string, unknown>;
  if (value.version !== 1) return null;
  const result: ProductPersonalization = {};
  const combo = value.combinacion as Record<string, unknown> | undefined;
  if (combo?.activada === true && combo.regla_precio === 'max' && typeof combo.titulo === 'string' && combo.titulo.trim()) {
    const ids = Array.isArray(combo.productos_compatibles)
      ? [...new Set(combo.productos_compatibles.filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)))].slice(0, 100)
      : [];
    if (ids.length) {
      result.combinacion = {
        titulo: combo.titulo.trim().slice(0, 120), productosCompatibles: ids, reglaPrecio: 'max',
        ...parseSectionQuestion(combo, DEFAULT_COMBINATION_QUESTION),
      };
    }
  }
  const removals = value.exclusiones as Record<string, unknown> | undefined;
  if (removals?.activadas === true && typeof removals.titulo === 'string' && removals.titulo.trim() && Array.isArray(removals.ingredientes)) {
    const seen = new Set<string>();
    const ingredientes: Array<{ id: string; nombre: string }> = [];
    for (const rawIngredient of removals.ingredientes.slice(0, 50)) {
      if (!rawIngredient || typeof rawIngredient !== 'object') continue;
      const ingredient = rawIngredient as Record<string, unknown>;
      if (typeof ingredient.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(ingredient.id) || seen.has(ingredient.id)) continue;
      if (typeof ingredient.nombre !== 'string' || !ingredient.nombre.trim()) continue;
      seen.add(ingredient.id);
      ingredientes.push({ id: ingredient.id, nombre: ingredient.nombre.trim().slice(0, 80) });
    }
    if (ingredientes.length) {
      result.exclusiones = {
        titulo: removals.titulo.trim().slice(0, 120), ingredientes,
        ...parseSectionQuestion(removals, DEFAULT_REMOVAL_QUESTION),
      };
    }
  }
  return Object.keys(result).length ? result : null;
}

/** Immutable per-line snapshot stored in pedidos.detalles.items[].selecciones. */
export type OrderLineOptionSnapshot = {
  grupo: string;
  opcion: string;
  precio: number;
};

export type CategoryMenuOptions = {
  servicio_adicional?: {
    label?: string;
    precios_por_tamano?: Record<string, number>;
  };
};

export type CartLineSelection = {
  tamanoId?: string;
  tamanoLabel?: string;
  servicioAdicional?: boolean;
  ajusteIds?: string[];
  /** Option-group selections: group id -> selected option ids. */
  grupos?: Record<string, string[]>;
  /** Free-text extras: group id -> option id -> written text. */
  textos?: Record<string, Record<string, string>>;
  exclusionesIds?: string[];
  combinacion?: { productId: string; seleccion: CartLineSelection };
};

type ProductLike = {
  id?: string;
  nombre?: string | null;
  precio?: number | null;
  opciones_menu?: unknown;
};

type CategoryLike = {
  nombre?: string | null;
  opciones_menu?: unknown;
};

const SERVICIO_ADICIONAL_PATTERN = /servicio\s*adicional/i;

export function isServicioAdicionalName(value: string) {
  return SERVICIO_ADICIONAL_PATTERN.test(value.trim());
}

export function parseProductMenuOptions(raw: unknown): ProductMenuOptions | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  const tamanosRaw = Array.isArray(record.tamanos) ? record.tamanos : [];
  const ajustesRaw = Array.isArray(record.ajustes) ? record.ajustes : [];

  const tamanos = tamanosRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const id = (row.id ?? '').toString().trim();
      const label = (row.label ?? '').toString().trim();
      const precio = toNumber(row.precio);
      if (!id || !label || precio === null || precio < 0) return null;
      return { id, label, precio };
    })
    .filter(Boolean) as MenuSizeOption[];

  const ajustes = ajustesRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const id = (row.id ?? '').toString().trim();
      const label = (row.label ?? '').toString().trim();
      const precio = toNumber(row.precio) ?? 0;
      if (!id || !label) return null;
      const tipoRaw = (row.tipo ?? 'checkbox').toString();
      const tipo = tipoRaw === 'toggle' ? 'toggle' : 'checkbox';
      return { id, label, precio, tipo };
    })
    .filter(Boolean) as MenuAdjustmentOption[];

  // Opt-in per product: groups are ignored unless the merchant switched them on.
  const grupos = record.activadas === true ? parseOptionGroups(record.grupos) : [];
  const personalizacion = parseProductPersonalization(raw);

  if (tamanos.length === 0 && ajustes.length === 0 && grupos.length === 0 && !personalizacion) {
    return null;
  }

  return {
    ...(tamanos.length > 0 ? { tamanos } : {}),
    ...(ajustes.length > 0 ? { ajustes } : {}),
    ...(grupos.length > 0 ? { grupos } : {}),
    ...(personalizacion ? { personalizacion } : {}),
  };
}

const OPTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function slugOptionId(rawId: unknown, fallbackName: string) {
  const explicit = String(rawId ?? '').trim();
  if (OPTION_ID_PATTERN.test(explicit)) return explicit;
  const slug = fallbackName
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return OPTION_ID_PATTERN.test(slug) ? slug : '';
}

function parseOptionGroups(raw: unknown): MenuOptionGroup[] {
  if (!Array.isArray(raw)) return [];
  const groups: MenuOptionGroup[] = [];
  const seenGroupIds = new Set<string>();

  for (const entry of raw.slice(0, 30)) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const nombre = (row.nombre ?? '').toString().trim();
    const id = slugOptionId(row.id, nombre);
    if (!OPTION_ID_PATTERN.test(id) || !nombre || seenGroupIds.has(id)) continue;

    const opciones: MenuOptionGroupChoice[] = [];
    const seenOptionIds = new Set<string>();
    const opcionesRaw = Array.isArray(row.opciones) ? row.opciones.slice(0, 50) : [];
    for (const optionEntry of opcionesRaw) {
      if (!optionEntry || typeof optionEntry !== 'object') continue;
      const option = optionEntry as Record<string, unknown>;
      if (option.activo === false) continue;
      const optionName = (option.nombre ?? '').toString().trim();
      const optionId = slugOptionId(option.id, optionName);
      const precio =
        toNumber(option.precio) ??
        toNumber(option.precio_base) ??
        toNumber(option.precio_extra) ??
        0;
      if (!OPTION_ID_PATTERN.test(optionId) || !optionName || seenOptionIds.has(optionId)) continue;
      if (precio < 0) continue;
      const reglasPrecio = parsePriceRules(option.reglas_precio, optionId);
      seenOptionIds.add(optionId);
      opciones.push({
        id: optionId,
        nombre: optionName,
        precio: roundMoney(precio),
        ...(reglasPrecio.length > 0 ? { reglasPrecio } : {}),
        ...(option.predeterminada === true ? { predeterminada: true } : {}),
        ...(option.texto_libre === true ? { textoLibre: true } : {}),
      });
    }
    if (opciones.length === 0) continue;

    const tipoToken = String(row.tipo ?? '')
      .trim()
      .toLowerCase();
    const tipoRaw = tipoToken === 'multiple' || tipoToken === 'multi' ? 'multiple' : 'unica';
    const obligatorio = row.obligatorio === true;
    let max = tipoRaw === 'unica' ? 1 : Math.floor(toNumber(row.max) ?? opciones.length);
    max = Math.max(1, Math.min(max, opciones.length));
    // max 1 is a radio group even if it was saved as "multiple".
    const tipo = max <= 1 ? 'unica' : tipoRaw;
    let min = obligatorio ? Math.max(1, Math.floor(toNumber(row.min) ?? 1)) : 0;
    min = Math.min(min, max);

    seenGroupIds.add(id);
    const preguntaText = (row.pregunta ?? '').toString().replace(/\s+/g, ' ').trim()
      .slice(0, OPTION_GROUP_QUESTION_MAX_LENGTH);
    const pregunta = min === 0 && row.pregunta_activada === true
      ? preguntaText || defaultOptionGroupQuestion(nombre)
      : undefined;
    const preguntaDirecta = Boolean(pregunta) && opciones.length === 1 && opciones[0].textoLibre === true &&
      row.pregunta_directa === true;
    groups.push({
      id, nombre, tipo, obligatorio: min > 0, min, max, opciones,
      ...(pregunta ? { pregunta } : {}),
      ...(preguntaDirecta ? { preguntaDirecta: true } : {}),
    });
  }

  return groups;
}

function parsePriceRules(raw: unknown, ownerOptionId: string): MenuPriceRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: MenuPriceRule[] = [];
  for (const entry of raw.slice(0, 40)) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const cuando = row.cuando && typeof row.cuando === 'object' && !Array.isArray(row.cuando)
      ? (row.cuando as Record<string, unknown>)
      : row;
    const grupo = (cuando.grupo ?? '').toString().trim();
    const opcion = (cuando.opcion ?? '').toString().trim();
    const precio = toNumber(row.precio);
    if (!OPTION_ID_PATTERN.test(grupo) || !OPTION_ID_PATTERN.test(opcion)) continue;
    if (opcion === ownerOptionId || precio === null || precio < 0) continue;
    rules.push({ grupo, opcion, precio: roundMoney(precio) });
  }
  return rules;
}

/** Resolved add-on price for the current selection. First matching rule wins. */
export function resolveOptionPrice(option: MenuOptionGroupChoice, selection: CartLineSelection) {
  const picked = selection.grupos ?? {};
  for (const rule of option.reglasPrecio ?? []) {
    if ((picked[rule.grupo] ?? []).includes(rule.opcion)) {
      return rule.precio;
    }
  }
  return option.precio;
}

export function productHasDependentPrices(product: ProductLike) {
  return (parseProductMenuOptions(product.opciones_menu)?.grupos ?? []).some((group) =>
    group.opciones.some((option) => (option.reglasPrecio?.length ?? 0) > 0),
  );
}

/** Why this add-on costs what it costs, or null when the option is fixed. */
export function describeDependentPriceReason(
  option: MenuOptionGroupChoice,
  groups: MenuOptionGroup[],
  selection: CartLineSelection,
) {
  if (!option.reglasPrecio?.length) return null;
  const picked = selection.grupos ?? {};
  const matched = option.reglasPrecio.find((rule) => (picked[rule.grupo] ?? []).includes(rule.opcion));
  const parentGroup = groups.find((group) => group.id === (matched ?? option.reglasPrecio[0]).grupo);
  return parentGroup ? `según ${lowerFirst(parentGroup.nombre)}` : 'según tu selección';
}

/** "Tamaño" -> "tamaño", but keeps acronyms such as "BBQ" as typed. */
function lowerFirst(value: string) {
  const text = value.trim();
  if (text.length > 1 && text[1] === text[1].toLocaleUpperCase('es') && text[1] !== text[1].toLocaleLowerCase('es')) return text;
  return text.charAt(0).toLocaleLowerCase('es') + text.slice(1);
}

function optionPriceRange(option: MenuOptionGroupChoice) {
  const prices = [option.precio, ...(option.reglasPrecio ?? []).map((rule) => rule.precio)];
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export type OptionGroupSelectionIssue = {
  groupId: string;
  groupName: string;
  message: string;
};

const FREE_TEXT_MAX = 80;

export function sanitizeFreeText(raw: unknown) {
  return `${raw ?? ''}`.replace(/\s+/g, ' ').trim().slice(0, FREE_TEXT_MAX);
}

export function getSelectedFreeText(
  selection: CartLineSelection,
  groupId: string,
  optionId: string,
) {
  return sanitizeFreeText(selection.textos?.[groupId]?.[optionId]);
}

export function getOptionDisplayName(
  option: MenuOptionGroupChoice,
  selection: CartLineSelection,
  groupId: string,
) {
  if (!option.textoLibre) return option.nombre;
  return getSelectedFreeText(selection, groupId, option.id) || option.nombre;
}

/** Only options the merchant marked as default. Existing products stay empty. */
export function defaultGroupSelections(groups: MenuOptionGroup[] | undefined): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const group of groups ?? []) {
    const marked = group.opciones.filter((option) => option.predeterminada);
    if (marked.length === 0) continue;
    if (group.tipo === 'unica' || group.max <= 1) {
      next[group.id] = [marked[0].id];
      continue;
    }
    next[group.id] = marked.slice(0, group.max).map((option) => option.id);
  }
  return next;
}

/** Next selected ids after a tap. Single-choice (unica / max 1) replaces. */
export function nextGroupSelection(
  group: MenuOptionGroup,
  currentIds: string[],
  optionId: string,
): string[] {
  if (group.tipo === 'unica' || group.max <= 1) {
    if (currentIds[0] === optionId && !group.obligatorio) return [];
    return [optionId];
  }
  if (currentIds.includes(optionId)) {
    return currentIds.filter((entry) => entry !== optionId);
  }
  if (currentIds.length >= group.max) return currentIds;
  return [...currentIds, optionId];
}

/** Checks the selection against each group's required/min/max rules. */
export function validateOptionGroupSelection(
  product: ProductLike,
  selection: CartLineSelection,
): OptionGroupSelectionIssue[] {
  const groups = parseProductMenuOptions(product.opciones_menu)?.grupos ?? [];
  const selected = selection.grupos ?? {};
  const issues: OptionGroupSelectionIssue[] = [];
  const knownGroupIds = new Set(groups.map((group) => group.id));

  for (const groupId of Object.keys(selected)) {
    if (!knownGroupIds.has(groupId) && (selected[groupId]?.length ?? 0) > 0) {
      issues.push({ groupId, groupName: groupId, message: 'Esta opción ya no está disponible.' });
    }
  }

  for (const group of groups) {
    const ids = selected[group.id] ?? [];
    const validIds = new Set(group.opciones.map((option) => option.id));
    if (ids.some((optionId) => !validIds.has(optionId))) {
      issues.push({
        groupId: group.id,
        groupName: group.nombre,
        message: `Una opción de ${group.nombre} ya no está disponible.`,
      });
      continue;
    }
    if (new Set(ids).size !== ids.length) {
      issues.push({ groupId: group.id, groupName: group.nombre, message: `Opción repetida en ${group.nombre}.` });
      continue;
    }
    if (ids.length < group.min) {
      issues.push({
        groupId: group.id,
        groupName: group.nombre,
        message:
          group.min === 1
            ? `Elige una opción de ${group.nombre}.`
            : `Elige al menos ${group.min} opciones de ${group.nombre}.`,
      });
    } else if (ids.length > group.max) {
      issues.push({
        groupId: group.id,
        groupName: group.nombre,
        message: `Puedes elegir hasta ${group.max} en ${group.nombre}.`,
      });
    }
    for (const option of group.opciones) {
      if (!option.textoLibre || !ids.includes(option.id)) continue;
      if (getSelectedFreeText(selection, group.id, option.id)) continue;
      issues.push({
        groupId: group.id,
        groupName: group.nombre,
        message: `Escribe qué quieres agregar en ${group.nombre}.`,
      });
    }
  }

  return issues;
}

function resolveSelectedGroupChoices(options: ProductMenuOptions | null, selection: CartLineSelection) {
  const choices: Array<{ group: MenuOptionGroup; option: MenuOptionGroupChoice }> = [];
  for (const group of options?.grupos ?? []) {
    const ids = selection.grupos?.[group.id] ?? [];
    for (const option of group.opciones) {
      if (ids.includes(option.id)) choices.push({ group, option });
    }
  }
  return choices;
}

/**
 * Snapshot of what the customer chose, with names and prices frozen at order
 * time. Invariant: precioBase + sum(selecciones.precio) === precioFinal.
 */
export function buildOrderLineSnapshot(
  product: ProductLike,
  category: CategoryLike | null | undefined,
  selection: CartLineSelection,
) {
  const options = parseProductMenuOptions(product.opciones_menu);
  const categoryOptions = parseCategoryMenuOptions(category?.opciones_menu ?? null);
  const selecciones: OrderLineOptionSnapshot[] = [];

  let precioBase = toNumber(product.precio) ?? 0;
  if (options?.tamanos?.length) {
    const size =
      options.tamanos.find((entry) => entry.id === selection.tamanoId) ?? options.tamanos[0];
    if (size) {
      precioBase = size.precio;
      selecciones.push({ grupo: 'Tamaño', opcion: size.label, precio: 0 });
    }
  }

  for (const ajusteId of selection.ajusteIds ?? []) {
    const ajuste = options?.ajustes?.find((entry) => entry.id === ajusteId);
    if (ajuste) selecciones.push({ grupo: 'Ajustes', opcion: ajuste.label, precio: ajuste.precio });
  }

  if (selection.servicioAdicional && categoryOptions?.servicio_adicional?.precios_por_tamano) {
    const tamanoKey = (selection.tamanoId ?? '').trim().toLowerCase();
    const addonPrice = categoryOptions.servicio_adicional.precios_por_tamano[tamanoKey];
    if (typeof addonPrice === 'number' && addonPrice >= 0) {
      const label = categoryOptions.servicio_adicional.label ?? 'Servicio adicional';
      selecciones.push({ grupo: label, opcion: label, precio: addonPrice });
    }
  }

  for (const { group, option } of resolveSelectedGroupChoices(options, selection)) {
    selecciones.push({
      grupo: group.nombre,
      opcion: getOptionDisplayName(option, selection, group.id),
      precio: resolveOptionPrice(option, selection),
    });
  }

  const precioFinal = roundMoney(
    precioBase + selecciones.reduce((sum, entry) => sum + entry.precio, 0),
  );
  return {
    producto: ((product.nombre ?? '').toString().trim() || 'Producto'),
    precioBase: roundMoney(precioBase),
    selecciones,
    precioFinal,
  };
}

function pluralizeEs(word: string) {
  const value = word.trim().toLowerCase();
  if (!value || /s$/.test(value)) return value;
  return /[aeiouáéó]$/.test(value) ? `${value}s` : `${value}es`;
}

/**
 * Card subtitle for configurable products ("3 tamaños disponibles"), without
 * opening the product. Null for simple products, so their card is unchanged.
 */
export function getProductOptionsSummary(product: ProductLike): string | null {
  const groups = parseProductMenuOptions(product.opciones_menu)?.grupos ?? [];
  if (groups.length === 0) return null;
  const lead = groups.find((group) => group.obligatorio) ?? groups[0];
  const count = lead.opciones.length;
  if (!lead.obligatorio) return 'Personalizable';
  const noun = count === 1 ? lead.nombre.trim().toLowerCase() : pluralizeEs(lead.nombre);
  return `${count} ${noun} ${count === 1 ? 'disponible' : 'disponibles'}`;
}

/** True only for products whose merchant enabled option groups. */
export function productHasOptionGroups(product: ProductLike) {
  return (parseProductMenuOptions(product.opciones_menu)?.grupos?.length ?? 0) > 0;
}

/**
 * Public menu payload: drop unpublished `grupos` so simple products stay
 * as small as they were. Activated groups stay on the same row (no extra
 * query). Legacy `tamanos` / `ajustes` are unchanged.
 */
export function slimPublicProductOptions(raw: unknown): unknown {
  if (raw == null || typeof raw !== 'object') return raw ?? null;
  const record = { ...(raw as Record<string, unknown>) };
  if (record.activadas !== true) {
    delete record.grupos;
    delete record.activadas;
  }
  if (Object.keys(record).length === 0) return null;
  return record;
}

export function sanitizeCartLineSelection(raw: unknown, allowCombination = true): CartLineSelection {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const row = raw as Record<string, unknown>;
  const tamanoId = (row.tamanoId ?? '').toString().trim().slice(0, 64);
  const tamanoLabel = (row.tamanoLabel ?? '').toString().trim().slice(0, 120);
  const ajusteIds = Array.isArray(row.ajusteIds)
    ? row.ajusteIds.map((entry) => `${entry ?? ''}`.trim()).filter(Boolean).slice(0, 24)
    : [];
  const grupos: Record<string, string[]> = {};
  if (row.grupos && typeof row.grupos === 'object' && !Array.isArray(row.grupos)) {
    for (const [groupId, value] of Object.entries(row.grupos as Record<string, unknown>).slice(0, 30)) {
      if (!OPTION_ID_PATTERN.test(groupId) || !Array.isArray(value)) continue;
      const ids = value
        .map((entry) => `${entry ?? ''}`.trim())
        .filter((entry) => OPTION_ID_PATTERN.test(entry))
        .slice(0, 50);
      if (ids.length > 0) grupos[groupId] = ids;
    }
  }
  const textos = sanitizeFreeTexts(row.textos, grupos);
  const exclusionesIds = Array.isArray(row.exclusionesIds)
    ? [...new Set(row.exclusionesIds.filter((id): id is string => typeof id === 'string' && OPTION_ID_PATTERN.test(id)))].slice(0, 50)
    : [];
  const combination = row.combinacion && typeof row.combinacion === 'object'
    ? row.combinacion as Record<string, unknown> : null;
  const combinacion = allowCombination && typeof combination?.productId === 'string' && OPTION_ID_PATTERN.test(combination.productId)
    ? { productId: combination.productId, seleccion: sanitizeCartLineSelection(combination.seleccion, false) }
    : undefined;
  return {
    ...(tamanoId ? { tamanoId } : {}),
    ...(tamanoLabel ? { tamanoLabel } : {}),
    ...(row.servicioAdicional === true ? { servicioAdicional: true } : {}),
    ...(ajusteIds.length > 0 ? { ajusteIds } : {}),
    ...(Object.keys(grupos).length > 0 ? { grupos } : {}),
    ...(textos ? { textos } : {}),
    ...(exclusionesIds.length ? { exclusionesIds } : {}),
    ...(combinacion ? { combinacion } : {}),
  };
}

function sanitizeFreeTexts(raw: unknown, grupos: Record<string, string[]>) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const textos: Record<string, Record<string, string>> = {};
  for (const [groupId, value] of Object.entries(raw as Record<string, unknown>).slice(0, 30)) {
    if (!OPTION_ID_PATTERN.test(groupId) || !value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const allowed = new Set(grupos[groupId] ?? []);
    const byOption: Record<string, string> = {};
    for (const [optionId, textRaw] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      if (!OPTION_ID_PATTERN.test(optionId) || !allowed.has(optionId)) continue;
      const text = sanitizeFreeText(textRaw);
      if (text) byOption[optionId] = text;
    }
    if (Object.keys(byOption).length > 0) textos[groupId] = byOption;
  }
  return Object.keys(textos).length > 0 ? textos : undefined;
}

function encodeGroupSelection(grupos: CartLineSelection['grupos']) {
  if (!grupos) return '';
  return Object.keys(grupos)
    .filter((groupId) => (grupos[groupId]?.length ?? 0) > 0)
    .sort()
    .map((groupId) => `${groupId}=${[...grupos[groupId]].sort().join('|')}`)
    .join(';');
}

function encodeFreeTexts(textos: CartLineSelection['textos']) {
  if (!textos) return '';
  return Object.keys(textos)
    .sort()
    .flatMap((groupId) =>
      Object.keys(textos[groupId] ?? {})
        .sort()
        .map((optionId) => {
          const text = sanitizeFreeText(textos[groupId]?.[optionId]);
          if (!text || !OPTION_ID_PATTERN.test(groupId) || !OPTION_ID_PATTERN.test(optionId)) {
            return '';
          }
          return `${groupId}~${optionId}=${encodeURIComponent(text)}`;
        }),
    )
    .filter(Boolean)
    .join(';');
}

function decodeFreeTexts(raw: string): CartLineSelection['textos'] {
  const textos: Record<string, Record<string, string>> = {};
  for (const chunk of raw.split(';')) {
    const eq = chunk.indexOf('=');
    if (eq < 0) continue;
    const [groupId = '', optionId = ''] = chunk.slice(0, eq).split('~');
    let decoded = chunk.slice(eq + 1);
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // Keep the raw value when the cart key is malformed.
    }
    const text = sanitizeFreeText(decoded);
    if (!OPTION_ID_PATTERN.test(groupId) || !OPTION_ID_PATTERN.test(optionId) || !text) continue;
    textos[groupId] = { ...textos[groupId], [optionId]: text };
  }
  return Object.keys(textos).length > 0 ? textos : undefined;
}

function decodeGroupSelection(raw: string): CartLineSelection['grupos'] {
  const grupos: Record<string, string[]> = {};
  for (const chunk of raw.split(';')) {
    const [groupId = '', idsRaw = ''] = chunk.split('=');
    if (!OPTION_ID_PATTERN.test(groupId)) continue;
    const ids = idsRaw.split('|').filter((entry) => OPTION_ID_PATTERN.test(entry));
    if (ids.length > 0) grupos[groupId] = ids;
  }
  return Object.keys(grupos).length > 0 ? grupos : undefined;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function parseCategoryMenuOptions(raw: unknown): CategoryMenuOptions | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  const servicioRaw = record.servicio_adicional;
  if (!servicioRaw || typeof servicioRaw !== 'object') return null;

  const servicio = servicioRaw as Record<string, unknown>;
  const preciosRaw = servicio.precios_por_tamano;
  const precios_por_tamano: Record<string, number> = {};

  if (preciosRaw && typeof preciosRaw === 'object') {
    for (const [key, value] of Object.entries(preciosRaw)) {
      const normalizedKey = key.trim().toLowerCase();
      const precio = toNumber(value);
      if (!normalizedKey || precio === null || precio < 0) continue;
      precios_por_tamano[normalizedKey] = precio;
    }
  }

  if (Object.keys(precios_por_tamano).length === 0) {
    return null;
  }

  return {
    servicio_adicional: {
      label: (servicio.label ?? 'Servicio adicional').toString().trim() || 'Servicio adicional',
      precios_por_tamano,
    },
  };
}

export function productRequiresConfiguration(product: ProductLike, category?: CategoryLike | null, includeCombination = true, includeRemovals = true) {
  const options = parseProductMenuOptions(product.opciones_menu);
  const categoryOptions = parseCategoryMenuOptions(category?.opciones_menu ?? null);
  const hasSizes = (options?.tamanos?.length ?? 0) > 0;
  const hasAdjustments = (options?.ajustes?.length ?? 0) > 0;
  const hasGroups = (options?.grupos?.length ?? 0) > 0;
  const hasCategoryAddon = Boolean(categoryOptions?.servicio_adicional?.precios_por_tamano);
  return hasSizes || hasAdjustments || hasGroups || hasCategoryAddon || (includeRemovals && Boolean(options?.personalizacion?.exclusiones)) ||
    (includeCombination && Boolean(options?.personalizacion?.combinacion));
}

function sumCheapest(prices: number[], count: number) {
  return [...prices].sort((a, b) => a - b).slice(0, count).reduce((sum, value) => sum + value, 0);
}

function sumPriciest(prices: number[], count: number) {
  return [...prices].sort((a, b) => b - a).slice(0, count).reduce((sum, value) => sum + value, 0);
}

function getProductBaseMinimumPrice(options: ProductMenuOptions | null, product: ProductLike) {
  const sizePrices = (options?.tamanos ?? [])
    .map((entry) => entry.precio)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (sizePrices.length > 0) {
    return Math.min(...sizePrices);
  }

  const base = toNumber(product.precio);
  return base !== null && base > 0 ? base : 0;
}

/** Cheapest valid configuration: base plus the cheapest required group picks. */
export function getProductMinimumPrice(product: ProductLike) {
  const options = parseProductMenuOptions(product.opciones_menu);
  const requiredExtra = (options?.grupos ?? []).reduce(
    (sum, group) =>
      sum + sumCheapest(group.opciones.map((option) => optionPriceRange(option).min), group.min),
    0,
  );
  return roundMoney(getProductBaseMinimumPrice(options, product) + requiredExtra);
}

export function getProductMaximumPrice(product: ProductLike) {
  const options = parseProductMenuOptions(product.opciones_menu);
  const sizePrices = (options?.tamanos ?? [])
    .map((entry) => entry.precio)
    .filter((value) => Number.isFinite(value) && value > 0);
  const groupExtra = (options?.grupos ?? []).reduce(
    (sum, group) =>
      sum + sumPriciest(group.opciones.map((option) => optionPriceRange(option).max), group.max),
    0,
  );

  if (sizePrices.length > 0) {
    return roundMoney(Math.max(...sizePrices) + groupExtra);
  }

  return roundMoney(getProductMinimumPrice(product) + groupExtra);
}

export function formatProductPriceLabel(product: ProductLike, formatPrice: (amount: number) => string) {
  const minPrice = getProductMinimumPrice(product);
  const maxPrice = getProductMaximumPrice(product);

  if (minPrice <= 0) {
    return 'Consultar';
  }

  if (maxPrice > minPrice) {
    return `Desde ${formatPrice(minPrice)}`;
  }

  return formatPrice(minPrice);
}

export function buildCartLineKey(productId: string, selection: CartLineSelection) {
  const tamanoId = (selection.tamanoId ?? '').trim();
  const ajusteIds = [...(selection.ajusteIds ?? [])].sort().join(',');
  const servicio = selection.servicioAdicional ? '1' : '0';
  const base = `${productId}::${tamanoId}::${servicio}::${ajusteIds}`;
  const grupos = encodeGroupSelection(selection.grupos);
  const textos = encodeFreeTexts(selection.textos);
  if (selection.combinacion || selection.exclusionesIds?.length) {
    const clean = sanitizeCartLineSelection(selection);
    const extra = { exclusionesIds: clean.exclusionesIds?.slice().sort(), combinacion: clean.combinacion };
    return `${base}::${grupos}::${textos}::${encodeURIComponent(JSON.stringify(extra))}`;
  }
  if (textos) return `${base}::${grupos}::${textos}`;
  // Keys without groups keep the legacy 4-segment shape.
  return grupos ? `${base}::${grupos}` : base;
}

export function parseCartLineKey(key: string): { productId: string; selection: CartLineSelection } {
  if (!key.includes('::')) {
    return { productId: key, selection: {} };
  }

  const [productId = '', tamanoId = '', servicio = '0', ajusteIdsRaw = '', gruposRaw = '', textosRaw = '', customRaw = ''] =
    key.split('::');
  let customization: CartLineSelection = {};
  if (customRaw) {
    try { customization = sanitizeCartLineSelection(JSON.parse(decodeURIComponent(customRaw))); } catch { customization = {}; }
  }
  const ajusteIds = ajusteIdsRaw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const grupos = gruposRaw ? decodeGroupSelection(gruposRaw) : undefined;
  const textos = textosRaw ? decodeFreeTexts(textosRaw) : undefined;

  return {
    productId,
    selection: {
      ...(tamanoId ? { tamanoId, tamanoLabel: tamanoId } : {}),
      servicioAdicional: servicio === '1',
      ...(ajusteIds.length > 0 ? { ajusteIds } : {}),
      ...(grupos ? { grupos } : {}),
      ...(textos ? { textos } : {}),
      ...customization,
    },
  };
}

export function resolveCartLineUnitPrice(
  product: ProductLike,
  category: CategoryLike | null | undefined,
  selection: CartLineSelection,
) {
  const options = parseProductMenuOptions(product.opciones_menu);
  const categoryOptions = parseCategoryMenuOptions(category?.opciones_menu ?? null);
  let unitPrice = getProductBaseMinimumPrice(options, product);

  if (options?.tamanos?.length) {
    const selectedSize =
      options.tamanos.find((entry) => entry.id === selection.tamanoId) ?? options.tamanos[0];
    unitPrice = selectedSize?.precio ?? unitPrice;
  } else {
    const base = toNumber(product.precio);
    if (base !== null && base > 0) {
      unitPrice = base;
    }
  }

  for (const ajusteId of selection.ajusteIds ?? []) {
    const ajuste = options?.ajustes?.find((entry) => entry.id === ajusteId);
    if (ajuste) {
      unitPrice += ajuste.precio;
    }
  }

  if (selection.servicioAdicional && categoryOptions?.servicio_adicional?.precios_por_tamano) {
    const tamanoKey = (selection.tamanoId ?? '').trim().toLowerCase();
    const addonPrice = categoryOptions.servicio_adicional.precios_por_tamano[tamanoKey];
    if (typeof addonPrice === 'number' && addonPrice >= 0) {
      unitPrice += addonPrice;
    }
  }

  for (const { option } of resolveSelectedGroupChoices(options, selection)) {
    unitPrice += resolveOptionPrice(option, selection);
  }

  return roundMoney(unitPrice);
}

export function validateCustomizationSelection(product: ProductLike, selection: CartLineSelection) {
  const errors = validateOptionGroupSelection(product, selection).map((issue) => issue.message);
  const options = parseProductMenuOptions(product.opciones_menu);
  if (selection.tamanoId && !options?.tamanos?.some((size) => size.id === selection.tamanoId)) errors.push('El tamaño seleccionado no está disponible.');
  if (options?.tamanos?.length && !selection.tamanoId) errors.push('Selecciona un tamaño.');
  if ((selection.ajusteIds ?? []).some((id) => !options?.ajustes?.some((adjustment) => adjustment.id === id))) errors.push('Un ajuste ya no está disponible.');
  const allowed = new Set(options?.personalizacion?.exclusiones?.ingredientes.map((ingredient) => ingredient.id) ?? []);
  if ((selection.exclusionesIds ?? []).some((id) => !allowed.has(id))) errors.push('Un ingrediente no se puede quitar.');
  return errors;
}

function sameLabel(a: string, b: string) {
  return normalizeLabel(a) === normalizeLabel(b);
}

function normalizeLabel(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

/**
 * Selection for the second product of a combination, which the shopper does not configure: each
 * required choice mirrors the option with the same name picked for the first product (Grande →
 * Grande), else its default, else its first option. Optional groups, extras and removals stay empty.
 */
export function autoPartnerSelection(product: ProductLike, selection: CartLineSelection, partner: ProductLike): CartLineSelection {
  const own = parseProductMenuOptions(product.opciones_menu);
  const options = parseProductMenuOptions(partner.opciones_menu);
  const result: CartLineSelection = {};
  if (options?.tamanos?.length) {
    const picked = own?.tamanos?.find((size) => size.id === selection.tamanoId);
    const size = (picked && options.tamanos.find((entry) => sameLabel(entry.label, picked.label))) ?? options.tamanos[0];
    result.tamanoId = size.id;
    result.tamanoLabel = size.label;
  }
  const pickedNames = (own?.grupos ?? []).flatMap((group) =>
    (selection.grupos?.[group.id] ?? []).flatMap((id) => {
      const option = group.opciones.find((entry) => entry.id === id);
      return option ? [{ group: group.nombre, option: option.nombre }] : [];
    }));
  const defaults = defaultGroupSelections(options?.grupos);
  const grupos: Record<string, string[]> = {};
  for (const group of options?.grupos ?? []) {
    if (group.min <= 0 || group.opciones.length === 0) continue;
    const sameGroup = pickedNames.filter((entry) => sameLabel(entry.group, group.nombre));
    const pool = sameGroup.length ? sameGroup : pickedNames;
    const mirrored = group.opciones.filter((option) => pool.some((entry) => sameLabel(entry.option, option.nombre)));
    const listed = group.opciones.filter((option) => !option.textoLibre);
    const fallback = (defaults[group.id] ?? []).length
      ? defaults[group.id]
      : (listed.length ? listed : group.opciones).map((option) => option.id);
    const ids = mirrored.length ? mirrored.map((option) => option.id) : fallback;
    grupos[group.id] = ids.slice(0, group.tipo === 'unica' || group.max <= 1 ? 1 : group.min);
  }
  if (Object.keys(grupos).length) result.grupos = grupos;
  return result;
}

export function resolveCombinedUnitPrice(
  product: ProductLike, category: CategoryLike | null | undefined, selection: CartLineSelection,
  partner?: ProductLike | null, partnerCategory?: CategoryLike | null,
) {
  const first = resolveCartLineUnitPrice(product, category, selection);
  return selection.combinacion && partner
    ? Math.max(first, resolveCartLineUnitPrice(partner, partnerCategory, selection.combinacion.seleccion))
    : first;
}

/**
 * Central price engine: base + selected options after applying dependency
 * rules. Same snapshot the order API freezes.
 */
export function calculateProductPrice(
  product: ProductLike,
  selection: CartLineSelection,
  category?: CategoryLike | null,
) {
  const snapshot = buildOrderLineSnapshot(product, category, selection);
  return {
    precioBase: snapshot.precioBase,
    selecciones: snapshot.selecciones,
    precioFinal: snapshot.precioFinal,
  };
}

export const COMBINATION_TITLE_PREFIX = '(Combinación)';

function productName(product: ProductLike) {
  return (product.nombre ?? '').toString().trim() || 'Producto';
}

/** "(Combinación) A + B" for lines that combine two products. */
export function combinedLineTitle(product: ProductLike, partner: ProductLike) {
  return `${COMBINATION_TITLE_PREFIX} ${productName(product)} + ${productName(partner)}`;
}

/**
 * Details of a combined line as one merged list, same wording as the merchant comanda:
 * "Tamaños: Grande", "Extras: Añadir extra (piña)", "Sin: Cebolla".
 */
function combinedLineDetails(
  product: ProductLike, selection: CartLineSelection, category: CategoryLike | null | undefined,
  partner: ProductLike, partnerSelection: CartLineSelection, partnerCategory: CategoryLike | null | undefined,
) {
  const byGroup = new Map<string, string[]>();
  const add = (group: string, label: string) => {
    const labels = byGroup.get(group) ?? [];
    if (!labels.includes(label)) byGroup.set(group, [...labels, label]);
  };
  const removedByProduct: string[][] = [];
  for (const [entry, picked, entryCategory] of [
    [product, selection, category], [partner, partnerSelection, partnerCategory],
  ] as const) {
    const options = parseProductMenuOptions(entry.opciones_menu);
    const size = options?.tamanos?.find((item) => item.id === picked.tamanoId)?.label ?? picked.tamanoLabel;
    if (size) add('Tamaño', String(size));
    for (const ajusteId of picked.ajusteIds ?? []) {
      const ajuste = options?.ajustes?.find((item) => item.id === ajusteId);
      if (ajuste?.label) add('', ajuste.label);
    }
    if (picked.servicioAdicional) {
      add('', parseCategoryMenuOptions(entryCategory?.opciones_menu ?? null)?.servicio_adicional?.label ?? 'Servicio adicional');
    }
    for (const { group, option } of resolveSelectedGroupChoices(options, picked)) {
      add(group.nombre, getOptionDisplayName(option, picked, group.id));
    }
    removedByProduct.push((options?.personalizacion?.exclusiones?.ingredientes ?? [])
      .filter((ingredient) => picked.exclusionesIds?.includes(ingredient.id))
      .map((ingredient) => ingredient.nombre));
  }
  const lines = [...byGroup].map(([group, labels]) => `${group ? `${group}: ` : ''}${labels.join(', ')}`);
  const both = removedByProduct.every((removed) => removed.length > 0);
  const removed = both
    ? removedByProduct.map((entries, index) => `${entries.join(', ')} (${productName(index === 0 ? product : partner)})`)
    : removedByProduct.flat();
  if (removed.length) lines.push(`Sin: ${removed.join(', ')}`);
  return lines;
}

export function buildOrderLineLabel(
  product: ProductLike,
  selection: CartLineSelection,
  category?: CategoryLike | null,
  partner?: ProductLike | null,
) {
  if (selection.combinacion && partner) return combinedLineTitle(product, partner);
  const parts = [productName(product)];
  const options = parseProductMenuOptions(product.opciones_menu);
  const categoryOptions = parseCategoryMenuOptions(category?.opciones_menu ?? null);

  if (selection.tamanoLabel || selection.tamanoId) {
    const sizeLabel =
      options?.tamanos?.find((entry) => entry.id === selection.tamanoId)?.label ??
      selection.tamanoLabel ??
      selection.tamanoId;
    if (sizeLabel) {
      parts.push(String(sizeLabel));
    }
  }

  for (const ajusteId of selection.ajusteIds ?? []) {
    const ajuste = options?.ajustes?.find((entry) => entry.id === ajusteId);
    if (ajuste?.label) {
      parts.push(ajuste.label);
    }
  }

  if (selection.servicioAdicional) {
    parts.push(categoryOptions?.servicio_adicional?.label ?? 'Servicio adicional');
  }

  for (const { group, option } of resolveSelectedGroupChoices(options, selection)) {
    parts.push(getOptionDisplayName(option, selection, group.id));
  }

  return parts.join(' · ');
}

export function summarizeCartLineSelection(
  product: ProductLike,
  selection: CartLineSelection,
  category?: CategoryLike | null,
  partner?: ProductLike | null,
  partnerCategory?: CategoryLike | null,
) {
  const options = parseProductMenuOptions(product.opciones_menu);
  const categoryOptions = parseCategoryMenuOptions(category?.opciones_menu ?? null);
  const chunks: string[] = [];

  const sizeLabel =
    options?.tamanos?.find((entry) => entry.id === selection.tamanoId)?.label ??
    selection.tamanoLabel;
  if (sizeLabel) {
    chunks.push(String(sizeLabel));
  }

  for (const ajusteId of selection.ajusteIds ?? []) {
    const ajuste = options?.ajustes?.find((entry) => entry.id === ajusteId);
    if (ajuste?.label) {
      chunks.push(ajuste.label);
    }
  }

  if (selection.servicioAdicional) {
    chunks.push(categoryOptions?.servicio_adicional?.label ?? 'Servicio adicional');
  }

  for (const { group, option } of resolveSelectedGroupChoices(options, selection)) {
    chunks.push(getOptionDisplayName(option, selection, group.id));
  }
  for (const ingredient of options?.personalizacion?.exclusiones?.ingredientes ?? []) {
    if (selection.exclusionesIds?.includes(ingredient.id)) chunks.push(`Sin ${ingredient.nombre}`);
  }

  if (selection.combinacion && partner) {
    return combinedLineDetails(product, selection, category, partner, selection.combinacion.seleccion, partnerCategory).join(' · ');
  }
  return chunks.join(' · ');
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replaceAll(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
