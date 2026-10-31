import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminBusinessDetailPanel } from '../../_components/AdminBusinessDetailPanel';
import { AdminPageLoadError } from '../../_components/AdminPageLoadError';
import { requireAdminPermission } from '../../_lib/admin-auth';
import { getAdminBusinessDetail } from '../../_lib/admin-businesses';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Negocio',
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminBusinessDetailPage({ params }: PageProps) {
  const admin = await requireAdminPermission('businesses.read');
  const { id } = await params;

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }

  try {
    const detail = await getAdminBusinessDetail(id);
    if (!detail) {
      notFound();
    }

    return (
      <AdminBusinessDetailPanel admin={admin} businessId={id} initialDetail={detail} />
    );
  } catch (error) {
    console.error('[admin/negocios/id] load failed', error);
    return (
      <AdminPageLoadError
        title="No se pudo abrir este negocio"
        message={
          error instanceof Error
            ? error.message
            : 'Error inesperado al cargar la ficha del negocio.'
        }
      />
    );
  }
}
