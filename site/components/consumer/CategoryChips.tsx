import type { ConsumerCategory } from '../../data/consumerBusinesses';

type CategoryChipsProps = {
  items: ConsumerCategory[];
};

export function CategoryChips({ items }: CategoryChipsProps) {
  return (
    <section id="categorias" className="px-3 pb-3 pt-2 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <h2 className="text-[1.15rem] font-black tracking-[-0.04em] text-white sm:text-[1.55rem] lg:text-[1.8rem]">
            Categorías populares
          </h2>
          <button type="button" className="text-xs font-semibold text-violet-300 sm:text-sm">
            Ver todos &gt;
          </button>
        </div>

        <div className="hide-scrollbar flex gap-2.5 overflow-x-auto pb-2.5 pr-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Explorar categoría ${item.label}`}
              className="flex min-w-[164px] snap-start items-center gap-3 rounded-[1rem] border border-white/10 bg-[#07111f]/76 px-3.5 py-3.5 text-left shadow-[0_22px_60px_-40px_rgba(15,23,42,1)] transition-all duration-300 hover:border-violet-400/24 hover:bg-[#0b1526] sm:min-w-[196px] sm:gap-4 sm:rounded-[1.1rem] sm:px-5 sm:py-4"
            >
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/14 text-[1.05rem] sm:h-11 sm:w-11 sm:text-2xl"
                style={{ backgroundColor: `${item.accent}22` }}
              >
                {item.emoji}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-white sm:text-[15px]">{item.label}</span>
                <span className="mt-0.5 block text-[11px] text-slate-400">Explora negocios</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}