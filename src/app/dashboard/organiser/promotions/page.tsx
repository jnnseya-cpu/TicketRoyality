'use client';

import * as React from 'react';
import { Crown, Loader2, Megaphone, PlayCircle } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Separator } from '@/frontend/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { RequireRole } from '@/frontend/components/dashboard/RequireRole';
import { authedFetch } from '@/frontend/lib/authed-fetch';
import { useToast } from '@/frontend/hooks/use-toast';
import { getEventsByOrganizer } from '@/shared/data/repositories';
import { formatCurrency } from '@/shared/utils';
import { PLACEMENTS, type PlacementDef } from '@/shared/placements';
import type { Event, UserProfile } from '@/shared/types';

/**
 * Placements, self-serve: pay the catalogue price and the placement goes live the
 * moment the payment lands — the webhook sets the flags the homepage and newsletter
 * render from. No enquiry, no manual invoice; the owner's direction (19 Aug 2026).
 *
 * The prices shown come from `shared/placements.ts`, the same table the checkout
 * route charges from, so the card and the charge cannot disagree. The first version
 * of this page charged a posted amount for slots that did not exist — the catalogue
 * and the real fulfilment surfaces are what make selling them honest now.
 */
const PLACEMENT_ICONS: Record<string, typeof PlayCircle> = {
  'video-ad': PlayCircle,
  featured: Crown,
  newsletter: Megaphone,
};

const ANNOUNCEMENTS: Array<{ id: string; title: string; body: string; date: string }> = [];

function Promotions({ profile }: { profile: UserProfile }) {
  const [events, setEvents] = React.useState<Event[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<string>('');
  const [paying, setPaying] = React.useState<string | null>(null);

  // Stripe sends the buyer back with ?placement=live once they have paid.
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('placement') === 'live') {
      toast({
        title: 'Placement live',
        description:
          'Payment received — your placement is active. The homepage updates within a minute; a newsletter spotlight goes out with the next weekly send.',
      });
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buyPlacement = async (placement: PlacementDef) => {
    setPaying(placement.id);
    try {
      const response = await authedFetch('/api/promotions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placementId: placement.id, eventId: selected }),
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        throw new Error(body.error ?? 'The payment could not be started.');
      }
      window.location.assign(body.url);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Payment not started',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
      setPaying(null);
    }
  };

  React.useEffect(() => {
    let cancelled = false;
    getEventsByOrganizer(profile.uid)
      .then((result) => {
        if (!cancelled) {
          setEvents(result);
          setSelected(result[0]?.id ?? '');
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.uid]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const selectedEvent = events.find((e) => e.id === selected);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">Promotions</h1>
        <p className="text-sm text-muted-foreground">
          Buy homepage placement for your events. Pay by card — the placement is live the
          moment the payment completes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" /> Announcements
          </CardTitle>
          <CardDescription>Platform news for organisers.</CardDescription>
        </CardHeader>
        <CardContent>
          {ANNOUNCEMENTS.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No announcements right now.
            </p>
          ) : (
            <ul className="space-y-3">
              {ANNOUNCEMENTS.map((item) => (
                <li key={item.id} className="rounded-md border border-border p-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Choose an event to promote</CardTitle>
          <CardDescription>
            Placement applies to a single event at a time. Only a published, upcoming
            event can be promoted — a placement links to its public page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Create an event first — there is nothing to promote yet.
            </p>
          ) : (
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Select an event" />
              </SelectTrigger>
              <SelectContent>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {selectedEvent && selectedEvent.status !== 'published' && (
            <p className="mt-2 text-xs text-amber-500">
              {selectedEvent.title} is not published yet — publish it before promoting it.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-3">
        {Object.values(PLACEMENTS).map((placement) => {
          const Icon = PLACEMENT_ICONS[placement.id] ?? Megaphone;
          const active =
            placement.id === 'video-ad'
              ? Boolean(selectedEvent?.spotlight)
              : placement.id === 'featured'
                ? Boolean(selectedEvent?.featured)
                : Boolean(selectedEvent?.newsletterSpotlight);
          return (
            <Card key={placement.id} className="flex flex-col">
              <CardHeader>
                <Icon className="mb-2 h-6 w-6 text-primary" />
                <CardTitle className="text-base">{placement.title}</CardTitle>
                <CardDescription>{placement.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-headline text-2xl font-bold text-primary">
                    {formatCurrency(placement.priceMajor)}
                  </span>
                  <Badge variant="secondary">{placement.periodLabel}</Badge>
                </div>
                {/*
                  Live the moment the webhook lands. The old enquiry step existed
                  because fulfilment did not: the strip was hardcoded demo events. The
                  strip, the grid and the newsletter block are all real surfaces now,
                  so the payment buys something that exists.
                */}
                {active ? (
                  <p className="rounded-md border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
                    Already live for this event.
                  </p>
                ) : (
                  <Button
                    variant="royal"
                    className="w-full"
                    disabled={
                      paying !== null || !selectedEvent || selectedEvent.status !== 'published'
                    }
                    onClick={() => buyPlacement(placement)}
                  >
                    {paying === placement.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : !selectedEvent ? (
                      'Choose an event above'
                    ) : selectedEvent.status !== 'published' ? (
                      'Publish the event first'
                    ) : (
                      `Pay ${formatCurrency(placement.priceMajor)} — go live`
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function PromotionsPage() {
  return <RequireRole role="organiser">{(profile) => <Promotions profile={profile} />}</RequireRole>;
}
