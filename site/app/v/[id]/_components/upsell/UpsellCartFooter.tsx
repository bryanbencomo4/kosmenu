import { ChevronRight, ShoppingBag } from 'lucide-react';

type UpsellCartFooterProps = {
  itemCount: number;
  totalLabel: string;
  remainingToFreeLabel?: string | null;
  freeUnlocked?: boolean;
  progressRatio?: number;
  showDeliveryProgress?: boolean;
  disabled?: boolean;
  onContinue: () => void;
  isPreview?: boolean;
};

export function UpsellCartFooter({
  itemCount,
  totalLabel,
  remainingToFreeLabel,
  freeUnlocked,
  progressRatio = 0,
  showDeliveryProgress,
  disabled,
  onContinue,
  isPreview,
}: UpsellCartFooterProps) {
  if (itemCount <= 0) return null;

  return (
    <section
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-6xl">
        {isPreview ? (
          <p className="mb-2 text-center text-[11px] font-semibold text-amber-800">
            Vista previa: el pedido no se enviará
          </p>
        ) : null}

        {showDeliveryProgress ? (
          <div
            className="mb-2 rounded-[18px] border px-3 py-2"
            style={{
              backgroundColor: 'var(--menu-surface)',
              borderColor: 'var(--menu-border)',
            }}
          >
            <p className="text-[11px] font-bold" style={{ color: 'var(--menu-text)' }}>
              {freeUnlocked
                ? '¡Envío gratis desbloqueado!'
                : remainingToFreeLabel
                  ? `Te faltan ${remainingToFreeLabel} para envío gratis`
                  : 'Progreso de envío gratis'}
            </p>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--menu-surface-alt)' }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${Math.round(Math.min(1, progressRatio) * 100)}%`,
                  backgroundColor: 'var(--menu-primary)',
                }}
              />
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onContinue}
          disabled={disabled}
          className="flex w-full items-center justify-between rounded-[22px] px-3.5 py-3 disabled:opacity-60"
          style={{
            backgroundColor: 'var(--menu-primary)',
            color: 'var(--menu-on-primary)',
            boxShadow: '0 14px 32px color-mix(in srgb, var(--menu-primary) 35%, transparent)',
          }}
        >
          <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-white/15">
            <ShoppingBag className="h-5 w-5" strokeWidth={2.3} />
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] font-black text-slate-900">
              {itemCount}
            </span>
          </span>
          <span className="flex-1 px-3 text-left">
            <span className="block text-[12px] font-semibold opacity-90">Ver pedido</span>
            <span className="block text-lg font-black tracking-[-0.02em]">{totalLabel}</span>
          </span>
          <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>
    </section>
  );
}
