import type { CSSProperties } from 'react';
import { Clock3, MapPin, Star, Truck } from 'lucide-react';

type UpsellHeroCardProps = {
  businessName: string;
  subtitle: string;
  coverUrl?: string | null;
  logoUrl?: string | null;
  supportsDelivery: boolean;
  locationLabel?: string | null;
  titleStyle?: CSSProperties;
  showDemoSocialProof?: boolean;
};

/** Aspirational hero — demo chips (rating/time/fee) until configurable. */
export function UpsellHeroCard({
  businessName,
  subtitle,
  coverUrl,
  logoUrl,
  supportsDelivery,
  locationLabel,
  titleStyle,
  showDemoSocialProof = false,
}: UpsellHeroCardProps) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6">
      <div
        className="relative overflow-hidden rounded-[28px]"
        style={{
          minHeight: 210,
          backgroundColor: '#1a1520',
          boxShadow: 'var(--menu-shadow)',
        }}
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 70% 30%, color-mix(in srgb, var(--menu-primary) 45%, transparent), transparent 45%), linear-gradient(160deg, #2a1d24, #121018)',
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />

        <div className="relative z-[1] flex h-full min-h-[210px] flex-col justify-end p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2.5">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="h-11 w-11 rounded-full border-2 border-white/80 object-cover"
              />
            ) : null}
            <div>
              <h1
                className="text-[1.65rem] font-black leading-none tracking-[-0.03em] text-white sm:text-[2rem]"
                style={titleStyle}
              >
                {businessName}
              </h1>
              <p className="mt-1 line-clamp-1 text-xs font-medium text-white/80">{subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {showDemoSocialProof ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                  <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                  4.8 · 2.3k
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                  <Clock3 className="h-3.5 w-3.5" />
                  30–40 min
                </span>
                {supportsDelivery ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                    <Truck className="h-3.5 w-3.5" />
                    Envío desde US$1.49
                  </span>
                ) : null}
              </>
            ) : null}
            {locationLabel ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{locationLabel}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
