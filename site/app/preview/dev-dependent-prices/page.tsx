import { notFound } from 'next/navigation';

import { DevDependentPricesClient } from './client';

export default function DevDependentPricesPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevDependentPricesClient />;
}
