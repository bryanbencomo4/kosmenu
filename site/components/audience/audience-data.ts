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
  { title: 'Menos espera y más autoservicio', icon: ShieldCheck, accent: 'violet' },
  { title: 'Menú siempre actualizado', icon: RefreshCw, accent: 'yellow' },
  { title: 'Imagen más profesional en mesa', icon: Star, accent: 'violet' },
];
