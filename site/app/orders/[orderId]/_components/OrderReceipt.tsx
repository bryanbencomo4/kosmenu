'use client';

import { Manrope } from 'next/font/google';
import Link from 'next/link';
import { ArrowLeft, Check, CheckCircle2, Clock3, MapPin, Package, RotateCcw, Star, Truck } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';

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
  categoryName?: string;
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
  estimatedDeliveryLabel: string | null;
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
  deliveryFeeNote: string | null;
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
  onCancelOrder: (reason: string) => void;
  showPendingCancelHint: boolean;
  canCustomerRateService: boolean;
  customerServiceRating: number | null;
  serviceRatingLoading: boolean;
  serviceRatingMessage: string;
  onRateService: (rating: number) => void;
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
    title: 'Enviando',
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

function splitReceiptItemName(value: string) {
  const parts = value.split(/\s+·\s+/).map((part) => part.trim()).filter(Boolean);
  return {
    product: parts[0] || value,
    options: parts.slice(1).join(' · '),
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
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [selectedServiceRating, setSelectedServiceRating] = useState(0);

  const copy = STATUS_COPY[props.status];
  const isCancelled = props.status === 'cancelado';
  const isDelivered = props.status === 'entregado';
  const hasQuickActions = Boolean(
    props.canRepeatOrder ||
      props.repeatClosedReason ||
      props.showWhatsapp ||
      props.canCustomerConfirmDelegatedDelivery,
  );
  const stepCount = Math.max(props.timeline.length - 1, 1);
  const progressRatio = isCancelled ? 0 : Math.min(1, Math.max(0, props.currentStep) / stepCount);

  return (
    <main
      className={`relative min-h-[100dvh] overflow-x-hidden px-4 ${props.canCustomerConfirmDelegatedDelivery ? 'pb-[calc(132px+env(safe-area-inset-bottom))]' : 'pb-[calc(80px+env(safe-area-inset-bottom))]'} pt-6 text-slate-900 sm:px-6 md:pb-10`}
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
          <Link
            href={props.menuHref}
            className="mb-4 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 text-xs font-bold text-slate-700 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
            Volver al menú
          </Link>
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

          {props.estimatedDeliveryLabel ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <Clock3 className="h-4 w-4 shrink-0" style={{ color: props.colors.primary }} />
              <span>
                Tiempo estimado: <strong>{props.estimatedDeliveryLabel}</strong>
              </span>
            </p>
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

        {props.canCustomerRateService || props.customerServiceRating !== null ? (
          <section className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-amber-600 shadow-sm">
                <Star className="h-5 w-5 fill-amber-400" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className={`${headingFont.className} text-base font-extrabold text-slate-900`}>
                  {props.customerServiceRating !== null ? 'Gracias por calificar' : '¿Cómo fue el servicio?'}
                </h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  {props.customerServiceRating !== null
                    ? 'Tu opinión ayuda a mejorar la experiencia.'
                    : isCancelled
                      ? 'Califica la atención recibida en este pedido.'
                      : 'Califica tu experiencia con el comercio.'}
                </p>
              </div>
            </div>
            {props.customerServiceRating !== null ? (
              <div className="mt-3 flex items-center gap-1" aria-label={`Tu calificación: ${props.customerServiceRating} de 5 estrellas`}>
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    className={`h-6 w-6 ${index < props.customerServiceRating! ? 'fill-amber-400 text-amber-500' : 'text-amber-200'}`}
                  />
                ))}
                <span className="ml-2 text-sm font-bold text-slate-700">
                  {props.customerServiceRating} de 5
                </span>
              </div>
            ) : (
              <>
                <div className="mt-3 flex items-center gap-1" role="group" aria-label="Selecciona de 1 a 5 estrellas">
                  {Array.from({ length: 5 }, (_, index) => {
                    const value = index + 1;
                    const active = value <= selectedServiceRating;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={props.serviceRatingLoading}
                        aria-label={`${value} ${value === 1 ? 'estrella' : 'estrellas'}`}
                        aria-pressed={selectedServiceRating === value}
                        onClick={() => setSelectedServiceRating(value)}
                        className="grid h-11 w-11 place-items-center rounded-full transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 disabled:opacity-50"
                      >
                        <Star className={`h-7 w-7 ${active ? 'fill-amber-400 text-amber-500' : 'text-amber-300'}`} />
                      </button>
                    );
                  })}
                  <span className="ml-2 text-sm font-semibold text-slate-600">
                    {selectedServiceRating ? `${selectedServiceRating}/5` : 'Elige una calificación'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={selectedServiceRating === 0 || props.serviceRatingLoading}
                  onClick={() => props.onRateService(selectedServiceRating)}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-extrabold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {props.serviceRatingLoading ? 'Guardando…' : 'Enviar calificación'}
                </button>
              </>
            )}
            {props.serviceRatingMessage ? (
              <p className="mt-2 text-sm font-semibold text-slate-700" role="status">
                {props.serviceRatingMessage}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="mt-4 rounded-[22px] p-4 sm:p-5" style={cardStyle(props.colors.surface)}>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-slate-700" />
            <h2 className="text-base font-extrabold text-slate-900">Resumen del pedido</h2>
          </div>
          <ul className="mt-3 space-y-2.5">
            {props.items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="flex items-start gap-2.5 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm">
                <span className="grid min-h-8 min-w-10 shrink-0 place-items-center rounded-lg bg-white px-2 text-xs font-black text-slate-700">
                  {item.quantity}x
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-bold leading-5 text-slate-900">
                    {splitReceiptItemName(item.name).product}
                  </span>
                  {item.categoryName?.trim() ? (
                    <span className="mt-0.5 block text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                      {item.categoryName.trim()}
                    </span>
                  ) : null}
                  {splitReceiptItemName(item.name).options ? (
                    <span className="mt-0.5 block break-words text-xs leading-4 text-slate-500">
                      {splitReceiptItemName(item.name).options}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 pt-1 text-xs font-bold tabular-nums text-slate-900">{item.amountLabel}</span>
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
            {props.deliveryFeeNote ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                {props.deliveryFeeNote}
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
        </section>

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

        {props.deliveryConfirmationMessage ? (
          <p className="mt-2 text-center text-sm text-slate-600">{props.deliveryConfirmationMessage}</p>
        ) : null}
        {props.deliveryConfirmationMessage ? (
          <p className="mt-2 text-center text-sm text-slate-600">{props.deliveryConfirmationMessage}</p>
        ) : null}

        {props.canCustomerCancel ? (
          <button
            type="button"
            disabled={props.cancelLoading}
            onClick={() => {
              setCancelReason('');
              setCancelDialogOpen(true);
            }}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-[16px] bg-rose-50 text-sm font-bold text-rose-800"
            style={{ opacity: props.cancelLoading ? 0.7 : 1 }}
          >
            {props.cancelLoading ? 'Cancelando pedido...' : 'Cancelar pedido'}
          </button>
        ) : null}
        {cancelDialogOpen && props.canCustomerCancel ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-order-title"
              onSubmit={(event) => {
                event.preventDefault();
                const reason = cancelReason.trim();
                if (reason.length < 3 || props.cancelLoading) return;
                props.onCancelOrder(reason);
                setCancelDialogOpen(false);
                setCancelReason('');
              }}
              className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            >
              <h2 id="cancel-order-title" className="text-lg font-extrabold text-slate-900">
                ¿Por qué cancelas el pedido?
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                El comercio recibirá el motivo por WhatsApp. Solo puedes cancelar antes de que acepte.
              </p>
              <label htmlFor="cancel-order-reason" className="mt-4 block text-sm font-bold text-slate-800">
                Motivo de cancelación
              </label>
              <textarea
                id="cancel-order-reason"
                required
                minLength={3}
                maxLength={500}
                rows={4}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Escribe el motivo"
                className="mt-2 w-full resize-y rounded-xl border border-slate-300 p-3 text-sm text-slate-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
              />
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  disabled={props.cancelLoading}
                  onClick={() => setCancelDialogOpen(false)}
                  className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 disabled:opacity-60"
                >
                  Seguir con el pedido
                </button>
                <button
                  type="submit"
                  disabled={props.cancelLoading || cancelReason.trim().length < 3}
                  className="min-h-11 flex-1 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {props.cancelLoading ? 'Cancelando...' : 'Confirmar cancelación'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
        {props.showPendingCancelHint ? (
          <p className="mt-3 text-center text-xs leading-5 text-slate-500">
            Puedes cancelarlo mientras el comercio no lo haya aceptado. Si no confirma en 15 minutos, se cancela automáticamente.
          </p>
        ) : null}
        {props.cancelMessage ? <p className="mt-2 text-center text-sm text-slate-600">{props.cancelMessage}</p> : null}

        <p className="mt-6 pb-4 text-center text-[11px] font-medium tracking-wide text-slate-400 md:pb-0">
          Powered by elmenuxfa.com
        </p>
      </div>

      {hasQuickActions ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-[0_-8px_28px_rgba(15,23,42,0.10)] backdrop-blur md:static md:mt-5 md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0 md:shadow-none md:backdrop-blur-none">
          <div className="mx-auto w-full max-w-[440px]">
            {props.canCustomerConfirmDelegatedDelivery ? (
              <button
                type="button"
                disabled={props.deliveryConfirmationLoading}
                onClick={props.onConfirmDelivery}
                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-3 py-2 text-center text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(4,120,87,0.20)] transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-70 md:min-h-[68px] md:justify-start md:gap-3 md:px-5 md:py-3 md:text-left md:text-base"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15 md:h-10 md:w-10 md:rounded-xl">
                  {props.deliveryConfirmationLoading ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.5} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block leading-tight">
                    {props.deliveryConfirmationLoading ? 'Confirmando recepción...' : 'Confirmar que recibí mi pedido'}
                  </span>
                  <span className="hidden pt-0.5 text-xs font-semibold text-emerald-50 md:block">
                    Pulsa cuando ya tengas el pedido
                  </span>
                </span>
              </button>
            ) : null}

            <div className="flex gap-2">
              {props.canRepeatOrder || props.repeatClosedReason ? (
                <button
                  type="button"
                  disabled={!props.canRepeatOrder}
                  onClick={props.onRepeatOrder}
                  title={props.repeatClosedReason || 'Repetir este pedido'}
                  className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border px-2 text-[11px] font-bold md:min-h-12 md:gap-2 md:rounded-[16px] md:text-sm"
                  style={{
                    borderColor: props.canRepeatOrder ? props.colors.primary : '#E2E8F0',
                    color: props.canRepeatOrder ? props.colors.primary : '#94A3B8',
                    backgroundColor: props.canRepeatOrder ? 'white' : '#F8FAFC',
                  }}
                >
                  <RotateCcw className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                  <span className="truncate">Repetir</span>
                </button>
              ) : null}

              {props.showWhatsapp ? (
                props.whatsappReady && props.whatsappHref ? (
                  <a
                    href={props.whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    referrerPolicy="no-referrer"
                    className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-bold text-white md:min-h-12 md:gap-2 md:rounded-[16px] md:text-sm"
                    style={{ backgroundColor: WHATSAPP_GREEN }}
                  >
                    <WhatsAppMark className="h-4.5 w-4.5 shrink-0 md:h-5 md:w-5" />
                    <span className="truncate">WhatsApp</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    title={isCancelled ? 'Este pedido ya no está activo' : 'Disponible cuando el comercio acepte tu pedido'}
                    className="inline-flex min-h-11 min-w-0 flex-1 cursor-not-allowed items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-bold text-white opacity-45 md:min-h-12 md:gap-2 md:rounded-[16px] md:text-sm"
                    style={{ backgroundColor: WHATSAPP_GREEN }}
                  >
                    <WhatsAppMark className="h-4.5 w-4.5 shrink-0 md:h-5 md:w-5" />
                    <span className="truncate">WhatsApp</span>
                  </button>
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
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
