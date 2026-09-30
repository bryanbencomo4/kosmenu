'use client';

import { useState } from 'react';

import { ProductOptionsSheet } from '../../v/[id]/_components/ProductOptionsSheet';
import {
  calculateProductPrice,
  type CartLineSelection,
} from '../../_lib/menu-product-options';

const cop = (amount: number) =>
  `$${Math.round(amount).toLocaleString('es-CO')}`;

const plain = {
  id: 'p_plain',
  nombre: 'Jugo de naranja',
  descripcion: 'Producto sin opciones.',
  precio: 4000,
  opciones_menu: null,
};

const sizeOnly = {
  id: 'p_size',
  nombre: 'Hamburguesa',
  descripcion: 'Solo tamaño, precio fijo por opción.',
  precio: 0,
  opciones_menu: {
    activadas: true,
    grupos: [
      {
        id: 'tamano',
        nombre: 'Tamaño',
        tipo: 'unica',
        obligatorio: true,
        opciones: [
          { id: 'normal', nombre: 'Normal', precio: 16161 },
          { id: 'grande', nombre: 'Grande', precio: 21500 },
        ],
      },
    ],
  },
};

const fixedExtra = {
  id: 'p_fixed',
  nombre: 'Perro caliente',
  descripcion: 'Extra con precio fijo.',
  precio: 8000,
  opciones_menu: {
    activadas: true,
    grupos: [
      {
        id: 'extras',
        nombre: 'Extras',
        tipo: 'multiple',
        opciones: [{ id: 'queso', nombre: 'Extra queso', precio: 2000 }],
      },
    ],
  },
};

const dependent = {
  id: 'p_dep',
  nombre: 'Campesina',
  descripcion: 'El extra cambia según el tamaño.',
  precio: 0,
  opciones_menu: {
    activadas: true,
    grupos: [
      {
        id: 'tamano',
        nombre: 'Tamaño',
        tipo: 'unica',
        obligatorio: true,
        opciones: [
          { id: 'normal', nombre: 'Normal', precio: 16161, predeterminada: true },
          { id: 'grande', nombre: 'Grande', precio: 21500 },
        ],
      },
      {
        id: 'extras',
        nombre: 'Extras',
        tipo: 'multiple',
        opciones: [
          {
            id: 'queso_extra',
            nombre: 'Extra queso',
            precio_base: 0,
            reglas_precio: [
              { cuando: { grupo: 'tamano', opcion: 'normal' }, precio: 2000 },
              { cuando: { grupo: 'tamano', opcion: 'grande' }, precio: 5000 },
            ],
          },
          { id: 'tocineta', nombre: 'Tocineta', precio: 2000 },
          { id: 'otro', nombre: 'Otro', precio: 0, texto_libre: true },
        ],
      },
    ],
  },
};

const products = [plain, sizeOnly, fixedExtra, dependent] as const;

export function DevDependentPricesClient() {
  const [openId, setOpenId] = useState<string | null>(dependent.id);
  const [last, setLast] = useState<{
    nombre: string;
    precioFinal: number;
    selecciones: { grupo: string; opcion: string; precio: number }[];
  } | null>(null);

  const openProduct = products.find((product) => product.id === openId) ?? null;

  return (
    <div
      className="min-h-screen bg-[#f6f1ea] p-6 text-[#1a1a1a]"
      style={
        {
          '--menu-surface': '#fff',
          '--menu-surface-alt': '#f4f1ec',
          '--menu-text': '#1a1a1a',
          '--menu-text-muted': '#6b645c',
          '--menu-border': '#e6e0d6',
          '--menu-primary': '#c2410c',
          '--menu-on-primary': '#fff',
          '--menu-shadow': '0 16px 40px rgba(0,0,0,.12)',
        } as React.CSSProperties
      }
    >
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6b645c]">
        Localhost only · mock data
      </p>
      <h1 className="mt-2 text-2xl font-black">Precios dependientes</h1>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => setOpenId(product.id)}
            className="rounded-2xl border border-[#e6e0d6] bg-white px-4 py-3 text-left"
          >
            <span className="block text-sm font-extrabold">{product.nombre}</span>
            <span className="mt-1 block text-xs text-[#6b645c]">{product.descripcion}</span>
          </button>
        ))}
      </div>
      {last ? (
        <pre className="mt-4 overflow-auto rounded-2xl bg-white p-4 text-xs">
          {JSON.stringify(last, null, 2)}
        </pre>
      ) : null}
      <ProductOptionsSheet
        open={Boolean(openProduct)}
        canAdd
        product={openProduct}
        imageUrl={null}
        category={null}
        formatPrice={cop}
        onClose={() => setOpenId(null)}
        onConfirm={(selection: CartLineSelection) => {
          if (!openProduct) return;
          const priced = calculateProductPrice(openProduct, selection);
          setLast({
            nombre: openProduct.nombre,
            precioFinal: priced.precioFinal,
            selecciones: priced.selecciones,
          });
          setOpenId(null);
        }}
      />
    </div>
  );
}
