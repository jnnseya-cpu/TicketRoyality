'use client';

import * as React from 'react';
import { Crown, Loader2, Megaphone, PlayCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RequireRole } from '@/components/dashboard/RequireRole';
import { getEventsByOrganizer } from '@/server/database';
import { formatCurrency } from '@/lib/utils';
import type { Event, UserProfile } from '@/shared/types';

/** Paid placements sold to organisers. Prices are per campaign, charged on approval. */
const PLACEMENTS = [
  {
    id: 'video-ad',
    icon: PlayCircle,
    title: 'Homepage video ad',
    description:
      'A 20-second auto-playing spot in the Events Ads carousel on the homepage. Three slots, rotating.',
    price: 249,
    period: '7 days',
  },
  {
    id: 'featured',
    icon: Crown,
    title: 'Featured event placement',
    description:
      'Your event appears in the Featured Events grid on the homepage and at the top of category search.',
    price: 149,
    period: '7 days',
  },
  {
    id: 'newsletter',
    icon: Megaphone,
    title: 'Newsletter spotlight',
    description:
      'A dedicated block in the weekly TicketRoyality email to opted-in attendees in your region.',
    price: 99,
    period: 'single send',
  },
];

const ANNOUNCEMENTS: Array<{ id: string; title: string; body: string; date: string }> = [];

function Promotions({ profile }: { profile: UserProfile }) {
  const [events, setEvents] = React.useState<Event[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<string>('');

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">Promotions</h1>
        <p className="text-sm text-muted-foreground">
          Buy homepage placement for your events. Charged once the placement goes live.
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
          <CardDescription>Placement applies to a single event at a time.</CardDescription>
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
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-3">
        {PLACEMENTS.map((placement) => (
          <Card key={placement.id} className="flex flex-col">
            <CardHeader>
              <placement.icon className="mb-2 h-6 w-6 text-primary" />
              <CardTitle className="text-base">{placement.title}</CardTitle>
              <CardDescription>{placement.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="font-headline text-2xl font-bold text-primary">
                  {formatCurrency(placement.price)}
                </span>
                <Badge variant="secondary">{placement.period}</Badge>
              </div>
              <form action="/api/checkout" method="POST">
                <input
                  type="hidden"
                  name="name"
                  value={`TicketRoyality — ${placement.title}`}
                />
                <input type="hidden" name="amount" value={placement.price} />
                <input type="hidden" name="quantity" value={1} />
                <input type="hidden" name="currency" value="GBP" />
                <input type="hidden" name="eventId" value={selected} />
                <input type="hidden" name="userId" value={profile.uid} />
                <Button
                  type="submit"
                  variant="royal"
                  className="w-full"
                  disabled={events.length === 0}
                >
                  Buy placement
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function PromotionsPage() {
  return <RequireRole role="organiser">{(profile) => <Promotions profile={profile} />}</RequireRole>;
}
