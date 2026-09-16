import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { formatOrderDisplayId } from './order-utils';

export async function allocateOrderDisplayId(
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabase.rpc('next_order_display_number');

  if (error) {
    throw new Error(error.message || 'Failed to allocate order display number.');
  }

  const sequenceNumber = Number(data);
  if (!Number.isFinite(sequenceNumber) || sequenceNumber <= 0) {
    throw new Error('Invalid order display number from database.');
  }

  return formatOrderDisplayId(sequenceNumber);
}
