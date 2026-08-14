import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, BookOpen, Clock } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { articlesInCluster, publishedArticles, publishedClusters } from '@/shared/content/articles';
import { siteUrl } from '@/shared/site';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'How the platform works, feature by feature — plus city guides, organiser guides and data. Written and edited by people.',
  alternates: { canonical: `${siteUrl()}/blog` },
};

/**
 * The index is organised by topic rather than by date (docs/04 M25).
 *
 * A reverse-chronological list is the right shape for a news site and the wrong shape
 * for a reference set. Someone landing on the pricing article wants the other money
 * articles, not whatever happened to be published the same week.
 */
const ARTICLES = publishedArticles();
const LATEST = ARTICLES.slice(0, 3);

const AUDIENCE_LABEL: Record<string, string> = {
  organiser: 'For organisers',
  customer: 'For ticket buyers',
  both: 'For everyone',
};

export default function BlogPage() {
  const base = siteUrl();

  return (
    <div className="container py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Blog',
            name: 'TicketRoyality',
            url: `${base}/blog`,
            blogPost: ARTICLES.map((article) => ({
              '@type': 'BlogPosting',
              headline: article.title,
              description: article.excerpt,
              datePublished: article.published,
              dateModified: article.updated,
              url: `${base}/blog/${article.slug}`,
            })),
          }).replace(/</g, '\\u003c'),
        }}
      />

      <div className="mx-auto max-w-3xl text-center">
        <Badge variant="gold" className="mb-4">
          Blog
        </Badge>
        <h1 className="font-headline text-3xl font-bold sm:text-5xl">
          How all of this actually works
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Every feature explained properly — what it does, what it deliberately will not do,
          and why. Plus city guides and data from our own transactions. Written and edited
          by people; nothing here is generated and published automatically.
        </p>
      </div>

      {ARTICLES.length === 0 ? (
        <Card className="mx-auto mt-14 max-w-2xl border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <h2 className="font-headline text-xl font-semibold">
              The first pieces are being written
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Nothing here is generated and published automatically, so this stays empty
              until an editor has signed something off. In the meantime, the events
              themselves are the most useful thing we publish.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button asChild>
                <Link href="/events">
                  Browse events <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <a href="mailto:info@ticketroyality.com?subject=Blog%20pitch">Pitch us</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="mt-14">
            <h2 className="font-headline text-2xl font-semibold">Latest</h2>
            <div className="mt-5 grid gap-6 md:grid-cols-3">
              {LATEST.map((article) => (
                <Card key={article.slug} className="transition-colors hover:border-primary/50">
                  <CardContent className="space-y-2 pt-6">
                    <Badge variant="secondary">{article.kind.replace('_', ' ')}</Badge>
                    <h3 className="font-headline text-lg font-semibold">{article.title}</h3>
                    <p className="text-sm text-muted-foreground">{article.excerpt}</p>
                    <Button asChild variant="link" className="px-0">
                      <Link href={`/blog/${article.slug}`}>Read more</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {publishedClusters().map((cluster) => {
            const articles = articlesInCluster(cluster.key);
            if (articles.length === 0) return null;

            return (
              <section key={cluster.key} className="mt-14">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <h2 className="font-headline text-2xl font-semibold">
                      <Link href={`/blog/topics/${cluster.key}`} className="hover:text-primary">
                        {cluster.title}
                      </Link>
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      {cluster.intent}
                    </p>
                  </div>
                  <Badge variant="secondary">{AUDIENCE_LABEL[cluster.audience]}</Badge>
                </div>

                <ul className="mt-5 grid gap-x-8 gap-y-1 sm:grid-cols-2">
                  {articles.map((article) => (
                    <li key={article.slug}>
                      <Link
                        href={`/blog/${article.slug}`}
                        className="group flex items-baseline justify-between gap-4 border-b border-border py-3"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium group-hover:text-primary">
                            {article.title}
                          </span>
                          <span className="mt-0.5 block text-sm text-muted-foreground">
                            {article.excerpt}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> {article.readMinutes}m
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
