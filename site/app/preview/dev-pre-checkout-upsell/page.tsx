import { notFound } from 'next/navigation';

import { DevPreCheckoutUpsellClient } from './client';

export default function DevPreCheckoutUpsellPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevPreCheckoutUpsellClient />;
}
