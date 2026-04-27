import {
  MessageCircle,
  PackageCheck,
  QrCode,
  ScanSearch,
  Store,
  Truck,
} from 'lucide-react';

const features = [
  {
    title: 'Menú digital',
    description: 'Publica categorías, fotos, precios y productos destacados en un solo enlace profesional.',
    icon: Store,
  },
  {
    title: 'Pedidos organizados',
    description: 'Centraliza las órdenes para evitar mensajes cruzados y errores al momento de preparar.',
    icon: PackageCheck,
  },
  {
    title: 'WhatsApp integrado',
    description: 'Mantén el canal que tus clientes ya usan, pero con una experiencia mucho más ordenada.',
    icon: MessageCircle,
  },
  {
    title: 'Tracking del pedido',
    description: 'Permite que tus clientes sigan el estado de la orden con una vista simple y clara.',
    icon: ScanSearch,
  },
  {
    title: 'Delivery delegado',
    description: 'Comparte enlaces con repartidores y mejora la coordinación de entregas.',
    icon: Truck,
  },
  {
    title: 'QR para compartir',
    description: 'Lleva tu menú a mesa, vitrina, redes o flyers con un QR fácil de escanear.',
    icon: QrCode,
  },
] as const;

export function Features() {
  return (
    <section id="beneficios" className="border-t border-white/8">
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start lg:py-20">
        <div className="rounded-[1.8rem] border border-white/10 bg-[#0b111d]/86 p-7 shadow-[0_28px_90px_-50px_rgba(0,0,0,1)]">
          <span className="inline-flex rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-violet-200">
            ¿Qué es ElMenuxFA?
          </span>
          <h2 className="mt-5 max-w-md font-[var(--font-display)] text-3xl font-black leading-tight tracking-[-0.03em] text-white sm:text-[2.45rem]">
            Una plataforma para vender mejor sin depender de catálogos manuales
          </h2>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-slate-400">
            ElMenuxFA ayuda a restaurantes, cafeterías, dark kitchens, food trucks, reposterías y emprendimientos de comida a mostrar su menú, recibir pedidos y gestionar mejor la entrega desde una experiencia más profesional.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {features.map(({ title, description, icon: Icon }) => (
          <article
            key={title}
            className="rounded-[1.55rem] border border-white/10 bg-[#0c1320]/90 p-5 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.95)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-2 hover:border-violet-400/30 hover:bg-[#101828]"
          >
            <div className="inline-flex rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3 text-violet-200">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-[var(--font-display)] text-[1.1rem] font-bold text-white">{title}</h3>
            <p className="mt-2 text-[13px] leading-6 text-slate-400">{description}</p>
          </article>
        ))}
      </div>
      </div>
    </section>
  );
}