import type { AudienceBenefit } from './audience-data';

type AudienceBenefitCardProps = {
  benefit: AudienceBenefit;
};

const ACCENT_STYLES = {
  violet: 'border-violet-400/25 bg-violet-500/12 text-violet-200',
  yellow: 'border-[#FACC15]/25 bg-[#FACC15]/12 text-[#FDE68A]',
} as const;

export function AudienceBenefitCard({ benefit }: AudienceBenefitCardProps) {
  const Icon = benefit.icon;

  return (
    <div className="flex min-h-[116px] items-center gap-4 rounded-[18px] border border-white/10 bg-white/[0.025] px-5">
      <span
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${ACCENT_STYLES[benefit.accent]}`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-[0.98rem] font-semibold leading-snug text-white">{benefit.title}</p>
    </div>
  );
}
