import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EventStructuredData } from '@/frontend/components/seo/StructuredData';
import { RelatedLinks } from '@/frontend/components/seo/RelatedLinks';
import { relatedGroups } from '@/shared/related';
import type { Metadata } from 'next';
import { CalendarDays, Clock, ExternalLink, Radio, Share2, Ticket, Users } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Separator } from '@/frontend/components/ui/separator';
import { EventCountdown } from '@/frontend/components/events/EventCountdown';
import { EventMap } from '@/frontend/components/events/EventMap';
import { EventSpeakers } from '@/frontend/components/events/EventSpeakers';
import { EventAgenda } from '@/frontend/components/events/EventAgenda';
import { HospitalityPackages } from '@/frontend/components/events/HospitalityPackages';
import { SeatMapPreview } from '@/frontend/components/events/SeatMapPreview';
import { RichText } from '@/frontend/components/common/RichText';
import { SimilarEvents } from '@/frontend/components/events/SimilarEvents';
import { TicketBox } from '@/frontend/components/events/TicketBox';
import { AuctionLots } from '@/frontend/components/giving/AuctionLots';
import { GiftRegistry } from '@/frontend/components/giving/GiftRegistry';
import { getEvents, getEventById } from '@/shared/data/repositories';
import { formatEventDate } from '@/shared/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) return { title: 'Event not found' };
  return {
    title: event.title,
    description: event.description.slice(0, 160),
    openGraph: { title: event.title, images: [event.imageUrl] },
    // A private event's link still renders; search engines are asked not to index it,
    // because "only people with the link" and "first result for the event's name"
    // cannot both be true.
    ...(event.listing === 'unlisted' ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  // Dynamic internal links (docs/04 M25). Failure here must not break the page — a
  // related-events block is an enhancement, the event itself is the product.
  const allEvents = await getEvents().catch(() => []);
  const groups = relatedGroups(event, allEvents);

  const isPast = new Date(event.date).getTime() < Date.now();
  const totalCapacity =
    event.capacity ?? event.ticketTiers.reduce((sum, tier) => sum + tier.quantity, 0);
  const totalSold = event.ticketTiers.reduce((sum, tier) => sum + (tier.sold ?? 0), 0);

  /*
   * Sellout states, computed from the same counters the checkout enforces. From 90%
   * the page says how few are left — scarcity that is true is information; above that
   * it would be theatre. At 100% (and on cancellation) the whole page is stamped and
   * purchases lock, so nobody spends time on a thing they cannot have.
   */
  const remaining = Math.max(0, totalCapacity - totalSold);
  const nearlySoldOut =
    totalCapacity > 0 && remaining > 0 && totalSold / totalCapacity >= 0.9;
  const soldOut = totalCapacity > 0 && remaining === 0;
  const cancelled = event.status === 'cancelled';
  const stamp = cancelled ? 'CANCELLED' : soldOut ? 'SOLD OUT' : null;

  return (
    <article>
      <EventStructuredData event={event} />
      {/* Hero */}
      <div className="relative h-[38vh] min-h-[280px] w-full overflow-hidden">
        <Image
          src={event.coverImageUrl || event.imageUrl}
          alt={event.title}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/10" />
        <div className="container relative flex h-full flex-col justify-end pb-8">
          <div className="flex flex-wrap gap-2">
            <Badge variant="gold">{event.category}</Badge>
            {event.featured && <Badge>Featured</Badge>}
            {event.eventType === 'livestream' && (
              <Badge variant="destructive" className="gap-1">
                <Radio className="h-3 w-3" /> Live stream
              </Badge>
            )}
            {isPast && <Badge variant="secondary">This event has ended</Badge>}
            {cancelled && <Badge variant="destructive">Cancelled</Badge>}
            {!cancelled && soldOut && <Badge variant="destructive">Sold out</Badge>}
            {!cancelled && nearlySoldOut && !isPast && (
              <Badge variant="gold">Only {remaining} left</Badge>
            )}
          </div>
          <h1 className="mt-3 max-w-4xl font-headline text-3xl font-bold sm:text-4xl lg:text-5xl">
            {event.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Presented by{' '}
            <Link href={`/organisers/${event.organizerId}`} className="text-primary hover:underline">
              {event.organizerName}
            </Link>
          </p>
        </div>
      </div>

      <div className="container relative grid gap-10 pb-16 lg:grid-cols-[1fr_380px]">
        {stamp && (
          /* The stamp crosses the information, deliberately: a page that still reads
             like a live sale with one small badge is how people book travel to a
             cancelled show. pointer-events-none — the page stays readable under it. */
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center overflow-hidden"
          >
            <p className="mt-40 -rotate-12 select-none whitespace-nowrap rounded-xl border-8 border-destructive/50 px-10 py-4 font-headline text-6xl font-black uppercase tracking-widest text-destructive/50 sm:text-8xl">
              {stamp}
            </p>
          </div>
        )}
        {/* Main column */}
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="bg-card/50">
              <CardContent className="flex items-center gap-3 p-4">
                <CalendarDays className="h-5 w-5 text-primary" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Date &amp; time</p>
                  <p className="truncate text-sm font-medium">{formatEventDate(event.date)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardContent className="flex items-center gap-3 p-4">
                <Users className="h-5 w-5 text-primary" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Capacity</p>
                  <p className="truncate text-sm font-medium">
                    {totalSold} / {totalCapacity} sold
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardContent className="flex items-center gap-3 p-4">
                <Ticket className="h-5 w-5 text-primary" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Ticket types</p>
                  <p className="truncate text-sm font-medium">{event.ticketTiers.length} tiers</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {!isPast && <EventCountdown date={event.date} />}

          <section>
            <h2 className="mb-3 font-headline text-xl font-semibold">About this event</h2>
            <RichText text={event.description} className="text-muted-foreground" />
          </section>

          {event.eventType === 'livestream' && event.streamDetails && (
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="h-5 w-5 text-destructive" /> Live stream
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex aspect-video items-center justify-center rounded-lg border border-border bg-black/60 text-sm text-muted-foreground">
                  The stream begins at {formatEventDate(event.date)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Ticket holders watch here, with live chat
                  {event.streamDetails.replayUrl ? ' and a replay afterwards' : ''}. The player
                  opens shortly before the start.
                </p>
                <Button variant="royal" asChild>
                  <Link href={`/events/${event.id}/watch`}>Open the player</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {event.eventType === 'online' && event.onlineLink && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <ExternalLink className="h-5 w-5 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Online event</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Your joining link is emailed with your ticket.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/*
            Shown for anything with a real address, not just `physical`. A livestream is
            produced from a venue and usually sells seats in the room as well, so gating
            the map on `physical` hid the location from exactly the events whose
            attendees were most likely to be unsure whether they had to travel.
            Purely online events are the only ones with nowhere to go.
          */}
          {event.eventType !== 'online' && event.location.trim() !== '' && (
            <section>
              <h2 className="mb-3 font-headline text-xl font-semibold">Location</h2>
              <EventMap coordinates={event.coordinates} location={event.location} />
            </section>
          )}

          {event.seating && event.seating.length > 0 && (
            <section>
              <h2 className="mb-3 font-headline text-xl font-semibold">Seating map</h2>
              <SeatMapPreview sections={event.seating} currency={event.currency} />
            </section>
          )}

          <EventAgenda event={event} />

          {!isPast && <HospitalityPackages event={event} />}

          {/* Renders nothing when the event has no lots, which is nearly every event. */}
          <AuctionLots eventId={event.id} />

          {/* Also renders nothing without a list. */}
          <GiftRegistry eventId={event.id} />

          {event.sponsors && event.sponsors.length > 0 && (
            <section>
              <h2 className="mb-3 font-headline text-xl font-semibold">Sponsors</h2>
              <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-card/40 p-6">
                {event.sponsors.map((sponsor) => {
                  const logo = (
                    <Image
                      src={sponsor.logoUrl}
                      alt={sponsor.name}
                      width={160}
                      height={64}
                      className="h-12 w-auto object-contain opacity-90 transition-opacity hover:opacity-100"
                    />
                  );
                  /* A sponsor with a tracked code goes through /r, so their reach is
                     measured. Without one the logo simply links out. */
                  return sponsor.code ? (
                    <a
                      key={sponsor.name}
                      href={`/r/${sponsor.code}?to=${encodeURIComponent(sponsor.url ?? `/events/${event.id}`)}`}
                      rel="sponsored noopener"
                      target="_blank"
                    >
                      {logo}
                    </a>
                  ) : sponsor.url ? (
                    <a key={sponsor.name} href={sponsor.url} rel="sponsored noopener" target="_blank">
                      {logo}
                    </a>
                  ) : (
                    <span key={sponsor.name}>{logo}</span>
                  );
                })}
              </div>
            </section>
          )}

          {event.speakers && event.speakers.length > 0 && (
            <EventSpeakers speakers={event.speakers} />
          )}

          <Separator />

          <SimilarEvents current={event} />
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {cancelled ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-destructive" /> Event cancelled
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This event has been cancelled and tickets are no longer on sale. Paid
                  ticket holders are refunded — check the email on your ticket for the
                  confirmation.
                </p>
                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/organisers/${event.organizerId}`}>
                    See more from {event.organizerName}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : soldOut && !isPast ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" /> Sold out
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Every ticket for this event has been sold. Nothing here is on sale any
                  more — if returns open, they appear on this page.
                </p>
                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/organisers/${event.organizerId}`}>
                    See more from {event.organizerName}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : isPast ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" /> Sales closed
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>This event has already taken place, so tickets are no longer on sale.</p>
                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/organisers/${event.organizerId}`}>
                    See more from {event.organizerName}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {nearlySoldOut && (
                <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-center text-sm font-medium">
                  Nearly sold out — only {remaining} ticket{remaining === 1 ? '' : 's'} left
                </div>
              )}
              <TicketBox event={event} />
            </>
          )}

          <Card className="bg-card/50">
            <CardContent className="space-y-3 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Share2 className="h-4 w-4 text-primary" /> Share this event
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  {
                    label: 'Facebook',
                    href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`/events/${event.id}`)}`,
                  },
                  {
                    label: 'X',
                    href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(event.title)}`,
                  },
                  {
                    label: 'WhatsApp',
                    href: `https://wa.me/?text=${encodeURIComponent(event.title)}`,
                  },
                ].map((target) => (
                  <Button key={target.label} variant="outline" size="sm" asChild>
                    <a href={target.href} target="_blank" rel="noopener noreferrer">
                      {target.label}
                    </a>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="container pb-14">
        <RelatedLinks groups={groups} />
      </div>
    </article>
  );
}
