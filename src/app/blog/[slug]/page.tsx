import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { ArticleViews } from '@/frontend/components/common/ArticleViews';
import { ArticleLinks } from '@/frontend/components/seo/ArticleLinks';
import { RichText } from '@/frontend/components/seo/RichText';
import { ProductLinks, RelatedArticles } from '@/frontend/components/seo/ArticleFooterLinks';
import {
  clusterMeta,
  getArticle,
  isShipped,
  publishedArticles,
  publishedSlugs,
  relatedArticles,
  type ArticleBlock,
} from '@/shared/content/articles';
import { linkify, newLinkState, type TextToken } from '@/shared/content/links';
import { resolveSlot } from '@/shared/content/resolve';
import { getEvents } from '@/shared/data/repositories';
import { siteUrl } from '@/shared/site';

export const revalidate = 3600;

export function generateStaticParams() {
  return publishedArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article || !isShipped(article)) return { title: 'Not found' };

  return {
    title: article.title,
    description: article.excerpt,
    keywords: article.tags,
    alternates: { canonical: `${siteUrl()}/blog/${article.slug}` },
    openGraph: {
      title: article.title,
      description: article.excerpt,
      type: 'article',
      publishedTime: article.published,
      modifiedTime: article.updated,
      tags: article.tags,
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

/**
 * A block with its prose already linkified.
 *
 * Linking is resolved here, in one pass, rather than inside the render loop: `linkify`
 * carries state across the whole article — one link per destination, ten in total —
 * and threading mutable state through JSX would make the output depend on render
 * order.
 */
type RenderedBlock = ArticleBlock & { tokens?: TextToken[]; itemTokens?: TextToken[][] };

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  // A draft 404s rather than rendering. `generateStaticParams` already omits them, but
  // this route is also reachable directly, and a half-true page is worse than none.
  if (!article || !isShipped(article)) notFound();

  const cluster = clusterMeta(article.cluster);
  const state = newLinkState(`/blog/${article.slug}`, publishedSlugs());

  // Headings are deliberately excluded. A link inside a heading competes with the
  // heading's job of describing the section, and it is a weak SEO signal besides.
  const blocks: RenderedBlock[] = article.blocks.map((block) => {
    if (block.type === 'paragraph' && block.text) {
      return { ...block, tokens: linkify(block.text, state) };
    }
    if (block.type === 'list' && block.items) {
      return { ...block, itemTokens: block.items.map((item) => linkify(item, state)) };
    }
    return block;
  });

  // The visible FAQ is linkified after the body, so body links win the budget. The
  // structured-data copy stays plain text — schema.org answers must be prose, and
  // markup inside one is grounds for the rich result being dropped.
  const answers = (article.answers ?? []).map((qa) => ({
    ...qa,
    tokens: linkify(qa.answer, state),
  }));

  // Link slots resolve against live inventory, so the prose stays fixed while the
  // links stay current. Failure degrades to an article with no link blocks.
  const events = await getEvents().catch(() => []);
  const resolved = article.linkSlots
    .map((slot) => ({ slot, events: resolveSlot(slot, events) }))
    .filter((r) => r.events.length > 0);

  const related = relatedArticles(article);
  const base = siteUrl();

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Article',
      headline: article.title,
      description: article.excerpt,
      datePublished: article.published,
      dateModified: article.updated,
      keywords: article.tags.join(', '),
      author: { '@type': 'Organization', name: article.author },
      publisher: { '@type': 'Organization', name: 'TicketRoyality' },
      mainEntityOfPage: `${base}/blog/${article.slug}`,
    },
    {
      // Breadcrumbs render as a path in search results instead of a bare URL, and they
      // tell a crawler the cluster hub is this page's parent.
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Blog', item: `${base}/blog` },
        {
          '@type': 'ListItem',
          position: 2,
          name: cluster.title,
          item: `${base}/blog/topics/${cluster.key}`,
        },
        { '@type': 'ListItem', position: 3, name: article.title },
      ],
    },
  ];

  if (article.answers?.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: article.answers.map((qa) => ({
        '@type': 'Question',
        name: qa.question,
        acceptedAnswer: { '@type': 'Answer', text: qa.answer },
      })),
    });
  }

  return (
    <article className="container max-w-3xl py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(
            /</g,
            '\\u003c'
          ),
        }}
      />

      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2">
        <Link href="/blog">
          <ArrowLeft className="mr-1 h-4 w-4" /> All articles
        </Link>
      </Button>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{article.kind.replace('_', ' ')}</Badge>
        <Link href={`/blog/topics/${cluster.key}`}>
          <Badge variant="gold" className="hover:opacity-80">
            {cluster.title}
          </Badge>
        </Link>
      </div>

      <h1 className="font-headline text-3xl font-bold leading-tight sm:text-4xl">
        {article.title}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <time dateTime={article.published}>{formatDate(article.published)}</time>
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> {article.readMinutes} min read
        </span>
        <span>{article.author}</span>
        {/* Client-side: the page is prerendered, the count is live. */}
        <ArticleViews slug={article.slug} />
      </div>

      <div className="mt-8 space-y-5">
        {blocks.map((block, index) => {
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
                {block.itemTokens?.map((tokens, itemIndex) => (
                  <li key={itemIndex}>
                    <RichText tokens={tokens} />
                  </li>
                ))}
              </ul>
            );
          }
          return (
            <p key={index} className="leading-relaxed text-muted-foreground">
              <RichText tokens={block.tokens ?? []} />
            </p>
          );
        })}
      </div>

      {answers.length > 0 ? (
        <section className="mt-12">
          <h2 className="font-headline text-xl font-semibold">Common questions</h2>
          <dl className="mt-4 space-y-5">
            {answers.map((qa) => (
              <div key={qa.question}>
                <dt className="font-medium">{qa.question}</dt>
                <dd className="mt-1 text-muted-foreground">
                  <RichText tokens={qa.tokens} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {resolved.length > 0 && (
        <div className="mt-12 space-y-8">
          {resolved.map(({ slot, events: slotEvents }) => (
            <ArticleLinks key={slot.heading} slot={slot} events={slotEvents} />
          ))}
        </div>
      )}

      {article.productLinks?.length ? <ProductLinks keys={article.productLinks} /> : null}

      {related.length > 0 && <RelatedArticles articles={related} />}

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
