import type { MetadataRoute } from 'next';

import { getEvents, getOrganisers } from '@/shared/data/repositories';
import { siteUrl } from '@/shared/site';
import { publishedArticles } from '@/shared/content/articles';

export const revalidate = 3600;

/**
 * Segmented by intent rather than emitted as one flat list.
 *
 * `lastModified` is real on every entry. A sitemap that stamps `now` on everything
 * teaches crawlers the field carries no information, and they stop using it to
 * prioritise — which is the entire reason to publish one.
 */
const STATIC_ROUTES: Array<{ path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '', priority: 1.0, freq: 'daily' },
  { path: '/events', priority: 0.9, freq: 'hourly' },
  { path: '/organisers', priority: 0.7, freq: 'daily' },
  { path: '/industries', priority: 0.7, freq: 'monthly' },
  { path: '/how-it-works', priority: 0.6, freq: 'monthly' },
  { path: '/get-started', priority: 0.6, freq: 'monthly' },
  { path: '/growth', priority: 0.6, freq: 'monthly' },
  { path: '/developers', priority: 0.5, freq: 'monthly' },
  { path: '/blog', priority: 0.5, freq: 'weekly' },
  { path: '/about-us', priority: 0.4, freq: 'monthly' },
  { path: '/contact', priority: 0.4, freq: 'yearly' },
  { path: '/policies', priority: 0.3, freq: 'monthly' },
  { path: '/privacy-policy', priority: 0.3, freq: 'yearly' },
  { path: '/terms-of-service', priority: 0.3, freq: 'yearly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${base}${route.path}`,
    lastModified: now,
    changeFrequency: route.freq,
    priority: route.priority,
  }));

  for (const article of publishedArticles()) {
    entries.push({
      url: `${base}/blog/${article.slug}`,
      lastModified: new Date(article.updated),
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }

  // A sitemap must never fail the build or the route. If the catalogue is unreachable
  // we publish the static routes rather than nothing.
  try {
    const [events, organisers] = await Promise.all([getEvents(), getOrganisers('approved')]);

    for (const event of events) {
      // Past events are dropped rather than listed — see docs/04 M25 on 410s.
      if (new Date(event.date).getTime() < now.getTime()) continue;
      entries.push({
        url: `${base}/events/${event.id}`,
        lastModified: new Date(event.createdAt ?? now),
        changeFrequency: 'daily',
        priority: 0.8,
      });
    }

    for (const organiser of organisers) {
      entries.push({
        url: `${base}/organisers/${organiser.uid}`,
        lastModified: new Date(organiser.createdAt ?? now),
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }
  } catch {
    // Static routes only.
  }

  return entries;
}
