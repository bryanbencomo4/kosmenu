// @ts-nocheck
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

type CategoriaRow = {
  id: string;
  nombre: string;
  orden: number | null;
};

type ProductoRow = {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion: string | null;
  precio: number | null;
  imagen_url: string | null;
  disponible: boolean | null;
};

type ComercioRow = {
  id: string;
  nombre: string | null;
  whatsapp: string | null;
  telefono: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const dynamic = 'force-dynamic';

function formatCop(value: number | null) {
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

function buildProductWhatsAppUrl(
  phone: string,
  comercioNombre: string,
  productoNombre: string,
  precio: string,
) {
  const text = `Hola ${comercioNombre}, me gustaria pedir: ${productoNombre} - ${precio}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export default async function PublicMenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  const resolvedParams = await params;
  const comercioId = resolvedParams.id?.trim();
  if (!comercioId) {
    notFound();
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const [comercioResult, categoriasResult, productosResult] = await Promise.all([
    supabase
      .from('comercios')
      .select('id,nombre,whatsapp,telefono')
      .eq('id', comercioId)
      .maybeSingle<ComercioRow>(),
    supabase
      .from('categorias')
      .select('id,nombre,orden')
      .eq('comercio_id', comercioId)
      .order('orden', { ascending: true })
      .returns<CategoriaRow[]>(),
    supabase
      .from('productos')
      .select('id,categoria_id,nombre,descripcion,precio,imagen_url,disponible')
      .eq('comercio_id', comercioId)
      .eq('disponible', true)
      .order('nombre', { ascending: true })
      .returns<ProductoRow[]>(),
  ]);

  if (comercioResult.error) throw new Error(comercioResult.error.message);
  if (categoriasResult.error) throw new Error(categoriasResult.error.message);
  if (productosResult.error) throw new Error(productosResult.error.message);

  const comercio = comercioResult.data;
  if (!comercio) {
    notFound();
  }

  const categorias = categoriasResult.data ?? [];
  const productos = productosResult.data ?? [];

  const categoriasConProductos = categorias
    .map((categoria) => ({
      ...categoria,
      productos: productos.filter((producto) => producto.categoria_id === categoria.id),
    }))
    .filter((categoria) => categoria.productos.length > 0);

  const phone = normalizePhone(comercio.whatsapp ?? comercio.telefono);
  const comercioNombre = (comercio.nombre ?? 'Kosmenu').trim();
  const whatsappText = encodeURIComponent(
    `Hola ${comercioNombre}, quiero ordenar del menu.`,
  );
  const whatsappUrl = phone ? `https://wa.me/${phone}?text=${whatsappText}` : '#';
  const hasProducts = categoriasConProductos.some(
    (categoria) => categoria.productos.length > 0,
  );
  const infoHref = phone ? `tel:+${phone}` : whatsappUrl;
  const infoLabel = phone ? 'Llamar al Mesero' : 'Info';

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

          <a
            href={infoHref}
            target={phone ? undefined : '_blank'}
            rel={phone ? undefined : 'noreferrer'}
            className="rounded-full border border-[#D7A74D]/60 bg-[#251A10] px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-[#F8D287] transition hover:bg-[#2F2114]"
          >
            {infoLabel}
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-32 pt-24 sm:px-6">
        <p className="max-w-xl text-sm leading-6 text-[#D8C6AE]">
          Sabores listos para ordenar. Explora el menú y pide por WhatsApp en segundos.
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
              Estamos preparando nuestro menú digital... 👨‍🍳
            </p>
            <p className="mt-2 text-sm text-[#CFB28A]">
              Vuelve en unos minutos para descubrir nuestros platos.
            </p>
          </section>
        ) : (
          <section className="mt-6 space-y-8">
            {categoriasConProductos.map((categoria) => (
              <section
                key={categoria.id}
                id={`categoria-${categoria.id}`}
                className="scroll-mt-36 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-2xl font-semibold text-[#FFEACC]">
                    {categoria.nombre}
                  </h2>
                  <span className="text-xs uppercase tracking-[0.25em] text-[#BFA383]">
                    {categoria.productos.length} items
                  </span>
                </div>

                <div className="space-y-3">
                  {categoria.productos.map((producto) => {
                    const price = formatCop(producto.precio);
                    const productWhatsAppUrl = phone
                      ? buildProductWhatsAppUrl(
                          phone,
                          comercioNombre,
                          producto.nombre,
                          price,
                        )
                      : '#';

                    return (
                      <article
                        key={producto.id}
                        className="rounded-3xl border border-[#D7A74D]/20 bg-[#1A140E] p-3 shadow-xl shadow-black/30"
                      >
                        <div className="flex gap-3">
                          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-[#2A2118]">
                            <img
                              src={producto.imagen_url || '/placeholder-food.png'}
                              alt={producto.nombre}
                              className="h-full w-full object-cover"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="text-base font-bold leading-5 text-[#FFF6E8]">
                                {producto.nombre}
                              </h3>
                              <span className="rounded-full bg-[#169A56]/20 px-3 py-1 text-sm font-extrabold text-[#40D887]">
                                {price}
                              </span>
                            </div>

                            {producto.descripcion ? (
                              <p className="mt-2 text-sm leading-5 text-[#D9C6AB]">
                                {producto.descripcion}
                              </p>
                            ) : (
                              <p className="mt-2 text-sm leading-5 text-[#B89A77]">
                                Especialidad de la casa.
                              </p>
                            )}

                            <a
                              href={productWhatsAppUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={`mt-3 inline-flex items-center rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition ${
                                phone
                                  ? 'bg-[#1AB15E] text-white hover:bg-[#12944d]'
                                  : 'pointer-events-none bg-[#66513E] text-[#CBB79C]'
                              }`}
                            >
                              Pedir por WhatsApp
                            </a>
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

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noreferrer"
        className={`fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full px-5 py-4 text-sm font-extrabold shadow-2xl transition ${
          phone
            ? 'bg-[#1AB15E] text-white shadow-[#0a3b20]/40 hover:bg-[#159650]'
            : 'pointer-events-none bg-[#514130] text-[#C3AE92]'
        }`}
      >
        <span className="text-lg">WhatsApp</span>
        <span>Hacer pedido</span>
      </a>
    </main>
  );
}
