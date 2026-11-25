export type BusinessOrderRow = {
  id: string;
  /** Short ref for chat actions (first 8 of uuid). */
  shortId: string;
  estado: string;
  total: number | null;
  currency: string;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string | null;
  whenLabel: string;
};

export type BusinessOrdersView = {
  title: string;
  filter: 'all' | 'pending' | 'today';
  currency: string;
  orders: BusinessOrderRow[];
};

export type BusinessMetricsView = {
  title: string;
  currency: string;
  ordersToday: number;
  salesToday: number;
  customersToday: number;
  avgTicket: number | null;
  focus: 'all' | 'sales' | 'customers' | 'orders';
};

export type BusinessCustomersView = {
  title: string;
  scopeLabel: string;
  customers: Array<{ name: string; orders: number; lastTotal: number | null }>;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 16).replace('T', ' ');
  }
}

export function buildOrdersView(params: {
  shopName: string;
  currency: string | null;
  filter: 'all' | 'pending' | 'today';
  rows: Array<Record<string, unknown>>;
}): BusinessOrdersView {
  const currency = (params.currency || 'USD').toUpperCase();
  const title =
    params.filter === 'pending'
      ? `Pendientes · ${params.shopName}`
      : params.filter === 'today'
        ? `Pedidos de hoy · ${params.shopName}`
        : `Pedidos recientes · ${params.shopName}`;

  const orders: BusinessOrderRow[] = params.rows.map((o) => {
    const id = String(o.id || '');
    const totalN = Number(o.total);
    return {
      id,
      shortId: id.replace(/-/g, '').slice(0, 8) || id.slice(0, 8),
      estado: String(o.estado || '—'),
      total: Number.isFinite(totalN) ? totalN : null,
      currency,
      customerName: String(o.nombre_cliente || '').trim() || null,
      customerPhone: String(o.telefono_cliente || '').trim() || null,
      createdAt: o.created_at != null ? String(o.created_at) : null,
      whenLabel: formatWhen(o.created_at != null ? String(o.created_at) : null),
    };
  });

  return { title, filter: params.filter, currency, orders };
}

export function buildMetricsView(params: {
  shopName: string;
  currency: string | null;
  ordersToday: number;
  salesToday: number;
  customersToday: number;
  focus?: BusinessMetricsView['focus'];
}): BusinessMetricsView {
  const orders = params.ordersToday;
  return {
    title: `Resumen de hoy · ${params.shopName}`,
    currency: (params.currency || 'USD').toUpperCase(),
    ordersToday: orders,
    salesToday: params.salesToday,
    customersToday: params.customersToday,
    avgTicket: orders > 0 ? params.salesToday / orders : null,
    focus: params.focus || 'all',
  };
}

export function buildCustomersView(params: {
  shopName: string;
  scopeLabel: string;
  rows: Array<{ nombre_cliente?: unknown; total?: unknown }>;
}): BusinessCustomersView {
  const map = new Map<string, { name: string; orders: number; lastTotal: number | null }>();
  for (const o of params.rows) {
    const name = String(o.nombre_cliente || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const totalN = Number(o.total);
    const prev = map.get(key);
    if (prev) {
      prev.orders += 1;
      if (Number.isFinite(totalN)) prev.lastTotal = totalN;
    } else {
      map.set(key, {
        name,
        orders: 1,
        lastTotal: Number.isFinite(totalN) ? totalN : null,
      });
    }
  }
  const customers = [...map.values()].sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name));
  return {
    title: `Clientes · ${params.shopName}`,
    scopeLabel: params.scopeLabel,
    customers,
  };
}

/** Friendly hours text — never dump raw JSON into the bubble. */
export function formatHoursForChat(horarios: unknown): string {
  if (horarios == null || horarios === '') return 'Sin horario cargado todavía.';
  if (typeof horarios === 'string') {
    const t = horarios.trim();
    if (!t) return 'Sin horario cargado todavía.';
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return formatHoursForChat(JSON.parse(t));
      } catch {
        return t;
      }
    }
    return t;
  }
  if (typeof horarios === 'object' && horarios !== null) {
    const obj = horarios as Record<string, unknown>;
    // Flutter BusinessSchedule: { timezone, days: { monday: { open, ranges } } }
    const daysObj =
      obj.days && typeof obj.days === 'object'
        ? (obj.days as Record<string, unknown>)
        : null;
    if (daysObj) {
      const labels: Record<string, string> = {
        monday: 'Lunes',
        tuesday: 'Martes',
        wednesday: 'Miércoles',
        thursday: 'Jueves',
        friday: 'Viernes',
        saturday: 'Sábado',
        sunday: 'Domingo',
      };
      const lines: string[] = [];
      for (const key of Object.keys(labels)) {
        const day = daysObj[key];
        if (!day || typeof day !== 'object') continue;
        const row = day as Record<string, unknown>;
        const ranges = Array.isArray(row.ranges) ? row.ranges : [];
        if (row.open === true && ranges.length) {
          const parts = ranges
            .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
            .map((r) => `${r.start ?? '?'}–${r.end ?? '?'}`);
          if (parts.length) lines.push(`• ${labels[key]}: ${parts.join(', ')}`);
        } else {
          lines.push(`• ${labels[key]}: cerrado`);
        }
      }
      if (lines.some((l) => !l.includes('cerrado'))) return lines.join('\n');
    }
    if (typeof obj.note === 'string' && obj.note.trim()) return obj.note.trim();
    const days = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
    const lines: string[] = [];
    for (const d of days) {
      const v = obj[d] ?? obj[d.toUpperCase()];
      if (v == null) continue;
      if (typeof v === 'string' && v.trim()) lines.push(`• ${d}: ${v.trim()}`);
      else if (typeof v === 'object' && v !== null) {
        const row = v as Record<string, unknown>;
        const open = row.open ?? row.abre ?? row.from;
        const close = row.close ?? row.cierra ?? row.to;
        if (open != null && close != null) lines.push(`• ${d}: ${open}–${close}`);
      }
    }
    if (lines.length) return lines.join('\n');
    // Last resort: compact key=value, no pretty-indent dump.
    const compact = Object.entries(obj)
      .filter(([k]) => !['updatedVia', 'updatedAt', 'sourceText', 'timezone', 'days'].includes(k))
      .map(([k, v]) => `• ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .slice(0, 12);
    return compact.length ? compact.join('\n') : 'Sin horario legible todavía.';
  }
  return String(horarios);
}
