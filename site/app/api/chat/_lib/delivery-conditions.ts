/**
 * Deterministic delivery conditions from the restaurant's real config.
 * Never invents a customer-specific fee without destination coordinates.
 * Keeps tariff currency separate from menu currency (no improvised FX).
 */
import {
  extractDeliveryConfigSource,
  parseDeliveryConfig,
  type DeliveryConfig,
} from '../../../_lib/delivery-config';
import type { LoadedPublicMenu } from '../../menu/_lib/load-public-menu';

function moneyLabel(amount: number, currency: string) {
  const code = (currency || '').trim();
  const n = Math.round(Math.max(0, amount) * 100) / 100;
  return code ? `${n} ${code}` : `${n}`;
}

export type DeliveryConditionsResult = {
  delivery_enabled: boolean;
  pickup_available: boolean;
  dine_in_available: boolean;
  menu_currency: string;
  tariff_currency: string;
  currencies_match: boolean;
  pricing_type: DeliveryConfig['pricingType'] | null;
  requires_customer_address: boolean;
  can_quote_exact_fee_now: boolean;
  exact_fee: number | null;
  exact_fee_label: string | null;
  /** Human-readable ranges — amounts stay in tariff_currency. */
  fee_overview: string[];
  min_order: number | null;
  min_order_label: string | null;
  estimated_delivery_minutes: number | null;
  estimated_preparation_minutes: number | null;
  free_delivery: { enabled: boolean; minimum_order: number; minimum_order_label: string | null } | null;
  custom_message: string | null;
  warning: string;
  note: string;
};

export function getDeliveryConditions(menu: LoadedPublicMenu): DeliveryConditionsResult {
  const comercio = menu.comercio as Record<string, unknown>;
  const menuCurrency = String(comercio.moneda || 'COP').trim().toUpperCase() || 'COP';
  const branding = menu.comercioRow?.branding_ia ?? null;
  const inicio =
    (branding as { config_negocio?: { inicio_menu?: Record<string, boolean> } } | null)
      ?.config_negocio?.inicio_menu ?? {};

  const deliveryFlag =
    comercio.permite_delivery === true || inicio.delivery === true;
  const pickup = inicio.para_llevar !== false;
  const dineIn = inicio.comer_aqui !== false;

  const source = extractDeliveryConfigSource(menu.comercioRow ?? { branding_ia: branding });
  const config = parseDeliveryConfig(source);
  const enabled = deliveryFlag && config.enabled;
  const tariffCurrency = (config.currency || '').trim() || menuCurrency;
  const currenciesMatch =
    tariffCurrency.toUpperCase() === menuCurrency.toUpperCase();

  const feeOverview: string[] = [];
  let exactFee: number | null = null;
  let requiresAddress = true;
  let canQuoteExact = false;

  if (!enabled) {
    return {
      delivery_enabled: false,
      pickup_available: pickup,
      dine_in_available: dineIn,
      menu_currency: menuCurrency,
      tariff_currency: tariffCurrency,
      currencies_match: currenciesMatch,
      pricing_type: null,
      requires_customer_address: false,
      can_quote_exact_fee_now: false,
      exact_fee: null,
      exact_fee_label: null,
      fee_overview: [],
      min_order: null,
      min_order_label: null,
      estimated_delivery_minutes: null,
      estimated_preparation_minutes: null,
      free_delivery: null,
      custom_message: null,
      warning:
        'Delivery no está habilitado o no hay tarifa configurada. No inventes un precio.',
      note: 'Ofrece pickup / menú tradicional si el cliente insiste.',
    };
  }

  switch (config.pricingType) {
    case 'fixed':
      exactFee = config.fixedPrice;
      requiresAddress = false;
      canQuoteExact = true;
      feeOverview.push(`Tarifa fija: ${moneyLabel(config.fixedPrice, tariffCurrency)}`);
      break;
    case 'free':
      exactFee = 0;
      requiresAddress = false;
      canQuoteExact = true;
      feeOverview.push(`Delivery gratis (${tariffCurrency})`);
      break;
    case 'zones':
      for (const z of config.zones.slice(0, 12)) {
        feeOverview.push(
          `${z.name}: ${moneyLabel(z.price, tariffCurrency)} (${z.minDistance}–${z.maxDistance} km)`,
        );
      }
      requiresAddress = true;
      canQuoteExact = false;
      break;
    case 'distance':
      feeOverview.push(
        `Base ${moneyLabel(config.distance.basePrice, tariffCurrency)} + ${moneyLabel(config.distance.extraPricePerKm, tariffCurrency)}/km extra (incluye ${config.distance.includedKm} km)`,
      );
      requiresAddress = true;
      canQuoteExact = false;
      break;
    case 'area_zones':
      for (const z of config.areaZones.slice(0, 12)) {
        feeOverview.push(`${z.name}: ${moneyLabel(z.price, tariffCurrency)}`);
      }
      requiresAddress = true;
      canQuoteExact = false;
      break;
    default:
      requiresAddress = true;
      canQuoteExact = false;
  }

  const warningParts = [
    'No inventes una tarifa exacta sin la dirección/zona del cliente.',
    !currenciesMatch
      ? `La tarifa de delivery está en ${tariffCurrency} y el menú en ${menuCurrency}: no los sumes ni conviertas sin tasa oficial del checkout.`
      : null,
  ].filter(Boolean);

  return {
    delivery_enabled: true,
    pickup_available: pickup,
    dine_in_available: dineIn,
    menu_currency: menuCurrency,
    tariff_currency: tariffCurrency,
    currencies_match: currenciesMatch,
    pricing_type: config.pricingType,
    requires_customer_address: requiresAddress,
    can_quote_exact_fee_now: canQuoteExact,
    exact_fee: canQuoteExact ? exactFee : null,
    exact_fee_label:
      canQuoteExact && exactFee != null
        ? moneyLabel(exactFee, tariffCurrency)
        : null,
    fee_overview: feeOverview,
    min_order: config.minOrder > 0 ? config.minOrder : null,
    min_order_label:
      config.minOrder > 0 ? moneyLabel(config.minOrder, tariffCurrency) : null,
    estimated_delivery_minutes: config.estimatedTimes.deliveryMinutes || null,
    estimated_preparation_minutes: config.estimatedTimes.preparationMinutes || null,
    free_delivery: config.freeDelivery.enabled
      ? {
          enabled: true,
          minimum_order: config.freeDelivery.minimumOrder,
          minimum_order_label: moneyLabel(
            config.freeDelivery.minimumOrder,
            tariffCurrency,
          ),
        }
      : { enabled: false, minimum_order: 0, minimum_order_label: null },
    custom_message: config.customMessage?.trim() || null,
    warning: warningParts.join(' '),
    note: requiresAddress
      ? 'Describe rangos/zonas si existen. El cargo definitivo se confirma en checkout con la ubicación.'
      : 'Puedes indicar la tarifa fija verificada. El checkout sigue siendo la fuente final.',
  };
}
