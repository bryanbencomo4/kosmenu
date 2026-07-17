import type { LucideIcon } from 'lucide-react';
import { BellRing, CakeSlice, Coffee, RefreshCw, ShieldCheck, Star, Truck, UtensilsCrossed } from 'lucide-react';

export type AudienceCategory = {
  label: string;
  icon: LucideIcon;
};

export const audienceCategories: AudienceCategory[] = [
  { label: 'Restaurantes', icon: UtensilsCrossed },
  { label: 'Cafeterías', icon: Coffee },
  { label: 'Food trucks', icon: Truck },
  { label: 'Dark kitchens', icon: BellRing },
  { label: 'Reposterías', icon: CakeSlice },
];

export type AudienceBenefit = {
  title: string;
  icon: LucideIcon;
  accent: 'violet' | 'yellow';
};

export const audienceBenefits: AudienceBenefit[] = [
  { title: 'Menos errores al recibir pedidos', icon: ShieldCheck, accent: 'violet' },
  { title: 'Catálogo siempre actualizado', icon: RefreshCw, accent: 'yellow' },
  { title: 'Experiencia más profesional', icon: Star, accent: 'violet' },
];

export type Testimonial = {
  quote: string;
  name: string;
  business: string;
  category: string;
  featured?: boolean;
};

// TODO: Reemplazar por testimonios verificados de clientes.
export const testimonials: Testimonial[] = [
  {
    quote:
      'Desde que usamos el menú digital, recibimos menos errores en los pedidos y nuestros clientes están más felices.',
    name: 'Cliente de restaurante',
    business: 'Restaurante local',
    category: 'Restaurante',
  },
  {
    quote:
      'Actualizar productos y precios me toma segundos. Ahora mi menú se ve mucho más profesional y mis clientes lo notan.',
    name: 'Cliente de cafetería',
    business: 'Cafetería local',
    category: 'Cafetería',
    featured: true,
  },
  {
    quote:
      'El menú digital nos ayudó a vender más por delivery. La experiencia del cliente mejoró muchísimo.',
    name: 'Cliente de food truck',
    business: 'Food truck local',
    category: 'Food truck',
  },
];
