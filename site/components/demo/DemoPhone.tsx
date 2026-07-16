'use client';

import Image from 'next/image';
import {
  CreditCard,
  MapPin,
  Menu,
  Minus,
  Plus,
  ShoppingCart,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
  formatUsd,
  type DemoProduct,
  type DemoStep,
} from './demo-data';

type CartMap = Record<string, number>;

type DemoPhoneProps = {
  step: DemoStep;
  cart: CartMap;
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
  onAdd: (productId: string) => void;
  onRemove: (productId: string) => void;
  onGoToCart: () => void;
  onGoToPayment: () => void;
  onGoToTracking: () => void;
  onGoToMenu: () => void;
};

function cartLines(cart: CartMap) {
  return DEMO_PRODUCTS.filter((product) => (cart[product.id] ?? 0) > 0).map((product) => ({
    product,
    qty: cart[product.id] ?? 0,
  }));
}

function cartTotal(cart: CartMap) {
  return cartLines(cart).reduce((sum, line) => sum + line.product.price * line.qty, 0);
}

function cartCount(cart: CartMap) {
  return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}

function ProductRow({
  product,
  onAdd,
}: {
  product: DemoProduct;
  onAdd: (productId: string) => void;
}) {
  return (
    <article className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.04] p-2.5">
      <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-[#121826]">
        <Image src={product.imageSrc} alt={product.imageAlt} fill sizes="72px" className="object-cover" />
        {product.badge ? (
          <span className="absolute left-1 top-1 rounded-full bg-white px-1.5 py-0.5 text-[0.52rem] font-bold uppercase tracking-wide text-violet-700">
            {product.badge}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate text-[0.82rem] font-semibold text-white">{product.name}</h4>
            <p className="mt-0.5 line-clamp-2 text-[0.68rem] leading-snug text-slate-400">{product.description}</p>
          </div>
          <button
            type="button"
            onClick={() => onAdd(product.id)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FACC15] text-[#0B0F1A] transition hover:bg-[#fde047] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FACC15]"
            aria-label={`Agregar ${product.name}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[0.84rem] font-bold text-[#FACC15]">{formatUsd(product.price)}</p>
      </div>
    </article>
  );
}

export function DemoPhone({
  step,
  cart,
  activeCategory,
  onCategoryChange,
  onAdd,
  onRemove,
  onGoToCart,
  onGoToPayment,
  onGoToTracking,
  onGoToMenu,
}: DemoPhoneProps) {
  const lines = cartLines(cart);
  const total = cartTotal(cart);
  const count = cartCount(cart);
  const filtered =
    activeCategory === 'recomendados'
      ? DEMO_PRODUCTS.filter((p) => p.category === 'recomendados' || Boolean(p.badge))
      : DEMO_PRODUCTS.filter((p) => p.category === activeCategory);

  return (
    <div className="relative mx-auto w-full max-w-[19.5rem] sm:max-w-[21rem] lg:max-w-[23.5rem]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[12%] h-[78%] w-[92%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(116,70,255,0.36)_0%,rgba(116,70,255,0.09)_42%,transparent_72%)] blur-2xl"
      />

      <div className="relative overflow-hidden rounded-[2.15rem] border border-violet-300/30 bg-[#05070f] p-[0.32rem] shadow-[0_40px_90px_-28px_rgba(0,0,0,0.95)] ring-1 ring-white/10 sm:rounded-[2.4rem] sm:p-[0.36rem]">
        <div className="pointer-events-none absolute left-1/2 top-[0.5rem] z-30 h-[1.3rem] w-[6.6rem] -translate-x-1/2 rounded-full bg-black/90" />

        <div className="relative flex h-[30rem] flex-col overflow-hidden rounded-[1.8rem] bg-[#070b14] sm:h-[32.5rem] sm:rounded-[2rem] lg:h-[36.5rem]">
          {step === 'menu' ? (
            <>
              <header className="relative z-20 flex items-center justify-between gap-2 border-b border-white/8 px-3.5 pb-2.5 pt-8">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/20 text-violet-200">
                    <Store className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[0.82rem] font-bold text-white">Delicious Burger</p>
                    <p className="truncate text-[0.62rem] text-slate-400">San Cristóbal · Abierto ahora</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80"
                    aria-label="Abrir menú"
                  >
                    <Menu className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onGoToCart}
                    className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80"
                    aria-label="Ver carrito"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    {count > 0 ? (
                      <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FACC15] px-1 text-[0.58rem] font-bold text-[#0B0F1A]">
                        {count}
                      </span>
                    ) : null}
                  </button>
                </div>
              </header>

              <div className="hide-scrollbar flex-1 overflow-y-auto px-3.5 pb-24 pt-3">
                <div className="relative mb-3 overflow-hidden rounded-2xl border border-white/8">
                  <div className="relative h-28 w-full">
                    <Image
                      src="/demo/products/hero-banner.png"
                      alt="Plato preparado al momento"
                      fill
                      sizes="320px"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#070b14] via-[#070b14]/45 to-transparent" />
                    <p className="absolute bottom-3 left-3 right-3 font-[var(--font-display)] text-[0.95rem] font-extrabold leading-tight text-white">
                      Hecho al momento, para ti
                    </p>
                  </div>
                </div>

                <div className="hide-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
                  {DEMO_CATEGORIES.map((category) => {
                    const active = activeCategory === category.id;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => onCategoryChange(category.id)}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-[0.72rem] font-semibold transition ${
                          active
                            ? 'bg-[#FACC15] text-[#0B0F1A]'
                            : 'border border-white/10 bg-white/5 text-white/70'
                        }`}
                      >
                        {category.label}
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2.5">
                  {filtered.map((product) => (
                    <ProductRow key={product.id} product={product} onAdd={onAdd} />
                  ))}
                </div>
              </div>

              {count > 0 ? (
                <div className="absolute inset-x-3 bottom-3 z-20">
                  <button
                    type="button"
                    onClick={onGoToCart}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-3.5 py-3 text-left shadow-[0_18px_40px_-20px_rgba(0,0,0,0.8)] transition hover:scale-[1.01]"
                  >
                    <div>
                      <p className="text-[0.72rem] font-semibold text-slate-600">
                        {count} producto{count === 1 ? '' : 's'} en el carrito
                      </p>
                      <p className="text-[0.92rem] font-bold text-[#0B0F1A]">{formatUsd(total)}</p>
                    </div>
                    <span className="inline-flex items-center rounded-xl bg-[#FACC15] px-3 py-2 text-[0.75rem] font-bold text-[#0B0F1A]">
                      Ver carrito
                    </span>
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {step === 'cart' ? (
            <div className="flex h-full flex-col px-3.5 pb-4 pt-8">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-violet-300/80">Checkout</p>
                  <h3 className="text-[1.05rem] font-bold text-white">Finaliza tu pedido</h3>
                </div>
                <button
                  type="button"
                  onClick={onGoToMenu}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70"
                  aria-label="Cerrar checkout"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mb-4 flex items-center justify-between gap-1 text-center text-[0.58rem] font-semibold uppercase tracking-wide text-white/45">
                {['Pedido', 'Cliente', 'Entrega', 'Pago'].map((label, index) => (
                  <div key={label} className="flex flex-1 flex-col items-center gap-1">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[0.68rem] font-bold ${
                        index === 0 ? 'bg-[#FACC15] text-[#0B0F1A]' : 'border border-violet-400/35 text-violet-200'
                      }`}
                    >
                      {index + 1}
                    </span>
                    {label}
                  </div>
                ))}
              </div>

              <div className="hide-scrollbar flex-1 space-y-3 overflow-y-auto">
                <p className="text-[0.92rem] font-semibold text-white">Pedido</p>
                <p className="text-[0.72rem] text-slate-400">Revisa tus productos. Ajusta cantidades o deja una nota.</p>

                {lines.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center">
                    <p className="text-sm text-slate-300">Tu carrito está vacío</p>
                    <button
                      type="button"
                      onClick={onGoToMenu}
                      className="mt-3 text-sm font-semibold text-[#FACC15]"
                    >
                      Volver al menú
                    </button>
                  </div>
                ) : (
                  lines.map(({ product, qty }) => (
                    <div key={product.id} className="rounded-2xl border border-white/8 bg-white/[0.04] p-3">
                      <div className="flex gap-3">
                        <div className="relative h-14 w-14 overflow-hidden rounded-xl">
                          <Image src={product.imageSrc} alt="" fill sizes="56px" className="object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-[0.82rem] font-semibold text-white">{product.name}</p>
                            <p className="text-[0.78rem] font-bold text-[#FACC15]">{formatUsd(product.price)}</p>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-2 py-1">
                              <button
                                type="button"
                                onClick={() => onRemove(product.id)}
                                className="text-violet-100"
                                aria-label={`Quitar ${product.name}`}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="min-w-4 text-center text-[0.78rem] font-bold text-white">{qty}</span>
                              <button
                                type="button"
                                onClick={() => onAdd(product.id)}
                                className="text-violet-100"
                                aria-label={`Agregar más ${product.name}`}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                for (let i = 0; i < qty; i += 1) onRemove(product.id);
                              }}
                              className="text-violet-300/80"
                              aria-label={`Eliminar ${product.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                <label className="block rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Nota para el negocio
                  </span>
                  <textarea
                    rows={2}
                    placeholder="Sin cebolla, tocar timbre..."
                    className="mt-2 w-full resize-none bg-transparent text-[0.78rem] text-white outline-none placeholder:text-slate-500"
                  />
                </label>
              </div>

              <div className="mt-3 border-t border-white/8 pt-3">
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-400">Total</p>
                    <p className="text-[1.15rem] font-bold text-white">{formatUsd(total)}</p>
                  </div>
                  <p className="text-[0.7rem] text-slate-400">
                    {count} unid. · USD
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={onGoToMenu}
                    className="rounded-xl border border-violet-400/30 px-3 py-3 text-[0.78rem] font-semibold text-white"
                  >
                    Seguir viendo
                  </button>
                  <button
                    type="button"
                    onClick={onGoToPayment}
                    disabled={count === 0}
                    className="rounded-xl bg-[#FACC15] px-3 py-3 text-[0.78rem] font-bold text-[#0B0F1A] disabled:opacity-40"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {step === 'payment' ? (
            <div className="flex h-full flex-col px-3.5 pb-4 pt-8">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-violet-300/80">Checkout</p>
                  <h3 className="text-[1.05rem] font-bold text-white">Finaliza tu pedido</h3>
                </div>
                <button
                  type="button"
                  onClick={onGoToCart}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70"
                  aria-label="Volver al pedido"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mb-4 flex items-center justify-between gap-1 text-center text-[0.58rem] font-semibold uppercase tracking-wide text-white/45">
                {['Pedido', 'Cliente', 'Entrega', 'Pago'].map((label, index) => (
                  <div key={label} className="flex flex-1 flex-col items-center gap-1">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[0.68rem] font-bold ${
                        index === 3 ? 'bg-[#FACC15] text-[#0B0F1A]' : 'border border-violet-400/35 text-violet-200'
                      }`}
                    >
                      {index + 1}
                    </span>
                    {label}
                  </div>
                ))}
              </div>

              <div className="flex-1 space-y-3">
                <p className="text-[0.92rem] font-semibold text-white">Método de pago</p>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 rounded-2xl border border-[#FACC15]/55 bg-[#FACC15]/8 p-3 text-left shadow-[0_0_24px_rgba(250,204,21,0.12)]"
                >
                  <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#FACC15] text-[#0B0F1A]">
                    <CreditCard className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-[0.85rem] font-bold text-white">Binance</span>
                    <span className="mt-0.5 block text-[0.7rem] text-slate-300">Paga de forma rápida y segura con cripto</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left"
                >
                  <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 text-violet-200">
                    <CreditCard className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-[0.85rem] font-bold text-white">Pago móvil</span>
                    <span className="mt-0.5 block text-[0.7rem] text-slate-400">Paga con tu billetera móvil preferida</span>
                  </span>
                </button>

                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <p className="text-[0.8rem] font-semibold text-white">Resumen de pago</p>
                  <div className="mt-2 space-y-1.5 text-[0.75rem] text-slate-300">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>{formatUsd(total || 20.98)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Costo de envío</span>
                      <span>{formatUsd(1.99)}</span>
                    </div>
                    <div className="flex justify-between border-t border-white/8 pt-2 text-[0.92rem] font-bold text-[#FACC15]">
                      <span>Total a pagar</span>
                      <span>{formatUsd((total || 20.98) + 1.99)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onGoToTracking}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FACC15] px-3 py-3.5 text-[0.85rem] font-bold text-[#0B0F1A]"
              >
                Confirmar pago
              </button>
            </div>
          ) : null}

          {step === 'tracking' ? (
            <div className="flex h-full flex-col px-3.5 pb-4 pt-8">
              <div className="mb-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/35 bg-cyan-400/10 px-2.5 py-1 text-[0.68rem] font-semibold text-cyan-100">
                  <MapPin className="h-3 w-3" />
                  Pedido en camino
                </span>
                <p className="mt-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Hora estimada de entrega
                </p>
                <p className="text-[1.55rem] font-black text-white">11:32 a. m.</p>
                <p className="text-[0.78rem] text-slate-400">En aprox. 18 min</p>
              </div>

              <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/20 text-violet-100">
                    <Store className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[0.82rem] font-semibold text-white">Delicious Burger</p>
                    <p className="text-[0.68rem] text-slate-400">Pedido #1048</p>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-[#FACC15]/35 bg-[#FACC15]/10 px-3 py-2 text-[0.72rem] text-[#FACC15]">
                  En preparación · tiempo estimado 18–22 min
                </div>
                <ol className="mt-3 space-y-2.5">
                  {[
                    { label: 'Recibido', active: true },
                    { label: 'En preparación', active: true, current: true },
                    { label: 'Listo', active: false },
                    { label: 'Entregado', active: false },
                  ].map((item) => (
                    <li key={item.label} className="flex items-center gap-2.5 text-[0.78rem]">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          item.current
                            ? 'bg-violet-300 shadow-[0_0_12px_rgba(196,181,253,0.9)]'
                            : item.active
                              ? 'bg-[#FACC15]'
                              : 'bg-white/20'
                        }`}
                      />
                      <span className={item.active ? 'text-white' : 'text-slate-500'}>{item.label}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="relative mt-3 flex-1 overflow-hidden rounded-2xl border border-white/8 bg-[#0c1220]">
                <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
                <svg viewBox="0 0 280 160" className="absolute inset-0 h-full w-full" aria-hidden="true">
                  <path
                    d="M40 120 C 90 40, 170 40, 230 90"
                    fill="none"
                    stroke="url(#demoRoute)"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="demoRoute" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#FACC15" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                  <circle cx="40" cy="120" r="7" fill="#FACC15" />
                  <circle cx="230" cy="90" r="8" fill="#a855f7" />
                </svg>
                <p className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-[0.68rem] text-white/80 backdrop-blur">
                  Ruta en vivo
                </p>
              </div>

              <button
                type="button"
                onClick={onGoToMenu}
                className="mt-3 w-full rounded-xl border border-[#FACC15]/40 px-3 py-3 text-[0.82rem] font-bold text-[#FACC15]"
              >
                Volver al menú demo
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
