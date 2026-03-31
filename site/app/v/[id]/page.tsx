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
  slug?: string | null;
  nombre?: string | null;
  whatsapp?: string | null;
  telefono?: string | null;
  celular?: string | null;
};

type MetodoPagoRow = {
  id: string;
  nombre?: string | null;
  tipo?: string | null;
  banco?: string | null;
  titular?: string | null;
  cedula?: string | null;
  telefono?: string | null;
  numero?: string | null;
  alias?: string | null;
  descripcion?: string | null;
  detalles?: string | null;
};

type MenuData = {
  comercio: ComercioRow;
  categorias: CategoriaRow[];
  productos: ProductoRow[];
  metodosPago: MetodoPagoRow[];
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

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [clientEmail, setClientEmail] = useState('');
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<
    string | null
  >(null);

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

        const { data: comercios, error: comercioError } = await supabase
          .from('comercios')
          .select('*')
          .or(`id.eq.${comercioId},slug.eq.${comercioId}`)
          .limit(1)
          .returns<ComercioRow[]>();

        if (comercioError) throw new Error(comercioError.message);

        const comercio = (comercios ?? [])[0] ?? null;
        if (!comercio) {
          throw new Error('No se encontro el comercio para esta URL.');
        }

        const resolvedComercioId = comercio.id;

        const [categoriasResult, productosResult, metodosPagoResult] = await Promise.all([
          supabase
            .from('categorias')
            .select('*')
            .eq('comercio_id', resolvedComercioId)
            .order('orden', { ascending: true })
            .returns<CategoriaRow[]>(),
          supabase
            .from('productos')
            .select('*')
            .eq('comercio_id', resolvedComercioId)
            .order('nombre', { ascending: true })
            .returns<ProductoRow[]>(),
          supabase
            .from('metodos_pago')
            .select('*')
            .eq('comercio_id', resolvedComercioId)
            .returns<MetodoPagoRow[]>(),
        ]);

        if (categoriasResult.error) throw new Error(categoriasResult.error.message);
        if (productosResult.error) throw new Error(productosResult.error.message);
        if (metodosPagoResult.error) throw new Error(metodosPagoResult.error.message);

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
            metodosPago: metodosPagoResult.data ?? [],
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
  const normalizedClientEmail = clientEmail.trim().toLowerCase();
  const isClientEmailValid = emailRegex.test(normalizedClientEmail);
  const whatsappNumber = normalizePhone(
    menuData?.comercio.whatsapp ?? menuData?.comercio.telefono ?? menuData?.comercio.celular,
  );

  useEffect(() => {
    if (!menuData) return;
    if (selectedPaymentMethodId) return;

    if (menuData.metodosPago.length > 0) {
      setSelectedPaymentMethodId(menuData.metodosPago[0].id);
    }
  }, [menuData, selectedPaymentMethodId]);

  function paymentMethodLabel(method: MetodoPagoRow) {
    return (
      method.nombre?.trim() ||
      method.tipo?.trim() ||
      method.banco?.trim() ||
      'Metodo de pago'
    );
  }

  function paymentMethodDetails(method: MetodoPagoRow) {
    const details: string[] = [];
    if (method.banco) details.push(`Banco: ${method.banco}`);
    if (method.titular) details.push(`Titular: ${method.titular}`);
    if (method.cedula) details.push(`Cedula: ${method.cedula}`);
    if (method.telefono) details.push(`Telefono: ${method.telefono}`);
    if (method.numero) details.push(`Numero: ${method.numero}`);
    if (method.alias) details.push(`Alias: ${method.alias}`);
    if (method.descripcion) details.push(`${method.descripcion}`);
    if (method.detalles) details.push(`${method.detalles}`);

    return details;
  }

  function selectedPaymentMethod() {
    if (!menuData) return null;
    return (
      menuData.metodosPago.find((method) => method.id === selectedPaymentMethodId) ??
      null
    );
  }

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

  async function persistOrderOptional(
    orderId: string,
    email: string,
    paymentMethod: MetodoPagoRow | null,
  ) {
    if (!supabaseUrl || !supabaseAnonKey) return;

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      });

      const detalles = {
        order_id: orderId,
        cliente_email: email,
        metodo_pago: paymentMethod
          ? {
              id: paymentMethod.id,
              nombre: paymentMethodLabel(paymentMethod),
              datos: paymentMethodDetails(paymentMethod),
            }
          : null,
        items: cartItems.map((item) => ({
          product_id: item.product.id,
          nombre: item.product.nombre,
          cantidad: item.quantity,
          precio: item.product.precio ?? 0,
        })),
        total: cartTotal,
      };

      const payload = {
        comercio_id: comercioId,
        estado: 'pendiente',
        total: cartTotal,
        detalles,
        cliente_email: email,
      };

      // Optional persistence: if schema differs, it should not block WhatsApp flow.
      let { error: insertError } = await supabase.from('pedidos').insert(payload);

      if (insertError?.message?.toLowerCase().includes('cliente_email')) {
        const fallbackPayload = {
          comercio_id: comercioId,
          estado: 'pendiente',
          total: cartTotal,
          detalles,
        };
        const fallbackResult = await supabase.from('pedidos').insert(fallbackPayload);
        insertError = fallbackResult.error;
      }

      if (insertError) {
        console.warn('No se pudo guardar pedido en Supabase (opcional):', insertError.message);
      }
    } catch (error) {
      console.warn('Persistencia opcional de pedido fallo:', error);
    }
  }

  async function confirmOrder() {
    if (!whatsappNumber || cartItems.length === 0 || isSubmittingOrder || !isClientEmailValid) return;

    const selectedMethod = selectedPaymentMethod();

    setIsSubmittingOrder(true);
    try {
      const orderId = orderIdFrom(comercioId);
      await persistOrderOptional(orderId, normalizedClientEmail, selectedMethod);

      const orderUrl = `${publicBaseUrl}/orders/${encodeURIComponent(orderId)}`;
      const paymentLabel = selectedMethod
        ? paymentMethodLabel(selectedMethod)
        : 'No especificado';
      const message =
        `¡Hola! Quiero hacer un pedido.\n` +
        `Metodo de pago: ${paymentLabel}.\n` +
        `Correo del cliente: ${normalizedClientEmail}.\n` +
        `Adjunto el comprobante de pago en este chat.\n` +
        `Puedes ver los detalles aqui: ${orderUrl}`;
      const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

      try {
        await fetch('/api/send-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clientEmail: normalizedClientEmail,
            comercioNombre,
            orderId,
            orderTrackingUrl: orderUrl,
          }),
        });
      } catch (sendEmailError) {
        console.warn('No se pudo enviar email de respaldo:', sendEmailError);
      }

      window.open(waUrl, '_blank', 'noopener,noreferrer');
      setCart({});
      setClientEmail('');
      setIsConfirmOpen(false);
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
              onClick={() => setIsConfirmOpen(true)}
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

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/55 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full rounded-t-3xl border border-[#D7A74D]/25 bg-[#16110C] p-5 shadow-2xl sm:max-w-xl sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-2xl font-bold text-[#FFEACC]">
                Confirmar pedido
              </h3>
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="rounded-full bg-[#2D2015] px-3 py-1 text-xs font-bold text-[#F5D39A]"
              >
                Cerrar
              </button>
            </div>

            <p className="mt-2 text-sm text-[#D8C6AE]">
              Selecciona como deseas pagar para incluirlo en el mensaje al restaurante.
            </p>
            <p className="mt-1 text-xs text-[#CFAF85]">
              Importante: al enviar el pedido por WhatsApp, adjunta el comprobante de pago.
            </p>

            <div className="mt-4 space-y-3">
              {menuData?.metodosPago?.length ? (
                menuData.metodosPago.map((method) => {
                  const isSelected = selectedPaymentMethodId === method.id;
                  const details = paymentMethodDetails(method);

                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedPaymentMethodId(method.id)}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        isSelected
                          ? 'border-[#1AB15E] bg-[#112417]'
                          : 'border-[#6B4A2A] bg-[#1F160F] hover:border-[#D7A74D]/40'
                      }`}
                    >
                      <p className="text-sm font-extrabold text-[#FFE8C6]">
                        {paymentMethodLabel(method)}
                      </p>
                      {details.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {details.map((detail, index) => (
                            <p key={`${method.id}-detail-${index}`} className="text-xs text-[#D0B697]">
                              {detail}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-[#B89A77]">
                          Sin datos adicionales configurados.
                        </p>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-[#6B4A2A] bg-[#1F160F] p-3">
                  <p className="text-sm text-[#D8C6AE]">
                    Este comercio no tiene metodos de pago configurados. El pedido se enviara sin metodo seleccionado.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-[#D7A74D]/20 bg-[#130F0A] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[#C9AB83]">Total</p>
              <p className="text-xl font-black text-[#FFE5BC]">{formatCop(cartTotal)}</p>
            </div>

            <div className="mt-4">
              <label htmlFor="client-email" className="mb-2 block text-sm font-semibold text-[#F5D39A]">
                Tu Correo Electrónico
              </label>
              <input
                id="client-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="tucorreo@ejemplo.com"
                value={clientEmail}
                onChange={(event) => setClientEmail(event.target.value)}
                className="h-12 w-full rounded-xl border border-[#6B4A2A] bg-[#1F160F] px-4 text-base text-[#FFF3DE] outline-none transition placeholder:text-[#9D8266] focus:border-[#1AB15E] focus:ring-2 focus:ring-[#1AB15E]/25"
              />
              <p className="mt-2 text-xs text-[#CFAF85]">
                Te enviaremos el enlace de seguimiento a este correo por si pierdes esta pestaña.
              </p>
              {clientEmail.trim().length > 0 && !isClientEmailValid ? (
                <p className="mt-2 text-xs font-semibold text-[#F58C7E]">
                  Ingresa un correo valido para continuar.
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void confirmOrder()}
              disabled={isSubmittingOrder || !isClientEmailValid}
              className={`mt-4 w-full rounded-full px-5 py-3 text-sm font-extrabold transition ${
                isSubmittingOrder || !isClientEmailValid
                  ? 'cursor-not-allowed bg-[#5A4A38] text-[#C3B299]'
                  : 'bg-[#1AB15E] text-white hover:bg-[#159650]'
              }`}
            >
              {isSubmittingOrder ? 'Procesando...' : 'Enviar por WhatsApp'}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
