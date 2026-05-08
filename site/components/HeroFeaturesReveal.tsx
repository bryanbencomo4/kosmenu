'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type HeroFeaturesRevealProps = {
  hero: ReactNode;
  features: ReactNode;
};

export function HeroFeaturesReveal({ hero, features }: HeroFeaturesRevealProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [overlapHeight, setOverlapHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateOverlapHeight = () => {
      if (window.innerWidth < 1024) {
        setOverlapHeight(null);
        return;
      }

      const nextHeight = Math.round(panelRef.current?.getBoundingClientRect().height ?? 0);

      setOverlapHeight((currentHeight) => (
        currentHeight === nextHeight ? currentHeight : nextHeight
      ));
    };

    updateOverlapHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateOverlapHeight();
    });

    if (panelRef.current) {
      resizeObserver.observe(panelRef.current);
    }

    window.addEventListener('resize', updateOverlapHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateOverlapHeight);
    };
  }, []);

  const revealStyle = overlapHeight
    ? ({ '--hero-features-overlap': `${overlapHeight}px` } as CSSProperties)
    : undefined;

  return (
    <section className="hero-features-reveal" style={revealStyle}>
      <div ref={panelRef} className="hero-features-panel">
        {features}
      </div>

      <div className="hero-features-overlay">
        {hero}
      </div>

      <div aria-hidden="true" className="hero-features-spacer" />
    </section>
  );
}