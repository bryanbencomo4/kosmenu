const steps = [
  'Configura tu comercio',
  'Carga productos',
  'Comparte link o QR',
  'Cliente arma pedido',
  'Gestionas entrega',
] as const;

export function Steps() {
  return (
    <section id="como-funciona" className="perf-section border-y border-white/8 bg-[#0a101c]">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-violet-200">
            Cómo funciona
          </span>
          <h2 className="mt-4 font-[var(--font-display)] text-[2rem] font-black leading-[1.02] tracking-[-0.03em] text-white sm:mt-5 sm:text-[2.55rem]">
            Cinco pasos para empezar a vender con una experiencia más clara
          </h2>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-5 lg:gap-0">
          {steps.map((step, index) => (
            <article key={step} className="relative rounded-[1.4rem] border border-white/10 bg-[#0d1420]/76 px-5 py-5 text-left shadow-[0_22px_70px_-42px_rgba(0,0,0,1)] lg:rounded-none lg:border-0 lg:bg-transparent lg:px-2 lg:py-0 lg:text-center lg:shadow-none">
              {index < steps.length - 1 ? (
                <span className="absolute left-[57%] top-[30px] hidden h-px w-[86%] bg-gradient-to-r from-[#7C3AED] to-transparent lg:block" />
              ) : null}
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-violet-400/25 bg-[#5b21b6] text-base font-black text-white shadow-[0_18px_40px_-20px_rgba(124,58,237,0.95)] lg:mx-auto lg:h-14 lg:w-14">
                {index + 1}
              </div>
              <p className="mt-4 text-[1rem] font-bold leading-6 text-white lg:mt-5 lg:text-[1.05rem]">{step}</p>
              <p className="mt-2 max-w-[18rem] text-sm leading-6 text-slate-400 lg:mx-auto lg:mt-3 lg:max-w-[11rem] lg:text-[13px]">
                {index === 0 && 'Personaliza tu identidad y deja listo tu canal de venta.'}
                {index === 1 && 'Organiza categorías, precios y productos destacados.'}
                {index === 2 && 'Llévalo a WhatsApp, redes, mesas y piezas impresas.'}
                {index === 3 && 'El cliente elige, confirma y entiende mejor su pedido.'}
                {index === 4 && 'Coordina pickup o delivery con menos fricción.'}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}