export type KioskFulfillment = 'dine_in' | 'takeaway' | 'delivery';

export type KioskScreen = 'home' | 'categories' | 'products';

export type KioskCategory = {
  id: string;
  name: string;
  glyph: string;
  coverUrl: string | null;
  productCount: number;
};

export type KioskProduct = {
  id: string;
  name: string;
  description: string;
  priceLabel: string;
  imageUrl: string | null;
  available: boolean;
  /** Only set for products with option groups enabled ("3 tamaños disponibles"). */
  optionsSummary?: string | null;
};

export type KioskVoucherData = {
  managementMode?: 'platform' | 'whatsapp_manual';
  orderId: string;
  orderUrl: string;
  whatsappUrl?: string;
  fulfillment: KioskFulfillment;
  totalLabel: string;
  items: Array<{ name: string; quantity: number; priceLabel: string }>;
};

export const FULFILLMENT_LABEL: Record<KioskFulfillment, string> = {
  dine_in: 'Comer aqui',
  takeaway: 'Para llevar',
  delivery: 'Delivery',
};
