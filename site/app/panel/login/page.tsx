import { redirect } from 'next/navigation';

import { merchantAppAuthHref } from '../../_lib/public-site-config';
import { safePanelNext } from '../_lib/safe-panel-next';

/**
 * Merchant auth lives only on app.elmenuxfa.com (Flutter AuthScreen).
 * This route exists so old /panel/login?next=… bookmarks still work.
 */
export default async function PanelLoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const next = safePanelNext(typeof sp.next === 'string' ? sp.next : '');
  redirect(merchantAppAuthHref(next));
}
