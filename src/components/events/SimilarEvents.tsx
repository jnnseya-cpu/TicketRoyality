'use client';

import * as React from 'react';

import { EventCard, EventCardSkeleton } from '@/components/events/EventCard';
import { getEvents } from '@/server/database';
import type { Event } from '@/shared/types';

/**
 * Shown beneath every event, and used in place of the buy box once an event has passed.
 * Uses the AI flow when available, and a category/location heuristic when it is not.
 */
export function SimilarEvents({ current, max = 3 }: { current: Event; max?: number }) {
  const [events, setEvents] = React.useState<Event[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      const all = await getEvents();
      const candidates = all.filter(
        (e) => e.id !== current.id && new Date(e.date).getTime() > Date.now()
      );

      if (candidates.length === 0) {
        if (!cancelled) {
          setEvents([]);
          setLoading(false);
        }
        return;
      }

      const summarise = (e: Event) => ({
        id: e.id,
        title: e.title,
        category: e.category,
        location: e.location,
        date: e.date,
      });

      try {
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: 'similar',
            input: {
              currentEvent: summarise(current),
              max,
              candidates: candidates.slice(0, 40).map(summarise),
            },
          }),
        });
        if (!response.ok) throw new Error('AI unavailable');

        const data = (await response.json()) as { eventIds?: string[] };
        const picks = (data.eventIds ?? [])
          .map((id) => candidates.find((e) => e.id === id))
          .filter((e): e is Event => Boolean(e));

        if (picks.length === 0) throw new Error('No AI matches');
        if (!cancelled) setEvents(picks.slice(0, max));
      } catch {
        // Heuristic fallback: same category first, then same category group, then city.
        const scored = candidates
          .map((event) => {
            let score = 0;
            if (event.category === current.category) score += 3;
            if (event.categoryGroup === current.categoryGroup) score += 2;
            if (event.location === current.location) score += 1;
            return { event, score };
          })
          .sort((a, b) => b.score - a.score || a.event.date.localeCompare(b.event.date));

        if (!cancelled) setEvents(scored.slice(0, max).map((s) => s.event));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [current, max]);

  if (!loading && events.length === 0) return null;

  return (
    <section className="pt-4">
      <h2 className="mb-4 font-headline text-xl font-semibold">Similar events</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: max }).map((_, i) => <EventCardSkeleton key={`similar-skel-${i}`} />)
          : events.map((event) => <EventCard key={event.id} event={event} />)}
      </div>
    </section>
  );
}
