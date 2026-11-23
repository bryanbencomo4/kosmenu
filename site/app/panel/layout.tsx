import type { ReactNode } from 'react';

export const metadata = {
  title: 'Conversaciones | El Menú XFA',
  robots: { index: false, follow: false },
};

/**
 * Shell for /panel/* — conversation detail mounts a full-screen chat that
 * reuses the consumer WhatsApp theme; keep this chrome minimal so it does not
 * fight that UI on mobile.
 */
export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[var(--chat-bg,#0B141A)] text-[var(--chat-text,#E9EDEF)]">
      {children}
    </div>
  );
}
