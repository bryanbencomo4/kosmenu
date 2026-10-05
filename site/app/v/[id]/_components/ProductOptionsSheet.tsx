'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

import type { CartLineSelection } from '../../../_lib/menu-product-options';
import { KioskImage } from './kiosk/KioskImage';
import {
  describeDependentPriceReason,
  formatProductPriceLabel,
  parseCategoryMenuOptions,
  parseProductMenuOptions,
  productHasDependentPrices,
  defaultGroupSelections,
  nextGroupSelection,
  sanitizeFreeText,
  resolveOptionPrice,
  validateOptionGroupSelection,
  validateCustomizationSelection,
  resolveCombinedUnitPrice,
  autoPartnerSelection,
  type MenuOptionGroup,
} from '../../../_lib/menu-product-options';
import { useLockBodyScroll } from '../../../_lib/use-lock-body-scroll';

function describeGroupRule(group: MenuOptionGroup) {
  if (group.tipo === 'unica') return group.obligatorio ? 'Obligatorio · elige 1' : 'Opcional · elige 1';
  if (group.obligatorio) {
    return group.min === group.max
      ? `Obligatorio · elige ${group.min}`
      : `Obligatorio · elige de ${group.min} a ${group.max}`;
  }
  return `Opcional · hasta ${group.max}`;
}

function optionRowStyle(active: boolean) {
  return active
    ? {
        borderColor: 'var(--menu-primary)',
        backgroundColor: 'color-mix(in srgb, var(--menu-primary) 12%, var(--menu-surface))',
      }
    : {
        borderColor: 'var(--menu-border)',
        backgroundColor: 'var(--menu-surface-alt)',
      };
}

function ChoiceMark({ kind, active }: { kind: 'radio' | 'checkbox'; active: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-5 w-5 shrink-0 place-items-center border-2 ${
        kind === 'radio' ? 'rounded-full' : 'rounded-md'
      }`}
      style={{
        borderColor: active ? 'var(--menu-primary)' : 'var(--menu-border)',
        backgroundColor: active && kind === 'checkbox' ? 'var(--menu-primary)' : 'transparent',
        color: 'var(--menu-on-primary)',
      }}
    >
      {active ? (
        kind === 'radio' ? (
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--menu-primary)' }} />
        ) : (
          <span className="text-[11px] font-black leading-none">✓</span>
        )
      ) : null}
    </span>
  );
}

function OptionSectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--menu-text-muted)]">
        {title}
      </p>
      {hint ? (
        <span className="shrink-0 text-[11px] font-bold text-[var(--menu-text-muted)]">{hint}</span>
      ) : null}
    </div>
  );
}

const COMPACT_LIST_THRESHOLD = 4;
const REMOVALS_QUESTION_KEY = ':exclusiones';
const COMBO_QUESTION_KEY = ':combinacion';
const COLLAPSED_VISIBLE_COUNT = 6;
const SEARCH_THRESHOLD = 8;

function normalizeSearch(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function choiceRowClass(compact: boolean) {
  return compact
    ? 'flex h-full min-h-12 w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition disabled:opacity-45'
    : 'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:opacity-45';
}

function choiceLabelClass(compact: boolean) {
  return compact
    ? 'line-clamp-2 break-words text-sm font-bold leading-tight text-[var(--menu-text)]'
    : 'block break-words text-sm font-bold text-[var(--menu-text)]';
}

/**
 * Long lists start as a compact two-column grid showing the first few items, with search
 * once they get long. Single-choice lists fold into the picked row after the shopper taps one.
 * Selected items are never hidden by the fold.
 */
function ChoiceList<T extends { id: string }>({
  items,
  selectedIds,
  getLabel,
  renderItem,
  searchLabel,
  single = false,
  allowCompact = true,
  foldMinItems = COMPACT_LIST_THRESHOLD + 1,
}: {
  items: T[];
  selectedIds: string[];
  getLabel: (item: T) => string;
  renderItem: (item: T, compact: boolean) => ReactNode;
  searchLabel: string;
  single?: boolean;
  allowCompact?: boolean;
  foldMinItems?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [folded, setFolded] = useState(false);
  const selectionKey = selectedIds.join('|');
  const [lastSelectionKey, setLastSelectionKey] = useState(selectionKey);
  if (selectionKey !== lastSelectionKey) {
    setLastSelectionKey(selectionKey);
    if (single && selectedIds.length === 1 && items.length >= foldMinItems) {
      setFolded(true);
      setQuery('');
      setExpanded(false);
    }
  }

  const picked = single && folded ? items.find((item) => item.id === selectedIds[0]) : undefined;
  if (picked) {
    return (
      <div ref={rootRef} className="mt-3 flex items-stretch gap-2">
        <div className="min-w-0 flex-1">{renderItem(picked, false)}</div>
        <button
          type="button"
          onClick={() => setFolded(false)}
          className="shrink-0 self-start rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] px-4 py-3 text-sm font-bold text-[var(--menu-text)]"
        >
          Cambiar
        </button>
      </div>
    );
  }

  const normalizedQuery = normalizeSearch(query);
  const filtered = normalizedQuery
    ? items.filter((item) => normalizeSearch(getLabel(item)).includes(normalizedQuery))
    : items;
  const selected = new Set(selectedIds);
  const canFold = items.length > COLLAPSED_VISIBLE_COUNT + 1;
  const collapsed = canFold && !expanded && !normalizedQuery;
  const visible = collapsed
    ? filtered.filter((item, index) => index < COLLAPSED_VISIBLE_COUNT || selected.has(item.id))
    : filtered;
  const hiddenCount = filtered.length - visible.length;
  const compact = allowCompact && items.length > COMPACT_LIST_THRESHOLD;

  return (
    <div ref={rootRef}>
      {items.length > SEARCH_THRESHOLD ? (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar..."
          aria-label={searchLabel}
          className="mt-3 h-11 w-full rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] px-4 text-base font-semibold text-[var(--menu-text)] outline-none placeholder:text-[var(--menu-text-muted)] focus:border-[var(--menu-primary)] sm:text-sm"
        />
      ) : null}
      <div className={`mt-3 grid gap-2 ${compact ? 'grid-cols-2' : ''}`}>
        {visible.map((item) => <Fragment key={item.id}>{renderItem(item, compact)}</Fragment>)}
      </div>
      {normalizedQuery && filtered.length === 0 ? (
        <p className="mt-3 text-center text-sm font-semibold text-[var(--menu-text-muted)]">
          Sin resultados para “{query.trim()}”
        </p>
      ) : null}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 w-full rounded-2xl border border-dashed border-[var(--menu-border)] px-4 py-3 text-sm font-bold text-[var(--menu-primary)]"
        >
          Ver {hiddenCount} más
        </button>
      ) : null}
      {canFold && expanded && !normalizedQuery ? (
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }}
          className="mt-2 w-full rounded-2xl px-4 py-2 text-sm font-bold text-[var(--menu-text-muted)]"
        >
          Ver menos
        </button>
      ) : null}
    </div>
  );
}

function QuestionToggle({ question, hint, open, onToggle }: {
  question: string; hint: string; open: boolean; onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={open}
      aria-expanded={open}
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition"
      style={optionRowStyle(open)}
    >
      <ChoiceMark kind="checkbox" active={open} />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[15px] font-extrabold leading-snug text-[var(--menu-text)]">
          {question}
        </span>
        <span className="mt-0.5 block text-xs font-semibold text-[var(--menu-text-muted)]">{hint}</span>
      </span>
    </button>
  );
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function QuestionPanel({ gated, children }: { gated: boolean; children: ReactNode }) {
  if (!gated) return <>{children}</>;
  return (
    <div className="mt-3 border-l-2 pl-3" style={{ borderColor: 'var(--menu-primary)' }}>
      {children}
    </div>
  );
}

function IngredientRemovalControls({ title, ingredients, selected, onChange }: {
  title: string; ingredients: Array<{ id: string; nombre: string }>;
  selected: string[]; onChange: (ids: string[]) => void;
}) {
  return (
    <section>
      <OptionSectionHeader
        title={title}
        hint={selected.length ? `Sin ${selected.length}` : 'Opcional'}
      />
      <ChoiceList
        items={ingredients}
        selectedIds={selected}
        getLabel={(ingredient) => ingredient.nombre}
        searchLabel={`Buscar en ${title}`}
        renderItem={(ingredient, compact) => {
          const removed = selected.includes(ingredient.id);
          return (
            <button
              type="button"
              role="checkbox"
              aria-checked={removed}
              onClick={() => onChange(
                removed
                  ? selected.filter((id) => id !== ingredient.id)
                  : [...selected, ingredient.id],
              )}
              className={choiceRowClass(compact)}
              style={optionRowStyle(removed)}
            >
              <ChoiceMark kind="checkbox" active={removed} />
              <span className="min-w-0 flex-1">
                <span className={choiceLabelClass(compact)}>{ingredient.nombre}</span>
              </span>
            </button>
          );
        }}
      />
    </section>
  );
}

type ConfigurableProduct = {
    id: string;
    nombre: string;
    descripcion?: string | null;
    precio?: number | null;
    opciones_menu?: unknown;
    imagen_url?: string | null;
    disponible?: boolean | null;
    comercio_id?: string;
    category?: { opciones_menu?: unknown } | null;
};

type ProductOptionsSheetProps = {
  open: boolean;
  canAdd: boolean;
  product: ConfigurableProduct | null;
  compatibleProducts?: ConfigurableProduct[];
  secondary?: boolean;
  imageUrl: string | null;
  category: {
    opciones_menu?: unknown;
  } | null;
  formatPrice: (amount: number) => string;
  onClose: () => void;
  onConfirm: (selection: CartLineSelection, quantity: number) => void;
};

export function ProductOptionsSheet({
  open,
  canAdd,
  product,
  imageUrl,
  category,
  formatPrice,
  onClose,
  onConfirm,
  compatibleProducts = [],
  secondary = false,
}: ProductOptionsSheetProps) {
  useLockBodyScroll(open && Boolean(product));
  const options = useMemo(() => parseProductMenuOptions(product?.opciones_menu), [product]);
  const categoryOptions = useMemo(
    () => parseCategoryMenuOptions(category?.opciones_menu),
    [category],
  );

  const [tamanoId, setTamanoId] = useState('');
  const [servicioAdicional, setServicioAdicional] = useState(false);
  const [ajusteIds, setAjusteIds] = useState<string[]>([]);
  const [groupSelections, setGroupSelections] = useState<Record<string, string[]>>({});
  const [freeTexts, setFreeTexts] = useState<Record<string, Record<string, string>>>({});
  const [quantity, setQuantity] = useState(1);
  const [partnerId, setPartnerId] = useState('');
  const [exclusionesIds, setExclusionesIds] = useState<string[]>([]);
  const [openQuestions, setOpenQuestions] = useState<Record<string, boolean>>({});
  const [listSession, setListSession] = useState(0);
  const [attentionGroupId, setAttentionGroupId] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !product) return;

    const defaultSize = options?.tamanos?.[0]?.id ?? '';
    setTamanoId(defaultSize);
    setServicioAdicional(false);
    setAjusteIds([]);
    const defaults = defaultGroupSelections(options?.grupos);
    setGroupSelections(defaults);
    setOpenQuestions(Object.fromEntries(
      (options?.grupos ?? [])
        .filter((group) => group.pregunta)
        .map((group) => [group.id, (defaults[group.id]?.length ?? 0) > 0]),
    ));
    setFreeTexts({});
    setQuantity(1);
    setPartnerId('');
    setExclusionesIds([]);
    setListSession((previous) => previous + 1);
    setAttentionGroupId('');
  }, [open, product, options]);

  useEffect(() => {
    if (!attentionGroupId) return;
    const timer = window.setTimeout(() => setAttentionGroupId(''), 1600);
    return () => window.clearTimeout(timer);
  }, [attentionGroupId]);

  function toggleGroupOption(group: MenuOptionGroup, optionId: string) {
    setGroupSelections((prev) => {
      const nextIds = nextGroupSelection(group, prev[group.id] ?? [], optionId);
      setFreeTexts((texts) => {
        if (nextIds.includes(optionId)) return texts;
        const groupTexts = { ...(texts[group.id] ?? {}) };
        delete groupTexts[optionId];
        const next = { ...texts };
        if (Object.keys(groupTexts).length > 0) next[group.id] = groupTexts;
        else delete next[group.id];
        return next;
      });
      return { ...prev, [group.id]: nextIds };
    });
  }

  function setFreeText(groupId: string, optionId: string, value: string) {
    setFreeTexts((prev) => {
      const text = value.replace(/\s{2,}/g, ' ').slice(0, 80);
      const groupTexts = { ...(prev[groupId] ?? {}) };
      if (text.trim()) groupTexts[optionId] = text;
      else delete groupTexts[optionId];
      const next = { ...prev };
      if (Object.keys(groupTexts).length > 0) next[groupId] = groupTexts;
      else delete next[groupId];
      return next;
    });
  }

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open || !product) {
    return null;
  }

  const selectedSize = options?.tamanos?.find((entry) => entry.id === tamanoId) ?? null;
  const selection: CartLineSelection = {
    ...(tamanoId
      ? {
          tamanoId,
          tamanoLabel: selectedSize?.label ?? tamanoId,
        }
      : {}),
    ...(servicioAdicional ? { servicioAdicional: true } : {}),
    ...(ajusteIds.length > 0 ? { ajusteIds } : {}),
  };
  const closedQuestionGroups = new Set(
    (options?.grupos ?? [])
      .filter((group) => group.pregunta && !openQuestions[group.id])
      .map((group) => group.id),
  );
  const selectedGroups = Object.fromEntries(
    Object.entries(groupSelections).filter(([groupId, ids]) => ids.length > 0 && !closedQuestionGroups.has(groupId)),
  );
  if (Object.keys(selectedGroups).length > 0) {
    selection.grupos = selectedGroups;
  }
  const selectedTexts: Record<string, Record<string, string>> = {};
  for (const [groupId, byOption] of Object.entries(freeTexts)) {
    const allowed = new Set(selectedGroups[groupId] ?? []);
    const kept: Record<string, string> = {};
    for (const [optionId, text] of Object.entries(byOption)) {
      const clean = sanitizeFreeText(text);
      if (allowed.has(optionId) && clean) kept[optionId] = clean;
    }
    if (Object.keys(kept).length > 0) selectedTexts[groupId] = kept;
  }
  if (Object.keys(selectedTexts).length > 0) {
    selection.textos = selectedTexts;
  }
  const removals = options?.personalizacion?.exclusiones;
  const removalsOpen = !removals?.pregunta || openQuestions[REMOVALS_QUESTION_KEY] === true;
  if (exclusionesIds.length && removalsOpen) selection.exclusionesIds = exclusionesIds;
  const combo = secondary ? null : options?.personalizacion?.combinacion;
  const comboOpen = !combo?.pregunta || openQuestions[COMBO_QUESTION_KEY] === true;
  const compatible = combo ? compatibleProducts.filter((entry) =>
    entry.id !== product.id && entry.disponible !== false &&
    (!product.comercio_id || entry.comercio_id === product.comercio_id) &&
    combo.productosCompatibles.includes(entry.id)) : [];
  const partner = comboOpen ? compatible.find((entry) => entry.id === partnerId) : undefined;
  const combine = Boolean(partner);
  const partnerSelection = partner ? autoPartnerSelection(product, selection, partner) : {};
  if (combine && partner) selection.combinacion = { productId: partner.id, seleccion: partnerSelection };

  const unitPrice = resolveCombinedUnitPrice(product, category, selection, partner, partner?.category);
  const groupIssues = validateOptionGroupSelection(product, selection);
  const customIssues = options?.personalizacion ? validateCustomizationSelection(product, selection) : [];
  const partnerIssues = partner ? validateCustomizationSelection(partner, partnerSelection) : [];
  const hasGroups = (options?.grupos?.length ?? 0) > 0;
  const hasDependentPrices = productHasDependentPrices(product);
  const servicioLabel = categoryOptions?.servicio_adicional?.label ?? 'Servicio adicional';
  const servicioPrice =
    servicioAdicional && tamanoId
      ? categoryOptions?.servicio_adicional?.precios_por_tamano?.[tamanoId] ?? 0
      : 0;

  const requiresSize = (options?.tamanos?.length ?? 0) > 0;
  const canConfirm =
    canAdd && (!requiresSize || Boolean(tamanoId)) && groupIssues.length === 0 && customIssues.length === 0 &&
    (!combine || Boolean(partner)) && partnerIssues.length === 0 && unitPrice > 0;
  const pendingGroupId = canAdd ? groupIssues[0]?.groupId ?? '' : '';

  return (
    <>
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Opciones de ${product.nombre}`}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-[24px] bg-[var(--menu-surface)] text-[var(--menu-text)] shadow-[var(--menu-shadow)] sm:max-h-[min(88vh,760px)]"
      >
        <div className="relative h-40 shrink-0 bg-[var(--menu-surface-alt)] sm:h-52">
          {imageUrl ? (
            <KioskImage src={imageUrl} alt={product.nombre} className="h-full w-full" />
          ) : (
            <div className="grid h-full place-items-center text-sm font-semibold text-[var(--menu-text-muted)]">
              Imagen no disponible
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          ref={bodyRef}
          data-sheet-scroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-6 [touch-action:pan-y]"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 text-xl font-extrabold leading-tight text-[var(--menu-text)] sm:text-2xl">
              {secondary ? `Configura ${product.nombre}` : product.nombre}
            </h3>
            <span className="shrink-0 rounded-full bg-[var(--menu-surface-alt)] px-3 py-1.5 text-sm font-extrabold text-[var(--menu-text)]">
              {hasGroups ? formatProductPriceLabel(product, formatPrice) : formatPrice(product.precio ?? 0)}
            </span>
          </div>
          {product.descripcion?.trim() ? (
            <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-[var(--menu-text-muted)] sm:text-[15px]">
              {product.descripcion.trim()}
            </p>
          ) : (
            <p className="mt-3 text-sm text-[var(--menu-text-muted)]">Sin descripción adicional.</p>
          )}

          <div className="mt-6 space-y-5">
          {options?.tamanos?.length ? (
            <section>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--menu-text-muted)]">Tamaño</p>
              <div className="mt-3 grid gap-2">
                {options.tamanos.map((size) => {
                  const active = tamanoId === size.id;
                  return (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => setTamanoId(size.id)}
                      className="flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition"
                      style={
                        active
                          ? {
                              borderColor: 'var(--menu-primary)',
                              backgroundColor: 'color-mix(in srgb, var(--menu-primary) 12%, var(--menu-surface))',
                            }
                          : {
                              borderColor: 'var(--menu-border)',
                              backgroundColor: 'var(--menu-surface-alt)',
                            }
                      }
                    >
                      <span className="text-sm font-bold text-[var(--menu-text)]">{size.label}</span>
                      <span className="text-sm font-black text-[var(--menu-text)]">{formatPrice(size.precio)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {categoryOptions?.servicio_adicional?.precios_por_tamano ? (
            <section>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] px-4 py-3">
                <input
                  type="checkbox"
                  checked={servicioAdicional}
                  onChange={(event) => setServicioAdicional(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-[var(--menu-primary)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[var(--menu-text)]">{servicioLabel}</span>
                  <span className="mt-1 block text-xs text-[var(--menu-text-muted)]">
                    {tamanoId && servicioPrice > 0
                      ? `+ ${formatPrice(servicioPrice)}`
                      : 'Precio según el tamaño seleccionado'}
                  </span>
                </span>
              </label>
            </section>
          ) : null}

          {options?.ajustes?.length ? (
            <section>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--menu-text-muted)]">Ajustes</p>
              <div className="mt-3 space-y-2">
                {options.ajustes.map((ajuste) => {
                  const checked = ajusteIds.includes(ajuste.id);
                  return (
                    <label
                      key={ajuste.id}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] px-4 py-3"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setAjusteIds((prev) =>
                            event.target.checked
                              ? [...prev, ajuste.id]
                              : prev.filter((entry) => entry !== ajuste.id),
                          );
                        }}
                        className="mt-1 h-4 w-4 accent-[var(--menu-primary)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-[var(--menu-text)]">{ajuste.label}</span>
                        {ajuste.precio > 0 ? (
                          <span className="mt-1 block text-xs text-[var(--menu-text-muted)]">
                            + {formatPrice(ajuste.precio)}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ) : null}

          {hasGroups ? (
            <p className="text-sm font-extrabold text-[var(--menu-text)]">Elige tus opciones</p>
          ) : null}

          {hasDependentPrices ? (
            <p className="rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] px-4 py-3 text-xs font-semibold leading-5 text-[var(--menu-text-muted)]">
              El precio de algunos adicionales cambia según tu selección.
            </p>
          ) : null}

          {options?.grupos?.map((group) => {
            const selectedIds = groupSelections[group.id] ?? [];
            const reachedMax = group.tipo === 'multiple' && selectedIds.length >= group.max;
            const pending = groupIssues.find((issue) => issue.groupId === group.id);
            const singleChoice = group.tipo === 'unica' || group.max <= 1;
            const attention = attentionGroupId === group.id;
            const questionOpen = !group.pregunta || openQuestions[group.id] === true;
            const cheapestExtra = group.pregunta
              ? Math.min(...group.opciones.map((option) => resolveOptionPrice(option, selection)).filter((price) => price > 0))
              : Infinity;
            const directOption = group.preguntaDirecta ? group.opciones[0] : undefined;
            const directPrice = directOption ? resolveOptionPrice(directOption, selection) : 0;
            const questionHint = directOption
              ? questionOpen && directOption.textoLibre
                ? 'Escribe abajo lo que quieres'
                : directPrice > 0 ? `+${formatPrice(directPrice)}` : directOption.nombre
              : questionOpen
              ? selectedIds.length
                ? plural(selectedIds.length, 'elegido', 'elegidos')
                : 'Elige abajo'
              : `${plural(group.opciones.length, 'opción', 'opciones')}${
                  Number.isFinite(cheapestExtra) ? ` · desde +${formatPrice(cheapestExtra)}` : ''
                }`;
            return (
              <section
                key={group.id}
                data-option-group={group.id}
                className="scroll-mt-4 rounded-2xl transition-shadow duration-300"
                style={attention ? { boxShadow: '0 0 0 6px color-mix(in srgb, var(--menu-primary) 18%, transparent)' } : undefined}
              >
                {group.pregunta ? (
                  <QuestionToggle
                    question={group.pregunta}
                    hint={questionHint}
                    open={questionOpen}
                    onToggle={() => {
                      const opening = !questionOpen;
                      setOpenQuestions((previous) => ({ ...previous, [group.id]: opening }));
                      const onlyOption = group.opciones[0];
                      if (opening && group.preguntaDirecta && onlyOption && !selectedIds.includes(onlyOption.id)) {
                        setGroupSelections((previous) => ({ ...previous, [group.id]: [onlyOption.id] }));
                      }
                    }}
                  />
                ) : null}
                {questionOpen ? (
                <QuestionPanel gated={Boolean(group.pregunta)}>
                {group.preguntaDirecta ? (() => {
                  const option = group.opciones[0];
                  const resolvedPrice = resolveOptionPrice(option, selection);
                  const reason = describeDependentPriceReason(option, options?.grupos ?? [], selection);
                  const textMissing = option.textoLibre && !sanitizeFreeText(freeTexts[group.id]?.[option.id] ?? '');
                  return (
                    <div className="grid gap-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block break-words text-sm font-bold text-[var(--menu-text)]">{option.nombre}</span>
                          {reason ? (
                            <span className="mt-0.5 block text-[11px] font-semibold text-[var(--menu-text-muted)]">{reason}</span>
                          ) : null}
                        </span>
                        {resolvedPrice > 0 || reason ? (
                          <span className="shrink-0 text-sm font-black text-[var(--menu-text)]">+{formatPrice(resolvedPrice)}</span>
                        ) : null}
                      </div>
                      {option.textoLibre && selectedIds.includes(option.id) ? (
                        <input
                          value={freeTexts[group.id]?.[option.id] ?? ''}
                          onChange={(event) => setFreeText(group.id, option.id, event.target.value)}
                          maxLength={80}
                          autoFocus
                          enterKeyHint="done"
                          placeholder="Ej. Extra de piña"
                          aria-label={`Escribe ${option.nombre}`}
                          aria-invalid={Boolean(pending && textMissing) || undefined}
                          className="h-12 w-full rounded-2xl border bg-[var(--menu-surface)] px-4 text-base font-semibold text-[var(--menu-text)] outline-none placeholder:text-[var(--menu-text-muted)] sm:text-sm"
                          style={{ borderColor: pending && textMissing && attention ? 'var(--menu-primary)' : 'var(--menu-border)' }}
                        />
                      ) : null}
                    </div>
                  );
                })() : (<>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--menu-text-muted)]">
                    {group.nombre}
                  </p>
                  <span
                    className="shrink-0 text-[11px] font-bold"
                    style={{ color: pending ? 'var(--menu-primary)' : 'var(--menu-text-muted)' }}
                  >
                    {describeGroupRule(group)}
                    {!singleChoice && selectedIds.length > 0 ? ` · ${selectedIds.length}/${group.max}` : ''}
                  </span>
                </div>
                <ChoiceList
                  key={`${group.id}:${listSession}`}
                  items={group.opciones}
                  selectedIds={selectedIds}
                  single={singleChoice}
                  allowCompact={!group.opciones.some((option) => option.textoLibre)}
                  getLabel={(option) => option.nombre}
                  searchLabel={`Buscar en ${group.nombre}`}
                  renderItem={(option, compact) => {
                    const active = selectedIds.includes(option.id);
                    const disabled = !active && reachedMax;
                    const resolvedPrice = resolveOptionPrice(option, selection);
                    const reason = describeDependentPriceReason(
                      option,
                      options?.grupos ?? [],
                      selection,
                    );
                    const showPrice = resolvedPrice > 0 || Boolean(reason);
                    const priceLabel = showPrice ? `+${formatPrice(resolvedPrice)}` : null;
                    return (
                      <div className="grid h-full gap-2">
                        <button
                          type="button"
                          role={group.tipo === 'unica' ? 'radio' : 'checkbox'}
                          aria-checked={active}
                          disabled={disabled}
                          onClick={() => toggleGroupOption(group, option.id)}
                          className={choiceRowClass(compact)}
                          style={optionRowStyle(active)}
                        >
                          <ChoiceMark kind={group.tipo === 'unica' ? 'radio' : 'checkbox'} active={active} />
                          <span className="min-w-0 flex-1">
                            <span className={choiceLabelClass(compact)}>
                              {option.nombre}
                            </span>
                            {compact && priceLabel ? (
                              <span className="mt-0.5 block text-xs font-black text-[var(--menu-text)]">
                                {priceLabel}
                              </span>
                            ) : null}
                            {reason ? (
                              <span className={`mt-0.5 block text-[11px] font-semibold text-[var(--menu-text-muted)] ${compact ? 'line-clamp-2' : ''}`}>
                                {reason}
                              </span>
                            ) : option.textoLibre ? (
                              <span className="mt-0.5 block text-[11px] font-semibold text-[var(--menu-text-muted)]">
                                Escribe lo que quieras agregar
                              </span>
                            ) : null}
                          </span>
                          {!compact && priceLabel ? (
                            <span className="shrink-0 text-sm font-black text-[var(--menu-text)]">
                              {priceLabel}
                            </span>
                          ) : null}
                        </button>
                        {active && option.textoLibre ? (
                          <input
                            value={freeTexts[group.id]?.[option.id] ?? ''}
                            onChange={(event) => setFreeText(group.id, option.id, event.target.value)}
                            maxLength={80}
                            autoFocus
                            placeholder="Ej. Extra de piña"
                            aria-label={`Escribe ${option.nombre}`}
                            className="h-11 w-full rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface)] px-4 text-sm font-semibold text-[var(--menu-text)] outline-none placeholder:text-[var(--menu-text-muted)]"
                          />
                        ) : null}
                      </div>
                    );
                  }}
                />
                </>)}
                </QuestionPanel>
                ) : null}
              </section>
            );
          })}

          {removals ? (() => {
            const controls = (
              <IngredientRemovalControls key={`exclusiones:${listSession}`} title={removals.titulo}
                ingredients={removals.ingredientes}
                selected={exclusionesIds} onChange={setExclusionesIds} />
            );
            if (!removals.pregunta) return controls;
            return (
              <section>
                <QuestionToggle
                  question={removals.pregunta}
                  hint={removalsOpen
                    ? exclusionesIds.length ? `Sin ${plural(exclusionesIds.length, 'ingrediente', 'ingredientes')}` : 'Toca lo que quieras quitar'
                    : plural(removals.ingredientes.length, 'ingrediente', 'ingredientes')}
                  open={removalsOpen}
                  onToggle={() => setOpenQuestions((previous) => ({ ...previous, [REMOVALS_QUESTION_KEY]: !removalsOpen }))}
                />
                {removalsOpen ? <QuestionPanel gated>{controls}</QuestionPanel> : null}
              </section>
            );
          })() : null}
          {combo && compatible.length ? (
            <section>
              {combo.pregunta ? (
                <QuestionToggle
                  question={combo.pregunta}
                  hint={comboOpen
                    ? partner ? partner.nombre : 'Elige 1 abajo'
                    : plural(compatible.length, 'producto', 'productos')}
                  open={comboOpen}
                  onToggle={() => setOpenQuestions((previous) => ({ ...previous, [COMBO_QUESTION_KEY]: !comboOpen }))}
                />
              ) : null}
              {comboOpen ? (
              <QuestionPanel gated={Boolean(combo.pregunta)}>
              <OptionSectionHeader
                title={combo.titulo}
                hint={`Opcional · elige 1${compatible.length > COLLAPSED_VISIBLE_COUNT ? ` de ${compatible.length}` : ''}`}
              />
              <ChoiceList
                key={`combo:${listSession}`}
                items={compatible}
                selectedIds={partnerId ? [partnerId] : []}
                single
                foldMinItems={1}
                getLabel={(entry) => entry.nombre}
                searchLabel={`Buscar en ${combo.titulo}`}
                renderItem={(entry, compact) => {
                  const active = partnerId === entry.id;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setPartnerId(active ? '' : entry.id);
                      }}
                      className={choiceRowClass(compact)}
                      style={optionRowStyle(active)}
                    >
                      <ChoiceMark kind="radio" active={active} />
                      <span className="min-w-0 flex-1">
                        <span className={choiceLabelClass(compact)}>{entry.nombre}</span>
                      </span>
                    </button>
                  );
                }}
              />
              </QuestionPanel>
              ) : null}
            </section>
          ) : null}
          {!secondary && <section>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--menu-text-muted)]">Cantidad</p>
            <div className="mt-3 inline-flex items-center rounded-full border border-[var(--menu-border)] bg-[var(--menu-surface-alt)] p-1">
              <button
                type="button"
                onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                className="grid h-9 w-9 place-items-center rounded-full bg-[var(--menu-surface)] text-base font-black text-[var(--menu-text)]"
              >
                −
              </button>
              <span className="min-w-10 px-2 text-center text-sm font-black text-[var(--menu-text)]">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((prev) => prev + 1)}
                className="grid h-9 w-9 place-items-center rounded-full bg-[var(--menu-surface)] text-base font-black text-[var(--menu-text)]"
              >
                +
              </button>
            </div>
          </section>}
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--menu-border)] bg-[var(--menu-surface)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-4">
          {hasGroups ? (
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-xs font-semibold text-[var(--menu-text-muted)]">
                {groupIssues[0]?.message ?? customIssues[0] ?? partnerIssues[0] ?? 'Precio actualizado'}
              </span>
              <span className="shrink-0 text-lg font-black text-[var(--menu-text)]">
                {formatPrice(unitPrice * quantity)}
              </span>
            </div>
          ) : null}
          <button
            type="button"
            disabled={!canConfirm && !pendingGroupId}
            aria-disabled={!canConfirm || undefined}
            onClick={() => {
              if (canConfirm) {
                onConfirm(selection, quantity);
                return;
              }
              const target = bodyRef.current?.querySelector(`[data-option-group="${CSS.escape(pendingGroupId)}"]`);
              target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              setAttentionGroupId(pendingGroupId);
            }}
            className={`inline-flex min-h-12 w-full items-center justify-center rounded-[16px] text-sm font-bold disabled:opacity-50 ${canConfirm ? '' : 'opacity-50'}`}
            style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
          >
            {secondary ? `Guardar opciones · ${formatPrice(unitPrice)}` : hasGroups ? 'Agregar al pedido' : `Agregar · ${formatPrice(unitPrice * quantity)}`}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
