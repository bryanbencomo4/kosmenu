import { describe, expect, it } from 'vitest';

import { bdvHmacHex, verifyBdvRequestHmac } from '../app/api/_lib/bdv-hmac';

describe('BDV HMAC', () => {
  const secret = 'bridge-shared-secret';
  const timestamp = '1710000000';
  const nonce = '11111111-2222-4333-8444-555555555555';
  const rawBody = '{"event":"payment_received","payment_id":"bdv-test"}';

  it('accepts the Android signing formula timestamp + LF + nonce + LF + rawBody', () => {
    const signature = bdvHmacHex(secret, timestamp, nonce, rawBody);
    const headers = new Headers({
      'X-BDV-Device': 'BDV-ANDROID-01',
      'X-BDV-Timestamp': timestamp,
      'X-BDV-Nonce': nonce,
      'X-BDV-Signature': signature,
    });

    expect(verifyBdvRequestHmac(headers, rawBody, { secret, nowSeconds: 1710000000 })).toEqual({
      ok: true,
      deviceId: 'BDV-ANDROID-01',
      timestamp,
      nonce,
    });
  });

  it('rejects a tampered body', () => {
    const signature = bdvHmacHex(secret, timestamp, nonce, rawBody);
    const headers = new Headers({
      'X-BDV-Device': 'BDV-ANDROID-01',
      'X-BDV-Timestamp': timestamp,
      'X-BDV-Nonce': nonce,
      'X-BDV-Signature': signature,
    });

    expect(
      verifyBdvRequestHmac(headers, '{"event":"payment_received","payment_id":"bdv-other"}', {
        secret,
        nowSeconds: 1710000000,
      }).ok,
    ).toBe(false);
  });

  it('rejects stale timestamps', () => {
    const signature = bdvHmacHex(secret, timestamp, nonce, rawBody);
    const headers = new Headers({
      'X-BDV-Device': 'BDV-ANDROID-01',
      'X-BDV-Timestamp': timestamp,
      'X-BDV-Nonce': nonce,
      'X-BDV-Signature': signature,
    });

    expect(verifyBdvRequestHmac(headers, rawBody, { secret, nowSeconds: 1710000000 + 301 }).ok).toBe(false);
  });
});
