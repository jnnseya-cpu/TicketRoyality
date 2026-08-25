'use client';

import * as React from 'react';
import { Loader2, Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { EventCard, EventCardSkeleton } from '@/frontend/components/events/EventCard';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { getEvents } from '@/shared/data/repositories';
import type { Event } from '@/shared/types';

/**
 * AI recommendations. Calls the Genkit flow through /api/ai; if the model is
 * unavailable (no API key, or a 503 from an overloaded model) it degrades to a
 * deterministic interest-based ranking rather than showing an error.
 */
export function PersonalizedRecommendations({
  interests = 'live music and sports events',
  max = 3,
}: {
  interests?: string;
  max?: number;
}) {
  const [events, setEvents] = React.useState<Event[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [aiPowered, setAiPowered] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setNotice(null);

    const all = await getEvents();
    const upcoming = all.filter((e) => new Date(e.date).getTime() > Date.now());

    if (upcoming.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }

    try {
      // Signed-in users get the model (capped per account); signed-out visitors send no
      // token, get a 401, and fall through to the interest-matched ranking below.
      const response = await authedFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'recommend',
          input: {
            interests,
            max,
            events: upcoming.slice(0, 40).map((e) => ({
              id: e.id,
              title: e.title,
              category: e.category,
              location: e.location,
              date: e.date,
            })),
          },
        }),
      });

      if (!response.ok) throw new Error(`AI unavailable (${response.status})`);

      const data = (await response.json()) as { eventIds?: string[] };
      const picks = (data.eventIds ?? [])
        .map((id) => upcoming.find((e) => e.id === id))
        .filter((e): e is Event => Boolean(e));

      if (picks.length > 0) {
        setEvents(picks.slice(0, max));
        setAiPowered(true);
        setLoading(false);
        return;
      }
      throw new Error('AI returned no matches');
    } catch {
      // Graceful fallback — score by keyword overlap with the stated interests.
      const terms = interests.toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 3);
      const scored = upcoming
        .map((event) => {
          const haystack = `${event.title} ${event.category} ${event.categoryGroup}`.toLowerCase();
          const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
          return { event, score };
        })
        .sort((a, b) => b.score - a.score || a.event.date.localeCompare(b.event.date));

      setEvents(scored.slice(0, max).map((s) => s.event));
      setAiPowered(false);
      setNotice(
        'The recommendation model is not reachable right now, so these are matched from your stated interests.'
      );
      setLoading(false);
    }
  }, [interests, max]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="container py-14">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Badge variant="gold" className="mb-2 gap-1">
            <Sparkles className="h-3 w-3" /> {aiPowered ? 'AI curated' : 'Curated'}
          </Badge>
          <h2 className="font-headline text-2xl font-bold sm:text-3xl">Events Just For You</h2>
          <p className="text-sm text-muted-foreground">
            Recommendations based on what you attend, browse and save.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {notice && (
        <Alert variant="warning" className="mb-6">
          <Sparkles />
          <AlertTitle>Showing interest-matched picks</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: max }).map((_, i) => <EventCardSkeleton key={`skeleton-${i}`} />)
          : events.map((event) => <EventCard key={event.id} event={event} />)}
      </div>

      {!loading && events.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No upcoming events to recommend yet. Check back soon.
        </p>
      )}
    </section>
  );
}
