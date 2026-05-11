import type { ConsumerCategory } from '../../data/consumerBusinesses';

type CategoryChipsProps = {
  items: ConsumerCategory[];
};

export function CategoryChips({ items }: CategoryChipsProps) {
  return (
    <section id="categorias" className="px-4 pb-3 pt-2 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px]">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-[1.35rem] font-black tracking-[-0.04em] text-white sm:text-[1.55rem]">
            Categorías populares
          </h2>
          <button type="button" className="text-sm font-semibold text-violet-300">
            Ver todos &gt;
          </button>
        </div>

        <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Explorar categoría ${item.label}`}
              className="flex min-w-[160px] items-center gap-3 rounded-[0.95rem] border border-white/10 bg-[#07111f]/76 px-4 py-3 text-left shadow-[0_22px_60px_-40px_rgba(15,23,42,1)] transition-all duration-300 hover:border-violet-400/24 hover:bg-[#0b1526]"
            >
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/14 text-xl"
                style={{ backgroundColor: `${item.accent}22` }}
              >
                {item.emoji}
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">{item.label}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}