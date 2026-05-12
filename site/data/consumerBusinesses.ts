export type FoodArtworkTheme =
  | 'burger'
  | 'pizza'
  | 'sushi'
  | 'dessert'
  | 'grill'
  | 'coffee'
  | 'salad'
  | 'tacos'
  | 'noodles';

export type NearbyBusiness = {
  id: string;
  name: string;
  category: string;
  rating: string;
  distance: string;
  eta: string;
  status: 'ABIERTO';
  artwork: FoodArtworkTheme;
  accent: string;
  zone: string;
  location: {
    lat: number;
    lng: number;
  };
};

export type PromotedBusiness = NearbyBusiness & {
  promoLabel: string;
  spotlightLabel?: string;
  promoTitle?: string;
  promoWindow?: string;
};

export type FeaturedBusiness = NearbyBusiness & {
  cuisine: string;
  tags: Array<'Delivery' | 'Retiro'>;
};

export type ConsumerCategory = {
  id: string;
  label: string;
  emoji: string;
  accent: string;
};

export type DiscoveryPin = {
  id: string;
  name: string;
  accent: string;
  category: string;
  location: {
    lat: number;
    lng: number;
  };
};

// TODO: reemplazar estos arrays mock por consultas a Supabase para negocios activos y publicos.
// TODO: conectar promociones del dia, categorias y favoritos al modelo real de negocio.
// TODO: sustituir las coordenadas fijas por datos geoespaciales y una busqueda real por zona.

export const directoryTotalBusinesses = 128;
export const directoryTotalPages = 13;

export const nearbyBusinesses: NearbyBusiness[] = [
  {
    id: 'nearby-parrilla-express',
    name: 'La Parrilla Express',
    category: 'Parrilla',
    rating: '4.7',
    distance: '0.2 km',
    eta: '6 min',
    status: 'ABIERTO',
    artwork: 'grill',
    accent: '#fb923c',
    zone: 'La Castellana',
    location: { lat: 10.4924, lng: -66.8575 },
  },
  {
    id: 'nearby-sushi-osaka',
    name: 'Sushi Osaka',
    category: 'Sushi',
    rating: '4.6',
    distance: '0.4 km',
    eta: '6 min',
    status: 'ABIERTO',
    artwork: 'sushi',
    accent: '#38bdf8',
    zone: 'Altamira',
    location: { lat: 10.5008, lng: -66.8464 },
  },
  {
    id: 'nearby-cafe-del-parque',
    name: 'Café del Parque',
    category: 'Café',
    rating: '4.8',
    distance: '0.6 km',
    eta: '8 min',
    status: 'ABIERTO',
    artwork: 'coffee',
    accent: '#a78bfa',
    zone: 'Los Palos Grandes',
    location: { lat: 10.4959, lng: -66.8444 },
  },
];

export const promotedBusinesses: PromotedBusiness[] = [
  {
    id: 'promo-burger-house',
    name: 'Burger House',
    category: 'Hamburguesas',
    rating: '4.8',
    distance: '0.3 km',
    eta: '15-25 min',
    status: 'ABIERTO',
    artwork: 'burger',
    accent: '#facc15',
    zone: 'Chacao',
    location: { lat: 10.4974, lng: -66.8618 },
    promoLabel: 'PROMO DEL DIA',
    spotlightLabel: 'DESTACADO',
    promoTitle: '2x1 en Smash Burgers',
    promoWindow: 'Hoy todo el día',
  },
  {
    id: 'promo-pizzeria-napoli',
    name: 'Pizzería Napoli',
    category: 'Pizza',
    rating: '4.7',
    distance: '0.4 km',
    eta: '22-30 min',
    status: 'ABIERTO',
    artwork: 'pizza',
    accent: '#f97316',
    zone: 'Sebucan',
    location: { lat: 10.5058, lng: -66.8554 },
    promoLabel: 'PROMO DEL DIA',
  },
  {
    id: 'promo-sushi-osaka',
    name: 'Sushi Osaka',
    category: 'Sushi',
    rating: '4.8',
    distance: '0.4 km',
    eta: '20-30 min',
    status: 'ABIERTO',
    artwork: 'sushi',
    accent: '#38bdf8',
    zone: 'Altamira',
    location: { lat: 10.5008, lng: -66.8464 },
    promoLabel: 'PROMO DEL DIA',
  },
  {
    id: 'promo-dulce-tentacion',
    name: 'Dulce Tentación',
    category: 'Postres',
    rating: '4.6',
    distance: '0.3 km',
    eta: '14-20 min',
    status: 'ABIERTO',
    artwork: 'dessert',
    accent: '#f472b6',
    zone: 'Campo Alegre',
    location: { lat: 10.4949, lng: -66.8501 },
    promoLabel: 'PROMO DEL DIA',
  },
  {
    id: 'promo-parrilla-express',
    name: 'La Parrilla Express',
    category: 'Parrilla',
    rating: '4.7',
    distance: '0.2 km',
    eta: '15-25 min',
    status: 'ABIERTO',
    artwork: 'grill',
    accent: '#fb923c',
    zone: 'La Castellana',
    location: { lat: 10.4924, lng: -66.8575 },
    promoLabel: 'PROMO DEL DIA',
  },
];

export const categories: ConsumerCategory[] = [
  { id: 'cat-burgers', label: 'Hamburguesas', emoji: '🍔', accent: '#facc15' },
  { id: 'cat-pizza', label: 'Pizza', emoji: '🍕', accent: '#fb923c' },
  { id: 'cat-sushi', label: 'Sushi', emoji: '🍣', accent: '#38bdf8' },
  { id: 'cat-coffee', label: 'Café', emoji: '☕', accent: '#a78bfa' },
  { id: 'cat-dessert', label: 'Postres', emoji: '🍰', accent: '#f472b6' },
  { id: 'cat-chinese', label: 'Comida china', emoji: '🥡', accent: '#22d3ee' },
  { id: 'cat-grill', label: 'Parrilla', emoji: '🥩', accent: '#fb923c' },
  { id: 'cat-breakfast', label: 'Desayunos', emoji: '🥐', accent: '#fde68a' },
];

export const featuredBusinesses: FeaturedBusiness[] = [
  {
    id: 'featured-burger-house',
    name: 'Burger House',
    category: 'Hamburguesas',
    cuisine: 'Smash burgers y papas',
    rating: '4.8',
    distance: '0.8',
    eta: '11 min',
    status: 'ABIERTO',
    artwork: 'burger',
    accent: '#facc15',
    zone: 'Chacao',
    location: { lat: 10.4974, lng: -66.8618 },
    tags: ['Delivery', 'Retiro'],
  },
  {
    id: 'featured-pizzeria-napoli',
    name: 'Pizzería Napoli',
    category: 'Pizza artesanal',
    cuisine: 'Pizzas y focaccias',
    rating: '4.7',
    distance: '0.4',
    eta: '22 min',
    status: 'ABIERTO',
    artwork: 'pizza',
    accent: '#f97316',
    zone: 'Sebucán',
    location: { lat: 10.5058, lng: -66.8554 },
    tags: ['Delivery', 'Retiro'],
  },
  {
    id: 'featured-sushi-osaka',
    name: 'Sushi Osaka',
    category: 'Sushi artesanal',
    cuisine: 'Rolls y nigiris premium',
    rating: '4.8',
    distance: '0.4',
    eta: '20 min',
    status: 'ABIERTO',
    artwork: 'sushi',
    accent: '#38bdf8',
    zone: 'Altamira',
    location: { lat: 10.5008, lng: -66.8464 },
    tags: ['Delivery', 'Retiro'],
  },
  {
    id: 'featured-dulce-tentacion',
    name: 'Dulce Tentación',
    category: 'Postres',
    cuisine: 'Postres, tortas y café',
    rating: '4.6',
    distance: '1.4',
    eta: '14 min',
    status: 'ABIERTO',
    artwork: 'dessert',
    accent: '#f472b6',
    zone: 'Campo Alegre',
    location: { lat: 10.4949, lng: -66.8501 },
    tags: ['Delivery', 'Retiro'],
  },
  {
    id: 'featured-parrilla-express',
    name: 'La Parrilla Express',
    category: 'Parrilla',
    cuisine: 'Parrilla, bowls y combos',
    rating: '4.7',
    distance: '1.8',
    eta: '17 min',
    status: 'ABIERTO',
    artwork: 'grill',
    accent: '#fb923c',
    zone: 'La Castellana',
    location: { lat: 10.4924, lng: -66.8575 },
    tags: ['Delivery', 'Retiro'],
  },
  {
    id: 'featured-green-bowl',
    name: 'Green Bowl',
    category: 'Healthy bowls',
    cuisine: 'Ensaladas y wraps',
    rating: '4.6',
    distance: '1.2',
    eta: '12 min',
    status: 'ABIERTO',
    artwork: 'salad',
    accent: '#34d399',
    zone: 'El Rosal',
    location: { lat: 10.4938, lng: -66.8682 },
    tags: ['Delivery', 'Retiro'],
  },
  {
    id: 'featured-taco-street',
    name: 'Taco Street',
    category: 'Mexicana',
    cuisine: 'Tacos y bowls',
    rating: '4.5',
    distance: '1.5',
    eta: '16 min',
    status: 'ABIERTO',
    artwork: 'tacos',
    accent: '#f59e0b',
    zone: 'Las Mercedes',
    location: { lat: 10.4804, lng: -66.8661 },
    tags: ['Delivery', 'Retiro'],
  },
  {
    id: 'featured-cafe-del-parque',
    name: 'Café del Parque',
    category: 'Cafetería',
    cuisine: 'Café, brunch y bakery',
    rating: '4.7',
    distance: '1.0',
    eta: '10 min',
    status: 'ABIERTO',
    artwork: 'coffee',
    accent: '#a78bfa',
    zone: 'Los Palos Grandes',
    location: { lat: 10.4959, lng: -66.8444 },
    tags: ['Retiro', 'Delivery'],
  },
  {
    id: 'featured-wok-roll',
    name: 'Wok & Roll',
    category: 'Asiática',
    cuisine: 'Wok y noodles',
    rating: '4.6',
    distance: '1.5',
    eta: '15 min',
    status: 'ABIERTO',
    artwork: 'noodles',
    accent: '#22d3ee',
    zone: 'Bello Campo',
    location: { lat: 10.4986, lng: -66.8403 },
    tags: ['Delivery', 'Retiro'],
  },
  {
    id: 'featured-pizza-co',
    name: 'Pizza & Co.',
    category: 'Pizza artesanal',
    cuisine: 'Pizzas y focaccias',
    rating: '4.8',
    distance: '2.0',
    eta: '20 min',
    status: 'ABIERTO',
    artwork: 'pizza',
    accent: '#fb923c',
    zone: 'Altamira Sur',
    location: { lat: 10.4908, lng: -66.8516 },
    tags: ['Delivery', 'Retiro'],
  },
];

export const discoveryPins: DiscoveryPin[] = [
  {
    id: 'pin-burger-house',
    name: 'Burger House',
    category: 'Hamburguesas',
    accent: '#facc15',
    location: { lat: 10.4974, lng: -66.8618 },
  },
  {
    id: 'pin-parrilla-express',
    name: 'La Parrilla Express',
    category: 'Parrilla',
    accent: '#fb923c',
    location: { lat: 10.4924, lng: -66.8575 },
  },
  {
    id: 'pin-sushi-osaka',
    name: 'Sushi Osaka',
    category: 'Sushi',
    accent: '#38bdf8',
    location: { lat: 10.5008, lng: -66.8464 },
  },
  {
    id: 'pin-cafe-del-parque',
    name: 'Café del Parque',
    category: 'Café',
    accent: '#a78bfa',
    location: { lat: 10.4959, lng: -66.8444 },
  },
  {
    id: 'pin-pizzeria-napoli',
    name: 'Pizzería Napoli',
    category: 'Pizza',
    accent: '#f97316',
    location: { lat: 10.5058, lng: -66.8554 },
  },
];