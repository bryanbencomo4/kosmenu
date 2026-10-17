import { getServiceSupabaseClient } from './supabase-server';

/** Owner or active staff member of the commerce (assisted / in-app ops). */
export async function userCanOperateComercio(
  userId: string,
  comercioId: string,
): Promise<boolean> {
  const id = comercioId.trim();
  const uid = userId.trim();
  if (!id || !uid) return false;

  const supabase = getServiceSupabaseClient();
  const { data: owned } = await supabase
    .from('comercios')
    .select('id')
    .eq('id', id)
    .eq('owner_id', uid)
    .maybeSingle();
  if (owned?.id) return true;

  const { data: member } = await supabase
    .from('comercio_members')
    .select('id')
    .eq('comercio_id', id)
    .eq('user_id', uid)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return Boolean(member?.id);
}
