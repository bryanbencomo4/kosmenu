const steps = [
  'Configura tu comercio',
  'Carga productos',
  'Comparte link o QR',
  'Cliente arma pedido',
  'Gestionas entrega',
] as const;

export function Steps() {
  return (
    <section id="como-funciona" className="border-y border-white/8 bg-[#0a101c]">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-violet-200">
            Cómo funciona
          </span>
          <h2 className="mt-5 font-[var(--font-display)] text-3xl font-black tracking-[-0.03em] text-white sm:text-[2.55rem]">
            Cinco pasos para empezar a vender con una experiencia más clara
          </h2>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-5 lg:gap-0">
          {steps.map((step, index) => (
            <article key={step} className="relative px-3 text-center lg:px-2">
              {index < steps.length - 1 ? (
                <span className="absolute left-[57%] top-[30px] hidden h-px w-[86%] bg-gradient-to-r from-[#7C3AED] to-transparent lg:block" />
              ) : null}
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-violet-400/25 bg-[#5b21b6] text-base font-black text-white shadow-[0_18px_40px_-20px_rgba(124,58,237,0.95)]">
                {index + 1}
              </div>
              <p className="mt-5 text-[1.05rem] font-bold leading-6 text-white">{step}</p>
              <p className="mx-auto mt-3 max-w-[11rem] text-[13px] leading-6 text-slate-400">
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