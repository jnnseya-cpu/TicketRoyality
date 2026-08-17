import type { MetadataRoute } from 'next';

import { siteUrl } from '@/shared/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        /*
         * Only the machine endpoints, deliberately.
         *
         * This list used to include `/login`, `/register`, `/cart`, `/account`,
         * `/dashboard/` and `/checkout/`, and that caused Search Console's "Indexed,
         * though blocked by robots.txt". robots.txt stops a crawl; it does not stop an
         * index. Those pages are linked from the header on every page, so Google indexed
         * the URLs from the links alone and was then forbidden from fetching them — which
         * is precisely what stopped it discovering they should not be listed.
         *
         * They now carry `X-Robots-Tag: noindex` (see next.config.ts) and are crawlable,
         * which is the only combination that removes a page from the index.
         *
         * `/api/` and `/webhooks/` stay: nothing links to them, so there is no path by
         * which they get indexed, and they already send `noindex` besides. Keeping them
         * out of the crawl saves crawl budget on endpoints that return JSON.
         */
        disallow: ['/api/', '/webhooks/'],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
