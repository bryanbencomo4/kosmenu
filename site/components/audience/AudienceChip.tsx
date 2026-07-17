import type { AudienceCategory } from './audience-data';

type AudienceChipProps = {
  category: AudienceCategory;
};

export function AudienceChip({ category }: AudienceChipProps) {
  const Icon = category.icon;

  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-white/12 bg-[#0d1420] px-5 py-3.5 text-sm font-semibold text-white transition-colors duration-300 hover:border-violet-400/35 hover:bg-[#121a2a]">
      <Icon className="h-4 w-4 text-violet-300" aria-hidden="true" />
      {category.label}
    </div>
  );
}
