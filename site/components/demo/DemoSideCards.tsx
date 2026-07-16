import Link from 'next/link';
import { ExternalLink, Link2, ShoppingCart, Smartphone, UtensilsCrossed } from 'lucide-react';

const CLIENT_VIEW_ITEMS = [
  {
    icon: Smartphone,
    title: 'Abre el demo',
    description: 'sin descargar apps',
  },
  {
    icon: UtensilsCrossed,
    title: 'Explora el menú',
    description: 'desde su celular',
  },
  {
    icon: ShoppingCart,
    title: 'Continúa al pedido',
    description: 'en segundos',
  },
] as const;

export function ClientViewCard() {
  return (
    <aside className="rounded-[1.35rem] border border-white/10 bg-[#0b1220]/92 p-4 shadow-[0_24px_60px_-40px_rgba(0,0,0,1)]">
      <h3 className="text-[0.98rem] font-bold text-white">¿Qué verá tu cliente?</h3>
      <ul className="mt-3 space-y-3">
        {CLIENT_VIEW_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.title} className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/12 text-violet-200">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="text-[0.82rem] leading-snug text-slate-200">
                <span className="font-semibold text-white">{item.title}</span>{' '}
                <span className="text-slate-400">{item.description}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

type NoCameraCardProps = {
  demoUrl: string;
  demoPath: string;
  displayUrl: string;
};

export function NoCameraCard({ demoUrl, demoPath, displayUrl }: NoCameraCardProps) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=4&data=${encodeURIComponent(demoUrl)}`;

  return (
    <aside className="rounded-[1.35rem] border border-white/10 bg-[#0b1220]/92 p-4 shadow-[0_24px_60px_-40px_rgba(0,0,0,1)]">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/12 text-violet-200">
        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <h3 className="mt-3 text-[0.98rem] font-bold text-white">¿Sin cámara?</h3>
      <p className="mt-1.5 text-[0.78rem] leading-relaxed text-slate-300">
        Usa el enlace directo para abrir el demo en tu navegador.
      </p>

      <div className="mt-3.5 flex items-center gap-3">
        <Link
          href={demoPath}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-[0.75rem] bg-[#FACC15] px-4 py-2.5 text-[0.82rem] font-bold text-[#0B0F1A] transition hover:-translate-y-0.5 hover:bg-[#fde047] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FACC15]"
        >
          Ir al enlace
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        <div className="relative shrink-0 overflow-hidden rounded-xl border border-white/12 bg-white p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt="Código QR alterno para abrir el demo" width={44} height={44} className="h-11 w-11" />
        </div>
      </div>
      <p className="mt-2.5 truncate text-[0.72rem] font-semibold text-slate-400">{displayUrl}</p>
      <p className="mt-2 text-[0.7rem] leading-relaxed text-slate-500">
        También puedes compartirlo por WhatsApp o redes sociales.
      </p>
    </aside>
  );
}
