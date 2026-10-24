import { NextResponse } from 'next/server';

import { parseAccountFields } from '../../../admin/_lib/admin-billing';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';

/**
 * Public-safe Pago Móvil destination for kit extras checkout.
 * Never exposes internal IDs beyond method code/name.
 */
export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`kit:payment-info:${ip}`, 30, 60_000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
      .from('payment_methods')
      .select('code, name, instructions, account_fields, local_currency, is_active')
      .eq('code', 'pago_movil')
      .maybeSingle();

    if (error) {
      console.error('[kit/payment-info]', error.message);
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }

    if (!data || data.is_active === false) {
      return NextResponse.json({
        ok: true,
        data: {
          available: false,
          methodName: 'Pago Móvil',
          instructions: null,
          accountFields: [],
          localCurrency: 'VES',
        },
      });
    }

    const accountFields = parseAccountFields(data.account_fields).filter(
      (field) => field.value.trim().length > 0,
    );

    return NextResponse.json({
      ok: true,
      data: {
        available: accountFields.length > 0,
        methodName: data.name || 'Pago Móvil',
        instructions: typeof data.instructions === 'string' ? data.instructions : null,
        accountFields,
        localCurrency: data.local_currency || 'VES',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Missing environment variable')) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }
    console.error('[kit/payment-info]', err);
    return NextResponse.json({ error: 'Unavailable.' }, { status: 500 });
  }
}
