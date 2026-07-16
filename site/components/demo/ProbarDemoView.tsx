'use client';

import Link from 'next/link';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { DemoPhone } from './DemoPhone';
import { DEMO_FLOW_STEPS } from './demo-data';
import { useDemoFlow } from './useDemoFlow';

export function ProbarDemoView() {
  const {
    step,
    cart,
    activeCategory,
    stepMeta,
    setActiveCategory,
    addToCart,
    removeFromCart,
    selectStep,
    playFullFlow,
  } = useDemoFlow();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#060b18] px-4 py-8 text-white sm:px-6 lg:py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(116, 70, 255, 0.16), transparent 45%), #060b18',
        }}
      />

      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between">
          <Link
            href="/#demo"
            className="inline-flex items-center gap-1.5 text-[0.85rem] font-semibold text-slate-300 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al sitio
          </Link>
          <button
            type="button"
            onClick={() => selectStep('menu')}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[0.78rem] font-semibold text-slate-200 transition hover:border-violet-300/35 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reiniciar
          </button>
        </div>

        <div className="mt-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-violet-100">
            Demo interactivo
          </span>
          <h1 className="mt-4 font-[var(--font-display)] text-[2rem] font-black leading-[0.98] tracking-[-0.04em] text-white">
            Pruébalo tú mismo
          </h1>
          <p className="mt-2 text-[0.92rem] text-slate-300/85">
            Este es el mismo menú digital que verían tus clientes. Explora, agrega productos y sigue el flujo completo.
          </p>
        </div>

        <div className="mt-8">
          <DemoPhone
            step={step}
            cart={cart}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            onAdd={addToCart}
            onRemove={removeFromCart}
            onGoToCart={() => selectStep('cart')}
            onGoToPayment={() => selectStep('payment')}
            onGoToTracking={() => selectStep('tracking')}
            onGoToMenu={() => selectStep('menu')}
          />
          <p className="mt-4 text-center text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-white/45">
            Paso {stepMeta.number} de {DEMO_FLOW_STEPS.length}: {stepMeta.title}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {DEMO_FLOW_STEPS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectStep(item.id)}
              aria-current={step === item.id ? 'true' : undefined}
              className={`rounded-full border px-3.5 py-1.5 text-[0.78rem] font-semibold transition ${
                step === item.id
                  ? 'border-violet-300/50 bg-violet-500/15 text-white'
                  : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'
              }`}
            >
              {item.number}. {item.title}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={playFullFlow}
          className="mx-auto mt-5 flex items-center justify-center gap-2 text-[0.85rem] font-semibold text-violet-200 transition hover:text-violet-100"
        >
          Reproducir flujo completo automáticamente
        </button>
      </div>
    </main>
  );
}
