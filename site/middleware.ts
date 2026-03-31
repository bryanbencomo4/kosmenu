import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const EXCLUDED_PREFIXES = ['/api', '/_next', '/v'];
const EXCLUDED_EXACT = new Set(['/favicon.ico', '/robots.txt', '/sitemap.xml']);

function hasFileExtension(pathname: string) {
  return /\.[^/]+$/.test(pathname);
}

function isExcludedPath(pathname: string) {
  if (EXCLUDED_EXACT.has(pathname)) {
    return true;
  }

  return EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    return NextResponse.next();
  }

  if (isExcludedPath(pathname) || hasFileExtension(pathname)) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = `/v${pathname}`;

  return NextResponse.redirect(redirectUrl, 308);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
