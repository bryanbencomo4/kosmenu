import { createElement, type ComponentProps } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

vi.mock('next/font/google', () => ({ Manrope: () => ({ className: 'test-font' }) }));

import { OrderReceipt } from '../app/orders/[orderId]/_components/OrderReceipt';

const props: ComponentProps<typeof OrderReceipt> = {
  businessName: 'Restaurante Preview', logoUrl: null, menuHref: '/v/preview',
  orderShortId: '#000156', createdAtLabel: 'ahora', status: 'pendiente', isDelivery: true,
  estimatedDeliveryLabel: null, locationHint: '', pickupAddress: '',
  timeline: [
    { key: 'pendiente', label: 'Recibido' }, { key: 'confirmado', label: 'Aceptado' },
    { key: 'en_camino', label: 'En camino' }, { key: 'entregado', label: 'Entregado' },
  ], currentStep: 0,
  items: [{ name: 'Pizza', quantity: 2, categoryName: 'Pizzas', amountLabel: '$ 18.000' }],
  subtotalLabel: '$ 18.000', deliveryLabel: '$ 2.000', deliveryFeeNote: null,
  cashChangeLabel: null, totalLabel: '$ 20.000', paymentLabel: 'Efectivo', paymentDetails: null,
  orderNotes: 'Cortar en ocho partes', cancelDetail: '',
  deliveryDelegateLabel: 'Repartidor reportó llegada', deliveryDelegateAcceptedAt: '',
  deliveryDelegateArrivedAt: '', deliveryDelegateCompletedAt: '',
  contactName: '', contactPhone: '', contactEmail: '',
  whatsappHref: 'https://wa.me/123', showWhatsapp: true, whatsappReady: true,
  canRepeatOrder: true, repeatClosedReason: null, onRepeatOrder: () => {},
  canCustomerConfirmDelegatedDelivery: true, deliveryConfirmationLoading: false,
  deliveryConfirmationMessage: '', onConfirmDelivery: () => {},
  canCustomerCancel: true, cancelLoading: false, cancelMessage: '', onCancelOrder: () => {},
  showPendingCancelHint: true, canCustomerRateService: false, customerServiceRating: null,
  serviceRatingLoading: false, serviceRatingMessage: '', onRateService: () => {},
  colors: {
    primary: '#FFAA00', secondary: '#111111', background: '#FFFFFF', surface: '#FFFFFF',
    onPrimary: '#111111', titleFont: 'Manrope', bodyFont: 'Manrope',
  },
};

describe('manual receipt is consultative', () => {
  it('hides workflow even if a caller supplies inconsistent action flags', () => {
    const html = renderToStaticMarkup(createElement(OrderReceipt, { ...props, managementMode: 'whatsapp_manual' }));
    expect(html).toContain('Gestionado por WhatsApp');
    expect(html).toContain('El comercio continuará');
    for (const label of ['Aceptado', 'En camino', 'Entregado', 'Confirmar que recibí', 'Cancelar pedido', 'Esperando confirmación', 'Repartidor reportó']) {
      expect(html).not.toContain(label);
    }
    expect(html).toContain('Pizza');
    expect(html).toContain('20.000');
    expect(html).toContain('Volver al menú');
    expect(html).toContain('WhatsApp');
  });
  it('old/missing-mode receipts retain the normal timeline and controls', () => {
    const old = renderToStaticMarkup(createElement(OrderReceipt, props));
    const platform = renderToStaticMarkup(createElement(OrderReceipt, { ...props, managementMode: 'platform' }));
    expect(platform).toBe(old);
    for (const label of ['Recibido', 'Aceptado', 'En camino', 'Entregado', 'Cancelar pedido']) expect(old).toContain(label);
  });
});