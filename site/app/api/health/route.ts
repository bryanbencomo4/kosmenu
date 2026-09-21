import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const maxDuration = 8;

const PING_TIMEOUT_MS = 4_000;

type CheckName = 'site' | 'supabaseRest' | 'supabaseAuth' | 'egress';

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function pingRest() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('missing supabase env');
  const response = await fetch(`${url}/rest/v1/comercios?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(PING_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`rest ${response.status}`);
}

async function pingAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('missing supabase env');
  const response = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(PING_TIMEOUT_MS),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`auth health ${response.status}`);
  }
}

async function pingEgress() {
  const response = await fetch('https://example.com/', {
    method: 'HEAD',
    cache: 'no-store',
    signal: AbortSignal.timeout(PING_TIMEOUT_MS),
  });
  if (!response.ok && response.status >= 500) {
    throw new Error(`egress ${response.status}`);
  }
}

function publicErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/sb_secret_[a-zA-Z0-9]+|eyJ[a-zA-Z0-9._-]+/g, '[redacted]').slice(0, 160);
}

async function runCheck(name: Exclude<CheckName, 'site'>, work: () => Promise<void>) {
  const started = Date.now();
  try {
    await withTimeout(work(), PING_TIMEOUT_MS);
    return { name, ok: true as const, ms: Date.now() - started, error: null as string | null };
  } catch (error) {
    return {
      name,
      ok: false as const,
      ms: Date.now() - started,
      error: publicErrorMessage(error),
    };
  }
}

export async function GET() {
  const [supabaseRest, supabaseAuth, egress] = await Promise.all([
    runCheck('supabaseRest', pingRest),
    runCheck('supabaseAuth', pingAuth),
    runCheck('egress', pingEgress),
  ]);

  const checks: Record<CheckName, 'ok' | 'fail'> = {
    site: 'ok',
    supabaseRest: supabaseRest.ok ? 'ok' : 'fail',
    supabaseAuth: supabaseAuth.ok ? 'ok' : 'fail',
    egress: egress.ok ? 'ok' : 'fail',
  };

  const ok = supabaseRest.ok;
  const supabase =
    supabaseRest.ok && supabaseAuth.ok ? 'healthy' : supabaseRest.ok ? 'degraded' : 'down';
  return NextResponse.json(
    {
      ok,
      supabase,
      latencyMs: supabaseRest.ms,
      timestamp: new Date().toISOString(),
      version:
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.VERCEL_DEPLOYMENT_ID ||
        'dev',
      service: 'kosmenu-site',
      checks,
      timingsMs: {
        supabaseRest: supabaseRest.ms,
        supabaseAuth: supabaseAuth.ms,
        egress: egress.ms,
      },
      errors: {
        supabaseRest: supabaseRest.error,
        supabaseAuth: supabaseAuth.error,
        egress: egress.error,
      },
    },
    {
      status: ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
