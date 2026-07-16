export type DemoStep = 'menu' | 'cart' | 'payment' | 'tracking';

export type DemoProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  imageSrc: string;
  imageAlt: string;
  category: 'recomendados' | 'entradas' | 'platos' | 'bebidas';
  badge?: string;
};

export const DEMO_CATEGORIES = [
  { id: 'recomendados', label: 'Recomendados' },
  { id: 'entradas', label: 'Entradas' },
  { id: 'platos', label: 'Platos fuertes' },
  { id: 'bebidas', label: 'Bebidas' },
] as const;

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: 'bbq-bacon',
    name: 'BBQ Bacon Rancher',
    description: 'Carne 180g, bacon, cheddar ahumado y salsa BBQ.',
    price: 10.99,
    imageSrc: '/demo/products/burger-bbq.png',
    imageAlt: 'Hamburguesa BBQ Bacon Rancher',
    category: 'recomendados',
    badge: 'Popular',
  },
  {
    id: 'pasta-alfredo',
    name: 'Pasta Alfredo',
    description: 'Fettuccine cremoso con pollo grillado y parmesano.',
    price: 11.9,
    imageSrc: '/demo/products/burger-mediterranean.png',
    imageAlt: 'Pasta Alfredo con pollo',
    category: 'platos',
  },
  {
    id: 'chicken-delight',
    name: 'Classic Chicken Delight',
    description: 'Pechuga crispy, lechuga, tomate y mayo de ajo.',
    price: 9.99,
    imageSrc: '/demo/products/burger-chicken.png',
    imageAlt: 'Hamburguesa de pollo Classic Chicken Delight',
    category: 'recomendados',
    badge: 'Clásica',
  },
  {
    id: 'limonada',
    name: 'Limonada Natural',
    description: 'Limón fresco, hierbabuena y un toque de azúcar.',
    price: 3.5,
    imageSrc: '/demo/products/limonada.png',
    imageAlt: 'Limonada natural con hierbabuena',
    category: 'bebidas',
  },
  {
    id: 'tacos',
    name: 'Tacos al Pastor',
    description: 'Con piña asada y cilantro fresco',
    price: 8.49,
    imageSrc: '/demo/products/tacos.png',
    imageAlt: 'Tacos al pastor con piña',
    category: 'entradas',
  },
  {
    id: 'salmon',
    name: 'Salmón al Grill',
    description: 'Acompañado de vegetales salteados y limón.',
    price: 14.99,
    imageSrc: '/demo/products/salmon.png',
    imageAlt: 'Salmón a la parrilla con vegetales',
    category: 'platos',
  },
  {
    id: 'cheesecake',
    name: 'Cheesecake de Maracuyá',
    description: 'Con coulis de maracuyá.',
    price: 4.99,
    imageSrc: '/demo/products/cheesecake.png',
    imageAlt: 'Cheesecake de maracuyá',
    category: 'recomendados',
  },
];

export const POPULAR_PRODUCT_IDS = ['tacos', 'salmon', 'cheesecake'] as const;

export const DEMO_FLOW_STEPS = [
  {
    id: 'menu' as const,
    number: 1,
    title: 'Explora el menú',
    description: 'Navegan categorías, ven descripciones, fotos y precios en tiempo real.',
    accent: 'violet' as const,
  },
  {
    id: 'cart' as const,
    number: 2,
    title: 'Agrega al carrito',
    description: 'Eligen sus productos y los agregan al carrito al instante.',
    accent: 'yellow' as const,
  },
  {
    id: 'payment' as const,
    number: 3,
    title: 'Pago rápido',
    description: 'Pagan de forma segura con tarjeta, billeteras digitales o transferencia.',
    accent: 'violet' as const,
  },
  {
    id: 'tracking' as const,
    number: 4,
    title: 'Seguimiento en vivo',
    description: 'Siguen su pedido en tiempo real hasta que llega a su mesa o domicilio.',
    accent: 'violet' as const,
  },
] as const;

export function formatUsd(value: number) {
  return `US$ ${value.toFixed(2).replace('.', ',')}`;
}
