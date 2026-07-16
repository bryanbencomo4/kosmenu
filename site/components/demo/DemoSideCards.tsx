'use client';

import Image from 'next/image';
import { Plus } from 'lucide-react';
import {
  DEMO_PRODUCTS,
  POPULAR_PRODUCT_IDS,
  formatUsd,
} from './demo-data';

type PopularProductsCardProps = {
  onAdd: (productId: string) => void;
};

export function PopularProductsCard({ onAdd }: PopularProductsCardProps) {
  const products = POPULAR_PRODUCT_IDS.map(
    (id) => DEMO_PRODUCTS.find((product) => product.id === id)!,
  );

  return (
    <aside className="rounded-[1.35rem] border border-white/10 bg-[#0b1220]/92 p-4 shadow-[0_24px_60px_-40px_rgba(0,0,0,1)]">
      <h3 className="text-[0.98rem] font-bold text-white">
        Populares hoy <span aria-hidden="true">🔥</span>
      </h3>
      <ul className="mt-3 divide-y divide-white/8">
        {products.map((product) => (
          <li key={product.id} className="flex items-center gap-3 py-3 first:pt-1 last:pb-0">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10">
              <Image src={product.imageSrc} alt={product.imageAlt} fill sizes="48px" className="object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.84rem] font-semibold text-white">{product.name}</p>
              <p className="truncate text-[0.7rem] text-slate-400">{product.description}</p>
              <p className="mt-0.5 text-[0.78rem] font-bold text-[#FACC15]">{formatUsd(product.price)}</p>
            </div>
            <button
              type="button"
              onClick={() => onAdd(product.id)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white transition hover:bg-violet-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
              aria-label={`Agregar ${product.name}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function OrderTrackingCard() {
  const stages = ['Recibido', 'En preparación', 'Listo', 'Entregado'] as const;
  const activeIndex = 1;

  return (
    <aside className="rounded-[1.35rem] border border-white/10 bg-[#0b1220]/92 p-4 shadow-[0_24px_60px_-40px_rgba(0,0,0,1)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[0.98rem] font-bold text-white">
            Tu pedido en camino <span aria-hidden="true">🚀</span>
          </h3>
          <p className="mt-0.5 text-[0.72rem] text-slate-400">Pedido #1048</p>
        </div>
        <span className="rounded-full border border-violet-300/35 bg-violet-500/15 px-2.5 py-1 text-[0.68rem] font-semibold text-violet-100">
          En preparación
        </span>
      </div>

      <div className="mt-4">
        <div className="relative flex justify-between">
          <div className="absolute left-2 right-2 top-[0.55rem] h-px bg-white/12" />
          <div
            className="absolute left-2 top-[0.55rem] h-px bg-violet-400"
            style={{ width: `${(activeIndex / (stages.length - 1)) * 100}%` }}
          />
          {stages.map((stage, index) => {
            const reached = index <= activeIndex;
            const current = index === activeIndex;
            return (
              <div key={stage} className="relative z-10 flex w-14 flex-col items-center gap-1.5">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    current
                      ? 'bg-violet-300 shadow-[0_0_12px_rgba(196,181,253,0.95)]'
                      : reached
                        ? 'bg-violet-400'
                        : 'bg-white/20'
                  }`}
                />
                <span className={`text-center text-[0.58rem] leading-tight ${current ? 'font-semibold text-white' : 'text-slate-500'}`}>
                  {stage}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-[0.78rem] text-slate-300">
        Tiempo estimado: <span className="font-semibold text-white">18 - 22 min</span>
      </p>

      <div className="relative mt-3 h-28 overflow-hidden rounded-2xl border border-white/8 bg-[#0a1020]">
        <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:18px_18px]" />
        <svg viewBox="0 0 320 120" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <path
            d="M28 88 C 90 28, 180 28, 280 70"
            fill="none"
            stroke="#a855f7"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="2 6"
          />
          <circle cx="28" cy="88" r="6" fill="#FACC15" />
          <circle cx="280" cy="70" r="7" fill="#c4b5fd" />
        </svg>
      </div>
    </aside>
  );
}

type DemoQrCardProps = {
  demoUrl: string;
};

export function DemoQrCard({ demoUrl }: DemoQrCardProps) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(demoUrl)}`;

  return (
    <aside className="relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#0b1220]/92 p-4 shadow-[0_24px_60px_-40px_rgba(0,0,0,1)]">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0 overflow-hidden rounded-2xl border border-white/12 bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt="Código QR para abrir el demo en tu celular" width={112} height={112} className="h-28 w-28" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[0.98rem] font-bold text-white">Pruébalo en tu celular</h3>
          <p className="mt-1 text-[0.78rem] leading-relaxed text-slate-300">
            Escanea el código y vive la experiencia completa.
          </p>
          <span className="mt-2.5 inline-flex rounded-full border border-violet-300/25 bg-violet-500/12 px-2.5 py-1 text-[0.65rem] font-semibold text-violet-100">
            Sin registro · 100% demo
          </span>
        </div>
      </div>
    </aside>
  );
}
