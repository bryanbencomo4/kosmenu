import { Users } from 'lucide-react';
import { AudienceBenefitCard } from './audience/AudienceBenefitCard';
import { AudienceChip } from './audience/AudienceChip';
import { audienceBenefits, audienceCategories } from './audience/audience-data';

export function TargetSection() {
  return (
    <section
      id="audiencia"
      className="perf-section relative scroll-mt-24 overflow-hidden border-y border-white/8 bg-[#060b18] py-20 lg:py-28"
      style={{
        background:
          'radial-gradient(circle at 50% 65%, rgba(124, 58, 237, 0.10), transparent 32%), radial-gradient(circle at 8% 12%, rgba(124, 58, 237, 0.06), transparent 26%), #060b18',
      }}
    >
      <div className="relative mx-auto w-full max-w-[1480px] px-5 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-violet-200">
              <Users className="h-3.5 w-3.5 text-violet-300" aria-hidden="true" />
              Para quién es
            </span>
            <h2 className="mt-5 max-w-full font-[var(--font-display)] text-[2.15rem] font-black leading-[1.1] tracking-[-0.03em] text-white sm:text-[2.5rem] lg:text-[2.55rem] xl:text-[3.25rem] xl:leading-[1.05] xl:tracking-[-0.04em] 2xl:text-[3.75rem] 2xl:leading-[1.02] 2xl:tracking-[-0.045em]">
              <span className="block">Pensado para negocios</span>
              <span className="block">
                que quieren{' '}
                <span className="bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
                  vender mejor
                </span>
              </span>
            </h2>
            <p className="mt-5 max-w-[34rem] text-[1.05rem] leading-[1.7] text-slate-300/90">
              Ideal para restaurantes, cafeterías, food trucks y emprendimientos gastronómicos que buscan una
              experiencia más profesional y rápida para sus clientes.
            </p>
          </div>

          <div>
            <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:-mx-6 sm:flex-wrap sm:overflow-visible sm:px-6 sm:pb-1 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
              {audienceCategories.map((category) => (
                <AudienceChip key={category.label} category={category} />
              ))}
            </div>

            <div className="mt-8 grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 lg:mt-12 lg:grid-cols-3">
              {audienceBenefits.map((benefit) => (
                <AudienceBenefitCard key={benefit.title} benefit={benefit} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
