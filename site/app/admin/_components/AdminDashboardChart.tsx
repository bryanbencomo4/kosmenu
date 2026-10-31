'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';

import { formatAdminMoney } from '../_lib/admin-money';
import { AdminFilterBar, AdminFilterSelect } from './AdminFilterSelect';

type ChartCurrencyPoint = {
  currency: string;
  amount: number;
  count: number;
};

type ChartPoint = {
  label: string;
  key?: string;
  from?: string;
  to?: string;
  orders: number;
  byCurrency: ChartCurrencyPoint[];
  usdEstimate: number;
  usdCoveredOrders: number;
};

type ChartRange = '24h' | '7d' | '30d' | '90d';
type CurrencyFilter = 'all' | 'usd_estimate' | string;

const RANGE_OPTIONS: Array<{ value: ChartRange; label: string }> = [
  { value: '24h', label: '24 horas' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
];

const CURRENCY_COLORS: Record<string, string> = {
  USD: '#059669',
  EUR: '#db2777',
  COP: '#2563eb',
  VES: '#d97706',
};

const USD_ESTIMATE_COLOR = '#7c3aed';
const ORDERS_BAR_COLOR = 'rgba(167,139,250,0.28)';

const SVG_WIDTH = 720;
/** Mas baja: en pantallas anchas el aspect ratio no come media viewport. */
const SVG_HEIGHT = 220;
const PLOT_LEFT = 36;
const PLOT_RIGHT = 20;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 30;
const PLOT_WIDTH = SVG_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const PLOT_HEIGHT = SVG_HEIGHT - PLOT_TOP - PLOT_BOTTOM;

function colorForCurrency(code: string) {
  return CURRENCY_COLORS[code] ?? '#64748b';
}

function seriesMax(values: number[]) {
  return Math.max(...values, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type AdminDashboardChartProps = {
  initialData: readonly ChartPoint[];
  initialCurrencies?: string[];
};

type ViewWindow = {
  start: number;
  end: number;
};

export function AdminDashboardChart({
  initialData,
  initialCurrencies = [],
}: AdminDashboardChartProps) {
  const router = useRouter();
  const [range, setRange] = useState<ChartRange>('7d');
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>('all');
  const [data, setData] = useState<ChartPoint[]>(() => [...initialData]);
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>(
    () =>
      initialCurrencies.length > 0
        ? initialCurrencies
        : Array.from(
            new Set(initialData.flatMap((entry) => entry.byCurrency.map((row) => row.currency))),
          ),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [view, setView] = useState<ViewWindow>({ start: 0, end: Math.max(0, initialData.length - 1) });
  const [isDragging, setIsDragging] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startView: ViewWindow;
    moved: boolean;
    isTouch: boolean;
  } | null>(null);
  const hoverIndexRef = useRef<number | null>(null);
  const dataRef = useRef(data);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const chartShellRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef(view);
  const dataLenRef = useRef(initialData.length);
  const isZoomedRef = useRef(false);
  const visibleMetaRef = useRef({
    count: 0,
    start: 0,
    end: 0,
    absoluteIndexes: [] as number[],
  });

  useEffect(() => {
    hoverIndexRef.current = hoverIndex;
  }, [hoverIndex]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    dataLenRef.current = data.length;
  }, [data.length]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(pointer: coarse)');
    const sync = () => setIsCoarsePointer(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const resetView = useCallback((points: ChartPoint[]) => {
    setView({ start: 0, end: Math.max(0, points.length - 1) });
    setHoverIndex(null);
  }, []);

  const load = useCallback(
    async (nextRange: ChartRange) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/admin/api/dashboard/chart?range=${encodeURIComponent(nextRange)}`,
          { method: 'GET', credentials: 'include', cache: 'no-store' },
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          data?: {
            points: ChartPoint[];
            availableCurrencies: string[];
          };
        };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error ?? 'No se pudo cargar la grafica.');
        }
        setData(payload.data.points);
        setAvailableCurrencies(payload.data.availableCurrencies);
        resetView(payload.data.points);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar la grafica.');
      } finally {
        setLoading(false);
      }
    },
    [resetView],
  );

  useEffect(() => {
    if (range === '7d') return;
    void load(range);
  }, [load, range]);

  useEffect(() => {
    setView((prev) => {
      const max = Math.max(0, data.length - 1);
      if (prev.end > max || prev.start > max) {
        return { start: 0, end: max };
      }
      return prev;
    });
  }, [data.length]);

  const visibleCurrencyCodes = useMemo(() => {
    if (currencyFilter === 'all') return availableCurrencies;
    if (currencyFilter === 'usd_estimate') return [];
    return availableCurrencies.filter((code) => code === currencyFilter);
  }, [availableCurrencies, currencyFilter]);

  const showUsdEstimate =
    currencyFilter === 'all' || currencyFilter === 'usd_estimate';

  const visiblePoints = useMemo(() => {
    if (data.length === 0) return [];
    const start = clamp(Math.floor(view.start), 0, data.length - 1);
    const end = clamp(Math.ceil(view.end), start, data.length - 1);
    return data.slice(start, end + 1).map((point, offset) => ({
      ...point,
      absoluteIndex: start + offset,
    }));
  }, [data, view.end, view.start]);

  useEffect(() => {
    visibleMetaRef.current = {
      count: visiblePoints.length,
      start: view.start,
      end: view.end,
      absoluteIndexes: visiblePoints.map((point) => point.absoluteIndex),
    };
  }, [visiblePoints, view.end, view.start]);

  const visibleCount = visiblePoints.length;
  const stepX = visibleCount > 1 ? PLOT_WIDTH / (visibleCount - 1) : PLOT_WIDTH;

  const xForVisibleIndex = useCallback(
    (visibleIndex: number) => PLOT_LEFT + stepX * visibleIndex,
    [stepX],
  );

  const maxOrders = seriesMax(visiblePoints.map((entry) => entry.orders));
  const barWidth = Math.max(
    6,
    Math.min(26, PLOT_WIDTH / Math.max(visibleCount * 1.7, 1)),
  );

  const amountByVisible = useCallback(
    (currency: string) =>
      visiblePoints.map(
        (entry) =>
          entry.byCurrency.find((row) => row.currency === currency)?.amount ?? 0,
      ),
    [visiblePoints],
  );
  const usdEstimateByVisible = useMemo(
    () => visiblePoints.map((entry) => entry.usdEstimate),
    [visiblePoints],
  );
  const maxUsdEstimate = seriesMax(usdEstimateByVisible);

  const currencyMax = useMemo(() => {
    const map = new Map<string, number>();
    for (const code of visibleCurrencyCodes) {
      map.set(code, seriesMax(amountByVisible(code)));
    }
    return map;
  }, [amountByVisible, visibleCurrencyCodes]);

  function linePoints(values: number[], maxValue: number) {
    return values
      .map((value, index) => {
        const x = xForVisibleIndex(index);
        const y = PLOT_TOP + PLOT_HEIGHT - (value / maxValue) * PLOT_HEIGHT;
        return `${x},${y}`;
      })
      .join(' ');
  }

  const totals = useMemo(() => {
    const byCurrency = new Map<string, { amount: number; count: number }>();
    for (const entry of data) {
      for (const row of entry.byCurrency) {
        const current = byCurrency.get(row.currency) ?? { amount: 0, count: 0 };
        current.amount += row.amount;
        current.count += row.count;
        byCurrency.set(row.currency, current);
      }
    }
    return {
      byCurrency,
      usd: data.reduce((sum, entry) => sum + entry.usdEstimate, 0),
      usdCovered: data.reduce((sum, entry) => sum + entry.usdCoveredOrders, 0),
      orders: data.reduce((sum, entry) => sum + entry.orders, 0),
    };
  }, [data]);

  const clientXToPlotX = useCallback((clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const localX = ((clientX - rect.left) / rect.width) * SVG_WIDTH;
    return localX;
  }, []);

  const plotXToVisibleIndex = useCallback(
    (plotX: number) => {
      if (visibleCount <= 0) return null;
      if (visibleCount === 1) return 0;
      const raw = (plotX - PLOT_LEFT) / stepX;
      return clamp(Math.round(raw), 0, visibleCount - 1);
    },
    [stepX, visibleCount],
  );

  const updateHoverFromClientX = useCallback(
    (clientX: number) => {
      const plotX = clientXToPlotX(clientX);
      if (plotX == null) return;
      if (plotX < PLOT_LEFT || plotX > PLOT_LEFT + PLOT_WIDTH) {
        setHoverIndex(null);
        return;
      }
      const visibleIndex = plotXToVisibleIndex(plotX);
      if (visibleIndex == null) {
        setHoverIndex(null);
        return;
      }
      setHoverIndex(visiblePoints[visibleIndex]?.absoluteIndex ?? null);
    },
    [clientXToPlotX, plotXToVisibleIndex, visiblePoints],
  );

  const openOrdersForPoint = useCallback(
    (point: ChartPoint | null | undefined) => {
      if (!point?.from || !point?.to) return;
      const params = new URLSearchParams();
      params.set('from', point.from);
      params.set('to', point.to);
      params.set('archived', 'active');
      router.push(`/admin/pedidos?${params.toString()}`);
    },
    [router],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (dragRef.current) {
        const dx = event.clientX - dragRef.current.startClientX;
        const isTouch = dragRef.current.isTouch;
        const panThreshold = isTouch ? 18 : 6;

        if (!dragRef.current.moved && Math.abs(dx) >= panThreshold) {
          // En touch sin zoom, el arrastre es scrub (ver montos), no pan.
          if (isTouch && !isZoomedRef.current) {
            updateHoverFromClientX(event.clientX);
            return;
          }
          dragRef.current.moved = true;
          setIsDragging(true);
        }

        if (!dragRef.current.moved) {
          updateHoverFromClientX(event.clientX);
          return;
        }

        // Touch + zoomed: pan, pero sigue mostrando el punto bajo el dedo.
        if (isTouch) {
          updateHoverFromClientX(event.clientX);
        }

        const span =
          dragRef.current.startView.end - dragRef.current.startView.start;
        const indexDelta = visibleCount > 1 ? Math.round((-dx / PLOT_WIDTH) * span) : 0;
        let nextStart = dragRef.current.startView.start + indexDelta;
        let nextEnd = dragRef.current.startView.end + indexDelta;
        if (nextStart < 0) {
          nextEnd -= nextStart;
          nextStart = 0;
        }
        const max = Math.max(0, data.length - 1);
        if (nextEnd > max) {
          const overflow = nextEnd - max;
          nextStart -= overflow;
          nextEnd = max;
          nextStart = Math.max(0, nextStart);
        }
        setView({ start: nextStart, end: nextEnd });
        if (!isTouch) {
          setHoverIndex(null);
        }
        return;
      }
      if (event.pointerType !== 'touch') {
        updateHoverFromClientX(event.clientX);
      }
    },
    [data.length, updateHoverFromClientX, visibleCount],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return;
      // Evita vibración / menú de copiar en iOS/Android.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const isTouch = event.pointerType === 'touch';
      dragRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startView: { ...viewRef.current },
        moved: false,
        isTouch,
      };
      updateHoverFromClientX(event.clientX);
    },
    [updateHoverFromClientX],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      const wasDrag = dragRef.current.moved;
      const wasTouch = dragRef.current.isTouch;
      dragRef.current = null;
      setIsDragging(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }

      // Touch: solo inspecciona; la redireccion va por boton explicito.
      if (wasTouch) {
        return;
      }

      if (wasDrag) return;
      const index = hoverIndexRef.current;
      if (index == null) return;
      openOrdersForPoint(dataRef.current[index]);
    },
    [openOrdersForPoint],
  );

  const applyZoom = useCallback((zoomIn: boolean, anchorAbsolute?: number) => {
    const meta = visibleMetaRef.current;
    const dataLength = dataLenRef.current;
    if (dataLength <= 3 || meta.count <= 0) return;

    const currentView = viewRef.current;
    const span = Math.max(1, currentView.end - currentView.start);
    const nextSpan = zoomIn
      ? Math.max(2, Math.floor(span * 0.75))
      : Math.min(dataLength - 1, Math.ceil(span * 1.35));

    if (nextSpan === span && zoomIn) return;
    if (!zoomIn && currentView.start === 0 && currentView.end >= dataLength - 1) {
      return;
    }

    const anchor =
      anchorAbsolute ??
      hoverIndexRef.current ??
      Math.round((currentView.start + currentView.end) / 2);

    let nextStart =
      anchor - Math.floor(((anchor - currentView.start) * nextSpan) / span);
    let nextEnd = nextStart + nextSpan;
    if (nextStart < 0) {
      nextEnd -= nextStart;
      nextStart = 0;
    }
    if (nextEnd > dataLength - 1) {
      const overflow = nextEnd - (dataLength - 1);
      nextStart = Math.max(0, nextStart - overflow);
      nextEnd = dataLength - 1;
    }
    setView({ start: nextStart, end: nextEnd });
  }, []);

  const panView = useCallback((direction: -1 | 1) => {
    const currentView = viewRef.current;
    const dataLength = dataLenRef.current;
    const span = Math.max(1, currentView.end - currentView.start);
    const step = Math.max(1, Math.round(span * 0.35));
    let nextStart = currentView.start + direction * step;
    let nextEnd = currentView.end + direction * step;
    if (nextStart < 0) {
      nextEnd -= nextStart;
      nextStart = 0;
    }
    if (nextEnd > dataLength - 1) {
      const overflow = nextEnd - (dataLength - 1);
      nextStart = Math.max(0, nextStart - overflow);
      nextEnd = dataLength - 1;
    }
    setView({ start: nextStart, end: nextEnd });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheelNative = (event: WheelEvent) => {
      event.preventDefault();
      const meta = visibleMetaRef.current;
      const dataLength = dataLenRef.current;
      if (dataLength <= 3 || meta.count <= 0) return;

      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return;
      const plotX = ((event.clientX - rect.left) / rect.width) * SVG_WIDTH;
      const step = meta.count > 1 ? PLOT_WIDTH / (meta.count - 1) : PLOT_WIDTH;
      const rawVisible =
        meta.count === 1 ? 0 : clamp(Math.round((plotX - PLOT_LEFT) / step), 0, meta.count - 1);
      const currentView = viewRef.current;
      const anchorAbsolute =
        meta.absoluteIndexes[rawVisible] ??
        Math.round((currentView.start + currentView.end) / 2);

      applyZoom(event.deltaY < 0, anchorAbsolute);
    };

    svg.addEventListener('wheel', onWheelNative, { passive: false });
    return () => svg.removeEventListener('wheel', onWheelNative);
  }, [applyZoom]);

  const hoverVisibleIndex = useMemo(() => {
    if (hoverIndex == null) return null;
    const idx = visiblePoints.findIndex((point) => point.absoluteIndex === hoverIndex);
    return idx >= 0 ? idx : null;
  }, [hoverIndex, visiblePoints]);

  const hoverPoint =
    hoverIndex != null && hoverIndex >= 0 && hoverIndex < data.length
      ? data[hoverIndex]
      : null;

  const hoverX =
    hoverVisibleIndex == null ? null : xForVisibleIndex(hoverVisibleIndex);

  const isZoomed =
    view.start > 0 || view.end < Math.max(0, data.length - 1);
  isZoomedRef.current = isZoomed;

  const rangeTitle =
    RANGE_OPTIONS.find((option) => option.value === range)?.label ?? '7 dias';

  const useDockedInspector = isCoarsePointer;
  const inspectorPoint = hoverPoint;

  const applyRange = (next: ChartRange) => {
    setRange(next);
    if (next === '7d') {
      const points = [...initialData];
      setData(points);
      setAvailableCurrencies(
        initialCurrencies.length > 0
          ? initialCurrencies
          : Array.from(
              new Set(
                initialData.flatMap((entry) =>
                  entry.byCurrency.map((row) => row.currency),
                ),
              ),
            ),
      );
      resetView(points);
      setError(null);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] sm:rounded-[1.8rem] sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
            Pedidos + monedas
          </p>
          <h2 className="mt-1 font-[var(--font-display)] text-lg font-black tracking-[-0.03em] text-slate-950 sm:mt-2 sm:text-xl">
            Comportamiento del marketplace
          </h2>
          <p className="mt-1 hidden text-xs text-slate-500 sm:block">
            Cursor = montos · Clic = pedidos · Rueda = zoom · Arrastra = desplazar.
          </p>
          <p className="mt-1 text-xs text-slate-500 sm:hidden">
            Desliza = montos · +/− = zoom · Ver pedidos = abrir dia.
          </p>
        </div>

        <AdminFilterBar className="w-full lg:w-auto lg:justify-end">
          <AdminFilterSelect
            label="Periodo"
            value={range}
            onChange={(value) => applyRange(value as ChartRange)}
            options={RANGE_OPTIONS}
          />
          <AdminFilterSelect
            label="Moneda"
            value={currencyFilter}
            onChange={setCurrencyFilter}
            options={[
              { value: 'all', label: 'Todas las monedas' },
              ...availableCurrencies.map((code) => ({ value: code, label: code })),
              { value: 'usd_estimate', label: '≈ USD convertido' },
            ]}
          />
        </AdminFilterBar>
      </div>

      {error ? (
        <p className="mt-3 rounded-[1rem] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}

      {useDockedInspector ? (
        <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/80 px-3 py-3">
          {inspectorPoint ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-violet-700">
                    {inspectorPoint.label}
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-slate-950">
                    {inspectorPoint.orders} pedidos
                    {showUsdEstimate
                      ? ` · ${formatAdminMoney(inspectorPoint.usdEstimate, 'USD')}`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openOrdersForPoint(inspectorPoint)}
                  className="shrink-0 rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white"
                >
                  Ver pedidos
                </button>
              </div>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                {(currencyFilter === 'all' || currencyFilter === 'usd_estimate'
                  ? inspectorPoint.byCurrency
                  : inspectorPoint.byCurrency.filter(
                      (row) => row.currency === currencyFilter,
                    )
                ).map((row) => (
                  <li key={row.currency}>
                    <span
                      style={{ color: colorForCurrency(row.currency) }}
                      className="font-bold"
                    >
                      {row.currency}
                    </span>{' '}
                    <span className="font-semibold text-slate-900">
                      {formatAdminMoney(row.amount, row.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs font-medium text-violet-800/80">
              Toca o desliza la grafica para inspeccionar un dia. La redireccion solo ocurre con
              “Ver pedidos”.
            </p>
          )}
        </div>
      ) : null}

      <div
        ref={chartShellRef}
        className="relative mx-auto mt-4 max-w-3xl overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-3 sm:mt-5 sm:p-4 lg:max-w-4xl"
        style={{
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            {isZoomed
              ? `Zoom ${view.start + 1}–${view.end + 1} / ${data.length}`
              : 'Vista completa'}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => panView(-1)}
              disabled={!isZoomed || view.start <= 0}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 disabled:opacity-35"
              aria-label="Desplazar izquierda"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => applyZoom(false)}
              disabled={!isZoomed}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-35"
              aria-label="Alejar"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => applyZoom(true)}
              disabled={data.length <= 3 || view.end - view.start <= 2}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-35"
              aria-label="Acercar"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => panView(1)}
              disabled={!isZoomed || view.end >= Math.max(0, data.length - 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 disabled:opacity-35"
              aria-label="Desplazar derecha"
            >
              ›
            </button>
            {isZoomed ? (
              <button
                type="button"
                onClick={() => resetView(data)}
                className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700"
                aria-label="Restablecer zoom"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/65 text-sm font-bold text-slate-600">
            Cargando {rangeTitle}…
          </div>
        ) : null}

        {!useDockedInspector && hoverPoint && hoverX != null ? (
          <div
            className="pointer-events-none absolute z-10 min-w-[180px] rounded-[1rem] border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm"
            style={{
              left: `clamp(8px, calc(${(hoverX / SVG_WIDTH) * 100}% - 90px), calc(100% - 200px))`,
              top: 12,
            }}
          >
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
              {hoverPoint.label}
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {hoverPoint.orders} pedidos
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
              {(currencyFilter === 'all' || currencyFilter === 'usd_estimate'
                ? hoverPoint.byCurrency
                : hoverPoint.byCurrency.filter((row) => row.currency === currencyFilter)
              ).map((row) => (
                <li key={row.currency} className="flex items-center justify-between gap-3">
                  <span style={{ color: colorForCurrency(row.currency) }} className="font-bold">
                    {row.currency}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {formatAdminMoney(row.amount, row.currency)}
                  </span>
                </li>
              ))}
              {showUsdEstimate ? (
                <li className="border-t border-slate-100 pt-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-violet-700">≈ USD</span>
                    <span className="font-semibold text-slate-900">
                      {formatAdminMoney(hoverPoint.usdEstimate, 'USD')}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {hoverPoint.usdCoveredOrders}/{hoverPoint.orders} convertidos a USD
                  </p>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full touch-none select-none"
          style={{
            cursor: isDragging ? 'grabbing' : 'crosshair',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            WebkitTouchCallout: 'none',
            touchAction: 'none',
          }}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onContextMenu={(event) => event.preventDefault()}
          onPointerLeave={() => {
            if (dragRef.current) return;
            if (isCoarsePointer) return;
            setHoverIndex(null);
          }}
        >
          {[0, 1, 2, 3].map((index) => {
            const y = PLOT_TOP + (PLOT_HEIGHT / 3) * index;
            return (
              <line
                key={index}
                x1={PLOT_LEFT}
                x2={PLOT_LEFT + PLOT_WIDTH}
                y1={y}
                y2={y}
                stroke="rgba(148,163,184,0.28)"
                strokeDasharray="4 6"
              />
            );
          })}

          {visiblePoints.map((entry, index) => {
            const x = xForVisibleIndex(index);
            const barHeight = (entry.orders / maxOrders) * PLOT_HEIGHT;
            const y = PLOT_TOP + PLOT_HEIGHT - barHeight;
            return (
              <rect
                key={`bar-${entry.absoluteIndex}`}
                x={x - barWidth / 2}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 0)}
                rx="7"
                fill={ORDERS_BAR_COLOR}
                pointerEvents="none"
              />
            );
          })}

          {visibleCurrencyCodes.map((code) => {
            const values = amountByVisible(code);
            const maxValue = currencyMax.get(code) ?? 1;
            return (
              <g key={`line-${code}`} pointerEvents="none">
                <polyline
                  fill="none"
                  stroke={colorForCurrency(code)}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={linePoints(values, maxValue)}
                />
                {values.map((value, index) => {
                  if (hoverVisibleIndex !== index) return null;
                  const x = xForVisibleIndex(index);
                  const y =
                    PLOT_TOP + PLOT_HEIGHT - (value / maxValue) * PLOT_HEIGHT;
                  return (
                    <circle
                      key={`${code}-${index}`}
                      cx={x}
                      cy={y}
                      r={5}
                      fill={colorForCurrency(code)}
                      stroke="#fff"
                      strokeWidth="2"
                    />
                  );
                })}
              </g>
            );
          })}

          {showUsdEstimate ? (
            <g pointerEvents="none">
              <polyline
                fill="none"
                stroke={USD_ESTIMATE_COLOR}
                strokeWidth="2.5"
                strokeDasharray="6 5"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={linePoints(usdEstimateByVisible, maxUsdEstimate)}
              />
              {usdEstimateByVisible.map((value, index) => {
                if (hoverVisibleIndex !== index) return null;
                const x = xForVisibleIndex(index);
                const y =
                  PLOT_TOP +
                  PLOT_HEIGHT -
                  (value / maxUsdEstimate) * PLOT_HEIGHT;
                return (
                  <circle
                    key={`usd-${index}`}
                    cx={x}
                    cy={y}
                    r={5}
                    fill={USD_ESTIMATE_COLOR}
                    stroke="#fff"
                    strokeWidth="2"
                  />
                );
              })}
            </g>
          ) : null}

          {hoverX != null ? (
            <g pointerEvents="none">
              <line
                x1={hoverX}
                x2={hoverX}
                y1={PLOT_TOP}
                y2={PLOT_TOP + PLOT_HEIGHT}
                stroke="#0f172a"
                strokeOpacity="0.55"
                strokeWidth="1.5"
              />
              <circle
                cx={hoverX}
                cy={PLOT_TOP + 4}
                r="3"
                fill="#0f172a"
              />
            </g>
          ) : null}

          {visiblePoints.map((entry, index) => {
            const x = xForVisibleIndex(index);
            const showLabel =
              visibleCount <= 10 ||
              index === 0 ||
              index === visibleCount - 1 ||
              index % Math.ceil(visibleCount / 7) === 0;
            if (!showLabel) return null;
            return (
              <text
                key={`label-${entry.absoluteIndex}`}
                x={x}
                y={SVG_HEIGHT - 12}
                textAnchor="middle"
                className="fill-slate-500 text-[10px] font-bold"
              >
                {entry.label}
              </text>
            );
          })}

          {/* Interaction hit area */}
          <rect
            x={PLOT_LEFT}
            y={PLOT_TOP}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            fill="transparent"
          />
        </svg>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
            Pedidos ({rangeTitle})
          </p>
          <p className="mt-2 text-xl font-black text-slate-950">{totals.orders}</p>
        </div>
        <div className="rounded-[1.25rem] border border-violet-200 bg-violet-50/70 px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">
            ≈ USD ({rangeTitle})
          </p>
          <p className="mt-2 text-xl font-black text-slate-950">
            {formatAdminMoney(totals.usd, 'USD')}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {totals.usdCovered}/{totals.orders} con tasa
          </p>
        </div>
        {[...totals.byCurrency.entries()].map(([code, row]) => (
          <div
            key={code}
            className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3"
          >
            <p
              className="text-[11px] font-black uppercase tracking-[0.14em]"
              style={{ color: colorForCurrency(code) }}
            >
              {code} nativo
            </p>
            <p className="mt-2 text-xl font-black text-slate-950">
              {formatAdminMoney(row.amount, code)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">{row.count} pedidos</p>
          </div>
        ))}
      </div>
    </article>
  );
}
