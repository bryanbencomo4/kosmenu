import type { MetadataRoute } from 'next';

import { privacyPagePath, publicSiteUrl, termsPagePath } from './_lib/public-site-config';

export default function sitemap(): MetadataRoute.Sitemap {
  if (process.env.VERCEL_ENV === 'preview') {
    return [];
  }

  const lastModified = new Date();

  return [
    {
      url: publicSiteUrl,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${publicSiteUrl}${termsPagePath}`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${publicSiteUrl}${privacyPagePath}`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];
}
