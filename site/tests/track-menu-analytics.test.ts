import { describe, expect, it } from 'vitest';

import { isOwnerPreviewPath } from '../app/v/[id]/_lib/track-menu-analytics';

describe('public menu analytics dedupe', () => {
  it('skips funnel events from the in-panel preview path', () => {
    expect(isOwnerPreviewPath('/preview/omg-burgers')).toBe(true);
    expect(isOwnerPreviewPath('/preview/demo')).toBe(true);
  });

  it('records public menu routes including QR', () => {
    expect(isOwnerPreviewPath('/v/omg-burgers')).toBe(false);
    expect(isOwnerPreviewPath('/v/omg-burgers?src=qr')).toBe(false);
  });
});
