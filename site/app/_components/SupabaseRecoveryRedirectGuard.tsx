'use client';

import { useEffect } from 'react';

const DEFAULT_ADMIN_SITE_URL = 'https://admin.elmenuxfa.com';
const PUBLIC_ADMIN_SITE_URL = process.env.NEXT_PUBLIC_ADMIN_SITE_URL?.trim();
const LOCAL_PUBLIC_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'www.localhost',
  'elmenuxfa.local',
  'www.elmenuxfa.local',
]);
const LOCAL_BUSINESS_HOSTS = new Set(['business.localhost', 'business.elmenuxfa.local']);
const LOCAL_ADMIN_HOSTS = new Set(['admin.localhost', 'admin.elmenuxfa.local']);
const PRODUCTION_PUBLIC_HOSTS = new Set(['elmenuxfa.com', 'www.elmenuxfa.com']);
const PRODUCTION_BUSINESS_HOSTS = new Set(['business.elmenuxfa.com']);
const PRODUCTION_ADMIN_HOSTS = new Set(['admin.elmenuxfa.com']);

function isBusinessOrAdminHost(hostname: string) {
  return (
    PRODUCTION_ADMIN_HOSTS.has(hostname) ||
    PRODUCTION_BUSINESS_HOSTS.has(hostname) ||
    LOCAL_ADMIN_HOSTS.has(hostname) ||
    LOCAL_BUSINESS_HOSTS.has(hostname)
  );
}

function resolveLocalAdminOrigin(hostname: string, port: string) {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return `http://admin.localhost${port ? `:${port}` : ''}`;
  }

  if (hostname === 'www.localhost') {
    return `http://admin.localhost${port ? `:${port}` : ''}`;
  }

  if (hostname === 'elmenuxfa.local' || hostname === 'www.elmenuxfa.local') {
    return `http://admin.elmenuxfa.local${port ? `:${port}` : ''}`;
  }

  return null;
}

function resolveAdminResetOrigin(hostname: string, port: string) {
  const normalizedHostname = hostname.trim().toLowerCase();

  if (LOCAL_PUBLIC_HOSTS.has(normalizedHostname)) {
    return resolveLocalAdminOrigin(normalizedHostname, port);
  }

  if (PRODUCTION_PUBLIC_HOSTS.has(normalizedHostname)) {
    return (PUBLIC_ADMIN_SITE_URL || DEFAULT_ADMIN_SITE_URL).replace(/\/$/, '');
  }

  return null;
}

export function SupabaseRecoveryRedirectGuard() {
  useEffect(() => {
    const { hash, hostname, port } = window.location;

    if (!hash) {
      return;
    }

    const normalizedHostname = hostname.trim().toLowerCase();

    if (isBusinessOrAdminHost(normalizedHostname)) {
      return;
    }

    const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
    const type = hashParams.get('type');
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (type !== 'recovery' || !accessToken || !refreshToken) {
      return;
    }

    const adminOrigin = resolveAdminResetOrigin(normalizedHostname, port);

    if (!adminOrigin) {
      return;
    }

    window.location.replace(`${adminOrigin}/admin/reset-password${hash}`);
  }, []);

  return null;
}