import type { MetadataRoute } from 'next';

import { siteUrl } from '@/shared/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Authenticated surfaces and transactional dead-ends.
        disallow: [
          '/api/',
          '/webhooks/',
          '/dashboard/',
          '/account',
          '/cart',
          '/checkout/',
          '/login',
          '/login/admin',
          '/register',
          '/forgot-password',
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
