'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import type { CartLineSelection } from '../../../_lib/menu-product-options';
import { KioskImage } from './kiosk/KioskImage';
import {
  parseCategoryMenuOptions,
  parseProductMenuOptions,
  resolveCartLineUnitPrice,
} from '../../../_lib/menu-product-options';

type ProductOptionsSheetProps = {
  open: boolean;
  canAdd: boolean;
  product: {
    id: string;
    nombre: string;
    descripcion?: string | null;
    precio?: number | null;
    opciones_menu?: unknown;
  } | null;
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
  const canConfirm = canAdd && (!requiresSize || Boolean(tamanoId));

  return (
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 text-xl font-extrabold leading-tight text-[var(--menu-text)] sm:text-2xl">
              {product.nombre}
            </h3>
            <span className="shrink-0 rounded-full bg-[var(--menu-surface-alt)] px-3 py-1.5 text-sm font-extrabold text-[var(--menu-text)]">
              {formatPrice(product.precio ?? 0)}
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

          <section>
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
          </section>
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--menu-border)] bg-[var(--menu-surface)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-4">
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(selection, quantity)}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-[16px] text-sm font-bold disabled:opacity-50"
            style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
          >
            Agregar · {formatPrice(unitPrice * quantity)}
          </button>
        </div>
      </div>
    </div>
  );
}
