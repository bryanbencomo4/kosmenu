import type { DeliveryQuote } from '../../../../_lib/delivery-config';

export type ChatDeliveryLocationResult = {
  kind: 'quoted' | 'free' | 'out_of_zone' | 'blocked' | 'no_delivery' | 'pickup_only';
  /** Human reply for the assistant bubble. */
  message: string;
  /** Whether checkout should open in delivery mode with this pin. */
  openCheckout: boolean;
  fee: number | null;
  currency: string | null;
};

export function buildDeliveryLocationReply(input: {
  supportsDelivery: boolean;
  pickupAvailable?: boolean;
  quote: DeliveryQuote | null;
  feeLabel: string | null;
  currency?: string | null;
}): ChatDeliveryLocationResult {
  const pickup = input.pickupAvailable !== false;
  const pickupHint = pickup
    ? ' También puedes pedir para llevar y pasar a recoger.'
    : '';

  if (!input.supportsDelivery) {
    return {
      kind: 'no_delivery',
      message: `Por ahora este negocio no ofrece delivery.${pickup ? ' Puedes armar el pedido y pasarlo a recoger en el local.' : ''}`,
      openCheckout: false,
      fee: null,
      currency: null,
    };
  }

  const quote = input.quote;
  if (!quote) {
    return {
      kind: 'blocked',
      message: `Recibí tu ubicación. Confirma la tarifa de delivery en el checkout.${pickupHint}`,
      openCheckout: true,
      fee: null,
      currency: input.currency ?? null,
    };
  }

  if (quote.blocked || quote.outOfZone) {
    const reason =
      quote.blockReason?.trim() ||
      'Tu ubicación está fuera de la zona de cobertura de delivery.';
    return {
      kind: quote.outOfZone ? 'out_of_zone' : 'blocked',
      message: `${reason}${pickupHint}`,
      openCheckout: false,
      fee: null,
      currency: input.currency ?? null,
    };
  }

  if (quote.free || quote.fee <= 0) {
    return {
      kind: 'free',
      message: `Perfecto, hasta esa zona el delivery va *sin costo extra* (según el carrito actual).${pickupHint} ¿Seguimos al checkout?`,
      openCheckout: true,
      fee: 0,
      currency: input.currency ?? null,
    };
  }

  const label = (input.feeLabel || '').trim() || `${quote.fee}`;
  return {
    kind: 'quoted',
    message: `Recibí tu ubicación. Hasta esa zona el delivery sale aprox. *${label}* (el checkout confirma el monto final).${pickupHint}`,
    openCheckout: true,
    fee: quote.fee,
    currency: input.currency ?? null,
  };
}
