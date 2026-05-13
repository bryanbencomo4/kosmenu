import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { adminSiteUrl, publicSiteUrl } from '../_lib/public-site-config';
import { AdminShell } from './_components/AdminShell';
import { isAdminHost, requireAdmin } from './_lib/admin-auth';
import {
  ADMIN_HOME_PATH,
  ADMIN_INTERNAL_PATH_HEADER,
  ADMIN_LOGIN_PATH,
  ADMIN_UNAUTHORIZED_PATH,
} from './_lib/admin-routes';

export const metadata: Metadata = {
  metadataBase: new URL(adminSiteUrl),
  title: {
    default: 'Admin Maestro | ElMenuxFA',
    template: '%s | Admin Maestro | ElMenuxFA',
  },
  description: 'Panel administrativo maestro para la operacion segura de ElMenuxFA.',
  alternates: {
    canonical: adminSiteUrl,
  },
  robots: {
    index: false,
    follow: false,
  },
};

function isPublicAdminSurface(pathname: string) {
  return pathname === ADMIN_LOGIN_PATH || pathname === ADMIN_UNAUTHORIZED_PATH;
}

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const internalPath = requestHeaders.get(ADMIN_INTERNAL_PATH_HEADER) ?? ADMIN_HOME_PATH;

  if (!(await isAdminHost())) {
    redirect(publicSiteUrl);
  }

  if (isPublicAdminSurface(internalPath)) {
    return children;
  }

  const admin = await requireAdmin();

  return <AdminShell admin={admin}>{children}</AdminShell>;
}