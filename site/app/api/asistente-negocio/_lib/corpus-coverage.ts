import corpus250 from './corpus-250.json';
import {
  parseBusinessIntent,
  parseBusinessIntents,
  type BusinessIntent,
} from './intents';

export type CorpusItem = {
  id: number;
  text: string;
  tag: string;
};

export type CoverageLevel = 'covered' | 'partial' | 'gap';

export type CorpusEvalRow = {
  id: number;
  text: string;
  tag: string;
  intentKind: string;
  level: CoverageLevel;
  tool: string;
  risk: 'A' | 'B' | 'C';
};

/** Tag → primary tools available today (rules + existing APIs). */
export const TAG_TOOL_MAP: Record<
  string,
  { expectedKinds: string[]; tool: string; risk: 'A' | 'B' | 'C'; defaultLevel: CoverageLevel }
> = {
  menu: {
    expectedKinds: ['list_menu'],
    tool: 'listMenu + menuView',
    risk: 'A',
    defaultLevel: 'covered',
  },
  precio: {
    expectedKinds: ['propose_price'],
    tool: 'proposePrice + confirm',
    risk: 'B',
    defaultLevel: 'covered',
  },
  stock: {
    expectedKinds: ['propose_availability'],
    tool: 'proposeAvailability + confirm',
    risk: 'B',
    defaultLevel: 'covered',
  },
  foto: {
    expectedKinds: ['change_image'],
    tool: 'guideChangeImage',
    risk: 'B',
    defaultLevel: 'partial',
  },
  producto_nuevo: {
    expectedKinds: ['add_product'],
    tool: 'add_product guide (no write yet)',
    risk: 'B',
    defaultLevel: 'partial',
  },
  horario: {
    expectedKinds: ['read_hours', 'propose_hours'],
    tool: 'readHours / proposeHours',
    risk: 'B',
    defaultLevel: 'covered',
  },
  abrir_cerrar: {
    expectedKinds: ['propose_en_linea'],
    tool: 'proposeEnLinea + confirm',
    risk: 'B',
    defaultLevel: 'covered',
  },
  tasa: {
    expectedKinds: ['currency'],
    tool: 'currency read (+ guide)',
    risk: 'A',
    defaultLevel: 'partial',
  },
  pedidos: {
    expectedKinds: ['recent_orders', 'order_detail'],
    tool: 'recentOrders / readOrderDetail + ordersView',
    risk: 'A',
    defaultLevel: 'covered',
  },
  clientes: {
    expectedKinds: ['customers', 'home_metrics'],
    tool: 'listCustomers / readHomeMetrics',
    risk: 'A',
    defaultLevel: 'covered',
  },
  metricas: {
    expectedKinds: ['home_metrics'],
    tool: 'readHomeMetrics + metricsView',
    risk: 'A',
    defaultLevel: 'partial',
  },
  membresia: {
    expectedKinds: ['membership'],
    tool: 'readMembership',
    risk: 'A',
    defaultLevel: 'covered',
  },
  cuenta: {
    expectedKinds: ['account'],
    tool: 'BusinessAccountCard',
    risk: 'C',
    defaultLevel: 'covered',
  },
  negocio: {
    expectedKinds: ['register', 'select_comercio'],
    tool: 'register / select_comercio guide',
    risk: 'B',
    defaultLevel: 'partial',
  },
  operacion: {
    expectedKinds: ['share_menu'],
    tool: 'shareMenuLink (slug)',
    risk: 'A',
    defaultLevel: 'partial',
  },
  pagos_cobros: {
    expectedKinds: [],
    tool: '— (no API)',
    risk: 'C',
    defaultLevel: 'gap',
  },
  marketing: {
    expectedKinds: [],
    tool: '— (no API)',
    risk: 'B',
    defaultLevel: 'gap',
  },
  errores: {
    expectedKinds: ['help', 'escalate_human'],
    tool: 'help / escalate when stuck',
    risk: 'A',
    defaultLevel: 'partial',
  },
  seguridad_limites: {
    expectedKinds: ['refuse_sensitive'],
    tool: 'refuseSensitive copy',
    risk: 'C',
    defaultLevel: 'covered',
  },
  humano: {
    expectedKinds: ['escalate_human'],
    tool: 'escalateBusinessAssistantToHuman',
    risk: 'C',
    defaultLevel: 'covered',
  },
  ambiguo: {
    expectedKinds: ['help', 'cancel_confirm', 'confirm_apply'],
    tool: 'help / Gemini lane',
    risk: 'A',
    defaultLevel: 'partial',
  },
  multi: {
    expectedKinds: ['multi'],
    tool: 'parseMultiBusinessIntents (≤2 safe)',
    risk: 'B',
    defaultLevel: 'partial',
  },
};

export function loadCorpus250(): CorpusItem[] {
  return corpus250 as CorpusItem[];
}

export function classifyCorpusItem(
  item: CorpusItem,
  intent?: BusinessIntent,
): CorpusEvalRow {
  const meta = TAG_TOOL_MAP[item.tag] || {
    expectedKinds: [],
    tool: 'unknown',
    risk: 'A' as const,
    defaultLevel: 'gap' as const,
  };

  if (item.tag === 'multi') {
    const intents = parseBusinessIntents(item.text);
    const kinds = intents.map((i) => i.kind).join('+');
    const concrete = intents.filter((i) => i.kind !== 'help' && i.kind !== 'chat');
    return {
      id: item.id,
      text: item.text,
      tag: item.tag,
      intentKind: kinds || 'help',
      level: concrete.length >= 2 ? 'partial' : concrete.length === 1 ? 'partial' : 'gap',
      tool: meta.tool,
      risk: meta.risk,
    };
  }

  const resolved = intent || parseBusinessIntent(item.text);
  const kind = resolved.kind;
  let level: CoverageLevel = meta.defaultLevel;

  if (item.tag === 'seguridad_limites') {
    level = kind === 'refuse_sensitive' ? 'covered' : 'gap';
  } else if (item.tag === 'humano') {
    level = kind === 'escalate_human' ? 'covered' : 'gap';
  } else if (meta.expectedKinds.length === 0) {
    level = 'gap';
  } else if (meta.expectedKinds.includes(kind)) {
    level = meta.defaultLevel === 'gap' ? 'covered' : meta.defaultLevel;
  } else if (kind === 'help' || kind === 'chat') {
    level = meta.defaultLevel === 'covered' ? 'gap' : 'gap';
  } else {
    // Matched some other concrete intent — partial credit if related family.
    level = 'partial';
  }

  return {
    id: item.id,
    text: item.text,
    tag: item.tag,
    intentKind: kind,
    level,
    tool: meta.tool,
    risk: meta.risk,
  };
}

export function summarizeCorpusCoverage(rows: CorpusEvalRow[]) {
  const byTag: Record<string, { covered: number; partial: number; gap: number; total: number }> =
    {};
  let covered = 0;
  let partial = 0;
  let gap = 0;
  for (const r of rows) {
    const bucket = byTag[r.tag] || { covered: 0, partial: 0, gap: 0, total: 0 };
    bucket.total += 1;
    bucket[r.level] += 1;
    byTag[r.tag] = bucket;
    if (r.level === 'covered') covered += 1;
    else if (r.level === 'partial') partial += 1;
    else gap += 1;
  }
  return {
    total: rows.length,
    covered,
    partial,
    gap,
    byTag,
  };
}

export function evaluateCorpus250() {
  const items = loadCorpus250();
  const rows = items.map((item) => classifyCorpusItem(item));
  return { rows, summary: summarizeCorpusCoverage(rows) };
}
