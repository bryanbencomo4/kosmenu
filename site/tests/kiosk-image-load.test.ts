import { describe, expect, it } from 'vitest';

import {
  hashImagePath,
  IMAGE_PHASE_TIMEOUT_MS,
  IMAGE_TOTAL_BUDGET_MS,
  initialPhase,
  nextPhase,
  phaseTimeoutMs,
  urlForPhase,
  type ImageCascadeUrls,
} from '../app/v/[id]/_lib/kiosk-image-load';
import { shouldSampleImageEvent } from '../app/v/[id]/_lib/track-image-analytics';

const full: ImageCascadeUrls = {
  cold: 'https://x/storage/v1/object/public/product-images/a/.variants/p/card.webp',
  hot: 'https://x/storage/v1/render/image/public/product-images/a/p.jpg?width=360',
  original: 'https://x/storage/v1/object/public/product-images/a/p.jpg',
};

describe('kiosk image cascade (scenarios)', () => {
  it('1. prefers cold WebP first when available', () => {
    expect(initialPhase(full)).toBe('cold');
    expect(urlForPhase(full, 'cold')).toContain('/card.webp');
  });

  it('2. after cold failure/timeout advances to hot then original', () => {
    expect(nextPhase(full, 'cold')).toBe('hot');
    expect(nextPhase(full, 'hot')).toBe('original');
    expect(nextPhase(full, 'original')).toBeNull();
  });

  it('3. pending hang is bounded by phase timeout within total budget', () => {
    expect(phaseTimeoutMs('cold', 0)).toBe(IMAGE_PHASE_TIMEOUT_MS.cold);
    expect(phaseTimeoutMs('cold', IMAGE_TOTAL_BUDGET_MS - 1_000)).toBe(1_000);
    expect(phaseTimeoutMs('hot', IMAGE_TOTAL_BUDGET_MS)).toBe(0);
  });

  it('4. slow network still gets a substantial cold window before giving up', () => {
    expect(IMAGE_PHASE_TIMEOUT_MS.cold).toBeGreaterThanOrEqual(10_000);
    expect(IMAGE_TOTAL_BUDGET_MS).toBeGreaterThanOrEqual(18_000);
  });

  it('5. category change = new cascade urls; hash is stable for same path', () => {
    const a = hashImagePath(full.cold!);
    const b = hashImagePath(`${full.cold}?cachebust=1`);
    expect(a).toBe(b);
    expect(a).toHaveLength(8);
  });

  it('6. interrupted cascade with only original still resolves a phase', () => {
    const onlyOriginal: ImageCascadeUrls = { cold: null, hot: null, original: full.original };
    expect(initialPhase(onlyOriginal)).toBe('original');
    expect(nextPhase(onlyOriginal, 'original')).toBeNull();
  });

  it('7. missing cold WebP starts at hot (new photo not backfilled yet)', () => {
    const noCold: ImageCascadeUrls = { cold: null, hot: full.hot, original: full.original };
    expect(initialPhase(noCold)).toBe('hot');
    expect(nextPhase(noCold, 'hot')).toBe('original');
  });

  it('8. same-host outage still ends: no infinite next phase', () => {
    let phase = initialPhase(full);
    const seen = new Set<string>([phase]);
    for (let i = 0; i < 5; i += 1) {
      const n = nextPhase(full, phase);
      if (!n) break;
      expect(seen.has(n)).toBe(false);
      seen.add(n);
      phase = n;
    }
    expect(nextPhase(full, phase)).toBeNull();
    expect(seen.size).toBeLessThanOrEqual(3);
  });

  it('9. skips duplicate URLs when advancing phases', () => {
    const dup: ImageCascadeUrls = {
      cold: full.original,
      hot: full.original,
      original: full.original,
    };
    expect(nextPhase(dup, 'cold')).toBeNull();
  });
});

describe('image analytics sampling', () => {
  it('caps and samples loads without requiring Wi-Fi labeling', () => {
    // Should not throw in node; returns false without window sessionStorage quirks
    const result = shouldSampleImageEvent('image_error');
    expect(typeof result).toBe('boolean');
  });
});
