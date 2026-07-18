import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  // Tracking URLs include a secret token — never send Referer to third parties.
  referrer: 'no-referrer',
  robots: {
    index: false,
    follow: false,
  },
};

export default function OrderTrackingLayout({ children }: { children: ReactNode }) {
  return children;
}
