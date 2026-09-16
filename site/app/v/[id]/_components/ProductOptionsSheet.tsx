'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import type { CartLineSelection } from '../../../_lib/menu-product-options';
import {
  parseCategoryMenuOptions,
  parseProductMenuOptions,
  resolveCartLineUnitPrice,
} from '../../../_lib/menu-product-options';

type ProductOptionsSheetProps = {
  open: boolean;
  product: {
    id: string;
    nombre: string;
    descripcion?: string | null;
    precio?: number | null;
    opciones_menu?: unknown;
  } | null;
  category: {
    opciones_menu?: unknown;
  } | null;
  formatPrice: (amount: number) => string;
  onClose: () => void;
  onConfirm: (selection: CartLineSelection, quantity: number) => void;
};

export function ProductOptionsSheet({
  open,
  product,
  category,
  formatPrice,
  onClose,
  onConfirm,
}: ProductOptionsSheetProps) {
  const options = useMemo(() => parseProductMenuOptions(product?.opciones_menu), [product]);
  const categoryOptions = useMemo(
    () => parseCategoryMenuOptions(category?.opciones_menu),
    [category],
  );

  const [tamanoId, setTamanoId] = useState('');
  const [servicioAdicional, setServicioAdicional] = useState(false);
  const [ajusteIds, setAjusteIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!open || !product) return;

    const defaultSize = options?.tamanos?.[0]?.id ?? '';
    setTamanoId(defaultSize);
    setServicioAdicional(false);
    setAjusteIds([]);
    setQuantity(1);
  }, [open, product, options]);

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

  const unitPrice = resolveCartLineUnitPrice(product, category, selection);
  const servicioLabel = categoryOptions?.servicio_adicional?.label ?? 'Servicio adicional';
  const servicioPrice =
    servicioAdicional && tamanoId
      ? categoryOptions?.servicio_adicional?.precios_por_tamano?.[tamanoId] ?? 0
      : 0;

  const requiresSize = (options?.tamanos?.length ?? 0) > 0;
  const canConfirm = !requiresSize || Boolean(tamanoId);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-[#05070f]/72 p-3 backdrop-blur-md sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Opciones de ${product.nombre}`}
        className="flex max-h-[min(88vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-[1.35rem] border border-white/10 bg-white shadow-[0_30px_90px_-30px_rgba(0,0,0,0.45)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black text-slate-950">{product.nombre}</h3>
            {product.descripcion?.trim() ? (
              <p className="mt-1 text-sm leading-5 text-slate-500">{product.descripcion.trim()}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          {options?.tamanos?.length ? (
            <section>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Tamaño</p>
              <div className="mt-3 grid gap-2">
                {options.tamanos.map((size) => {
                  const active = tamanoId === size.id;
                  return (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => setTamanoId(size.id)}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                        active
                          ? 'border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_10%,white)]'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <span className="text-sm font-bold text-slate-900">{size.label}</span>
                      <span className="text-sm font-black text-slate-900">{formatPrice(size.precio)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {categoryOptions?.servicio_adicional?.precios_por_tamano ? (
            <section>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={servicioAdicional}
                  onChange={(event) => setServicioAdicional(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-[var(--primary-color)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900">{servicioLabel}</span>
                  <span className="mt-1 block text-xs text-slate-500">
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
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Ajustes</p>
              <div className="mt-3 space-y-2">
                {options.ajustes.map((ajuste) => {
                  const checked = ajusteIds.includes(ajuste.id);
                  return (
                    <label
                      key={ajuste.id}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
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
                        className="mt-1 h-4 w-4 accent-[var(--primary-color)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-slate-900">{ajuste.label}</span>
                        {ajuste.precio > 0 ? (
                          <span className="mt-1 block text-xs text-slate-500">
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

          <section>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Cantidad</p>
            <div className="mt-3 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                className="grid h-9 w-9 place-items-center rounded-full bg-white text-base font-black text-slate-700"
              >
                −
              </button>
              <span className="min-w-10 px-2 text-center text-sm font-black text-slate-900">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((prev) => prev + 1)}
                className="grid h-9 w-9 place-items-center rounded-full bg-white text-base font-black text-slate-700"
              >
                +
              </button>
            </div>
          </section>
        </div>

        <div className="border-t border-slate-200 px-4 py-4 sm:px-5">
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(selection, quantity)}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full text-sm font-black text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary-color)' }}
          >
            Agregar · {formatPrice(unitPrice * quantity)}
          </button>
        </div>
      </div>
    </div>
  );
}
