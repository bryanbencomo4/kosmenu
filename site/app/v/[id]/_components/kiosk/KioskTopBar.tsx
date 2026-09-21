'use client';

import { CurrencyTicker } from '../CurrencyTicker';

type KioskTopBarProps = {
  tickerEntries: string[];
  currencies: string[];
  selectedCurrency: string;
  onSelectCurrency: (currency: string) => void;
};

export function KioskTopBar({
  tickerEntries,
  currencies,
  selectedCurrency,
  onSelectCurrency,
}: KioskTopBarProps) {
  const showSwitcher = currencies.length > 1;
  if (tickerEntries.length === 0 && !showSwitcher) return null;

  return (
    <div style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}>
      <div className="mx-auto flex h-9 w-full max-w-5xl items-center gap-2 px-3">
        {tickerEntries.length > 0 ? (
          <CurrencyTicker entries={tickerEntries} accentColor="currentColor" />
        ) : (
          <p className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
            Moneda del pedido
          </p>
        )}
        {showSwitcher ? (
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Moneda del menú">
            {currencies.map((code) => {
              const active = code === selectedCurrency;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => onSelectCurrency(code)}
                  aria-pressed={active}
                  className="rounded-full px-2 py-0.5 text-[10px] font-black tracking-[0.04em]"
                  style={
                    active
                      ? { backgroundColor: 'var(--menu-on-primary)', color: 'var(--menu-primary)' }
                      : { backgroundColor: 'color-mix(in srgb, var(--menu-on-primary) 16%, transparent)' }
                  }
                >
                  {code}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
