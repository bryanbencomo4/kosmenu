'use client';

const topTickerHeightPx = 36;
const topAppBarHeightPx = 56;
const stickySearchTopPx = topTickerHeightPx + topAppBarHeightPx + 10;

type PublicMenuSkeletonLoaderProps = {
  businessName: string;
  logoUrl: string;
  initialLetter: string;
};

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-neutral-200 ${className}`} aria-hidden="true" />;
}

function ProductCardSkeleton({ withImage = true }: { withImage?: boolean }) {
  return (
    <article className="overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_18px_38px_rgba(0,0,0,0.05)]">
      <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
        {withImage ? <SkeletonBlock className="h-[8.75rem] w-[8.4rem] shrink-0 rounded-[22px] sm:h-[10rem] sm:w-[9.5rem]" /> : null}
        <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
          <div>
            <SkeletonBlock className="h-5 w-[78%] sm:h-6" />
            <SkeletonBlock className="mt-2.5 h-3.5 w-full" />
            <SkeletonBlock className="mt-2 h-3.5 w-[88%]" />
          </div>
          <div className="mt-4">
            <SkeletonBlock className="h-7 w-24" />
            <SkeletonBlock className="mt-3 h-11 w-[9rem] rounded-2xl" />
          </div>
        </div>
      </div>
    </article>
  );
}

function CategorySectionSkeleton({ productCount = 2 }: { productCount?: number }) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <SkeletonBlock className="h-10 w-10 shrink-0 rounded-2xl" />
          <SkeletonBlock className="h-7 w-[min(12rem,52vw)] sm:w-48" />
        </div>
        <SkeletonBlock className="h-7 w-16 rounded-full" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: productCount }).map((_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    </section>
  );
}

export function PublicMenuSkeletonLoader({
  businessName,
  logoUrl,
  initialLetter,
}: PublicMenuSkeletonLoaderProps) {
  const categoryChips = ['w-20', 'w-24', 'w-28', 'w-20', 'w-24'];

  return (
    <main
      className="min-h-[100dvh] bg-[linear-gradient(180deg,#f5f5f5_0%,#ececec_100%)] pt-9 text-neutral-900"
      aria-busy="true"
      aria-label={`Cargando menu de ${businessName}`}
    >
      <section className="fixed inset-x-0 top-0 z-50 border-b border-neutral-800/20 bg-neutral-950 text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <div className="mx-auto flex h-9 max-w-6xl items-center overflow-hidden px-4 sm:px-6">
          <SkeletonBlock className="mr-3 h-6 w-14 shrink-0 rounded-full bg-neutral-700" />
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-3 w-24 shrink-0 rounded-full bg-neutral-700" />
            ))}
          </div>
          <SkeletonBlock className="ml-3 h-3 w-12 shrink-0 rounded-full bg-neutral-700" />
        </div>
      </section>

      <section
        className="sticky z-40 border-b border-neutral-200 bg-white/95 backdrop-blur-sm"
        style={{ top: `${topTickerHeightPx}px` }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 grayscale">
                <img src={logoUrl} alt="" className="h-full w-full object-cover opacity-80" />
              </div>
            ) : (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-300 text-xs font-black text-neutral-600">
                {initialLetter}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[15px] font-black tracking-[-0.02em] text-neutral-900 sm:text-base">{businessName}</p>
              <SkeletonBlock className="mt-1.5 h-3 w-28" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-10 w-10 rounded-2xl" />
            <SkeletonBlock className="h-10 w-10 rounded-2xl" />
          </div>
        </div>
      </section>

      <section className="mx-auto mt-4 max-w-6xl px-4 sm:mt-5 sm:px-6">
        <div className="relative overflow-hidden rounded-[32px] border border-neutral-300/60 bg-neutral-200 shadow-[0_22px_55px_rgba(0,0,0,0.08)]">
          <SkeletonBlock className="absolute inset-0 rounded-[32px] bg-neutral-300" />
          <div className="relative flex min-h-[19rem] flex-col justify-between p-4 sm:min-h-[22rem] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <SkeletonBlock className="h-8 w-28 rounded-full bg-neutral-100/80" />
              <SkeletonBlock className="h-8 w-14 rounded-full bg-neutral-100/80" />
            </div>
            <div className="max-w-[34rem]">
              <SkeletonBlock className="h-10 w-[min(16rem,72vw)] rounded-2xl bg-neutral-100/90 sm:h-12 sm:w-80" />
              <SkeletonBlock className="mt-3 h-4 w-full max-w-xl rounded-lg bg-neutral-100/70" />
              <SkeletonBlock className="mt-2 h-4 w-[88%] max-w-lg rounded-lg bg-neutral-100/70" />
              <SkeletonBlock className="mt-4 h-10 w-[min(17rem,80vw)] rounded-[15px] bg-neutral-100/60" />
              <div className="mt-5 max-w-md overflow-hidden rounded-[18px] border border-neutral-100/40 bg-neutral-100/30 p-0 sm:rounded-[20px]">
                <div className="grid grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className={`flex min-h-[56px] flex-col items-center justify-center px-2 py-2 sm:min-h-[64px] ${
                        index > 0 ? 'border-l border-neutral-100/50' : ''
                      }`}
                    >
                      <SkeletonBlock className="h-5 w-8 rounded-md bg-neutral-100/80" />
                      <SkeletonBlock className="mt-2 h-2.5 w-14 rounded-full bg-neutral-100/60" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="sticky z-30 mt-4 overflow-visible rounded-[28px] border border-neutral-200 bg-white p-3 shadow-[0_20px_55px_rgba(0,0,0,0.08)] md:p-4"
          style={{ top: `${stickySearchTopPx}px` }}
        >
          <div className="rounded-[22px] border border-neutral-200 bg-neutral-50 p-3 sm:p-4">
            <SkeletonBlock className="h-12 w-full rounded-2xl bg-neutral-200" />
            <div className="mt-3 flex w-max max-w-full items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {categoryChips.map((width, index) => (
                <SkeletonBlock key={index} className={`h-9 shrink-0 rounded-full ${width}`} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-8 pb-44">
          <CategorySectionSkeleton productCount={2} />
          <CategorySectionSkeleton productCount={1} />
        </div>
      </section>
    </main>
  );
}
