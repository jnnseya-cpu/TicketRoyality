'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Shuffle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard';
import { getEvents } from '@/server/database';
import type { Event } from '@/shared/types';

export function FeaturedEvents() {
  const [events, setEvents] = React.useState<Event[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    getEvents({ featuredOnly: true, max: 9 })
      .then((result) => {
        if (!cancelled) setEvents(result);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="container py-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Badge variant="gold" className="mb-2">
            Featured placements
          </Badge>
          <h2 className="font-headline text-2xl font-bold sm:text-3xl">Featured Events</h2>
          <p className="text-sm text-muted-foreground">
            Premium homepage placements purchased by organisers from their dashboard.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/events">
            View all events <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 9 }).map((_, i) => <EventCardSkeleton key={`featured-skel-${i}`} />)
          : events.map((event) => <EventCard key={event.id} event={event} />)}
      </div>
    </section>
  );
}

/** Three random upcoming events, refreshed on every visit. */
export function UpcomingSample() {
  const [events, setEvents] = React.useState<Event[]>([]);
  const [loading, setLoading] = React.useState(true);

  const pick = React.useCallback(async () => {
    setLoading(true);
    const all = await getEvents();
    const upcoming = all.filter((e) => new Date(e.date).getTime() > Date.now());
    // Shuffle client-side only — Math.random() during render would break hydration.
    const shuffled = [...upcoming].sort(() => Math.random() - 0.5);
    setEvents(shuffled.slice(0, 3));
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void pick();
  }, [pick]);

  return (
    <section className="border-y border-border/60 bg-card/20 py-16">
      <div className="container">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-headline text-2xl font-bold sm:text-3xl">All Upcoming Events</h2>
            <p className="text-sm text-muted-foreground">
              A rotating sample of what is on sale right now.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => void pick()}>
              <Shuffle className="h-4 w-4" /> Shuffle
            </Button>
            <Button variant="royal" asChild>
              <Link href="/events">
                View more <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <EventCardSkeleton key={`upcoming-skel-${i}`} />)
            : events.map((event) => <EventCard key={event.id} event={event} />)}
        </div>
      </div>
    </section>
  );
}
