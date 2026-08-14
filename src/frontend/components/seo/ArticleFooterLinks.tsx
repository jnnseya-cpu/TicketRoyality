import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';

import { Card, CardContent } from '@/frontend/components/ui/card';
import type { Article } from '@/shared/content/articles';
import { clusterMeta } from '@/shared/content/articles';
import { DESTINATIONS, type DestinationKey } from '@/shared/content/links';

/**
 * The two blocks that close every article: where to go next inside the site, and what
 * to read next.
 *
 * Both exist for the same reason. A page with no onward path is a page a reader leaves
 * from and a crawler stops at, which wastes whatever it cost to get either of them
 * there.
 */

export function ProductLinks({ keys }: { keys: DestinationKey[] }) {
  return (
    <div className="mt-12 grid gap-4 sm:grid-cols-2">
      {keys.map((key) => {
        const destination = DESTINATIONS[key];
        return (
          <Card key={key} className="border-primary/25 transition-colors hover:border-primary/60">
            <CardContent className="pt-6">
              <Link href={destination.href} className="group block">
                <span className="flex items-center gap-1.5 font-headline font-semibold group-hover:text-primary">
                  {destination.label}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1.5 block text-sm text-muted-foreground">
                  {destination.blurb}
                </span>
              </Link>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function RelatedArticles({ articles }: { articles: Article[] }) {
  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="flex items-center gap-2 font-headline text-lg font-semibold">
        <BookOpen className="h-4 w-4 text-primary" /> Keep reading
      </h2>
      <ul className="mt-4 divide-y divide-border">
        {articles.map((article) => (
          <li key={article.slug}>
            <Link href={`/blog/${article.slug}`} className="group block py-3">
              <span className="block font-medium group-hover:text-primary">{article.title}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{article.excerpt}</span>
              <span className="mt-1 block text-xs uppercase tracking-wide text-primary/70">
                {clusterMeta(article.cluster).title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
