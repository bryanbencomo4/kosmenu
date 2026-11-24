import { requireAdminAnyPermission } from '../_lib/admin-auth';
import { WaControlClient } from './WaControlClient';

export const dynamic = 'force-dynamic';

export default async function AdminWaControlPage() {
  await requireAdminAnyPermission(['orders.write', 'businesses.write', 'security.write']);
  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Inbox WhatsApp · elmenuxfa.com
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Recepción del número oficial. Respuestas automáticas solo para contactos autorizados.
            Toma cualquier conversación con un clic. No detiene notificaciones de pedidos.
          </p>
        </div>
      </div>
      <WaControlClient />
    </div>
  );
}
