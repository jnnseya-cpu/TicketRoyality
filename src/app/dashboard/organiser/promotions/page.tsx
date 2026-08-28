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
import { track } from '@/frontend/lib/analytics';
import { useToast } from '@/frontend/hooks/use-toast';
import { usePaymentMethods } from '@/frontend/hooks/use-payment-methods';
import { VideoAdPicker } from '@/frontend/components/media/VideoAdPicker';
import { getEventsByOrganizer, updateEvent } from '@/shared/data/repositories';
import { describeError } from '@/shared/errors';
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
  const methods = usePaymentMethods();

  /*
   * Prices from the server — the dashboard-editable catalogue — so what this page
   * advertises is what the checkout charges. The static defaults render first and are
   * replaced the moment the real numbers arrive.
   */
  const [catalogue, setCatalogue] = React.useState<PlacementDef[]>(Object.values(PLACEMENTS));

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/placements')
      .then((r) => r.json())
      .then((data: { placements?: PlacementDef[] }) => {
        if (!cancelled && data.placements?.length) setCatalogue(data.placements);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Stripe sends the buyer back with ?placement=live once they have paid.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('placement') === 'live') {
      const amt = Number(params.get('amt'));
      track('purchase', {
        id: `placement_${Date.now()}`,
        value: Number.isFinite(amt) && amt > 0 ? amt : undefined,
        currency: params.get('cur') || undefined,
        category: 'placement',
      });
      toast({
        title: 'Placement live',
        description:
          'Payment received — your placement is active. The homepage updates within a minute; a newsletter spotlight goes out with the next weekly send.',
      });
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buyPlacement = async (placement: PlacementDef, rail: 'card' | 'momo') => {
    setPaying(`${placement.id}:${rail}`);
    track('buy_placement', {
      id: placement.id,
      name: placement.title,
      value: rail === 'momo' ? placement.priceUsdMajor : placement.priceMajor,
      currency: rail === 'momo' ? 'USD' : 'GBP',
      category: 'placement',
    });
    try {
      const response = await authedFetch('/api/promotions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placementId: placement.id, eventId: selected, rail }),
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

  /*
   * The promo video is stored on the event, so it can be attached the moment the
   * organiser buys the Spotlight — no separate trip to the event editor. It persists
   * immediately (the organiser owns the event; `storage.rules` and the events rule both
   * allow the write), and only ever *plays* once the placement sets `spotlight`. So a
   * video uploaded here waits, invisible, until the payment it belongs to lands.
   */
  const saveVideo = async (url: string) => {
    if (!selectedEvent) return;
    try {
      await updateEvent(selectedEvent.id, { videoAdUrl: url });
      setEvents((prev) =>
        prev.map((e) => (e.id === selectedEvent.id ? { ...e, videoAdUrl: url } : e))
      );
      toast({
        title: url ? 'Video saved' : 'Video removed',
        description: `${selectedEvent.title} — it plays once your Spotlight is live.`,
      });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not save video', description: describeError(error) });
    }
  };

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
        {catalogue.map((placement) => {
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
                {/* The Spotlight is the one placement that carries a video. Offer the
                    upload right here so buying it and attaching the clip are one step;
                    it saves to the event immediately and plays once the payment lands. */}
                {placement.id === 'video-ad' && selectedEvent && selectedEvent.status === 'published' && (
                  <div className="rounded-md border border-border p-3">
                    <p className="mb-2 text-xs font-medium">Promo video for {selectedEvent.title}</p>
                    <VideoAdPicker
                      organiserId={profile.uid}
                      value={selectedEvent.videoAdUrl}
                      onChange={saveVideo}
                    />
                  </div>
                )}
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
                  <>
                    <Button
                      variant="royal"
                      className="w-full"
                      disabled={
                        paying !== null || !selectedEvent || selectedEvent.status !== 'published'
                      }
                      onClick={() => buyPlacement(placement, 'card')}
                    >
                      {paying === `${placement.id}:card` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : !selectedEvent ? (
                        'Choose an event above'
                      ) : selectedEvent.status !== 'published' ? (
                        'Publish the event first'
                      ) : (
                        `Pay ${formatCurrency(placement.priceMajor)} by card — go live`
                      )}
                    </Button>
                    {/* The mobile-money rail, in USD because KODA moves USD and CDF
                        only. Same activation, same webhook discipline as the card. */}
                    {methods.koda && selectedEvent && selectedEvent.status === 'published' && (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={paying !== null}
                        onClick={() => buyPlacement(placement, 'momo')}
                      >
                        {paying === `${placement.id}:momo` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          `Pay ${formatCurrency(placement.priceUsdMajor, 'USD')} mobile money`
                        )}
                      </Button>
                    )}
                  </>
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
