import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('comprobante media proxy tokens', () => {
  const SERVICE_ROLE = 'service-role-secret-for-media-tests';

  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL = 'https://elmenuxfa.com';
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('builds public same-origin image urls', async () => {
    const { buildPublicComprobanteMediaUrls } = await import('../../app/api/_lib/comprobante-media');
    const urls = buildPublicComprobanteMediaUrls('AbCdEf1234', 'comercio/proof.jpg');
    expect(urls.fileUrl).toBe('/api/p/AbCdEf1234/image?v=file');
    expect(urls.previewUrl).toBe('/api/p/AbCdEf1234/image?v=preview');
    expect(urls.downloadUrl).toBe('/api/p/AbCdEf1234/image?v=download');
  });

  it('omits preview for pdfs', async () => {
    const { buildPublicComprobanteMediaUrls } = await import('../../app/api/_lib/comprobante-media');
    const urls = buildPublicComprobanteMediaUrls('AbCdEf1234', 'comercio/proof.pdf');
    expect(urls.previewUrl).toBeNull();
    expect(urls.fileUrl).toContain('v=file');
  });

  it('signs and verifies merchant media tokens', async () => {
    const { signMediaToken, verifyMediaToken } = await import('../../app/api/_lib/comprobante-media');
    const exp = Date.now() + 60_000;
    const sig = signMediaToken('order-1', 'preview', exp);
    expect(verifyMediaToken('order-1', 'preview', String(exp), sig).ok).toBe(true);
    expect(verifyMediaToken('order-1', 'file', String(exp), sig).ok).toBe(false);
    expect(verifyMediaToken('order-1', 'preview', String(exp - 120_000), sig).ok).toBe(false);
  });

  it('builds merchant urls on elmenuxfa.com without supabase hosts', async () => {
    const { buildMerchantComprobanteMediaUrls } = await import('../../app/api/_lib/comprobante-media');
    const urls = buildMerchantComprobanteMediaUrls('comercio-a-1', 'comercio-a/proof.jpg');
    expect(urls.url).toContain('https://elmenuxfa.com/api/business/orders/');
    expect(urls.url).toContain('v=file');
    expect(urls.previewUrl).toContain('v=preview');
    expect(urls.downloadUrl).toContain('v=download');
    expect(JSON.stringify(urls)).not.toContain('supabase.co');
  });
});
