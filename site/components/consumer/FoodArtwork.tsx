import type { FoodArtworkTheme } from '../../data/consumerBusinesses';

type FoodArtworkProps = {
  theme: FoodArtworkTheme;
  title: string;
  imageUrl?: string | null;
  className?: string;
  variant?: 'default' | 'thumb' | 'promo' | 'showcase';
};

const artworkStyles: Record<
  FoodArtworkTheme,
  {
    badge: string;
    image: string;
    position: string;
    gradient: string;
  }
> = {
  burger: {
    badge: 'PROMO DEL DÍA',
    image:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1400&q=80',
    position: 'center center',
    gradient: 'linear-gradient(180deg, rgba(8,13,24,0.18) 0%, rgba(8,13,24,0.25) 35%, rgba(8,13,24,0.92) 100%)',
  },
  pizza: {
    badge: 'PROMO DEL DÍA',
    image:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1400&q=80',
    position: 'center center',
    gradient: 'linear-gradient(180deg, rgba(8,13,24,0.14) 0%, rgba(8,13,24,0.26) 35%, rgba(8,13,24,0.94) 100%)',
  },
  sushi: {
    badge: 'PROMO DEL DÍA',
    image:
      'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1400&q=80',
    position: 'center center',
    gradient: 'linear-gradient(180deg, rgba(8,13,24,0.16) 0%, rgba(8,13,24,0.28) 35%, rgba(8,13,24,0.94) 100%)',
  },
  dessert: {
    badge: 'PROMO DEL DÍA',
    image:
      'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=1400&q=80',
    position: 'center center',
    gradient: 'linear-gradient(180deg, rgba(8,13,24,0.14) 0%, rgba(8,13,24,0.3) 35%, rgba(8,13,24,0.95) 100%)',
  },
  grill: {
    badge: 'ABIERTO',
    image:
      'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=1400&q=80',
    position: 'center center',
    gradient: 'linear-gradient(180deg, rgba(8,13,24,0.16) 0%, rgba(8,13,24,0.28) 35%, rgba(8,13,24,0.95) 100%)',
  },
  coffee: {
    badge: 'ABIERTO',
    image:
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1400&q=80',
    position: 'center center',
    gradient: 'linear-gradient(180deg, rgba(8,13,24,0.18) 0%, rgba(8,13,24,0.28) 35%, rgba(8,13,24,0.95) 100%)',
  },
  salad: {
    badge: 'DESTACADO',
    image:
      'https://images.unsplash.com/photo-1546793665-c74683f339c1?auto=format&fit=crop&w=1400&q=80',
    position: 'center center',
    gradient: 'linear-gradient(180deg, rgba(8,13,24,0.18) 0%, rgba(8,13,24,0.3) 35%, rgba(8,13,24,0.95) 100%)',
  },
  tacos: {
    badge: 'DESTACADO',
    image:
      'https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?auto=format&fit=crop&w=1400&q=80',
    position: 'center center',
    gradient: 'linear-gradient(180deg, rgba(8,13,24,0.18) 0%, rgba(8,13,24,0.28) 35%, rgba(8,13,24,0.95) 100%)',
  },
  noodles: {
    badge: 'DESTACADO',
    image:
      'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=1400&q=80',
    position: 'center center',
    gradient: 'linear-gradient(180deg, rgba(8,13,24,0.16) 0%, rgba(8,13,24,0.28) 35%, rgba(8,13,24,0.95) 100%)',
  },
};

export function FoodArtwork({
  theme,
  title,
  imageUrl,
  className = '',
  variant = 'default',
}: FoodArtworkProps) {
  const style = artworkStyles[theme];
  const resolvedImage = imageUrl?.trim() ? imageUrl.trim() : style.image;
  const backgroundStyle = {
    backgroundImage: `url("${resolvedImage}")`,
    backgroundPosition: style.position,
  };

  if (variant === 'thumb') {
    return (
      <div
        className={`relative isolate overflow-hidden rounded-[1rem] border border-white/10 bg-[#0b1220] ${className}`}
      >
        <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06] group-focus-within:scale-[1.06] motion-reduce:transform-none motion-reduce:transition-none"
          style={backgroundStyle}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,13,24,0.08)_0%,rgba(8,13,24,0.18)_45%,rgba(8,13,24,0.58)_100%)]" />
        <span className="sr-only">{title}</span>
      </div>
    );
  }

  if (variant === 'promo') {
    return (
      <div
        className={`relative isolate overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#0b1220] ${className}`}
      >
        <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06] group-focus-within:scale-[1.06] motion-reduce:transform-none motion-reduce:transition-none"
          style={backgroundStyle}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,13,24,0.03)_0%,rgba(8,13,24,0.08)_36%,rgba(8,13,24,0.56)_100%)]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,rgba(8,13,24,0)_0%,rgba(8,13,24,0.8)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="truncate text-lg font-black tracking-[-0.03em] text-white drop-shadow-[0_10px_22px_rgba(0,0,0,0.45)]">
            {title}
          </p>
        </div>
      </div>
    );
  }

  if (variant === 'showcase') {
    return (
      <div
        className={`relative isolate overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#0b1220] ${className}`}
      >
        <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06] group-focus-within:scale-[1.06] motion-reduce:transform-none motion-reduce:transition-none"
          style={backgroundStyle}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,13,24,0.02)_0%,rgba(8,13,24,0.12)_42%,rgba(8,13,24,0.46)_100%)]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:28px_28px]" />
        <span className="sr-only">{title}</span>
      </div>
    );
  }

  return (
    <div
      className={`relative isolate overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#0b1220] ${className}`}
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06] group-focus-within:scale-[1.06] motion-reduce:transform-none motion-reduce:transition-none"
        style={backgroundStyle}
      />
      <div className="absolute inset-0" style={{ backgroundImage: style.gradient }} />
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.55)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.55)_1px,transparent_1px)] [background-size:24px_24px]" />

      <div className="relative flex h-full min-h-[8rem] flex-col justify-between p-3.5">
        <span className="inline-flex w-fit rounded-full border border-white/18 bg-[#0a1120]/52 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/88 backdrop-blur">
          {style.badge}
        </span>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/68">Selección</p>
            <p className="mt-1 truncate text-sm font-bold text-white drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)]">{title}</p>
          </div>
        </div>
      </div>
    </div>
  );
}