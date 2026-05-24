'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type CurrencyTickerProps = {
  entries: string[];
  accentColor?: string;
};

const SCROLL_SPEED_PX_PER_SEC = 52;

export function CurrencyTicker({ entries, accentColor = 'var(--primary-color)' }: CurrencyTickerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLDivElement>(null);
  const [durationSec, setDurationSec] = useState(18);

  const segmentEntries = useMemo(() => {
    const cleaned = entries.map((entry) => entry.trim()).filter(Boolean);
    if (cleaned.length === 0) return [];

    let segment = [...cleaned];
    while (segment.length < 12) {
      segment = [...segment, ...cleaned];
    }
    return segment;
  }, [entries]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const segment = segmentRef.current;
    if (!viewport || !segment) return;

    const update = () => {
      const segmentWidth = segment.getBoundingClientRect().width;
      const viewportWidth = viewport.getBoundingClientRect().width;
      if (segmentWidth <= 0) return;

      const targetWidth = Math.max(segmentWidth, viewportWidth * 1.15);
      setDurationSec(Math.max(10, targetWidth / SCROLL_SPEED_PX_PER_SEC));
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(segment);

    return () => observer.disconnect();
  }, [segmentEntries]);

  const renderSegment = (prefix: string) =>
    segmentEntries.map((entry, index) => (
      <div key={`${prefix}-${index}`} className="flex shrink-0 items-center gap-3 pr-3">
        <span className="text-xs font-bold tracking-[0.04em] text-white/95">{entry}</span>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} />
      </div>
    ));

  return (
    <div ref={viewportRef} className="relative min-w-0 flex-1 overflow-hidden">
      <div
        className="flex w-max items-center will-change-transform"
        style={{ animation: `kosmenuTickerScroll ${durationSec}s linear infinite` }}
      >
        <div ref={segmentRef} className="flex shrink-0 items-center">
          {renderSegment('a')}
        </div>
        <div className="flex shrink-0 items-center" aria-hidden="true">
          {renderSegment('b')}
        </div>
      </div>
    </div>
  );
}
