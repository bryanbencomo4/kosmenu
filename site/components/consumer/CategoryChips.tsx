import type { ConsumerCategory } from '../../data/consumerBusinesses';

type CategoryChipsProps = {
  items: ConsumerCategory[];
};

export function CategoryChips({ items }: CategoryChipsProps) {
  return (
    <section id="categorias" className="px-4 pb-3 pt-2 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px]">
        <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <h2 className="text-[1.2rem] font-black tracking-[-0.04em] text-white sm:text-[1.4rem] lg:text-[1.55rem]">
            Categorías populares
          </h2>
          <button type="button" className="text-xs font-semibold text-violet-300 sm:text-sm">
            Ver todos &gt;
          </button>
        </div>

        <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Explorar categoría ${item.label}`}
              className="flex min-w-[138px] items-center gap-2.5 rounded-[0.95rem] border border-white/10 bg-[#07111f]/76 px-3 py-2.5 text-left shadow-[0_22px_60px_-40px_rgba(15,23,42,1)] transition-all duration-300 hover:border-violet-400/24 hover:bg-[#0b1526] sm:min-w-[160px] sm:gap-3 sm:px-4 sm:py-3"
            >
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/14 text-lg sm:h-9 sm:w-9 sm:text-xl"
                style={{ backgroundColor: `${item.accent}22` }}
              >
                {item.emoji}
              </span>
              <span>
                <span className="block text-[13px] font-semibold text-white sm:text-sm">{item.label}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}