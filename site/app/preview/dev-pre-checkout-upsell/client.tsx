'use client';

import { useMemo, useState } from 'react';

import {
  buildCartLineKey,
  calculateProductPrice,
  formatProductPriceLabel,
  getProductMinimumPrice,
  parseCartLineKey,
  productRequiresConfiguration,
  type CartLineSelection,
} from '../../_lib/menu-product-options';
import {
  resolvePreCheckoutSuggestions,
  shouldShowPreCheckoutUpsell,
  type PreCheckoutCartLine,
} from '../../_lib/pre-checkout-upsell';
import { PreCheckoutUpsellSheet } from '../../v/[id]/_components/upsell/PreCheckoutUpsellSheet';

const categories = [
  { id: 'pizzas', nombre: 'Pizzas', rol: null, orden: 0 },
  { id: 'refrescos', nombre: 'Bebidas', rol: 'drink', orden: 1 },
  { id: 'dulces', nombre: 'Postres', rol: 'dessert', orden: 2 },
];

const colaOptions = {
  activadas: true,
  grupos: [
    {
      nombre: 'Tamaño',
      tipo: 'single',
      obligatorio: true,
      opciones: [
        { nombre: '400 ml', precio: 3500 },
        { nombre: '600 ml', precio: 6734 },
        { nombre: '1.5 litros', precio: 10101 },
      ],
    },
    {
      nombre: 'Sabor',
      tipo: 'single',
      opciones: [
        { nombre: 'Original', precio_extra: 0 },
        { nombre: 'Zero', precio_extra: 0 },
        { nombre: 'Sin azúcar', precio_extra: 0 },
      ],
    },
  ],
};

const heladoOptions = {
  activadas: true,
  grupos: [
    {
      nombre: 'Tamaño',
      tipo: 'single',
      obligatorio: true,
      opciones: [
        { nombre: '1 bola', precio: 6000 },
        { nombre: '2 bolas', precio: 9000 },
        { nombre: '3 bolas', precio: 12000 },
      ],
    },
    {
      nombre: 'Sabores',
      tipo: 'single',
      opciones: [
        { nombre: 'Chocolate', precio_extra: 0 },
        { nombre: 'Vainilla', precio_extra: 0 },
        { nombre: 'Fresa', precio_extra: 0 },
      ],
    },
    {
      nombre: 'Extras',
      tipo: 'multiple',
      opciones: [
        { nombre: 'Topping chocolate', precio_extra: 1000 },
        { nombre: 'Nueces', precio_extra: 1500 },
      ],
    },
  ],
};

const catalog = [
  { id: 'pizza', categoria_id: 'pizzas', nombre: 'Campesina', precio: 21500, orden: 0, opciones_menu: null as unknown },
  { id: 'especial', categoria_id: 'pizzas', nombre: 'Especial Nápoles', precio: 14141, orden: 1, opciones_menu: null as unknown },
  { id: 'agua', categoria_id: 'refrescos', nombre: 'Agua 600ml', precio: 3500, orden: 0, opciones_menu: null as unknown },
  {
    id: 'cola',
    categoria_id: 'refrescos',
    nombre: 'Coca Cola',
    descripcion: 'Bebida gaseosa',
    precio: 0,
    orden: 1,
    opciones_menu: colaOptions,
  },
  { id: 'sprite', categoria_id: 'refrescos', nombre: 'Sprite 600ml', precio: 6734, orden: 2, opciones_menu: null as unknown },
  {
    id: 'helado',
    categoria_id: 'dulces',
    nombre: 'Helado',
    descripcion: 'Elige tamaño y sabor',
    precio: 0,
    orden: 0,
    opciones_menu: heladoOptions,
  },
  { id: 'brownie', categoria_id: 'dulces', nombre: 'Brownie', precio: 8000, orden: 1, opciones_menu: null as unknown },
];

function money(amount: number) {
  const whole = Math.round(amount).toString();
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${grouped}`;
}

const configOn = { activo: true, tipos: ['bebida', 'postre'], max_productos: 8 } as const;

export function DevPreCheckoutUpsellClient() {
  const [offCart] = useState<PreCheckoutCartLine[]>([{ productId: 'pizza', categoryId: 'pizzas' }]);
  const [qty, setQty] = useState<Record<string, number>>({ pizza: 1, especial: 1 });
  const [open, setOpen] = useState(true);
  const [continued, setContinued] = useState(false);

  const onCart = useMemo<PreCheckoutCartLine[]>(
    () =>
      Object.entries(qty)
        .filter(([, quantity]) => quantity > 0)
        .map(([cartKey]) => {
          const { productId } = parseCartLineKey(cartKey);
          return {
            productId,
            categoryId: catalog.find((row) => row.id === productId)?.categoria_id,
          };
        }),
    [qty],
  );

  const offGroups = useMemo(
    () =>
      resolvePreCheckoutSuggestions({
        config: { upselling: false },
        categories,
        products: catalog,
        cart: offCart,
      }),
    [offCart],
  );

  const onGroups = useMemo(
    () =>
      resolvePreCheckoutSuggestions({
        config: configOn,
        categories,
        products: catalog,
        cart: onCart,
      }).map((group) => ({
        ...group,
        products: group.products.map((product) => {
          const full = catalog.find((row) => row.id === product.id);
          const quantity = Object.entries(qty).reduce((sum, [cartKey, count]) => {
            return parseCartLineKey(cartKey).productId === product.id ? sum + count : sum;
          }, 0);
          return {
            ...product,
            precio: full ? getProductMinimumPrice(full) : product.precio,
            quantity,
            hasOptions: full ? productRequiresConfiguration(full, null) : false,
          };
        }),
      })),
    [onCart, qty],
  );

  const cartItems = Object.entries(qty)
    .filter(([, quantity]) => quantity > 0)
    .map(([cartKey, quantity]) => {
      const { productId, selection } = parseCartLineKey(cartKey);
      const product = catalog.find((row) => row.id === productId);
      if (!product) return null;
      const priced = calculateProductPrice(product, selection);
      const detail = priced.selecciones.map((row) => row.opcion).join(' · ') || null;
      return {
        id: cartKey,
        name: product.nombre,
        detail,
        quantity,
        priceLabel: money(priced.precioFinal * quantity),
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    name: string;
    detail: string | null;
    quantity: number;
    priceLabel: string;
  }>;

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const total = Object.entries(qty).reduce((sum, [cartKey, quantity]) => {
    const { productId, selection } = parseCartLineKey(cartKey);
    const product = catalog.find((row) => row.id === productId);
    if (!product) return sum;
    return sum + calculateProductPrice(product, selection).precioFinal * quantity;
  }, 0);

  function bump(productId: string, delta: number) {
    const cartKey = buildCartLineKey(productId, {});
    setQty((prev) => {
      const next = Math.max(0, (prev[cartKey] ?? prev[productId] ?? 0) + delta);
      const copy = { ...prev };
      delete copy[productId];
      copy[cartKey] = next;
      return copy;
    });
  }

  return (
    <main
      className="min-h-screen p-6"
      style={{
        background: 'var(--menu-background)',
        color: 'var(--menu-text)',
        ['--menu-primary' as string]: '#F5C400',
        ['--menu-on-primary' as string]: '#111111',
        ['--menu-background' as string]: '#111114',
        ['--menu-surface' as string]: '#18181C',
        ['--menu-surface-alt' as string]: '#222228',
        ['--menu-text' as string]: '#F5F5F5',
        ['--menu-text-muted' as string]: 'rgba(245,245,245,0.55)',
        ['--menu-border' as string]: 'rgba(255,255,255,0.1)',
        ['--menu-shadow' as string]: '0 24px 48px rgba(0,0,0,0.35)',
      }}
    >
      <h1 className="text-xl font-black">Preview localhost · venta sugerida</h1>
      <p className="mt-2 text-sm text-white/60">Esta ruta no existe en producción.</p>
      <ul className="mt-4 space-y-2 text-sm text-white/80">
        <li>
          Caso 1 sin upselling: {offGroups.length} grupos · interceptar=
          {String(
            shouldShowPreCheckoutUpsell({
              config: { upselling: false },
              categories,
              products: catalog,
              cart: offCart,
            }),
          )}
        </li>
        <li>Caso 2 con bebidas/postres: {onGroups.map((group) => group.categoryName).join(', ') || 'ninguno'}</li>
        <li>Caso 3/5 checkout: {continued ? 'fue al checkout' : 'pendiente'}</li>
        <li>
          Caso 4 carrito: {cartItems.map((item) => `${item.name} x${item.quantity}`).join(' + ')} = {money(total)}
        </li>
        <li>Agua 600ml: {formatProductPriceLabel(catalog[2], money)} · directo</li>
        <li>Coca Cola: {formatProductPriceLabel(catalog[3], money)} · configurador</li>
      </ul>
      {!open ? (
        <button
          type="button"
          className="mt-4 rounded-full bg-[#F5C400] px-4 py-2 text-sm font-black text-[#111]"
          onClick={() => {
            setContinued(false);
            setOpen(true);
          }}
        >
          Reabrir modal
        </button>
      ) : null}
      <PreCheckoutUpsellSheet
        open={open}
        cartItems={cartItems}
        cartCount={cartCount}
        cartTotalLabel={money(total)}
        groups={onGroups}
        formatPrice={money}
        onIncrement={(productId) => bump(productId, 1)}
        onDecrement={(productId) => bump(productId, -1)}
        onRemove={(cartKey) => {
          setQty((prev) => {
            if (!(cartKey in prev)) return prev;
            const next = { ...prev };
            delete next[cartKey];
            return next;
          });
        }}
        onKeepShopping={() => setOpen(false)}
        onContinue={() => {
          setOpen(false);
          setContinued(true);
        }}
        resolveConfigurableProduct={(productId) => {
          const product = catalog.find((row) => row.id === productId);
          if (!product) return null;
          return {
            id: product.id,
            nombre: product.nombre,
            descripcion: 'descripcion' in product ? String(product.descripcion ?? '') : null,
            precio: product.precio,
            opciones_menu: product.opciones_menu,
            imagen_url: null,
            category: { nombre: categories.find((row) => row.id === product.categoria_id)?.nombre ?? null },
          };
        }}
        onConfirmConfigured={(productId, selection: CartLineSelection, quantity) => {
          const cartKey = buildCartLineKey(productId, selection);
          setQty((prev) => ({ ...prev, [cartKey]: (prev[cartKey] ?? 0) + quantity }));
        }}
      />
    </main>
  );
}
