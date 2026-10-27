import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Dev-only: never completes the response (simulates a hung image request).
 * Guarded so it cannot be abused outside development.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }
  await new Promise(() => {
    // intentionally never resolves
  });
  return new NextResponse(null, { status: 204 });
}
