// @ts-nocheck
'use client';

import { createClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type CategoriaRow = {
  id: string;
  nombre: string;
  orden?: number | null;
};

type ProductoRow = {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion?: string | null;
  precio?: number | null;
  imagen_url?: string | null;
  disponible?: boolean | null;
};

type ComercioRow = {
  id: string;
  nombre?: string | null;
  whatsapp?: string | null;
  telefono?: string | null;
  celular?: string | null;
};

type MenuData = {
  comercio: ComercioRow;
  categorias: CategoriaRow[];
  productos: ProductoRow[];
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const publicBaseUrl = 'https://kosmenu.vercel.app';
const defaultProductImage =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">' +
      '<rect width="240" height="240" fill="#2A2118"/>' +
      '<circle cx="120" cy="95" r="34" fill="#D7A74D"/>' +
      '<rect x="56" y="145" width="128" height="22" rx="11" fill="#F5D39A"/>' +
      '<text x="120" y="206" text-anchor="middle" font-size="18" font-family="Arial" fill="#FFE8C6">Kosmenu</text>' +
      '</svg>',
  );

function formatCop(value: number | null | undefined) {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(safeValue);
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

function orderIdFrom(comercioId: string) {
  const safeComercioId = comercioId.trim() || 'kosmenu';
  return `${safeComercioId}-${Date.now()}`;
}

function safeImageSrc(imageUrl: string | null | undefined) {
  const src = (imageUrl ?? '').trim();
  return src.length > 0 ? src : defaultProductImage;
}

export default function PublicMenuPage() {
  const params = useParams<{ id: string }>();
  const comercioId = (params?.id ?? '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
      if (!supabaseUrl || !supabaseAnonKey) {
        setError('Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY.');
        setLoading(false);
        return;
      }

      if (!comercioId) {
        setError('El comercio_id no es valido.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false },
        });

        const [comercioResult, categoriasResult, productosResult] = await Promise.all([
          supabase
            .from('comercios')
            .select('*')
            .eq('id', comercioId)
            .maybeSingle<ComercioRow>(),
          supabase
            .from('categorias')
            .select('*')
            .eq('comercio_id', comercioId)
            .order('orden', { ascending: true })
            .returns<CategoriaRow[]>(),
          supabase
            .from('productos')
            .select('*')
            .eq('comercio_id', comercioId)
            .order('nombre', { ascending: true })
            .returns<ProductoRow[]>(),
        ]);

        if (comercioResult.error) throw new Error(comercioResult.error.message);
        if (categoriasResult.error) throw new Error(categoriasResult.error.message);
        if (productosResult.error) throw new Error(productosResult.error.message);

        const comercio = comercioResult.data;
        if (!comercio) {
          throw new Error('No se encontro el comercio para esta URL.');
        }

        const productos = (productosResult.data ?? []).filter((producto) => {
          if (typeof producto.disponible === 'boolean') {
            return producto.disponible;
          }
          return true;
        });

        if (!cancelled) {
          setMenuData({
            comercio,
            categorias: categoriasResult.data ?? [],
            productos,
          });
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Error cargando menu';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMenu();

    return () => {
      cancelled = true;
    };
  }, [comercioId]);

  const categoriasConProductos = useMemo(() => {
    if (!menuData) return [];

    return menuData.categorias
      .map((categoria) => ({
        ...categoria,
        productos: menuData.productos.filter((producto) => producto.categoria_id === categoria.id),
      }))
      .filter((categoria) => categoria.productos.length > 0);
  }, [menuData]);

  const productById = useMemo(() => {
    const map = new Map<string, ProductoRow>();
    for (const product of menuData?.productos ?? []) {
      map.set(product.id, product);
    }
    return map;
  }, [menuData]);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([productId, quantity]) => {
        const product = productById.get(productId);
        if (!product || quantity <= 0) return null;
        return { product, quantity };
      })
      .filter(Boolean) as Array<{ product: ProductoRow; quantity: number }>;
  }, [cart, productById]);

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + (item.product.precio ?? 0) * item.quantity, 0),
    [cartItems],
  );

  const comercioNombre = (menuData?.comercio.nombre ?? 'Kosmenu').trim();
  const whatsappNumber = normalizePhone(
    menuData?.comercio.whatsapp ?? menuData?.comercio.telefono ?? menuData?.comercio.celular,
  );

  function incrementProduct(productId: string) {
    setCart((prev) => ({
      ...prev,
      [productId]: (prev[productId] ?? 0) + 1,
    }));
  }

  function decrementProduct(productId: string) {
    setCart((prev) => {
      const current = prev[productId] ?? 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }

      return {
        ...prev,
        [productId]: current - 1,
      };
    });
  }

  async function persistOrderOptional(orderId: string) {
    if (!supabaseUrl || !supabaseAnonKey) return;

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      });

      const detalles = {
        order_id: orderId,
        items: cartItems.map((item) => ({
          product_id: item.product.id,
          nombre: item.product.nombre,
          cantidad: item.quantity,
          precio: item.product.precio ?? 0,
        })),
        total: cartTotal,
      };

      // Optional persistence: if schema differs, it should not block WhatsApp flow.
      const { error: insertError } = await supabase.from('pedidos').insert({
        comercio_id: comercioId,
        estado: 'pendiente',
        total: cartTotal,
        detalles,
      });

      if (insertError) {
        console.warn('No se pudo guardar pedido en Supabase (opcional):', insertError.message);
      }
    } catch (error) {
      console.warn('Persistencia opcional de pedido fallo:', error);
    }
  }

  async function confirmOrder() {
    if (!whatsappNumber || cartItems.length === 0 || isSubmittingOrder) return;

    setIsSubmittingOrder(true);
    try {
      const orderId = orderIdFrom(comercioId);
      await persistOrderOptional(orderId);

      const orderUrl = `${publicBaseUrl}/orders/${encodeURIComponent(orderId)}`;
      const message = `¡Hola! Quiero hacer un pedido. Puedes ver los detalles aqui: ${orderUrl}`;
      const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

      window.open(waUrl, '_blank', 'noopener,noreferrer');
      setCart({});
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0F0D0B] text-[#F9F3EB]">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-[#D7A74D]/50 border-t-[#D7A74D]" />
          <p className="mt-3 text-sm text-[#D8C6AE]">Cargando menu...</p>
        </div>
      </main>
    );
  }

  if (error || !menuData) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0F0D0B] px-6 text-[#F9F3EB]">
        <p className="max-w-md text-center text-sm text-[#E7D5BF]">
          {error ?? 'No se pudo cargar el menu.'}
        </p>
      </main>
    );
  }

  const hasProducts = categoriasConProductos.length > 0;

  return (
    <main className="min-h-screen bg-[#0F0D0B] text-[#F9F3EB]">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-[#C08A2C]/30 bg-[#16110C]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-[#D7A74D]">Kosmenu</p>
            <h1 className="font-serif text-2xl font-bold leading-tight text-[#FFF4E2]">
              {comercioNombre}
            </h1>
          </div>
          <span className="rounded-full border border-[#D7A74D]/60 bg-[#251A10] px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-[#F8D287]">
            Menu en linea
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-36 pt-24 sm:px-6">
        <p className="max-w-xl text-sm leading-6 text-[#D8C6AE]">
          Sabores listos para ordenar. Agrega productos al carrito y confirma por WhatsApp.
        </p>

        <nav className="sticky top-[72px] z-30 -mx-4 mt-4 overflow-x-auto border-y border-[#D7A74D]/20 bg-[#130F0B]/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex w-max gap-2">
            {categoriasConProductos.map((categoria) => (
              <a
                key={categoria.id}
                href={`#categoria-${categoria.id}`}
                className="rounded-full border border-[#D7A74D]/40 bg-[#2A1D12] px-4 py-2 text-sm font-semibold text-[#F5D39A] transition hover:bg-[#3A2919]"
              >
                {categoria.nombre}
              </a>
            ))}
          </div>
        </nav>

        {!hasProducts ? (
          <section className="mt-10 rounded-3xl border border-[#D7A74D]/20 bg-[#1B140E] p-8 text-center shadow-xl shadow-black/30">
            <p className="text-lg font-semibold text-[#FFEAC8]">
              Estamos preparando nuestro menu digital... 👨‍🍳
            </p>
          </section>
        ) : (
          <section className="mt-6 space-y-8">
            {categoriasConProductos.map((categoria) => (
              <section key={categoria.id} id={`categoria-${categoria.id}`} className="scroll-mt-36 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-2xl font-semibold text-[#FFEACC]">{categoria.nombre}</h2>
                  <span className="text-xs uppercase tracking-[0.25em] text-[#BFA383]">
                    {categoria.productos.length} items
                  </span>
                </div>

                <div className="space-y-3">
                  {categoria.productos.map((producto) => {
                    const quantity = cart[producto.id] ?? 0;

                    return (
                      <article
                        key={producto.id}
                        className="rounded-3xl border border-[#D7A74D]/20 bg-[#1A140E] p-3 shadow-xl shadow-black/30"
                      >
                        <div className="flex gap-3">
                          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-[#2A2118]">
                            <img
                              src={safeImageSrc(producto.imagen_url)}
                              alt={producto.nombre}
                              className="h-full w-full object-cover"
                              onError={(event) => {
                                const img = event.currentTarget;
                                if (img.src !== defaultProductImage) {
                                  img.onerror = null;
                                  img.src = defaultProductImage;
                                }
                              }}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="text-base font-bold leading-5 text-[#FFF6E8]">{producto.nombre}</h3>
                              <span className="rounded-full bg-[#169A56]/20 px-3 py-1 text-sm font-extrabold text-[#40D887]">
                                {formatCop(producto.precio)}
                              </span>
                            </div>

                            {producto.descripcion ? (
                              <p className="mt-2 text-sm leading-5 text-[#D9C6AB]">{producto.descripcion}</p>
                            ) : (
                              <p className="mt-2 text-sm leading-5 text-[#B89A77]">Especialidad de la casa.</p>
                            )}

                            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#120D08] p-1">
                              <button
                                type="button"
                                onClick={() => decrementProduct(producto.id)}
                                className="h-8 w-8 rounded-full bg-[#2A1E14] text-base font-bold text-[#FFD7A1] transition hover:bg-[#3A291C]"
                              >
                                -
                              </button>
                              <span className="min-w-7 text-center text-sm font-bold text-[#FFE8C6]">
                                {quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => incrementProduct(producto.id)}
                                className="h-8 w-8 rounded-full bg-[#1A9F56] text-base font-bold text-white transition hover:bg-[#128347]"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </section>
        )}
      </div>

      {cartCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#D7A74D]/30 bg-[#140F0B]/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#C9AB83]">
                {cartCount} item{cartCount === 1 ? '' : 's'} en carrito
              </p>
              <p className="text-lg font-black text-[#FFE5BC]">{formatCop(cartTotal)}</p>
            </div>

            <button
              type="button"
              onClick={() => void confirmOrder()}
              disabled={!whatsappNumber || isSubmittingOrder}
              className={`rounded-full px-5 py-3 text-sm font-extrabold transition ${
                !whatsappNumber || isSubmittingOrder
                  ? 'cursor-not-allowed bg-[#5A4A38] text-[#C3B299]'
                  : 'bg-[#1AB15E] text-white hover:bg-[#159650]'
              }`}
            >
              {isSubmittingOrder ? 'Procesando...' : 'Confirmar Pedido'}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
