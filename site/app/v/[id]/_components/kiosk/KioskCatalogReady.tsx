'use client';

import { useEffect, useMemo, useState } from 'react';
import { Caveat, Manrope } from 'next/font/google';
import {
  Banknote,
  Camera,
  Check,
  Copy,
  ImageIcon,
  Loader2,
  MessageCircle,
  X,
} from 'lucide-react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import type { Country } from 'react-phone-number-input';

import { prepareComprobanteFile } from '../../../../_lib/prepare-comprobante-file';
import { useLockBodyScroll } from '../../../../_lib/use-lock-body-scroll';
import type { CatalogPaymentGroup } from '../upsell/PreCheckoutUpsellSheet';
import { KioskImage } from './KioskImage';

const titleFont = Manrope({
  subsets: ['latin'],
  weight: ['700', '800'],
});

const scriptFont = Caveat({
  subsets: ['latin'],
  weight: ['500', '600'],
});

export type CatalogReadyItem = {
  name: string;
  quantity: number;
  priceLabel: string;
};

export type CatalogWhatsappSubmitInput = {
  customerName: string;
  customerWhatsapp: string;
  paymentMethodId: string | null;
  currency: string;
  proofFiles: File[];
};

type KioskCatalogReadyProps = {
  businessName: string;
  logoUrl: string | null;
  initialLetter: string;
  items: CatalogReadyItem[];
  itemCount: number;
  totalLabel: string;
  paymentGroups?: CatalogPaymentGroup[];
  selectedPaymentCurrency?: string;
  onSelectPaymentCurrency?: (currency: string) => void;
  /** Digits-only WhatsApp for wa.me (e.g. 58412...). */
  whatsappNumber?: string | null;
  onBackToMenu: () => void;
  onSubmitWhatsapp: (input: CatalogWhatsappSubmitInput) => Promise<void>;
};

function currencyChipLabel(currency: string) {
  return currency === 'VES' ? 'Bs (VES)' : currency;
}

function isCashLabel(label: string) {
  return label.toLowerCase().includes('efectivo');
}

function formatWhatsappDisplay(digits: string) {
  const raw = digits.replace(/\D/g, '');
  if (!raw) return '';
  if (raw.startsWith('58') && raw.length >= 12) {
    return `+58 ${raw.slice(2, 5)} ${raw.slice(5, 8)} ${raw.slice(8)}`;
  }
  if (raw.startsWith('57') && raw.length >= 12) {
    return `+57 ${raw.slice(2, 5)} ${raw.slice(5, 8)} ${raw.slice(8)}`;
  }
  return `+${raw}`;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.273.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.693.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64.001 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.002 5.45-4.436 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.893c0 2.096.547 4.142 1.588 5.946L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.684 1.447h.005c6.554 0 11.89-5.335 11.893-11.893a11.817 11.817 0 0 0-3.48-8.412z" />
    </svg>
  );
}

export function KioskCatalogReady({
  businessName,
  logoUrl,
  initialLetter,
  items,
  itemCount,
  totalLabel,
  paymentGroups = [],
  selectedPaymentCurrency,
  onSelectPaymentCurrency,
  whatsappNumber,
  onBackToMenu,
  onSubmitWhatsapp,
}: KioskCatalogReadyProps) {
  const [waSheetOpen, setWaSheetOpen] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerWhatsappCountry, setCustomerWhatsappCountry] = useState<Country>('VE');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [proofPreviewUrls, setProofPreviewUrls] = useState<string[]>([]);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofError, setProofError] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useLockBodyScroll(waSheetOpen);

  const payableGroups = useMemo(
    () => paymentGroups.filter((group) => group.methods.length > 0),
    [paymentGroups],
  );
  const activePaymentCurrency =
    payableGroups.find((group) => group.currency === selectedPaymentCurrency)?.currency ??
    payableGroups[0]?.currency ??
    '';
  const activePaymentMethods = useMemo(
    () => payableGroups.find((group) => group.currency === activePaymentCurrency)?.methods ?? [],
    [payableGroups, activePaymentCurrency],
  );
  const selectedMethod =
    activePaymentMethods.find((method) => method.id === selectedMethodId) ?? null;
  const selectedIsCash = selectedMethod ? isCashLabel(selectedMethod.label) : false;

  const waDigits = (whatsappNumber ?? '').replace(/\D/g, '');
  const waDisplay = formatWhatsappDisplay(waDigits);
  const canOpenWhatsapp = waDigits.length >= 10;

  useEffect(() => {
    const urls = proofFiles.map((file) => URL.createObjectURL(file));
    setProofPreviewUrls(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [proofFiles]);

  useEffect(() => {
    if (!waSheetOpen) return;
    if (selectedMethodId && activePaymentMethods.some((m) => m.id === selectedMethodId)) return;
    setSelectedMethodId(activePaymentMethods[0]?.id ?? null);
  }, [waSheetOpen, activePaymentMethods, selectedMethodId]);

  useEffect(() => {
    if (!selectedIsCash) return;
    setProofFiles([]);
    setProofError('');
  }, [selectedIsCash]);

  function resetWaSheet() {
    setWaSheetOpen(false);
    setSubmitError('');
    setProofError('');
    setSubmitBusy(false);
  }

  function openWaSheet() {
    setSubmitError('');
    setWaSheetOpen(true);
  }

  async function copyLocalWhatsapp() {
    const value = waDigits ? `+${waDigits}` : '';
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedPhone(true);
      window.setTimeout(() => setCopiedPhone(false), 1600);
    } catch {
      setCopiedPhone(false);
    }
  }

  async function handleProofSelected(file: File | null) {
    setProofError('');
    if (!file) return;
    if (proofFiles.length >= 3) {
      setProofError('Puedes adjuntar hasta 3 comprobantes.');
      return;
    }
    setProofBusy(true);
    try {
      const prepared = await prepareComprobanteFile(file);
      setProofFiles((prev) => [...prev, prepared]);
    } catch (error) {
      setProofError(
        error instanceof Error
          ? error.message
          : 'Ese comprobante no se pudo cargar. Prueba otra foto en JPEG o PNG.',
      );
    } finally {
      setProofBusy(false);
    }
  }

  async function handleSubmitWhatsapp() {
    setSubmitError('');
    const name = customerName.trim();
    const phone = customerWhatsapp.trim();
    if (name.length < 3) {
      setSubmitError('Escribe tu nombre completo.');
      return;
    }
    if (!phone || !isValidPhoneNumber(phone)) {
      setSubmitError('Escribe un WhatsApp válido.');
      return;
    }
    if (payableGroups.length > 0 && !selectedMethodId) {
      setSubmitError('Selecciona un método de pago.');
      return;
    }
    if (!selectedIsCash && proofFiles.length === 0) {
      setSubmitError('Adjunta el comprobante de pago para enviarlo por WhatsApp.');
      return;
    }
    setSubmitBusy(true);
    try {
      await onSubmitWhatsapp({
        customerName: name,
        customerWhatsapp: phone.replace(/\D/g, ''),
        paymentMethodId: selectedMethodId,
        currency: activePaymentCurrency,
        proofFiles: selectedIsCash ? [] : proofFiles,
      });
      setWhatsappSent(true);
      resetWaSheet();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'No se pudo preparar el mensaje de WhatsApp.',
      );
    } finally {
      setSubmitBusy(false);
    }
  }

  return (
    <section className="relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[var(--menu-background)] text-[var(--menu-text)]">
      <style>{`
        .checkout-phone-field .PhoneInput {
          display: flex;
          min-height: 3rem;
          align-items: center;
          gap: 0.5rem;
          padding-inline: 0.875rem;
        }
        .checkout-phone-field .PhoneInputInput {
          min-width: 0;
          flex: 1;
          height: 3rem;
          border: 0;
          background: transparent;
          color: var(--menu-text, #0f172a);
          font-size: 0.95rem;
          outline: 0;
        }
        .checkout-phone-field .PhoneInputCountry {
          border-right-color: var(--menu-border);
          background: var(--menu-surface-alt);
        }
        .checkout-phone-field .PhoneInputCountrySelect,
        .checkout-phone-field .PhoneInputCountrySelectArrow {
          color: var(--menu-text-muted);
        }
      `}</style>
      <header className="mx-auto flex w-full max-w-[440px] shrink-0 items-center gap-3 px-5 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))]">
        {logoUrl ? (
          <KioskImage
            src={logoUrl}
            sourceUrl={logoUrl}
            displayWidth={120}
            alt={businessName}
            fit="cover"
            className="h-11 w-11 shrink-0 rounded-[14px] bg-[var(--menu-surface)] shadow-[var(--menu-shadow)]"
          />
        ) : (
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] text-lg font-extrabold shadow-[var(--menu-shadow)]"
            style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
          >
            {initialLetter}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className={`${titleFont.className} truncate text-[18px] font-extrabold tracking-[-0.03em]`}>
              Resumen del pedido
            </h1>
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--menu-primary) 16%, var(--menu-surface))',
                color: 'var(--menu-primary)',
              }}
            >
              <Check className="h-3 w-3" strokeWidth={2.6} />
              Listo
            </span>
          </div>
          <p className="truncate text-[12px] font-medium text-[var(--menu-text-muted)]">{businessName}</p>
        </div>
      </header>

      <div className="mx-auto min-h-0 w-full max-w-[440px] flex-1 overflow-y-auto overscroll-contain px-5 pb-3">
        {canOpenWhatsapp ? (
          <div
            className="overflow-hidden rounded-[22px] shadow-[var(--menu-shadow)]"
            style={{
              background:
                'linear-gradient(145deg, color-mix(in srgb, #25D366 18%, var(--menu-surface)) 0%, var(--menu-surface) 55%)',
            }}
          >
            <div className="px-4 pb-4 pt-4">
              <div className="flex items-start gap-3">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] text-white"
                  style={{ backgroundColor: '#25D366' }}
                >
                  <MessageCircle className="h-5 w-5" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 text-left">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--menu-text-muted)]">
                    Al terminar de comer
                  </p>
                  <p
                    className={`${scriptFont.className} mt-0.5 text-[1.45rem] leading-none`}
                    style={{ color: '#128C7E' }}
                  >
                    {whatsappSent ? 'Listo, ya avisaste' : 'Avisa por WhatsApp'}
                  </p>
                  <p className="mt-1.5 text-[13px] font-medium leading-snug text-[var(--menu-text)]">
                    {whatsappSent
                      ? 'Ya enviamos tu aviso al local. Puedes seguir disfrutando.'
                      : 'Si pagaste por transferencia, envía el comprobante. Si pagas en efectivo, solo avísanos.'}
                  </p>
                </div>
              </div>

              {whatsappSent ? (
                <div
                  className="mt-3 flex items-center gap-3 rounded-[16px] px-3 py-3"
                  style={{
                    backgroundColor: 'color-mix(in srgb, #25D366 12%, var(--menu-surface-alt))',
                    border: '1px solid color-mix(in srgb, #25D366 28%, transparent)',
                  }}
                >
                  <Check className="h-5 w-5 shrink-0" style={{ color: '#128C7E' }} strokeWidth={2.6} />
                  <span className="text-sm font-bold" style={{ color: '#128C7E' }}>
                    Mensaje enviado
                  </span>
                </div>
              ) : (
                <div
                  className="mt-3 flex items-center gap-3 rounded-[16px] px-3 py-3"
                  style={{
                    backgroundColor: 'color-mix(in srgb, #25D366 12%, var(--menu-surface-alt))',
                    border: '1px solid color-mix(in srgb, #25D366 28%, transparent)',
                  }}
                >
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-[11px] font-semibold text-[var(--menu-text-muted)]">
                      WhatsApp del local
                    </span>
                    <span
                      className={`${titleFont.className} mt-0.5 block text-[17px] font-extrabold tracking-[-0.02em] text-[var(--menu-text)]`}
                    >
                      {waDisplay}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyLocalWhatsapp()}
                    aria-label={copiedPhone ? 'Número copiado' : 'Copiar WhatsApp del local'}
                    title={copiedPhone ? 'Copiado' : 'Copiar'}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition active:scale-95"
                    style={{ backgroundColor: copiedPhone ? '#128C7E' : '#25D366' }}
                  >
                    {copiedPhone ? (
                      <Check className="h-4 w-4" strokeWidth={2.6} />
                    ) : (
                      <Copy className="h-4 w-4" strokeWidth={2.4} />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div
          className={`rounded-[20px] bg-[var(--menu-surface)] p-4 shadow-[var(--menu-shadow)] ${
            canOpenWhatsapp ? 'mt-3' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--menu-text-muted)]">
              Tu pedido
            </p>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
              style={{ backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text)' }}
            >
              {itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}
            </span>
          </div>
          <ul className="mt-3 space-y-2.5">
            {items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-sm font-medium text-[var(--menu-text)]">
                  <span className="mr-1.5 font-bold text-[var(--menu-text-muted)]">{item.quantity}×</span>
                  {item.name}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--menu-text)]">
                  {item.priceLabel}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-dashed border-[var(--menu-border)] pt-3">
            <span className="text-sm font-semibold text-[var(--menu-text-muted)]">Total</span>
            <span className={`${titleFont.className} text-xl font-extrabold tracking-[-0.04em]`}>
              {totalLabel}
            </span>
          </div>
        </div>
      </div>

      <div
        className="mx-auto w-full max-w-[440px] shrink-0 border-t px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
        style={{ borderColor: 'var(--menu-border)', backgroundColor: 'var(--menu-background)' }}
      >
        <div className="grid gap-2">
          {canOpenWhatsapp && !whatsappSent ? (
            <button
              type="button"
              onClick={openWaSheet}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] text-sm font-bold text-white shadow-[var(--menu-shadow)]"
              style={{ backgroundColor: '#25D366' }}
            >
              <WhatsAppIcon className="h-5 w-5" />
              Abrir WhatsApp
            </button>
          ) : null}
          {whatsappSent ? (
            <div
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] text-sm font-bold"
              style={{
                backgroundColor: 'color-mix(in srgb, #25D366 14%, var(--menu-surface))',
                color: '#128C7E',
              }}
            >
              <Check className="h-4 w-4" strokeWidth={2.6} />
              Mensaje enviado
            </div>
          ) : null}
          <button
            type="button"
            onClick={onBackToMenu}
            className="min-h-12 w-full rounded-[16px] text-sm font-bold"
            style={
              canOpenWhatsapp && !whatsappSent
                ? { backgroundColor: 'var(--menu-surface)', color: 'var(--menu-text)' }
                : { backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }
            }
          >
            Regresar al menú
          </button>
        </div>
      </div>

      {waSheetOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/45"
            onClick={() => {
              if (!submitBusy) resetWaSheet();
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-wa-title"
            className="relative z-[1] flex max-h-[min(92dvh,720px)] w-full max-w-[440px] flex-col overflow-hidden rounded-t-[24px] sm:rounded-[24px]"
            style={{ backgroundColor: 'var(--menu-surface)', color: 'var(--menu-text)' }}
          >
            <div
              className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3.5"
              style={{ borderColor: 'var(--menu-border)' }}
            >
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--menu-text-muted)]">
                  Al terminar de comer
                </p>
                <h2
                  id="catalog-wa-title"
                  className={`${titleFont.className} mt-0.5 text-[18px] font-extrabold tracking-[-0.03em]`}
                >
                  Cómo vas a pagar
                </h2>
              </div>
              <button
                type="button"
                disabled={submitBusy}
                onClick={resetWaSheet}
                aria-label="Cerrar"
                className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-50"
                style={{ backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text-muted)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
              <div className="grid gap-2.5">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                    Tu nombre
                  </span>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    autoComplete="name"
                    placeholder="Nombre y apellido"
                    className="min-h-11 w-full rounded-[14px] px-3 text-sm font-medium outline-none"
                    style={{
                      backgroundColor: 'var(--menu-surface-alt)',
                      color: 'var(--menu-text)',
                      boxShadow: 'inset 0 0 0 1px var(--menu-border)',
                    }}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                    <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.4} />
                    WhatsApp
                  </span>
                  <div
                    className="checkout-phone-field rounded-2xl border bg-[var(--menu-surface-alt)]"
                    style={{
                      borderColor:
                        !customerWhatsapp.trim() || isValidPhoneNumber(customerWhatsapp)
                          ? 'var(--menu-border)'
                          : '#F43F5E',
                    }}
                  >
                    <PhoneInput
                      international
                      countryCallingCodeEditable={false}
                      defaultCountry={customerWhatsappCountry}
                      country={customerWhatsappCountry}
                      value={customerWhatsapp || undefined}
                      onChange={(value) => setCustomerWhatsapp(value ?? '')}
                      onCountryChange={(country) => {
                        if (country) setCustomerWhatsappCountry(country as Country);
                      }}
                      placeholder="Ingresa tu numero"
                      numberInputProps={{
                        required: true,
                        autoComplete: 'tel',
                      }}
                    />
                  </div>
                </label>
              </div>

              {payableGroups.length === 0 ? (
                <p className="text-[13px] font-medium text-[var(--menu-text-muted)]">
                  Este comercio no publicó métodos de pago. Si transferiste, puedes adjuntar el comprobante.
                </p>
              ) : (
                <div className="space-y-3">
                  {payableGroups.length > 1 ? (
                    <div
                      className="rounded-[16px] p-3"
                      style={{ backgroundColor: 'var(--menu-surface-alt)' }}
                      role="group"
                      aria-label="Moneda de pago"
                    >
                      <p className="mb-2 text-xs font-semibold text-[var(--menu-text-muted)]">Moneda de pago</p>
                      <div className="flex gap-2">
                        {payableGroups.map((group) => {
                          const isSelected = group.currency === activePaymentCurrency;
                          return (
                            <button
                              key={group.currency}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => onSelectPaymentCurrency?.(group.currency)}
                              className="min-h-10 flex-1 rounded-xl px-3 text-sm font-bold"
                              style={
                                isSelected
                                  ? {
                                      backgroundColor: 'var(--menu-primary)',
                                      color: 'var(--menu-on-primary)',
                                    }
                                  : {
                                      backgroundColor: 'var(--menu-surface)',
                                      color: 'var(--menu-text-muted)',
                                    }
                              }
                            >
                              {currencyChipLabel(group.currency)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2" role="radiogroup" aria-label="Método de pago">
                    {activePaymentMethods.map((method) => {
                      const isSelected = method.id === selectedMethodId;
                      const cash = isCashLabel(method.label);
                      return (
                        <button
                          key={method.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setSelectedMethodId(method.id)}
                          className="w-full rounded-[18px] px-4 py-3.5 text-left transition"
                          style={
                            isSelected
                              ? {
                                  backgroundColor:
                                    'color-mix(in srgb, var(--menu-primary) 12%, var(--menu-surface-alt))',
                                  boxShadow: 'inset 0 0 0 1.5px var(--menu-primary)',
                                }
                              : {
                                  backgroundColor: 'var(--menu-surface-alt)',
                                }
                          }
                        >
                          <p className="flex items-center gap-2 text-sm font-bold">
                            {cash ? <Banknote className="h-4 w-4 shrink-0" aria-hidden /> : null}
                            {method.label}
                          </p>
                          {method.details ? (
                            <p className="mt-1 text-xs text-[var(--menu-text-muted)]">{method.details}</p>
                          ) : cash ? (
                            <p className="mt-1 text-xs text-[var(--menu-text-muted)]">
                              Pagas en el local. No necesitas comprobante.
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedIsCash ? (
                <div
                  className="flex items-start gap-3 rounded-[16px] px-3.5 py-3"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--menu-primary) 10%, var(--menu-surface-alt))',
                  }}
                >
                  <Banknote
                    className="mt-0.5 h-5 w-5 shrink-0"
                    style={{ color: 'var(--menu-primary)' }}
                    aria-hidden
                  />
                  <p className="text-[13px] font-medium leading-snug text-[var(--menu-text)]">
                    Vas a pagar en efectivo. Solo avisaremos al local por WhatsApp, sin adjuntar comprobante.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--menu-text-muted)]">
                    Comprobante de pago
                  </p>
                  <div
                    className="overflow-hidden rounded-[16px] border"
                    style={{ borderColor: 'var(--menu-border)', backgroundColor: 'var(--menu-surface-alt)' }}
                  >
                    {proofFiles.length === 0 ? (
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <p className="min-w-0 flex-1 text-[12px] font-medium text-[var(--menu-text-muted)]">
                          {proofBusy ? 'Preparando…' : 'Adjunta la foto del pago'}
                        </p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <label
                            className={`grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-dashed ${
                              proofBusy ? 'pointer-events-none opacity-60' : ''
                            }`}
                            style={{
                              borderColor: 'var(--menu-border)',
                              backgroundColor: 'var(--menu-surface)',
                            }}
                            aria-label="Subir comprobante desde galería"
                          >
                            <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="sr-only"
                              disabled={proofBusy || submitBusy}
                              onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                event.target.value = '';
                                void handleProofSelected(file);
                              }}
                            />
                          </label>
                          <label
                            className={`grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-dashed ${
                              proofBusy ? 'pointer-events-none opacity-60' : ''
                            }`}
                            style={{
                              borderColor: 'var(--menu-border)',
                              backgroundColor: 'var(--menu-surface)',
                            }}
                            aria-label="Tomar foto del comprobante"
                          >
                            <Camera className="h-3.5 w-3.5" aria-hidden />
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="sr-only"
                              disabled={proofBusy || submitBusy}
                              onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                event.target.value = '';
                                void handleProofSelected(file);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      proofFiles.map((file, index) => {
                        const previewUrl = proofPreviewUrls[index] ?? null;
                        return (
                          <div
                            key={`${file.name}-${index}`}
                            className="flex items-center gap-2.5 px-3 py-2.5"
                            style={
                              index > 0 ? { borderTop: '1px solid var(--menu-border)' } : undefined
                            }
                          >
                            {previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={previewUrl}
                                alt=""
                                className="h-9 w-9 shrink-0 rounded-lg object-cover"
                              />
                            ) : null}
                            <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--menu-text-muted)]">
                              Comprobante {proofFiles.length > 1 ? index + 1 : ''} listo
                            </p>
                            <button
                              type="button"
                              disabled={submitBusy}
                              onClick={() =>
                                setProofFiles((prev) => prev.filter((_, i) => i !== index))
                              }
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg disabled:opacity-50"
                              style={{
                                backgroundColor: 'var(--menu-surface)',
                                color: 'var(--menu-text-muted)',
                              }}
                              aria-label="Quitar comprobante"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                    {proofFiles.length > 0 && proofFiles.length < 3 ? (
                      <div
                        className="flex items-center justify-between gap-2 px-3 py-2"
                        style={{ borderTop: '1px solid var(--menu-border)' }}
                      >
                        <p className="text-[11px] font-medium text-[var(--menu-text-muted)]">Añadir otro</p>
                        <div className="flex gap-1.5">
                          <label
                            className={`grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-dashed ${
                              proofBusy ? 'pointer-events-none opacity-60' : ''
                            }`}
                            style={{
                              borderColor: 'var(--menu-border)',
                              backgroundColor: 'var(--menu-surface)',
                            }}
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="sr-only"
                              disabled={proofBusy || submitBusy}
                              onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                event.target.value = '';
                                void handleProofSelected(file);
                              }}
                            />
                          </label>
                          <label
                            className={`grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-dashed ${
                              proofBusy ? 'pointer-events-none opacity-60' : ''
                            }`}
                            style={{
                              borderColor: 'var(--menu-border)',
                              backgroundColor: 'var(--menu-surface)',
                            }}
                          >
                            <Camera className="h-3.5 w-3.5" />
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="sr-only"
                              disabled={proofBusy || submitBusy}
                              onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                event.target.value = '';
                                void handleProofSelected(file);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {proofError ? (
                    <p className="text-[12px] font-semibold text-rose-500">{proofError}</p>
                  ) : null}
                </div>
              )}

              {submitError ? (
                <p
                  className="rounded-[14px] px-3 py-2 text-[12px] font-semibold text-rose-600"
                  style={{ backgroundColor: 'color-mix(in srgb, #f43f5e 10%, var(--menu-surface))' }}
                >
                  {submitError}
                </p>
              ) : null}
            </div>

            <div
              className="shrink-0 border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
              style={{ borderColor: 'var(--menu-border)' }}
            >
              <button
                type="button"
                disabled={submitBusy || proofBusy}
                onClick={() => void handleSubmitWhatsapp()}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] text-sm font-bold text-white disabled:opacity-60"
                style={{ backgroundColor: '#25D366' }}
              >
                {submitBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparando…
                  </>
                ) : (
                  <>
                    <WhatsAppIcon className="h-5 w-5" />
                    {selectedIsCash ? 'Avisar por WhatsApp' : 'Enviar por WhatsApp'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
