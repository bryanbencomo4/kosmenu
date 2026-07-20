import type { MetadataRoute } from 'next';

import { publicSiteUrl } from './_lib/public-site-config';

const isPreviewDeployment = process.env.VERCEL_ENV === 'preview';

export default function robots(): MetadataRoute.Robots {
  if (isPreviewDeployment) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/', '/orders/'],
    },
    sitemap: `${publicSiteUrl}/sitemap.xml`,
    host: publicSiteUrl,
  };
}
