import { NextResponse } from 'next/server';

import { getServerSupabaseClient } from '../../_lib/supabase-server';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

type Params = {
  params: Promise<{ comercioId: string }>;
};

export async function GET(_: Request, { params }: Params) {
  try {
    const { comercioId: rawComercioId } = await params;
    const comercioId = decodeURIComponent(rawComercioId ?? '').trim();

    if (!comercioId) {
      return NextResponse.json({ error: 'Invalid comercioId.' }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();

    const comercioQuery = supabase.from('comercios').select('*').limit(1);
    const { data: comercios, error: comercioError } = isUuid(comercioId)
      ? await comercioQuery.eq('id', comercioId)
      : await comercioQuery.eq('slug', comercioId);

    if (comercioError) {
      throw new Error(comercioError.message);
    }

    const comercio = (comercios ?? [])[0] ?? null;
    if (!comercio) {
      return NextResponse.json({ error: 'Comercio not found.' }, { status: 404 });
    }

    const resolvedComercioId = comercio.id;

    const [categoriasResult, productosResult, metodosPagoResult] = await Promise.all([
      supabase
        .from('categorias')
        .select('*')
        .eq('comercio_id', resolvedComercioId)
        .order('orden', { ascending: true }),
      supabase
        .from('productos')
        .select('*')
        .eq('comercio_id', resolvedComercioId)
        .order('nombre', { ascending: true }),
      supabase
        .from('metodos_pago')
        .select('*')
        .eq('comercio_id', resolvedComercioId),
    ]);

    if (categoriasResult.error) {
      throw new Error(categoriasResult.error.message);
    }

    if (productosResult.error) {
      throw new Error(productosResult.error.message);
    }

    if (metodosPagoResult.error) {
      throw new Error(metodosPagoResult.error.message);
    }

    const productos = (productosResult.data ?? []).filter((producto: any) => {
      if (typeof producto?.disponible === 'boolean') {
        return producto.disponible;
      }
      return true;
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          comercio,
          categorias: categoriasResult.data ?? [],
          productos,
          metodosPago: metodosPagoResult.data ?? [],
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load menu.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
