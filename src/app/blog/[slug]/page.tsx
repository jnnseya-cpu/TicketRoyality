import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { ArticleLinks } from '@/frontend/components/seo/ArticleLinks';
import { ARTICLES, getArticle } from '@/shared/content/articles';
import { resolveSlot } from '@/shared/content/resolve';
import { getEvents } from '@/shared/data/repositories';
import { siteUrl } from '@/shared/site';

export const revalidate = 3600;

export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return { title: 'Not found' };

  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical: `${siteUrl()}/blog/${article.slug}` },
    openGraph: {
      title: article.title,
      description: article.excerpt,
      type: 'article',
      publishedTime: article.published,
      modifiedTime: article.updated,
    },
  };
}

/** UTC-fixed so server and client render identically. */
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  // Link slots resolve against live inventory, so the prose stays fixed while the
  // links stay current. Failure degrades to an article with no link blocks.
  const events = await getEvents().catch(() => []);
  const resolved = article.linkSlots
    .map((slot) => ({ slot, events: resolveSlot(slot, events) }))
    .filter((r) => r.events.length > 0);

  return (
    <article className="container max-w-3xl py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: article.title,
            description: article.excerpt,
            datePublished: article.published,
            dateModified: article.updated,
            author: { '@type': 'Organization', name: article.author },
            publisher: { '@type': 'Organization', name: 'TicketRoyality' },
            mainEntityOfPage: `${siteUrl()}/blog/${article.slug}`,
          }).replace(/</g, '\\u003c'),
        }}
      />

      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2">
        <Link href="/blog">
          <ArrowLeft className="mr-1 h-4 w-4" /> All articles
        </Link>
      </Button>

      <Badge variant="secondary" className="mb-3">
        {article.kind.replace('_', ' ')}
      </Badge>

      <h1 className="font-headline text-3xl font-bold leading-tight sm:text-4xl">
        {article.title}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <time dateTime={article.published}>{formatDate(article.published)}</time>
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> {article.readMinutes} min read
        </span>
        <span>{article.author}</span>
      </div>

      <div className="mt-8 space-y-5">
        {article.blocks.map((block, index) => {
          if (block.type === 'heading') {
            return (
              <h2 key={index} className="pt-4 font-headline text-xl font-semibold">
                {block.text}
              </h2>
            );
          }
          if (block.type === 'list') {
            return (
              <ul key={index} className="ml-5 list-disc space-y-2 text-muted-foreground">
                {block.items?.map((item) => <li key={item}>{item}</li>)}
              </ul>
            );
          }
          return (
            <p key={index} className="leading-relaxed text-muted-foreground">
              {block.text}
            </p>
          );
        })}
      </div>

      {resolved.length > 0 && (
        <div className="mt-12 space-y-8">
          {resolved.map(({ slot, events: slotEvents }) => (
            <ArticleLinks key={slot.heading} slot={slot} events={slotEvents} />
          ))}
        </div>
      )}

      <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
        Written and edited by people. Nothing on this blog is generated and published
        automatically — see our{' '}
        <Link href="/policies" className="text-primary hover:underline">
          editorial approach
        </Link>
        .
      </p>
    </article>
  );
}
