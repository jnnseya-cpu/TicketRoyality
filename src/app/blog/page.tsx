import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, BookOpen, LineChart, Mic, MapPin } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent } from '@/frontend/components/ui/card';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'City guides, organiser interviews and data from the platform. Written and edited by people.',
};

/**
 * Article inventory is intentionally empty until real, human-reviewed pieces exist.
 * Nothing is auto-published here — see docs/04 M25. Rendering an honest empty state
 * beats seeding the index with filler that would drag the whole domain down.
 */
const ARTICLES: Array<{
  slug: string;
  title: string;
  kind: string;
  excerpt: string;
  date: string;
}> = [];

const STRANDS = [
  {
    icon: MapPin,
    title: 'City guides',
    body: 'What is actually on, where, and what it costs — refreshed as the listings change rather than written once and left.',
  },
  {
    icon: Mic,
    title: 'Organiser interviews',
    body: 'How people who fill rooms actually do it. Pricing, timing, marketing, and the mistakes they would not repeat.',
  },
  {
    icon: LineChart,
    title: 'Data',
    body: 'What the market paid, sold and attended, drawn from our own transactions with the methodology published alongside.',
  },
];

export default function BlogPage() {
  return (
    <div className="container py-12">
      <div className="mx-auto max-w-3xl text-center">
        <Badge variant="gold" className="mb-4">
          Blog
        </Badge>
        <h1 className="font-headline text-3xl font-bold sm:text-5xl">
          Written by people, edited by people
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Three strands, published when there is something worth saying. We do not
          publish filler to fill a calendar.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {STRANDS.map((strand) => (
          <Card key={strand.title}>
            <CardContent className="space-y-3 pt-6">
              <strand.icon className="h-7 w-7 text-primary" />
              <h2 className="font-headline text-lg font-semibold">{strand.title}</h2>
              <p className="text-sm text-muted-foreground">{strand.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {ARTICLES.length > 0 ? (
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {ARTICLES.map((article) => (
            <Card key={article.slug}>
              <CardContent className="space-y-2 pt-6">
                <Badge variant="secondary">{article.kind}</Badge>
                <h2 className="font-headline text-lg font-semibold">{article.title}</h2>
                <p className="text-sm text-muted-foreground">{article.excerpt}</p>
                <Button asChild variant="link" className="px-0">
                  <Link href={`/blog/${article.slug}`}>Read more</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
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
      )}
    </div>
  );
}
