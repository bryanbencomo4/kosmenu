'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';

import type { CartLineSelection } from '../../../../_lib/menu-product-options';
import {
  calculateProductPrice,
  defaultGroupSelections,
  nextGroupSelection,
  parseCategoryMenuOptions,
  parseProductMenuOptions,
  productHasDependentPrices,
  sanitizeFreeText,
  validateOptionGroupSelection,
  type MenuOptionGroup,
} from '../../../../_lib/menu-product-options';
import { useLockBodyScroll } from '../../../../_lib/use-lock-body-scroll';

export type UpsellConfigurableProduct = {
  id: string;
  nombre: string;
  descripcion?: string | null;
  precio?: number | null;
  opciones_menu?: unknown;
  imagen_url: string | null;
  category: {
    nombre?: string | null;
    opciones_menu?: unknown;
  } | null;
};

type UpsellOptionConfiguratorProps = {
  product: UpsellConfigurableProduct;
  formatPrice: (amount: number) => string;
  canAdd: boolean;
  onClose: () => void;
  onConfirm: (selection: CartLineSelection, quantity: number) => void;
};

function buildSelection(params: {
  tamanoId: string;
  tamanoLabel?: string;
  servicioAdicional: boolean;
  ajusteIds: string[];
  groupSelections: Record<string, string[]>;
  freeTexts: Record<string, Record<string, string>>;
}): CartLineSelection {
  const selectedGroups = Object.fromEntries(
    Object.entries(params.groupSelections).filter(([, ids]) => ids.length > 0),
  );
  const selection: CartLineSelection = {
    ...(params.tamanoId
      ? { tamanoId: params.tamanoId, tamanoLabel: params.tamanoLabel ?? params.tamanoId }
      : {}),
    ...(params.servicioAdicional ? { servicioAdicional: true } : {}),
    ...(params.ajusteIds.length > 0 ? { ajusteIds: params.ajusteIds } : {}),
    ...(Object.keys(selectedGroups).length > 0 ? { grupos: selectedGroups } : {}),
  };

  const selectedTexts: Record<string, Record<string, string>> = {};
  for (const [groupId, byOption] of Object.entries(params.freeTexts)) {
    const allowed = new Set(selectedGroups[groupId] ?? []);
    const kept: Record<string, string> = {};
    for (const [optionId, text] of Object.entries(byOption)) {
      const clean = sanitizeFreeText(text);
      if (allowed.has(optionId) && clean) kept[optionId] = clean;
    }
    if (Object.keys(kept).length > 0) selectedTexts[groupId] = kept;
  }
  if (Object.keys(selectedTexts).length > 0) selection.textos = selectedTexts;
  return selection;
}

function ChoiceChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 rounded-[14px] border px-3 py-2 text-left transition disabled:opacity-40"
      style={
        active
          ? {
              borderColor: 'var(--menu-primary)',
              backgroundColor: 'color-mix(in srgb, var(--menu-primary) 12%, var(--menu-surface))',
              color: 'var(--menu-text)',
            }
          : {
              borderColor: 'var(--menu-border)',
              backgroundColor: 'var(--menu-surface-alt)',
              color: 'var(--menu-text)',
            }
      }
    >
      {children}
    </button>
  );
}

export function UpsellOptionConfigurator({
  product,
  formatPrice,
  canAdd,
  onClose,
  onConfirm,
}: UpsellOptionConfiguratorProps) {
  useLockBodyScroll(true);
  const options = useMemo(() => parseProductMenuOptions(product.opciones_menu), [product]);
  const categoryOptions = useMemo(
    () => parseCategoryMenuOptions(product.category?.opciones_menu),
    [product.category],
  );

  const [tamanoId, setTamanoId] = useState('');
  const [servicioAdicional, setServicioAdicional] = useState(false);
  const [ajusteIds, setAjusteIds] = useState<string[]>([]);
  const [groupSelections, setGroupSelections] = useState<Record<string, string[]>>({});
  const [freeTexts, setFreeTexts] = useState<Record<string, Record<string, string>>>({});
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    setTamanoId(options?.tamanos?.[0]?.id ?? '');
    setServicioAdicional(false);
    setAjusteIds([]);
    const defaults = { ...defaultGroupSelections(options?.grupos) };
    for (const group of options?.grupos ?? []) {
      if (group.obligatorio && (group.tipo === 'unica' || group.max <= 1) && !defaults[group.id]?.length) {
        defaults[group.id] = [group.opciones[0].id];
      }
    }
    setGroupSelections(defaults);
    setFreeTexts({});
    setQuantity(1);
  }, [product.id, options]);

  const selectedSize = options?.tamanos?.find((entry) => entry.id === tamanoId) ?? null;
  const selection = buildSelection({
    tamanoId,
    tamanoLabel: selectedSize?.label,
    servicioAdicional,
    ajusteIds,
    groupSelections,
    freeTexts,
  });
  const priced = calculateProductPrice(product, selection, product.category);
  const groupIssues = validateOptionGroupSelection(product, selection);
  const hasDependentPrices = productHasDependentPrices(product);
  const requiresSize = (options?.tamanos?.length ?? 0) > 0;
  const canConfirm =
    canAdd && (!requiresSize || Boolean(tamanoId)) && groupIssues.length === 0 && priced.precioFinal > 0;
  const lineTotal = priced.precioFinal * quantity;

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

  return (
    <div
      className="absolute inset-0 z-20 flex items-end justify-center bg-black/45 p-2 lg:items-center lg:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Opciones de ${product.nombre}`}
        className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] shadow-[var(--menu-shadow)] lg:max-h-[min(80vh,640px)] lg:rounded-[24px]"
        style={{ backgroundColor: 'var(--menu-surface)', color: 'var(--menu-text)' }}
      >
        <div className="flex items-start gap-3 px-4 pb-3 pt-4">
          {product.imagen_url ? (
            <div
              className="h-16 w-16 shrink-0 overflow-hidden rounded-[16px]"
              style={{ backgroundColor: 'var(--menu-surface-alt)' }}
            >
              <img
                src={product.imagen_url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-contain"
              />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-extrabold leading-tight">{product.nombre}</h3>
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--menu-text-muted)' }}>
              {product.descripcion?.trim() || product.category?.nombre || 'Personaliza tu producto'}
            </p>
            <p className="mt-1 text-sm font-black" style={{ color: 'var(--menu-primary)' }}>
              {formatPrice(priced.precioFinal)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{ backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div data-sheet-scroll className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4 [touch-action:pan-y]">
          {options?.tamanos?.length ? (
            <section>
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: 'var(--menu-text-muted)' }}>
                Tamaño
              </p>
              <div className="grid grid-cols-3 gap-2">
                {options.tamanos.map((size) => (
                  <ChoiceChip key={size.id} active={tamanoId === size.id} onClick={() => setTamanoId(size.id)}>
                    <span className="block text-[13px] font-bold">{size.label}</span>
                    <span className="mt-0.5 block text-[11px] font-semibold" style={{ color: 'var(--menu-text-muted)' }}>
                      {formatPrice(size.precio)}
                    </span>
                  </ChoiceChip>
                ))}
              </div>
            </section>
          ) : null}

          {options?.grupos?.map((group) => {
            const selectedIds = groupSelections[group.id] ?? [];
            const reachedMax = group.tipo === 'multiple' && selectedIds.length >= group.max;
            const pending = groupIssues.find((issue) => issue.groupId === group.id);
            return (
              <section key={group.id}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: 'var(--menu-text-muted)' }}>
                    {group.nombre}
                  </p>
                  {pending ? (
                    <span className="text-[11px] font-bold" style={{ color: 'var(--menu-primary)' }}>
                      {pending.message}
                    </span>
                  ) : null}
                </div>
                <div className={group.tipo === 'unica' ? 'flex flex-wrap gap-2' : 'grid gap-2'}>
                  {group.opciones.map((option) => {
                    const active = selectedIds.includes(option.id);
                    const extra = option.precio;
                    return (
                      <div key={option.id} className="min-w-0">
                        <ChoiceChip
                          active={active}
                          disabled={!active && reachedMax}
                          onClick={() => toggleGroupOption(group, option.id)}
                        >
                          <span className="flex items-center gap-2">
                            {active ? (
                              <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--menu-primary)' }} />
                            ) : null}
                            <span className="text-[13px] font-bold">{option.nombre}</span>
                          </span>
                          {extra > 0 ? (
                            <span className="mt-0.5 block text-[11px] font-semibold" style={{ color: 'var(--menu-text-muted)' }}>
                              +{formatPrice(extra)}
                            </span>
                          ) : null}
                        </ChoiceChip>
                        {active && option.textoLibre ? (
                          <input
                            value={freeTexts[group.id]?.[option.id] ?? ''}
                            onChange={(event) => {
                              const text = event.target.value.replace(/\s{2,}/g, ' ').slice(0, 80);
                              setFreeTexts((prev) => {
                                const groupTexts = { ...(prev[group.id] ?? {}) };
                                if (text.trim()) groupTexts[option.id] = text;
                                else delete groupTexts[option.id];
                                const next = { ...prev };
                                if (Object.keys(groupTexts).length > 0) next[group.id] = groupTexts;
                                else delete next[group.id];
                                return next;
                              });
                            }}
                            maxLength={80}
                            placeholder="Escribe aquí"
                            className="mt-2 h-10 w-full rounded-2xl border px-3 text-sm outline-none"
                            style={{
                              borderColor: 'var(--menu-border)',
                              backgroundColor: 'var(--menu-surface-alt)',
                              color: 'var(--menu-text)',
                            }}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {options?.ajustes?.length ? (
            <section>
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: 'var(--menu-text-muted)' }}>
                Extras
              </p>
              <div className="grid gap-2">
                {options.ajustes.map((ajuste) => {
                  const checked = ajusteIds.includes(ajuste.id);
                  return (
                    <ChoiceChip
                      key={ajuste.id}
                      active={checked}
                      onClick={() =>
                        setAjusteIds((prev) =>
                          prev.includes(ajuste.id) ? prev.filter((id) => id !== ajuste.id) : [...prev, ajuste.id],
                        )
                      }
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-[13px] font-bold">{ajuste.label}</span>
                        {ajuste.precio > 0 ? (
                          <span className="text-[12px] font-black">+{formatPrice(ajuste.precio)}</span>
                        ) : null}
                      </span>
                    </ChoiceChip>
                  );
                })}
              </div>
            </section>
          ) : null}

          {categoryOptions?.servicio_adicional?.precios_por_tamano ? (
            <label className="flex cursor-pointer items-center gap-3 rounded-[14px] border px-3 py-3" style={{ borderColor: 'var(--menu-border)' }}>
              <input
                type="checkbox"
                checked={servicioAdicional}
                onChange={(event) => setServicioAdicional(event.target.checked)}
                className="h-4 w-4 accent-[var(--menu-primary)]"
              />
              <span className="text-[13px] font-bold">{categoryOptions.servicio_adicional.label ?? 'Servicio adicional'}</span>
            </label>
          ) : null}

          {hasDependentPrices ? (
            <p className="text-[12px] leading-5" style={{ color: 'var(--menu-text-muted)' }}>
              El precio puede cambiar según las opciones seleccionadas.
            </p>
          ) : null}

          <section className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-bold">Cantidad</p>
            <div
              className="inline-flex items-center rounded-full border p-1"
              style={{ borderColor: 'var(--menu-border)', backgroundColor: 'var(--menu-surface-alt)' }}
            >
              <button
                type="button"
                onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                className="grid h-9 w-9 place-items-center rounded-full"
                style={{ backgroundColor: 'var(--menu-surface)', color: 'var(--menu-text)' }}
                aria-label="Quitar uno"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-8 text-center text-sm font-black">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((prev) => prev + 1)}
                className="grid h-9 w-9 place-items-center rounded-full"
                style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
                aria-label="Agregar uno"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>

        <div className="border-t px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-3" style={{ borderColor: 'var(--menu-border)' }}>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(selection, quantity)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[16px] text-sm font-bold disabled:opacity-45"
            style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
          >
            Agregar al pedido
            <span className="opacity-80">|</span>
            {formatPrice(lineTotal)}
          </button>
        </div>
      </div>
    </div>
  );
}
