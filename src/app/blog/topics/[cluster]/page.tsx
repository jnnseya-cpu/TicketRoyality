import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import {
  CLUSTERS,
  articlesInCluster,
  clusterMeta,
  type Cluster,
} from '@/shared/content/articles';
import { siteUrl } from '@/shared/site';

export const revalidate = 3600;

/**
 * Topic hub (docs/04 M25).
 *
 * The hub in hub-and-spoke. Every article links up to its hub and the hub links back
 * down to all of them, which concentrates internal authority on one page per topic
 * rather than spreading it evenly across thirty leaves — and gives a crawler a single
 * page from which every article in a topic is one click away.
 */
export function generateStaticParams() {
  return CLUSTERS.map((cluster) => ({ cluster: cluster.key }));
}

function isCluster(value: string): value is Cluster {
  return CLUSTERS.some((c) => c.key === value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cluster: string }>;
}): Promise<Metadata> {
  const { cluster } = await params;
  if (!isCluster(cluster)) return { title: 'Not found' };
  const meta = clusterMeta(cluster);

  return {
    title: meta.title,
    description: meta.intent,
    alternates: { canonical: `${siteUrl()}/blog/topics/${meta.key}` },
  };
}

const AUDIENCE_LABEL: Record<string, string> = {
  organiser: 'For organisers',
  customer: 'For ticket buyers',
  both: 'For everyone',
};

export default async function TopicPage({ params }: { params: Promise<{ cluster: string }> }) {
  const { cluster } = await params;
  if (!isCluster(cluster)) notFound();

  const meta = clusterMeta(cluster);
  const articles = articlesInCluster(cluster);
  const base = siteUrl();

  return (
    <div className="container max-w-4xl py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'CollectionPage',
                name: meta.title,
                description: meta.intent,
                url: `${base}/blog/topics/${meta.key}`,
              },
              {
                '@type': 'ItemList',
                itemListElement: articles.map((article, index) => ({
                  '@type': 'ListItem',
                  position: index + 1,
                  name: article.title,
                  url: `${base}/blog/${article.slug}`,
                })),
              },
              {
                '@type': 'BreadcrumbList',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: 'Blog', item: `${base}/blog` },
                  { '@type': 'ListItem', position: 2, name: meta.title },
                ],
              },
            ],
          }).replace(/</g, '\\u003c'),
        }}
      />

      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2">
        <Link href="/blog">
          <ArrowLeft className="mr-1 h-4 w-4" /> All topics
        </Link>
      </Button>

      <Badge variant="gold" className="mb-4">
        {AUDIENCE_LABEL[meta.audience]}
      </Badge>

      <h1 className="font-headline text-3xl font-bold sm:text-4xl">{meta.title}</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{meta.intent}</p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {articles.map((article) => (
          <Card key={article.slug} className="transition-colors hover:border-primary/50">
            <CardContent className="pt-6">
              <Link href={`/blog/${article.slug}`} className="group block">
                <h2 className="font-headline text-lg font-semibold group-hover:text-primary">
                  {article.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{article.excerpt}</p>
                <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> {article.readMinutes} min read
                </p>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <nav className="mt-14 border-t border-border pt-8">
        <h2 className="font-headline text-lg font-semibold">Other topics</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {CLUSTERS.filter((c) => c.key !== cluster).map((other) => (
            <li key={other.key}>
              <Link href={`/blog/topics/${other.key}`}>
                <Badge variant="secondary" className="hover:opacity-80">
                  {other.title}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
