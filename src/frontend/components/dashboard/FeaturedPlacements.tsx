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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { useToast } from '@/frontend/hooks/use-toast';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { getEvents, getPlacementQueue, setEventFeatured } from '@/shared/data/repositories';
import { describeError } from '@/shared/errors';
import { PLACEMENTS, type PlacementId } from '@/shared/placements';
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

  /*
   * "Place any event" — the owner's direct control. Any published event can be put
   * into (or pulled from) any of the three slots, free, with no request needed. The
   * write goes through the admin API so the new flags never depend on the security
   * rules learning them.
   */
  const [allEvents, setAllEvents] = React.useState<Event[]>([]);
  const [pickedId, setPickedId] = React.useState('');
  const [placing, setPlacing] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    getPlacementQueue()
      .then(setQueue)
      .catch(() => setQueue({ requested: [], live: [] }));
    getEvents({ max: 200 })
      .then(setAllEvents)
      .catch(() => setAllEvents([]));
  }, []);

  React.useEffect(load, [load]);

  const picked = allEvents.find((e) => e.id === pickedId);

  const grant = async (placementId: PlacementId, active: boolean) => {
    if (!picked) return;
    setPlacing(placementId);
    try {
      const response = await authedFetch('/api/admin/placement-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: picked.id, placement: placementId, active }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'The placement was not changed.');
      toast({
        title: active ? 'Placed' : 'Removed',
        description: `${picked.title} — ${PLACEMENTS[placementId].title}`,
      });
      load();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not update', description: describeError(error) });
    } finally {
      setPlacing(null);
    }
  };

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
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Place any event
          </p>
          <Select value={pickedId} onValueChange={setPickedId}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Choose an event" />
            </SelectTrigger>
            <SelectContent>
              {allEvents.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {picked && (
            <div className="space-y-2 pt-1">
              {(
                [
                  ['video-ad', Boolean(picked.spotlight)],
                  ['featured', Boolean(picked.featured)],
                  ['newsletter', Boolean(picked.newsletterSpotlight)],
                ] as Array<[PlacementId, boolean]>
              ).map(([placementId, active]) => (
                <div key={placementId} className="flex items-center justify-between gap-3">
                  <span className="text-sm">
                    {PLACEMENTS[placementId].title}
                    {active && <span className="ml-2 text-xs text-primary">live</span>}
                  </span>
                  <Button
                    variant={active ? 'outline' : 'royal'}
                    size="sm"
                    disabled={placing !== null}
                    onClick={() => grant(placementId, !active)}
                  >
                    {placing === placementId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : active ? (
                      'Remove'
                    ) : (
                      'Place'
                    )}
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Placed by you means free and permanent until removed — paid placements
                expire on their own.
              </p>
            </div>
          )}
        </div>

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
