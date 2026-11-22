'use client';

import { useCallback, useMemo, useState, type CSSProperties } from 'react';

import {
  buildCartLineKey,
  parseCartLineKey,
  productRequiresConfiguration,
  resolveCartLineUnitPrice,
  validateOptionGroupSelection,
  type CartLineSelection,
} from '../../_lib/menu-product-options';
import { ChatAssistantView } from '../../v/[id]/_components/chat/ChatAssistantView';
import type {
  ChatAppliedAddNotice,
  ChatCartActionData,
} from '../../v/[id]/_components/chat/chat-types';
import { ProductOptionsSheet } from '../../v/[id]/_components/ProductOptionsSheet';

type Product = {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  disponible: boolean;
  opciones_menu: unknown;
  imagen_url: string | null;
  categoria_id: string | null;
};

type Category = {
  id: string;
  nombre: string;
  opciones_menu: unknown;
};

type Props = {
  commerceId: string;
  slug: string;
  businessName: string;
  currency: string;
  logoUrl: string | null;
  products: Product[];
  categories: Category[];
};

function formatMoney(amount: number, currency: string) {
  return `${Math.round(amount * 100) / 100} ${currency}`;
}

export function DevChatbotTruenoClient({
  commerceId,
  slug,
  businessName,
  currency,
  logoUrl,
  products,
  categories,
}: Props) {
  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const [cart, setCart] = useState<Record<string, number>>({});
  const [optionsProductId, setOptionsProductId] = useState<string | null>(null);
  const [incomingProposal, setIncomingProposal] =
    useState<ChatCartActionData | null>(null);
  const [appliedNotice, setAppliedNotice] =
    useState<ChatAppliedAddNotice | null>(null);
  const [sheetAddLock, setSheetAddLock] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [mode, setMode] = useState<'chat' | 'menu'>('chat');
  const [deliveryPoint, setDeliveryPoint] = useState<{
    lat: number;
    lng: number;
    label?: string | null;
  } | null>(null);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([cartKey, quantity]) => {
        const { productId, selection } = parseCartLineKey(cartKey);
        const product = productById.get(productId);
        if (!product || quantity <= 0) return null;
        const category = product.categoria_id
          ? categoryById.get(product.categoria_id) || null
          : null;
        const unitPrice = resolveCartLineUnitPrice(product, category, selection);
        if (!(unitPrice > 0)) return null;
        return { cartKey, product, category, selection, quantity, unitPrice };
      })
      .filter(Boolean) as Array<{
      cartKey: string;
      product: Product;
      category: Category | null;
      selection: CartLineSelection;
      quantity: number;
      unitPrice: number;
    }>;
  }, [cart, productById, categoryById]);

  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cartItems.reduce(
    (s, i) => s + i.unitPrice * i.quantity,
    0,
  );

  const addConfigured = useCallback(
    (productId: string, selection: CartLineSelection, quantity: number) => {
      const product = productById.get(productId);
      if (!product || product.disponible === false) return false;
      if (validateOptionGroupSelection(product, selection).length) return false;
      const category = product.categoria_id
        ? categoryById.get(product.categoria_id) || null
        : null;
      const unit = resolveCartLineUnitPrice(product, category, selection);
      if (!(unit > 0)) return false;
      const key = buildCartLineKey(productId, selection);
      setCart((prev) => ({
        ...prev,
        [key]: (prev[key] || 0) + Math.max(1, Math.floor(quantity || 1)),
      }));
      return true;
    },
    [productById, categoryById],
  );

  const optionsProduct = optionsProductId
    ? productById.get(optionsProductId) || null
    : null;

  return (
    <div
      className="min-h-[100dvh] bg-[var(--menu-background,#f7f7f8)] text-[var(--menu-text,#111)]"
      style={
        {
          '--menu-primary': '#c45c26',
          '--menu-on-primary': '#fff',
          '--menu-primary-hover': '#a84c1e',
          '--menu-surface': '#ffffff',
          '--menu-surface-alt': '#f3f1ee',
          '--menu-border': '#e5e1db',
          '--menu-text': '#1c1917',
          '--menu-text-muted': '#78716c',
          '--menu-background': '#faf8f5',
        } as CSSProperties
      }
      data-preview="dev-chatbot-trueno"
      data-cart-count={cartCount}
      data-preview-mode={mode}
    >
      {mode === 'chat' ? (
        <ChatAssistantView
          comercioId={slug}
          businessName={businessName}
          logoUrl={logoUrl}
          initialLetter={(businessName || 'P').slice(0, 1).toUpperCase()}
          cartCount={cartCount}
          cartTotalLabel={formatMoney(cartTotal, currency)}
          cartSnapshot={cartItems.map((i) => ({
            productId: i.product.id,
            quantity: i.quantity,
            selection: i.selection,
          }))}
          chatRuntimeEnabled={false}
          probeServerAuth
          onOpenMenu={() => setMode('menu')}
          onOpenCart={() => setShowCheckout(true)}
          onOpenCheckout={() => {
            setMode('menu');
            setShowCheckout(true);
          }}
          onShareLocationForDelivery={(location) => {
            setDeliveryPoint({
              lat: location.lat,
              lng: location.lng,
              label: location.label,
            });
            setMode('menu');
            setShowCheckout(true);
          }}
          incomingProposal={incomingProposal}
          onIncomingProposalConsumed={() => setIncomingProposal(null)}
          incomingAppliedNotice={appliedNotice}
          onIncomingAppliedNoticeConsumed={() => setAppliedNotice(null)}
          onConfigureProduct={(productId) => setOptionsProductId(productId)}
          onAddSimpleProduct={(productId) => {
            const p = productById.get(productId);
            if (!p) return;
            if (productRequiresConfiguration(p)) {
              setOptionsProductId(productId);
              return;
            }
            addConfigured(productId, {}, 1);
          }}
          onApplyCartAction={(action) => {
            if (action.type === 'propose_add') {
              return addConfigured(
                action.product_id,
                action.selection,
                action.quantity,
              );
            }
            if (action.type === 'propose_update_qty') {
              setCart((prev) => {
                const next = { ...prev };
                if (action.quantity <= 0) delete next[action.cart_key];
                else next[action.cart_key] = action.quantity;
                return next;
              });
              return true;
            }
            if (action.type === 'propose_remove') {
              setCart((prev) => {
                const next = { ...prev };
                delete next[action.cart_key];
                return next;
              });
              return true;
            }
            if (action.type === 'open_checkout') {
              setShowCheckout(true);
              return true;
            }
            return false;
          }}
        />
      ) : (
        <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-4 py-4">
          <header className="mb-4 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--menu-text-muted)]">
                Menú tradicional (preview)
              </p>
              <h1 className="text-xl font-bold">{businessName}</h1>
            </div>
            <button
              type="button"
              className="rounded-lg bg-[var(--menu-primary)] px-3 py-2 text-sm font-semibold text-[var(--menu-on-primary)]"
              onClick={() => setMode('chat')}
            >
              Volver al chat
            </button>
          </header>
          <p className="mb-3 text-sm text-[var(--menu-text-muted)]">
            Carrito compartido: {cartCount} ítem(s) ·{' '}
            {formatMoney(cartTotal, currency)}
          </p>
          <ul className="space-y-2">
            {cartItems.map((item) => (
              <li
                key={item.cartKey}
                className="rounded-xl border border-[var(--menu-border)] bg-[var(--menu-surface)] p-3 text-sm"
                data-cart-key={item.cartKey}
                data-cart-qty={item.quantity}
                data-cart-unit={item.unitPrice}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {item.quantity}× {item.product.nombre}
                    </p>
                    <p className="text-xs text-[var(--menu-text-muted)]">
                      {formatMoney(item.unitPrice * item.quantity, currency)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-cart-dec={item.cartKey}
                      className="h-8 w-8 rounded-lg border border-[var(--menu-border)] text-sm font-bold"
                      onClick={() =>
                        setCart((prev) => {
                          const next = { ...prev };
                          const q = (next[item.cartKey] || 0) - 1;
                          if (q <= 0) delete next[item.cartKey];
                          else next[item.cartKey] = q;
                          return next;
                        })
                      }
                    >
                      −
                    </button>
                    <button
                      type="button"
                      data-cart-inc={item.cartKey}
                      className="h-8 w-8 rounded-lg border border-[var(--menu-border)] text-sm font-bold"
                      onClick={() =>
                        setCart((prev) => ({
                          ...prev,
                          [item.cartKey]: (prev[item.cartKey] || 0) + 1,
                        }))
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              </li>
            ))}
            {cartItems.length === 0 ? (
              <li className="text-sm text-[var(--menu-text-muted)]">
                Carrito vacío
              </li>
            ) : null}
          </ul>
          <button
            type="button"
            data-open-checkout="1"
            className="mt-4 rounded-xl border border-[var(--menu-border)] px-3 py-2 text-sm font-semibold"
            onClick={() => setShowCheckout(true)}
            disabled={cartCount === 0}
          >
            Abrir checkout (preview)
          </button>
        </div>
      )}

      <ProductOptionsSheet
        open={Boolean(optionsProduct)}
        canAdd={Boolean(optionsProduct?.disponible)}
        product={optionsProduct}
        imageUrl={optionsProduct?.imagen_url || null}
        category={
          optionsProduct?.categoria_id
            ? categoryById.get(optionsProduct.categoria_id) || null
            : null
        }
        formatPrice={(n) => formatMoney(n, currency)}
        onClose={() => setOptionsProductId(null)}
        onConfirm={(selection, quantity) => {
          if (!optionsProduct || sheetAddLock) return;
          setSheetAddLock(true);
          try {
            if (validateOptionGroupSelection(optionsProduct, selection).length) {
              setAppliedNotice({
                label:
                  'No se pudo agregar: revisa las opciones obligatorias.',
              });
              setOptionsProductId(null);
              return;
            }
            const category = optionsProduct.categoria_id
              ? categoryById.get(optionsProduct.categoria_id) || null
              : null;
            const unit = resolveCartLineUnitPrice(
              optionsProduct,
              category,
              selection,
            );
            if (!(unit > 0)) {
              setAppliedNotice({
                label:
                  'No se pudo agregar: precio o disponibilidad no válidos.',
              });
              setOptionsProductId(null);
              return;
            }
            const ok = addConfigured(
              optionsProduct.id,
              selection,
              quantity,
            );
            if (!ok) {
              setAppliedNotice({
                label: 'No se pudo agregar al carrito.',
              });
              setOptionsProductId(null);
              return;
            }
            const lineTotal = Math.round(unit * quantity * 100) / 100;
            setAppliedNotice({
              label: `${quantity}× ${optionsProduct.nombre}`,
              productCard: {
                product_id: optionsProduct.id,
                name: optionsProduct.nombre,
                description: optionsProduct.descripcion.slice(0, 160) || null,
                image_url: optionsProduct.imagen_url,
                currency,
                price_base: optionsProduct.precio,
                price_unit: unit,
                price_label: formatMoney(unit, currency),
                line_total: lineTotal,
                line_total_label: formatMoney(lineTotal, currency),
                available: true,
                requires_configuration: false,
                option_hints: [],
                quantity,
              },
            });
            setOptionsProductId(null);
          } finally {
            window.setTimeout(() => setSheetAddLock(false), 400);
          }
        }}
      />

      {showCheckout ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
          data-checkout-preview="1"
        >
          <div className="max-h-[85dvh] w-full max-w-md overflow-auto rounded-2xl bg-[var(--menu-surface)] p-4 shadow-xl">
            <h2 className="text-lg font-bold">Checkout (preview local)</h2>
            <p className="mt-1 text-sm text-[var(--menu-text-muted)]">
              No se envía ningún pedido. Subtotal{' '}
              {formatMoney(cartTotal, currency)}.
            </p>
            {deliveryPoint ? (
              <p
                className="mt-2 rounded-lg bg-[var(--menu-surface-alt)] px-3 py-2 text-sm"
                data-checkout-delivery-point="1"
              >
                Delivery · ubicación del chat:{' '}
                {deliveryPoint.label ||
                  `${deliveryPoint.lat.toFixed(5)}, ${deliveryPoint.lng.toFixed(5)}`}
              </p>
            ) : null}
            <ul className="mt-3 space-y-2 text-sm">
              {cartItems.map((i) => (
                <li key={i.cartKey}>
                  {i.quantity}× {i.product.nombre} —{' '}
                  {formatMoney(i.unitPrice * i.quantity, currency)}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-[var(--menu-primary)] py-2.5 text-sm font-semibold text-[var(--menu-on-primary)]"
              onClick={() => setShowCheckout(false)}
            >
              Cerrar (sin confirmar pedido)
            </button>
          </div>
        </div>
      ) : null}

      <p className="sr-only">
        commerce {commerceId} preview shell — orders disabled
      </p>
    </div>
  );
}
