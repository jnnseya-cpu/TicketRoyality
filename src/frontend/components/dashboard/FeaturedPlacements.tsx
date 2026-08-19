'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, Star, StarOff } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { useToast } from '@/frontend/hooks/use-toast';
import { getPlacementQueue, setEventFeatured } from '@/shared/data/repositories';
import { describeError } from '@/shared/errors';
import type { Event } from '@/shared/types';

/**
 * The homepage placement queue — requests on one side, live placements on the other.
 *
 * This is the approval step the organiser checkbox always claimed existed. Before it,
 * "Request featured homepage placement (billed on approval)" wrote `featured: true`
 * directly, so the review this screen performs was being skipped by the very form that
 * promised it. Granting and revoking write through `setEventFeatured`, which the
 * security rules restrict to superusers — an organiser posting the same update by hand
 * is refused by the database, not by the absence of a button.
 *
 * Billing stays a human step: the superuser invoices the organiser before granting.
 * Wiring placement money through Stripe automatically is a decision about pricing and
 * refunds that belongs to the business, not to this component.
 */
export function FeaturedPlacements() {
  const { toast } = useToast();
  const [queue, setQueue] = React.useState<{ requested: Event[]; live: Event[] } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    getPlacementQueue()
      .then(setQueue)
      .catch(() => setQueue({ requested: [], live: [] }));
  }, []);

  React.useEffect(load, [load]);

  const act = async (event: Event, featured: boolean) => {
    setBusy(event.id);
    try {
      await setEventFeatured(event.id, featured);
      toast({
        title: featured ? 'Placement granted' : 'Placement removed',
        description: event.title,
      });
      load();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not update', description: describeError(error) });
    } finally {
      setBusy(null);
    }
  };

  if (!queue) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const row = (event: Event, featured: boolean) => (
    <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <Link href={`/events/${event.id}`} className="truncate font-medium hover:text-primary">
          {event.title}
        </Link>
        <p className="text-xs text-muted-foreground">
          {event.status} · {event.date ? new Date(event.date).toLocaleDateString('en-GB') : '—'}
        </p>
      </div>
      <Button
        variant={featured ? 'outline' : 'royal'}
        size="sm"
        disabled={busy === event.id}
        onClick={() => act(event, !featured)}
      >
        {busy === event.id ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : featured ? (
          <>
            <StarOff className="h-4 w-4" /> Remove
          </>
        ) : (
          <>
            <Star className="h-4 w-4" /> Grant
          </>
        )}
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Featured placements</CardTitle>
        <CardDescription>
          Paid placements activate themselves the moment the card payment lands and lapse
          on their own after their term. This card is the override: grant a free placement
          (it never expires until you remove it), or pull anything off the homepage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Awaiting a decision ({queue.requested.length})
          </p>
          {queue.requested.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests.</p>
          ) : (
            queue.requested.map((event) => row(event, false))
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Live on the homepage ({queue.live.length})
          </p>
          {queue.live.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is featured.</p>
          ) : (
            queue.live.map((event) => row(event, true))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
