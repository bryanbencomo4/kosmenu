import { describe, expect, it } from 'vitest';

import { DEFAULT_IMAGE_FILL, getCachedImageFillColor } from '../app/v/[id]/_components/kiosk/extract-image-fill-color';

describe('extract-image-fill-color helpers', () => {
  it('exports a sensible default fill', () => {
    expect(DEFAULT_IMAGE_FILL).toMatch(/^rgb\(/);
  });

  it('returns undefined for uncached sources', () => {
    expect(getCachedImageFillColor('https://example.com/missing.jpg')).toBeUndefined();
  });
});
