'use client';

import { Manrope } from 'next/font/google';
import Link from 'next/link';
import { ArrowLeft, Check, MapPin, RotateCcw, Truck, Utensils } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

const headingFont = Manrope({
  subsets: ['latin'],
  weight: ['700', '800'],
});

type TimelineItem = {
  key: string;
  label: string;
};

type ReceiptItem = {
  name: string;
  quantity: number;
  amountLabel: string;
};

type OrderReceiptProps = {
  businessName: string;
  logoUrl: string | null;
  menuHref: string | null;
  orderShortId: string;
  createdAtLabel: string;
  status: 'pendiente' | 'confirmado' | 'preparando' | 'en_camino' | 'cancelado' | 'entregado';
  isDelivery: boolean;
  locationHint: string;
  pickupAddress: string;
  timeline: TimelineItem[];
  currentStep: number;
  pendingExpired: boolean;
  confirmTimeLeftLabel: string;
  confirmProgress: number;
  items: ReceiptItem[];
  subtotalLabel: string;
  deliveryLabel: string | null;
  cashChangeLabel: string | null;
  totalLabel: string;
  paymentLabel: string | null;
  paymentDetails: string | null;
  orderNotes: string;
  cancelDetail: string;
  deliveryDelegateLabel: string;
  deliveryDelegateAcceptedAt: string;
  deliveryDelegateArrivedAt: string;
  deliveryDelegateCompletedAt: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  whatsappHref: string;
  showWhatsapp: boolean;
  whatsappReady: boolean;
  canRepeatOrder: boolean;
  repeatClosedReason: string | null;
  onRepeatOrder: () => void;
  canCustomerConfirmDelegatedDelivery: boolean;
  deliveryConfirmationLoading: boolean;
  deliveryConfirmationMessage: string;
  onConfirmDelivery: () => void;
  canCustomerCancel: boolean;
  cancelLoading: boolean;
  cancelMessage: string;
  onCancelOrder: () => void;
  showPendingCancelHint: boolean;
  whatsappNotificationsEnabled: boolean;
  whatsappPreferenceSaving: boolean;
  notificationMessage: string;
  onSetWhatsappNotifications: (enabled: boolean) => void;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    onPrimary: string;
    titleFont: string;
    bodyFont: string;
  };
};

const STATUS_COPY: Record<
  OrderReceiptProps['status'],
  { title: string; headline: string }
> = {
  pendiente: {
    title: 'Recibido',
    headline: 'El comercio está revisando tu pedido',
  },
  confirmado: {
    title: 'Confirmado',
    headline: 'Ya lo aceptaron. Ahora lo preparan',
  },
  preparando: {
    title: 'En preparación',
    headline: 'Tu pedido se está cocinando',
  },
  en_camino: {
    title: 'En camino',
    headline: 'Ya va hacia ti',
  },
  entregado: {
    title: 'Entregado',
    headline: 'Gracias por tu pedido',
  },
  cancelado: {
    title: 'Cancelado',
    headline: 'Este pedido no se completó',
  },
};

const WHATSAPP_GREEN = '#25D366';
const WHATSAPP_DISABLE_CONFIRM =
  'Si desactivas las actualizaciones, puede que no te enteres de los cambios de tu pedido en tiempo real. ¿Quieres continuar?';

function WhatsAppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.02 3.2c-7.05 0-12.8 5.7-12.8 12.73 0 2.24.59 4.42 1.7 6.35L3.2 28.8l6.72-1.76a12.86 12.86 0 0 0 6.1 1.56h.01c7.05 0 12.8-5.7 12.8-12.73S23.07 3.2 16.02 3.2Zm7.45 18.05c-.31.86-1.8 1.64-2.5 1.74-.64.1-1.45.14-2.34-.14-.54-.18-1.23-.4-2.12-.79-3.73-1.61-6.16-5.36-6.35-5.61-.18-.25-1.51-2-1.51-3.82s.93-2.68 1.29-3.06c.31-.33.82-.48 1.31-.48.16 0 .3 0 .43.01.38.02.57.04.82.63.31.74 1.06 2.58 1.15 2.77.10.18.16.4.03.64-.12.25-.19.4-.37.62-.18.21-.35.38-.53.58-.19.21-.4.43-.17.82.22.4 1 1.64 2.14 2.66 1.48 1.31 2.68 1.72 3.1 1.9.31.14.64.12.86-.1.27-.27.93-1.08 1.18-1.45.25-.37.5-.3.82-.18.33.12 2.08.98 2.43 1.16.36.18.59.27.68.42.08.15.08.86-.23 1.72Z" />
    </svg>
  );
}

function cardStyle(surface: string): CSSProperties {
  return {
    backgroundColor: surface,
    boxShadow: '0 8px 30px rgba(15,23,42,0.06)',
  };
}

function BusinessMark({
  name,
  logoUrl,
  primary,
  onPrimary,
  size = 72,
}: {
  name: string;
  logoUrl: string | null;
  primary: string;
  onPrimary: string;
  size?: number;
}) {
  const letter = (name || 'C').slice(0, 1).toUpperCase();
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-[18px] bg-white object-contain shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid place-items-center rounded-[18px] text-2xl font-extrabold shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
      style={{
        width: size,
        height: size,
        backgroundColor: primary,
        color: onPrimary,
      }}
    >
      {letter}
    </span>
  );
}

function Section({
  title,
  children,
  surface,
}: {
  title: string;
  children: ReactNode;
  surface: string;
}) {
  return (
    <section className="mt-4 rounded-[22px] p-5" style={cardStyle(surface)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function OrderReceipt(props: OrderReceiptProps) {
  const copy = STATUS_COPY[props.status];
  const isCancelled = props.status === 'cancelado';
  const isDelivered = props.status === 'entregado';
  const stepCount = Math.max(props.timeline.length - 1, 1);
  const progressRatio = isCancelled ? 0 : Math.min(1, Math.max(0, props.currentStep) / stepCount);

  return (
    <main
      className="relative min-h-[100dvh] overflow-x-hidden px-4 pb-10 pt-6 text-slate-900 sm:px-6"
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${props.colors.primary} 10%, ${props.colors.background}) 0%, ${props.colors.background} 42%)`,
        fontFamily: props.colors.bodyFont,
        color: props.colors.secondary,
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36" aria-hidden>
        <div
          className="h-full w-full opacity-70"
          style={{
            background: `radial-gradient(ellipse at top, color-mix(in srgb, ${props.colors.primary} 22%, transparent), transparent 68%)`,
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-[440px]">
        {props.menuHref ? (
          <div className="mb-4">
            <Link
              href={props.menuHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
              Volver al menú
            </Link>
          </div>
        ) : null}

        <header className="flex flex-col items-center text-center">
          {props.menuHref ? (
            <Link href={props.menuHref} className="rounded-[18px]" aria-label={`Ir al menú de ${props.businessName}`}>
              <BusinessMark
                name={props.businessName}
                logoUrl={props.logoUrl}
                primary={props.colors.primary}
                onPrimary={props.colors.onPrimary}
              />
            </Link>
          ) : (
            <BusinessMark
              name={props.businessName}
              logoUrl={props.logoUrl}
              primary={props.colors.primary}
              onPrimary={props.colors.onPrimary}
            />
          )}
          <p className={`${headingFont.className} mt-3 text-[22px] font-extrabold leading-tight tracking-[-0.04em] text-[#111827]`}>
            {props.businessName || 'Comercio'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Pedido {props.orderShortId}
            {props.createdAtLabel ? ` · ${props.createdAtLabel}` : ''}
          </p>
        </header>

        <section className="mt-5 rounded-[22px] p-5" style={cardStyle(props.colors.surface)}>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={
              isCancelled
                ? { backgroundColor: '#FEF2F2', color: '#B91C1C' }
                : isDelivered
                  ? { backgroundColor: '#ECFDF5', color: '#047857' }
                  : {
                      backgroundColor: `color-mix(in srgb, ${props.colors.primary} 14%, white)`,
                      color: props.colors.primary,
                    }
            }
          >
            {copy.title}
          </span>
          <p
            className={`${headingFont.className} mt-2 text-[22px] font-extrabold leading-7 tracking-[-0.04em] text-[#111827]`}
            style={{ fontFamily: props.colors.titleFont }}
          >
            {copy.headline}
          </p>

          {!isCancelled ? (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.max(8, progressRatio * 100)}%`,
                    backgroundColor: isDelivered ? '#10B981' : props.colors.primary,
                  }}
                />
              </div>
              <ol className="mt-3 flex items-start justify-between gap-1">
                {props.timeline.map((item, index) => {
                  const done = index <= props.currentStep;
                  const current = index === props.currentStep;
                  return (
                    <li key={item.key} className="flex min-w-0 flex-1 flex-col items-center text-center">
                      <span
                        className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold"
                        style={{
                          backgroundColor: done ? props.colors.primary : '#E5E7EB',
                          color: done ? props.colors.onPrimary : '#94A3B8',
                          boxShadow: current ? `0 0 0 4px color-mix(in srgb, ${props.colors.primary} 18%, white)` : undefined,
                        }}
                      >
                        {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.6} /> : index + 1}
                      </span>
                      <span
                        className="mt-1.5 max-w-[4.8rem] text-[10px] font-semibold leading-3"
                        style={{ color: current ? props.colors.primary : done ? '#334155' : '#94A3B8' }}
                      >
                        {item.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}

          {props.status === 'pendiente' ? (
            <div
              className="mt-4 rounded-[16px] px-3.5 py-3 text-sm"
              style={{
                backgroundColor: props.pendingExpired ? '#FEF2F2' : '#FFFBEB',
                color: props.pendingExpired ? '#9F1239' : '#92400E',
              }}
            >
              {props.pendingExpired ? (
                <p>Se agotó el tiempo de confirmación. Estamos cerrando este pedido.</p>
              ) : (
                <>
                  <p className="font-semibold">Esperando al comercio · {props.confirmTimeLeftLabel}</p>
                  <p className="mt-0.5 text-[13px] opacity-80">Si no confirman en 15 minutos, el pedido se cancela solo.</p>
                  <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-black/10">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-[width] duration-1000"
                      style={{ width: `${Math.min(100, Math.max(2, props.confirmProgress * 100))}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          ) : null}

          {isCancelled ? (
            <div className="mt-4 rounded-[16px] bg-rose-50 px-3.5 py-3 text-sm text-rose-800">
              <p>{props.cancelDetail || 'Si necesitas ayuda, escríbeles por WhatsApp.'}</p>
            </div>
          ) : null}

          {props.locationHint ? (
            <p className="mt-4 flex items-start gap-2 text-sm leading-5 text-slate-600">
              {props.isDelivery ? (
                <Truck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: props.colors.primary }} />
              ) : (
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: props.colors.primary }} />
              )}
              <span>{props.locationHint}</span>
            </p>
          ) : null}

          {!props.isDelivery && props.pickupAddress ? (
            <p className="mt-2 pl-6 text-sm font-medium text-slate-700">{props.pickupAddress}</p>
          ) : null}
        </section>

        <Section title="Tu pedido" surface={props.colors.surface}>
          <ul className="space-y-2.5">
            {props.items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 font-medium text-slate-800">
                  <span className="mr-1.5 font-bold text-slate-500">{item.quantity}×</span>
                  {item.name}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">{item.amountLabel}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1.5 border-t border-dashed border-slate-200 pt-3 text-sm text-slate-500">
            <p className="flex items-center justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums text-slate-700">{props.subtotalLabel}</span>
            </p>
            {props.deliveryLabel ? (
              <p className="flex items-center justify-between">
                <span>Entrega</span>
                <span className="tabular-nums text-slate-700">{props.deliveryLabel}</span>
              </p>
            ) : null}
            {props.cashChangeLabel ? (
              <p className="flex items-center justify-between">
                <span>Cambio</span>
                <span className="tabular-nums text-slate-700">{props.cashChangeLabel}</span>
              </p>
            ) : null}
            <p className="flex items-center justify-between pt-1 text-base font-extrabold text-[#111827]">
              <span>Total</span>
              <span className="tabular-nums">{props.totalLabel}</span>
            </p>
          </div>
          {props.paymentLabel ? (
            <p className="mt-3 text-sm text-slate-500">
              Pago · <span className="font-medium text-slate-700">{props.paymentLabel}</span>
              {props.paymentDetails ? <span className="block text-[13px]">{props.paymentDetails}</span> : null}
            </p>
          ) : null}
        </Section>

        {props.orderNotes ? (
          <Section title="Notas" surface={props.colors.surface}>
            <p className="text-sm leading-6 text-slate-700">{props.orderNotes}</p>
          </Section>
        ) : null}

        {props.deliveryDelegateLabel ? (
          <Section title="Repartidor" surface={props.colors.surface}>
            <p className="text-sm font-medium text-slate-800">{props.deliveryDelegateLabel}</p>
            {props.deliveryDelegateAcceptedAt ? (
              <p className="mt-1 text-xs text-slate-500">Aceptado: {props.deliveryDelegateAcceptedAt}</p>
            ) : null}
            {props.deliveryDelegateArrivedAt ? (
              <p className="mt-1 text-xs text-slate-500">Llegó: {props.deliveryDelegateArrivedAt}</p>
            ) : null}
            {props.deliveryDelegateCompletedAt ? (
              <p className="mt-1 text-xs text-slate-500">Completado: {props.deliveryDelegateCompletedAt}</p>
            ) : null}
          </Section>
        ) : null}

        {(props.contactName || props.contactPhone || props.contactEmail) ? (
          <Section title="Tus datos" surface={props.colors.surface}>
            {props.contactName ? <p className="text-sm font-medium text-slate-800">{props.contactName}</p> : null}
            {props.contactPhone ? <p className="mt-1 text-sm text-slate-600">{props.contactPhone}</p> : null}
            {props.contactEmail ? <p className="mt-1 text-sm text-slate-600">{props.contactEmail}</p> : null}
          </Section>
        ) : null}

        {props.menuHref ? (
          <Link
            href={props.menuHref}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] text-sm font-bold"
            style={{ backgroundColor: props.colors.primary, color: props.colors.onPrimary }}
          >
            <Utensils className="h-4 w-4" strokeWidth={2.2} />
            Volver al menú
          </Link>
        ) : null}

        {props.canRepeatOrder || props.repeatClosedReason ? (
          <button
            type="button"
            disabled={!props.canRepeatOrder}
            onClick={props.onRepeatOrder}
            className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] border text-sm font-bold"
            style={{
              borderColor: props.canRepeatOrder ? props.colors.primary : '#E2E8F0',
              color: props.canRepeatOrder ? props.colors.primary : '#94A3B8',
              backgroundColor: props.canRepeatOrder ? 'white' : '#F8FAFC',
            }}
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2.2} />
            Repetir este pedido
          </button>
        ) : null}
        {props.repeatClosedReason ? (
          <p className="mt-1.5 text-center text-xs text-slate-500">{props.repeatClosedReason}</p>
        ) : null}

        {props.showWhatsapp ? (
          props.whatsappReady && props.whatsappHref ? (
            <a
              href={props.whatsappHref}
              target="_blank"
              rel="noopener noreferrer nofollow"
              referrerPolicy="no-referrer"
              className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] text-sm font-bold text-white"
              style={{ backgroundColor: WHATSAPP_GREEN }}
            >
              <WhatsAppMark className="h-5 w-5" />
              Escribir por WhatsApp
            </a>
          ) : (
            <div className="mt-2">
              <button
                type="button"
                disabled
                className="inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-[16px] text-sm font-bold text-white"
                style={{ backgroundColor: WHATSAPP_GREEN, opacity: 0.42 }}
              >
                <WhatsAppMark className="h-5 w-5" />
                Escribir por WhatsApp
              </button>
              <p className="mt-1.5 text-center text-xs text-slate-500">
                {isCancelled
                  ? 'Este pedido ya no está activo'
                  : 'Disponible cuando el comercio acepte tu pedido'}
              </p>
            </div>
          )
        ) : null}

        {props.canCustomerConfirmDelegatedDelivery ? (
          <button
            type="button"
            disabled={props.deliveryConfirmationLoading}
            onClick={props.onConfirmDelivery}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-[16px] bg-emerald-50 text-sm font-bold text-emerald-800"
            style={{ opacity: props.deliveryConfirmationLoading ? 0.7 : 1 }}
          >
            {props.deliveryConfirmationLoading ? 'Confirmando entrega...' : 'Confirmar que recibí mi pedido'}
          </button>
        ) : null}
        {props.deliveryConfirmationMessage ? (
          <p className="mt-2 text-center text-sm text-slate-600">{props.deliveryConfirmationMessage}</p>
        ) : null}

        {props.canCustomerCancel ? (
          <button
            type="button"
            disabled={props.cancelLoading}
            onClick={props.onCancelOrder}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-[16px] bg-rose-50 text-sm font-bold text-rose-800"
            style={{ opacity: props.cancelLoading ? 0.7 : 1 }}
          >
            {props.cancelLoading ? 'Cancelando pedido...' : 'Cancelar pedido'}
          </button>
        ) : null}
        {props.showPendingCancelHint ? (
          <p className="mt-3 text-center text-xs leading-5 text-slate-500">
            Este pedido se cancela solo si el comercio no confirma en 15 minutos.
          </p>
        ) : null}
        {props.cancelMessage ? <p className="mt-2 text-center text-sm text-slate-600">{props.cancelMessage}</p> : null}

        <label
          className="mt-4 flex cursor-pointer items-start gap-3 rounded-[22px] px-4 py-3"
          style={{
            ...cardStyle(props.colors.surface),
            opacity: props.whatsappPreferenceSaving ? 0.7 : 1,
          }}
        >
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-800 accent-slate-800"
            checked={!props.whatsappNotificationsEnabled}
            disabled={props.whatsappPreferenceSaving}
            onChange={(event) => {
              const optOut = event.target.checked;
              if (optOut) {
                const accepted =
                  typeof window === 'undefined' ||
                  window.confirm(WHATSAPP_DISABLE_CONFIRM);
                if (!accepted) return;
                props.onSetWhatsappNotifications(false);
                return;
              }
              props.onSetWhatsappNotifications(true);
            }}
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-5 text-slate-800">
              No quiero recibir las actualizaciones del pedido en WhatsApp
            </span>
            <span className="mt-1 block text-[12px] leading-4 text-slate-500">
              {props.whatsappNotificationsEnabled
                ? 'Ahora te avisamos por WhatsApp cuando cambie el estado.'
                : 'No te enviaremos actualizaciones de este pedido por WhatsApp.'}
            </span>
          </span>
        </label>
        {props.notificationMessage ? (
          <p className="mt-2 text-center text-sm text-slate-600">{props.notificationMessage}</p>
        ) : null}

        <p className="mt-6 text-center text-[11px] font-medium tracking-wide text-slate-400">
          Powered by elmenuxfa.com
        </p>
      </div>
    </main>
  );
}

export function OrderReceiptFrame({
  background,
  bodyFont,
  children,
}: {
  background: string;
  bodyFont: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-6" style={{ background, fontFamily: bodyFont }}>
      {children}
    </main>
  );
}
