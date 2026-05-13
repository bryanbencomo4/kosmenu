export const adminRoles = [
  'super_admin',
  'support',
  'sales',
  'finance',
  'business_owner',
] as const;

export type AdminRole = (typeof adminRoles)[number];

export const adminPermissions = [
  'dashboard.read',
  'businesses.read',
  'businesses.write',
  'menus.read',
  'menus.write',
  'orders.read',
  'subscriptions.read',
  'subscriptions.write',
  'ai_credits.read',
  'ai_credits.write',
  'delivery.read',
  'analytics.read',
  'settings.read',
  'settings.write',
  'security.read',
  'security.write',
  'audit.read',
] as const;

export type AdminPermission = (typeof adminPermissions)[number];

const rolePermissions: Record<AdminRole, readonly AdminPermission[]> = {
  super_admin: adminPermissions,
  support: [
    'dashboard.read',
    'businesses.read',
    'menus.read',
    'orders.read',
    'delivery.read',
  ],
  sales: [
    'dashboard.read',
    'businesses.read',
    'subscriptions.read',
    'analytics.read',
  ],
  finance: [
    'dashboard.read',
    'subscriptions.read',
    'subscriptions.write',
    'analytics.read',
  ],
  business_owner: [
    'dashboard.read',
    'businesses.read',
    'menus.read',
    'orders.read',
  ],
};

const rolePermissionSets: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  super_admin: new Set(rolePermissions.super_admin),
  support: new Set(rolePermissions.support),
  sales: new Set(rolePermissions.sales),
  finance: new Set(rolePermissions.finance),
  business_owner: new Set(rolePermissions.business_owner),
};

export function isAdminRole(value: string | null | undefined): value is AdminRole {
  return Boolean(value) && adminRoles.includes(value as AdminRole);
}

export function getRolePermissions(role: AdminRole) {
  return [...rolePermissions[role]];
}

export function hasAdminPermission(role: AdminRole, permission: AdminPermission) {
  return rolePermissionSets[role].has(permission);
}