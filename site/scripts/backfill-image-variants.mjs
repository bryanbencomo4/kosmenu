/**
 * Page through POST /api/images/variants/backfill until no more Storage images.
 *
 * Usage:
 *   IMAGE_VARIANTS_SECRET=... SITE_URL=https://elmenuxfa.com node scripts/backfill-image-variants.mjs
 */

const siteUrl = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://elmenuxfa.com')
  .trim()
  .replace(/\/$/, '');
const secret = (process.env.IMAGE_VARIANTS_SECRET || process.env.CRON_SECRET || '').trim();

if (!secret) {
  console.error('Missing IMAGE_VARIANTS_SECRET or CRON_SECRET');
  process.exit(1);
}

const pageSize = Number(process.env.BACKFILL_PAGE_SIZE || 20);
let offset = Number(process.env.BACKFILL_OFFSET || 0);
let pages = 0;
let totalGenerated = 0;

while (pages < 500) {
  const response = await fetch(`${siteUrl}/api/images/variants/backfill`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-image-variants-secret': secret,
    },
    body: JSON.stringify({ limit: pageSize, offset }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Backfill page failed', response.status, payload);
    process.exit(1);
  }
  const count = Number(payload?.data?.count ?? 0);
  const generated = Number(payload?.data?.generatedTotal ?? 0);
  totalGenerated += generated;
  pages += 1;
  console.log(`offset=${offset} count=${count} generated=${generated}`);
  if (count < pageSize) break;
  offset += pageSize;
}

console.log(`Done. pages=${pages} generatedFiles≈${totalGenerated}`);
