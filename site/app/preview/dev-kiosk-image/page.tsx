import { notFound } from 'next/navigation';

import { DevKioskImageClient } from './client';

export default function DevKioskImagePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevKioskImageClient />;
}
