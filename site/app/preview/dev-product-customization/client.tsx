'use client';

import { useState, type CSSProperties } from 'react';
import { ProductOptionsSheet } from '../../v/[id]/_components/ProductOptionsSheet';
import { resolveCombinedUnitPrice, summarizeCartLineSelection, type CartLineSelection } from '../../_lib/menu-product-options';
import type { SnapshotProductRow, StoredOrderItem } from '../../api/_lib/order-item-snapshots';

type DemoResult = { error?: string; items?: StoredOrderItem[]; total?: number; message?: string };
type Props = {
  baseProducts: SnapshotProductRow[];
  optionProducts: SnapshotProductRow[];
  validate: (mode: boolean, selection: CartLineSelection, quantity: number) => Promise<DemoResult>;
};

const formatPrice = (amount: number) => `${amount.toLocaleString('es-CO')} COP`;
const style = {
  '--menu-surface': '#ffffff', '--menu-surface-alt': '#f3f5f7', '--menu-text': '#18232a',
  '--menu-text-muted': '#647078', '--menu-border': '#dce2e6', '--menu-primary': '#176d4e', '--menu-on-primary': '#ffffff',
} as CSSProperties;

export function CustomizationPreview({ baseProducts, optionProducts, validate }: Props) {
  const [mode, setMode] = useState(false);
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState<{ selection: CartLineSelection; quantity: number } | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [busy, setBusy] = useState(false);
  const catalog = mode ? optionProducts : baseProducts;
  const product = catalog[0];
  const partner = catalog[1];
  const price = line ? resolveCombinedUnitPrice(product, null, line.selection, partner) : 0;

  return <main style={style} className="min-h-dvh bg-[#f3f5f7] px-4 py-6 text-[#18232a]">
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-xl font-bold">Personalización · Preview</h1>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-sm font-semibold">Catálogo de prueba</legend>
        {[false, true].map((value) => <label key={String(value)} className="flex items-center gap-2 text-sm">
          <input type="radio" checked={mode === value} onChange={() => { setMode(value); setLine(null); setResult(null); }} />
          {value ? 'Con opciones · 50.000 / 80.000' : 'Base · 30.000 / 40.000'}
        </label>)}
      </fieldset>
      <section className="border-y border-[#dce2e6] py-4">
        <h2 className="font-bold">{product.nombre}</h2>
        <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-lg bg-[#176d4e] px-4 py-3 text-sm font-bold text-white">Configurar producto</button>
      </section>
      {line ? <section className="space-y-3">
        <h2 className="font-bold">Carrito</h2>
        <p>{line.quantity}x {product.nombre}{line.selection.combinacion ? ` + ${partner.nombre}` : ''}</p>
        <p className="text-sm">{summarizeCartLineSelection(product, line.selection, null, partner)}</p>
        <p className="font-bold">{formatPrice(price * line.quantity)}</p>
        <button type="button" disabled={busy} onClick={async () => {
          setBusy(true);
          try { setResult(await validate(mode, line.selection, line.quantity)); }
          catch { setResult({ error: 'No se pudo validar el pedido de prueba.' }); }
          finally { setBusy(false); }
        }} className="rounded-lg border border-[#176d4e] px-4 py-3 text-sm font-bold disabled:opacity-50">{busy ? 'Validando…' : 'Validar pedido de prueba'}</button>
      </section> : null}
      {result ? <section className="space-y-3 border-t border-[#dce2e6] pt-4">
        {result.error ? <p role="alert">{result.error}</p> : <>
          <h2 className="font-bold">Pedido · {formatPrice(result.total ?? 0)}</h2>
          <h3 className="text-sm font-semibold">Comanda WhatsApp</h3>
          <pre className="whitespace-pre-wrap break-words text-sm">{result.message}</pre>
          <details><summary className="cursor-pointer text-sm font-semibold">Snapshot</summary><pre className="overflow-x-auto text-xs">{JSON.stringify(result.items, null, 2)}</pre></details>
        </>}
      </section> : null}
    </div>
    <ProductOptionsSheet open={open} canAdd product={{ ...product, nombre: product.nombre ?? 'Producto A' }}
      compatibleProducts={catalog.map((entry) => ({ ...entry, nombre: entry.nombre ?? 'Producto' }))}
      imageUrl={null} category={null} formatPrice={formatPrice} onClose={() => setOpen(false)}
      onConfirm={(selection, quantity) => { setLine({ selection, quantity }); setResult(null); setOpen(false); }} />
  </main>;
}