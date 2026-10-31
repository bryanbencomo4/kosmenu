import type { AdminPermission } from './admin-permissions';

export const ADMIN_PATH_PREFIX = '/admin';
export const ADMIN_HOME_PATH = '/admin';
export const ADMIN_FORGOT_PASSWORD_PATH = '/admin/forgot-password';
export const ADMIN_LOGIN_PATH = '/admin/login';
export const ADMIN_RESET_PASSWORD_PATH = '/admin/reset-password';
export const ADMIN_UNAUTHORIZED_PATH = '/admin/unauthorized';
export const ADMIN_SESSION_COOKIE_NAME = 'elmenuxfa_admin_access_token';
export const ADMIN_HOST_HEADER = 'x-admin-host';
export const ADMIN_INTERNAL_PATH_HEADER = 'x-admin-internal-path';

export type AdminNavIcon =
  | 'home'
  | 'businesses'
  | 'menus'
  | 'orders'
  | 'promoted'
  | 'subscriptions'
  | 'credits'
  | 'delivery'
  | 'customers'
  | 'analytics'
  | 'sectors'
  | 'android'
  | 'settings'
  | 'security'
  | 'bank';

export type AdminNavigationItem = {
  label: string;
  href: string;
  icon: AdminNavIcon;
  permission?: AdminPermission;
};

/** Solo rutas reales con pantalla propia (sin anclas /admin#...). */
export const adminNavigation: readonly AdminNavigationItem[] = [
  {
    label: 'Inicio',
    href: '/admin',
    icon: 'home',
    permission: 'dashboard.read',
  },
  {
    label: 'Ops en vivo',
    href: '/admin/ops',
    icon: 'analytics',
    permission: 'analytics.read',
  },
  {
    label: 'Negocios',
    href: '/admin/negocios',
    icon: 'businesses',
    permission: 'businesses.read',
  },
  {
    label: 'Pedidos',
    href: '/admin/pedidos',
    icon: 'orders',
    permission: 'orders.read',
  },
  {
    label: 'Suscripciones',
    href: '/admin/suscripciones',
    icon: 'subscriptions',
    permission: 'subscriptions.read',
  },
  {
    label: 'Pagos',
    href: '/admin/pagos',
    icon: 'bank',
    permission: 'subscriptions.read',
  },
  {
    label: 'Pagos BDV',
    href: '/admin/pagos-bdv',
    icon: 'bank',
    permission: 'subscriptions.read',
  },
  {
    label: 'Envíos Kit',
    href: '/admin/envios-kit',
    icon: 'delivery',
    permission: 'subscriptions.read',
  },
  {
    label: 'Sectores',
    href: '/admin/sectores',
    icon: 'sectors',
    permission: 'settings.read',
  },
  {
    label: 'App Android',
    href: '/admin/app-android',
    icon: 'android',
    permission: 'settings.read',
  },
] as const;

export function sanitizeAdminNextPath(value: string | null | undefined) {
  const candidate = (value ?? '').trim();

  if (!candidate) {
    return ADMIN_HOME_PATH;
  }

  if (candidate === '/' || candidate.startsWith('/admin')) {
    if (candidate.startsWith('//')) {
      return ADMIN_HOME_PATH;
    }

    return candidate;
  }

  return ADMIN_HOME_PATH;
}
