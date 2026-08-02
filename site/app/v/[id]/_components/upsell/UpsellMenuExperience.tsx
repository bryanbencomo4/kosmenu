'use client';

import type { CSSProperties, Ref, RefCallback } from 'react';
import { UpsellHeroCard } from './UpsellHeroCard';
import { ComboRail } from './ComboRail';
import { UpsellProductGrid, type UpsellGridProduct } from './UpsellProductGrid';
import { CrossSellRail } from './CrossSellRail';
import { UpsellCartFooter } from './UpsellCartFooter';
import type { ComboRailItem, CrossSellItem } from '../../_lib/upsell-heuristics';

export type UpsellCategoryTab = {
  id: string;
  label: string;
  glyph?: string;
};

type UpsellMenuExperienceProps = {
  businessName: string;
  subtitle: string;
  coverUrl?: string | null;
  logoUrl?: string | null;
  supportsDelivery: boolean;
  locationLabel?: string | null;
  stickyTopPx: number;
  stickySearchCardRef?: Ref<HTMLDivElement | null>;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  categories: UpsellCategoryTab[];
  activeCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  setChipRef: (id: string) => RefCallback<HTMLButtonElement>;
  comboItems: ComboRailItem[];
  gridTitle: string;
  gridProducts: UpsellGridProduct[];
  crossSellItems: CrossSellItem[];
  getQuantity: (id: string) => number;
  formatPrice: (amount: number) => string;
  resolveImage: (url?: string | null) => string | null;
  onAdd: (id: string) => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  cartCount: number;
  cartTotalLabel: string;
  showDeliveryProgress: boolean;
  freeUnlocked: boolean;
  progressRatio: number;
  remainingToFreeLabel: string | null;
  onContinue: () => void;
  continueDisabled?: boolean;
  isPreview?: boolean;
  emptyMessage?: string | null;
  titleStyle?: CSSProperties;
};

export function UpsellMenuExperience({
  businessName,
  subtitle,
  coverUrl,
  logoUrl,
  supportsDelivery,
  locationLabel,
  stickyTopPx,
  stickySearchCardRef,
  searchQuery,
  onSearchChange,
  onClearSearch,
  categories,
  activeCategoryId,
  onSelectCategory,
  setChipRef,
  comboItems,
  gridTitle,
  gridProducts,
  crossSellItems,
  getQuantity,
  formatPrice,
  resolveImage,
  onAdd,
  onIncrement,
  onDecrement,
  cartCount,
  cartTotalLabel,
  showDeliveryProgress,
  freeUnlocked,
  progressRatio,
  remainingToFreeLabel,
  onContinue,
  continueDisabled,
  isPreview,
  emptyMessage,
  titleStyle,
}: UpsellMenuExperienceProps) {
  return (
    <>
      <UpsellHeroCard
        businessName={businessName}
        subtitle={subtitle}
        coverUrl={coverUrl}
        logoUrl={logoUrl}
        supportsDelivery={supportsDelivery}
        locationLabel={locationLabel}
        titleStyle={titleStyle}
      />

      <section
        ref={stickySearchCardRef}
        className="sticky z-30 mx-auto mt-4 w-full max-w-6xl px-4 sm:px-6"
        style={{ top: `${stickyTopPx}px` }}
      >
        <div
          className="rounded-[22px] border p-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--menu-surface) 94%, transparent)',
            borderColor: 'var(--menu-border)',
          }}
        >
          <div className="relative">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar pizza, combo, bebida..."
              className="h-11 w-full rounded-2xl border pl-10 pr-10 text-sm font-semibold outline-none"
              style={{
                backgroundColor: 'var(--menu-surface)',
                borderColor: 'var(--menu-border)',
                color: 'var(--menu-text)',
              }}
            />
            <span
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm"
              style={{ color: 'var(--menu-text-muted)' }}
            >
              ⌕
            </span>
            {searchQuery ? (
              <button
                type="button"
                onClick={onClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm font-bold"
                style={{ color: 'var(--menu-text-muted)' }}
              >
                ✕
              </button>
            ) : null}
          </div>

          <div className="mt-2.5 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((categoria) => {
              const active = activeCategoryId === categoria.id;
              return (
                <button
                  key={categoria.id}
                  type="button"
                  ref={setChipRef(categoria.id)}
                  onClick={() => onSelectCategory(categoria.id)}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-extrabold"
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--menu-primary)',
                          color: 'var(--menu-on-primary)',
                        }
                      : {
                          backgroundColor: 'var(--menu-surface)',
                          color: 'var(--menu-text)',
                          border: '1px solid var(--menu-border)',
                        }
                  }
                >
                  {categoria.glyph ? <span aria-hidden="true">{categoria.glyph}</span> : null}
                  {categoria.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {!searchQuery.trim() ? (
        <ComboRail
          items={comboItems}
          formatPrice={formatPrice}
          onAdd={onAdd}
          titleStyle={titleStyle}
        />
      ) : null}

      {emptyMessage ? (
        <div
          className="mx-auto mt-6 max-w-6xl rounded-[22px] border p-6 text-center"
          style={{
            backgroundColor: 'var(--menu-surface)',
            borderColor: 'var(--menu-border)',
            color: 'var(--menu-text)',
          }}
        >
          {emptyMessage}
        </div>
      ) : (
        <UpsellProductGrid
          title={gridTitle}
          products={gridProducts}
          getQuantity={getQuantity}
          formatPrice={formatPrice}
          resolveImage={resolveImage}
          onAdd={onAdd}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          titleStyle={titleStyle}
        />
      )}

      {!searchQuery.trim() ? (
        <CrossSellRail
          items={crossSellItems}
          formatPrice={formatPrice}
          onAdd={onAdd}
          titleStyle={titleStyle}
        />
      ) : null}

      <div className="h-36" />

      <UpsellCartFooter
        itemCount={cartCount}
        totalLabel={cartTotalLabel}
        showDeliveryProgress={showDeliveryProgress}
        freeUnlocked={freeUnlocked}
        progressRatio={progressRatio}
        remainingToFreeLabel={remainingToFreeLabel}
        onContinue={onContinue}
        disabled={continueDisabled}
        isPreview={isPreview}
      />
    </>
  );
}
