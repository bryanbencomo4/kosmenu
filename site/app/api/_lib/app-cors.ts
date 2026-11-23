import { NextResponse } from 'next/server';

import { appSiteUrl } from '../../_lib/public-site-config';

const DEFAULT_APP_ORIGINS = [
  appSiteUrl,
  'https://app.elmenuxfa.com',
  'http://localhost:5000',
  'http://localhost:8080',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:8080',
] as const;

export type AppCorsOptions = {
  methods?: string;
  headers?: string;
};

/** CORS for browser calls from the Flutter merchant app (app.elmenuxfa.com). */
export function appCorsHeaders(
  request: Request,
  options: AppCorsOptions = {},
): Record<string, string> {
  const origin = (request.headers.get('origin') ?? '').trim();
  const allowed = new Set<string>(DEFAULT_APP_ORIGINS.filter(Boolean));
  if (!origin || !allowed.has(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods':
      options.methods ?? 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      options.headers ??
      'authorization, content-type, accept, x-idempotency-key, x-comprobante-permit',
    Vary: 'Origin',
  };
}

export function appCorsPreflight(
  request: Request,
  options: AppCorsOptions = {},
): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: appCorsHeaders(request, options),
  });
}

export function withAppCors(
  request: Request,
  response: NextResponse,
  options: AppCorsOptions = {},
): NextResponse {
  const cors = appCorsHeaders(request, options);
  for (const [key, value] of Object.entries(cors)) {
    response.headers.set(key, value);
  }
  return response;
}
