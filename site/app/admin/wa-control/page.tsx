import { requireAdminAnyPermission } from '../_lib/admin-auth';
import { WaControlClient } from './WaControlClient';

export const dynamic = 'force-dynamic';

export default async function AdminWaControlPage() {
  await requireAdminAnyPermission(['orders.write', 'businesses.write', 'security.write']);
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Control WhatsApp · elmenuxfa.com</h1>
      <p style={{ color: '#555', marginBottom: 20, lineHeight: 1.45 }}>
        Toma conversaciones, pausa el bot de la plataforma y reanúdalo. No detiene notificaciones
        de pedidos ni la sesión WaSender.
      </p>
      <WaControlClient />
    </main>
  );
}
