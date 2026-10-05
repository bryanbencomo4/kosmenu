import { notFound } from 'next/navigation';
import { buildOrderItemSnapshots, type SnapshotProductRow } from '../../api/_lib/order-item-snapshots';
import { sanitizeCartLineSelection, type CartLineSelection } from '../../_lib/menu-product-options';
import { buildDetailedMerchantWhatsappText } from '../../_lib/whatsapp-order-format';
import { CustomizationPreview } from './client';

const EXTRA_PARTNERS = ['Pepperoni', 'Hawaiana', 'Margarita', 'Cuatro quesos', 'Pollo champiñones', 'Mexicana',
  'Vegetariana', 'Carnes', 'BBQ', 'Napolitana', 'Jamón y queso', 'Ranchera'];

function products(configurable: boolean): SnapshotProductRow[] {
  const extras: SnapshotProductRow[] = EXTRA_PARTNERS.map((nombre, index) => ({
    id: `demo_p${index}`, comercio_id: 'demo', nombre: `Pizza ${nombre}`, disponible: true, precio: 40000,
    opciones_menu: { personalizacion: { version: 1 } },
  }));
  return [
    {
      id: 'demo_a', comercio_id: 'demo', nombre: 'Producto A', disponible: true,
      precio: configurable ? 0 : 30000,
      opciones_menu: {
        ...(configurable ? { activadas: true, grupos: [{ id: 'group_a', nombre: 'Formato', tipo: 'unica', obligatorio: true,
          opciones: [{ id: 'option_a', nombre: 'Grande', precio: 50000 }] }] } : { activadas: true, grupos: [
          { id: 'group_sauce', nombre: 'Salsa', tipo: 'unica', obligatorio: true, min: 1, max: 1,
            opciones: ['Rosada', 'Ajo', 'Tártara', 'BBQ', 'Piña', 'Mostaza miel', 'Picante', 'Chimichurri'].map((nombre, index) => ({ id: `sauce_${index}`, nombre, precio: 0 })) },
          { id: 'group_extras', nombre: 'Extras', tipo: 'multiple', obligatorio: false, min: 0, max: 4,
            pregunta_activada: true, pregunta: '¿Quieres agregar un extra?',
            opciones: ['Tocineta', 'Queso extra', 'Maíz tierno', 'Champiñones', 'Jalapeños', 'Huevo de codorniz', 'Aguacate', 'Pepinillos', 'Aros de cebolla', 'Papa ripio', 'Chorizo', 'Pollo desmechado']
              .map((nombre, index) => ({ id: `extra_${index}`, nombre, precio: 2000 + index * 500 })) },
          { id: 'group_custom', nombre: 'Ingrediente Extra', tipo: 'unica', obligatorio: false, pregunta_activada: true, pregunta_directa: true,
            opciones: [{ id: 'custom_extra', nombre: 'Añadir extra', precio: 3000, texto_libre: true }] },
        ] }),
        personalizacion: { version: 1,
          combinacion: { activada: true, titulo: 'Combina con', productos_compatibles: ['demo_b', ...extras.map((entry) => entry.id)], regla_precio: 'max', pregunta_activada: true },
          exclusiones: { activadas: true, titulo: '¿Quieres quitar algo?', pregunta_activada: true, ingredientes: ['Cebolla', 'Maíz', 'Lechuga', 'Tomate', 'Salsas', 'Queso', 'Pepinillos', 'Papas', 'Tocineta', 'Huevo']
            .map((nombre, index) => ({ id: `remove_${index}`, nombre })) },
        },
      },
    },
    {
      id: 'demo_b', comercio_id: 'demo', nombre: 'Producto B', disponible: true,
      precio: configurable ? 0 : 40000,
      opciones_menu: {
        ...(configurable ? { activadas: true, grupos: [{ id: 'group_b', nombre: 'Formato', tipo: 'unica', obligatorio: true,
          opciones: [{ id: 'option_b', nombre: 'Grande', precio: 80000 }] }] } : {}),
        personalizacion: { version: 1, exclusiones: { activadas: true, titulo: '¿Quieres quitar algo?', ingredientes: [{ id: 'remove_b', nombre: 'Aceitunas' }] } },
      },
    },
    ...extras,
  ];
}

async function validateDemo(mode: boolean, raw: CartLineSelection, quantity: number) {
  'use server';
  if (process.env.NODE_ENV === 'production') throw new Error('Not available.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('Cantidad inválida.');
  const catalog = products(mode === true);
  const result = await buildOrderItemSnapshots({
    comercioId: 'demo',
    items: [{ product_id: 'demo_a', nombre: 'Producto A', cantidad: quantity, precio: 1 }],
    selections: [sanitizeCartLineSelection(raw)],
    loadProducts: async (ids) => catalog.filter((product) => ids.includes(product.id)),
    loadCategories: async () => [],
  });
  if (result.ok === false) return { error: result.message };
  const total = result.items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  return {
    items: result.items,
    total,
    message: buildDetailedMerchantWhatsappText({
      orderId: 'DEMO', appOrderUrl: 'https://preview.example/orders/DEMO', customerName: 'Cliente de prueba', customerWhatsapp: '',
      details: { management_mode: 'whatsapp_manual', moneda_base: 'COP', moneda_checkout: 'COP', total, items: result.items, delivery: { mode: 'pickup' } },
    }),
  };
}

export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <CustomizationPreview baseProducts={products(false)} optionProducts={products(true)} validate={validateDemo} />;
}