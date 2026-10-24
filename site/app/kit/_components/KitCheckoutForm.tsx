'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, Copy, Minus, Plus, Truck } from 'lucide-react';

import {
  computeKitProductTotalUsd,
  KIT_EXTRAS_MAX,
  KIT_EXTRAS_UNIT_USD,
  KIT_GIFT_QTY,
} from '../../_lib/kit-shipments';
import { businessBenefitsHref } from '../../_lib/public-site-config';

type AccountField = { label: string; value: string; copyable: boolean };

type PaymentInfo = {
  available: boolean;
  methodName: string;
  instructions: string | null;
  accountFields: AccountField[];
  localCurrency: string;
};

type SuccessState = {
  code: string;
  status: string;
  giftQty: number;
  extrasQty: number;
  productTotalUsd: number;
};

function formatUsd(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function KitCheckoutForm() {
  const [extrasQty, setExtrasQty] = useState(0);
  const [recipientName, setRecipientName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [ci, setCi] = useState('');
  const [estado, setEstado] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [zoomOffice, setZoomOffice] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [declaredAmount, setDeclaredAmount] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const productTotal = useMemo(() => computeKitProductTotalUsd(extrasQty), [extrasQty]);
  const needsPayment = extrasQty > 0;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/kit/payment-info')
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!cancelled && json?.ok && json.data) {
          setPaymentInfo(json.data as PaymentInfo);
        }
      })
      .catch(() => {
        /* ignore — form still works; payment block may be empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyField(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(label);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      /* ignore */
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set('extrasQty', String(extrasQty));
      form.set('recipientName', recipientName);
      form.set('phone', phone);
      form.set('email', email);
      form.set('ci', ci);
      form.set('estado', estado);
      form.set('ciudad', ciudad);
      form.set('zoomOffice', zoomOffice);
      if (needsPayment) {
        form.set('paymentReference', paymentReference);
        if (declaredAmount.trim()) form.set('declaredAmount', declaredAmount);
        if (receipt) form.set('receipt', receipt);
      }

      const res = await fetch('/api/kit/orders', { method: 'POST', body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || 'No se pudo enviar el pedido.');
        return;
      }
      setSuccess(json.data as SuccessState);
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section className="rounded-[1.6rem] border border-emerald-400/20 bg-emerald-500/10 px-5 py-8 sm:px-8">
        <CheckCircle2 className="h-10 w-10 text-emerald-300" />
        <h2 className="mt-4 font-[var(--font-display)] text-2xl font-black text-white sm:text-3xl">
          Pedido confirmado
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          Número de pedido{' '}
          <span className="font-semibold text-white">{success.code}</span>
        </p>
        <ul className="mt-5 space-y-2 text-sm text-slate-200">
          <li>
            {success.giftQty} portamenús de obsequio
            {success.extrasQty > 0 ? ` + ${success.extrasQty} extra(s)` : ''}
          </li>
          <li>Productos: {formatUsd(success.productTotalUsd)}</li>
          <li>
            {success.status === 'pending_payment'
              ? 'Revisaremos tu pago y luego despachamos por Zoom.'
              : 'Prepararemos el envío por Zoom.'}
          </li>
          <li className="text-slate-400">
            El flete lo pagas en la oficina Zoom al retirar (1–2 días hábiles).
          </li>
        </ul>
        <Link
          href={businessBenefitsHref}
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al sitio
        </Link>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div className="space-y-5">
        <section className="rounded-[1.5rem] border border-white/10 bg-[#0b1220]/90 p-5 sm:p-6">
          <h2 className="font-[var(--font-display)] text-xl font-black text-white">Tu kit</h2>
          <p className="mt-1 text-sm text-slate-400">
            Incluye {KIT_GIFT_QTY} portamenús de obsequio. Agrega extras a {formatUsd(KIT_EXTRAS_UNIT_USD)} c/u.
          </p>

          <div className="mt-5 flex items-center gap-4">
            <div className="relative h-24 w-[4.5rem] shrink-0">
              <Image
                src="/branding/table-tent.png"
                alt="Portamenú elmenuxfa"
                fill
                sizes="72px"
                className="object-contain"
              />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">
                Obsequio: {KIT_GIFT_QTY} unidades
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Extras
              </p>
              <div className="mt-2 inline-flex items-center gap-3 rounded-full border border-white/12 bg-black/20 px-2 py-1.5">
                <button
                  type="button"
                  aria-label="Menos extras"
                  className="rounded-full p-1.5 text-white hover:bg-white/10 disabled:opacity-40"
                  disabled={extrasQty <= 0}
                  onClick={() => setExtrasQty((q) => Math.max(0, q - 1))}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-[2ch] text-center text-base font-bold text-white">
                  {extrasQty}
                </span>
                <button
                  type="button"
                  aria-label="Más extras"
                  className="rounded-full p-1.5 text-white hover:bg-white/10 disabled:opacity-40"
                  disabled={extrasQty >= KIT_EXTRAS_MAX}
                  onClick={() => setExtrasQty((q) => Math.min(KIT_EXTRAS_MAX, q + 1))}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
            <span className="text-slate-400">Total productos</span>
            <span className="font-[var(--font-display)] text-xl font-black text-[#FACC15]">
              {formatUsd(productTotal)}
            </span>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-amber-400/20 bg-amber-500/8 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <Truck className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
            <div>
              <h3 className="font-semibold text-amber-50">Envío por Zoom</h3>
              <p className="mt-1 text-sm leading-6 text-amber-100/85">
                Despachamos a la oficina Zoom que indiques. El flete lo pagas tú al retirar
                (típicamente 1–2 días hábiles). Nosotros no cobramos envío.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-white/10 bg-[#0b1220]/90 p-5 sm:p-6">
          <h2 className="font-[var(--font-display)] text-xl font-black text-white">
            Destinatario y Zoom
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Nombre completo
              </span>
              <input
                required
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white outline-none ring-[#FACC15]/40 focus:ring-2"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Teléfono
              </span>
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className="w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white outline-none ring-[#FACC15]/40 focus:ring-2"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Correo
              </span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white outline-none ring-[#FACC15]/40 focus:ring-2"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Cédula / RIF
              </span>
              <input
                required
                value={ci}
                onChange={(e) => setCi(e.target.value)}
                className="w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white outline-none ring-[#FACC15]/40 focus:ring-2"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Estado
              </span>
              <input
                required
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white outline-none ring-[#FACC15]/40 focus:ring-2"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Ciudad
              </span>
              <input
                required
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
                className="w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white outline-none ring-[#FACC15]/40 focus:ring-2"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Oficina Zoom
              </span>
              <input
                required
                value={zoomOffice}
                onChange={(e) => setZoomOffice(e.target.value)}
                placeholder="Ej. Zoom Centro Comercial X — taquilla 3"
                className="w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white outline-none ring-[#FACC15]/40 focus:ring-2"
              />
            </label>
          </div>
        </section>
      </div>

      <div className="space-y-5">
        {needsPayment ? (
          <section className="rounded-[1.5rem] border border-white/10 bg-[#0b1220]/90 p-5 sm:p-6">
            <h2 className="font-[var(--font-display)] text-xl font-black text-white">
              Pago de extras
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Transfiere {formatUsd(productTotal)} por {paymentInfo?.methodName || 'Pago Móvil'} y
              adjunta el comprobante.
            </p>

            {paymentInfo?.accountFields?.length ? (
              <ul className="mt-4 space-y-2">
                {paymentInfo.accountFields.map((field) => (
                  <li
                    key={field.label}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {field.label}
                      </p>
                      <p className="truncate text-sm font-semibold text-white">{field.value}</p>
                    </div>
                    {field.copyable ? (
                      <button
                        type="button"
                        onClick={() => copyField(field.label, field.value)}
                        className="shrink-0 rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5"
                        aria-label={`Copiar ${field.label}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-amber-200/90">
                Los datos de pago se están cargando o aún no están configurados. Si no aparecen,
                escríbenos por WhatsApp de soporte.
              </p>
            )}
            {copiedKey ? (
              <p className="mt-2 text-xs text-emerald-300">Copiado: {copiedKey}</p>
            ) : null}
            {paymentInfo?.instructions ? (
              <p className="mt-3 text-xs leading-5 text-slate-400">{paymentInfo.instructions}</p>
            ) : null}

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Referencia
              </span>
              <input
                required={needsPayment}
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                className="w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white outline-none ring-[#FACC15]/40 focus:ring-2"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Monto declarado (VES, opcional)
              </span>
              <input
                value={declaredAmount}
                onChange={(e) => setDeclaredAmount(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white outline-none ring-[#FACC15]/40 focus:ring-2"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Comprobante (imagen o PDF)
              </span>
              <input
                required={needsPayment}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
            </label>
          </section>
        ) : (
          <section className="rounded-[1.5rem] border border-white/10 bg-[#0b1220]/90 p-5 sm:p-6">
            <h2 className="font-[var(--font-display)] text-xl font-black text-white">
              Sin costo de productos
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Solo solicitas el obsequio de {KIT_GIFT_QTY} portamenús. No hay Pago Móvil ahora; solo
              pagas el flete en Zoom al retirar.
            </p>
          </section>
        )}

        {error ? (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-[#FACC15] px-5 py-3.5 text-sm font-bold text-[#1a1200] transition hover:bg-[#fde047] disabled:opacity-60"
        >
          {submitting ? 'Enviando…' : 'Confirmar pedido'}
        </button>
        <p className="text-center text-xs text-slate-500">
          Al confirmar aceptas que usemos tus datos solo para despachar este kit.
        </p>
      </div>
    </form>
  );
}
