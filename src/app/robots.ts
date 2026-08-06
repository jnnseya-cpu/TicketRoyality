import type { MetadataRoute } from 'next';

import { siteUrl } from '@/shared/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Authenticated surfaces, transactional dead-ends and the dev shortcut.
        disallow: [
          '/api/',
          '/webhooks/',
          '/dashboard/',
          '/account',
          '/cart',
          '/checkout/',
          '/dev-access',
          '/login',
          '/register',
          '/forgot-password',
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
