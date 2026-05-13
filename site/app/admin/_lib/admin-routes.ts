import type { AdminPermission } from './admin-permissions';

export const ADMIN_PATH_PREFIX = '/admin';
export const ADMIN_HOME_PATH = '/admin';
export const ADMIN_LOGIN_PATH = '/admin/login';
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
  | 'settings'
  | 'security';

export type AdminNavigationItem = {
  label: string;
  href: string;
  icon: AdminNavIcon;
  permission?: AdminPermission;
};

export const adminNavigation: readonly AdminNavigationItem[] = [
  {
    label: 'Inicio',
    href: '/admin',
    icon: 'home',
    permission: 'dashboard.read',
  },
  {
    label: 'Negocios',
    href: '/admin#businesses',
    icon: 'businesses',
    permission: 'businesses.read',
  },
  {
    label: 'Menus',
    href: '/admin#menus',
    icon: 'menus',
    permission: 'menus.read',
  },
  {
    label: 'Pedidos',
    href: '/admin#orders',
    icon: 'orders',
    permission: 'orders.read',
  },
  {
    label: 'Promocionados',
    href: '/admin#promoted',
    icon: 'promoted',
    permission: 'analytics.read',
  },
  {
    label: 'Suscripciones',
    href: '/admin#subscriptions',
    icon: 'subscriptions',
    permission: 'subscriptions.read',
  },
  {
    label: 'Creditos IA',
    href: '/admin#ai-credits',
    icon: 'credits',
    permission: 'ai_credits.read',
  },
  {
    label: 'Delivery',
    href: '/admin#delivery',
    icon: 'delivery',
    permission: 'delivery.read',
  },
  {
    label: 'Clientes',
    href: '/admin#customers',
    icon: 'customers',
    permission: 'analytics.read',
  },
  {
    label: 'Analiticas',
    href: '/admin#analytics',
    icon: 'analytics',
    permission: 'analytics.read',
  },
  {
    label: 'Configuracion',
    href: '/admin#settings',
    icon: 'settings',
    permission: 'settings.read',
  },
  {
    label: 'Seguridad',
    href: '/admin#security',
    icon: 'security',
    permission: 'security.read',
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