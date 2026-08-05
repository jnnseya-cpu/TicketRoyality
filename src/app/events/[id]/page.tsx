import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CalendarDays, Clock, ExternalLink, Radio, Share2, Ticket, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { EventCountdown } from '@/components/events/EventCountdown';
import { EventMap } from '@/components/events/EventMap';
import { EventSpeakers } from '@/components/events/EventSpeakers';
import { SeatMapPreview } from '@/components/events/SeatMapPreview';
import { SimilarEvents } from '@/components/events/SimilarEvents';
import { TicketBox } from '@/components/events/TicketBox';
import { getEventById } from '@/server/database';
import { formatEventDate } from '@/lib/utils';

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
  };
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  const isPast = new Date(event.date).getTime() < Date.now();
  const totalCapacity =
    event.capacity ?? event.ticketTiers.reduce((sum, tier) => sum + tier.quantity, 0);
  const totalSold = event.ticketTiers.reduce((sum, tier) => sum + (tier.sold ?? 0), 0);

  return (
    <article>
      {/* Hero */}
      <div className="relative h-[38vh] min-h-[280px] w-full overflow-hidden">
        <Image
          src={event.imageUrl}
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

      <div className="container grid gap-10 pb-16 lg:grid-cols-[1fr_380px]">
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
            <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
              {event.description}
            </p>
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
                  Ticket holders get the player, live chat, Q&amp;A polling and on-demand replay.
                </p>
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

          {event.eventType === 'physical' && (
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

          {event.speakers && event.speakers.length > 0 && (
            <EventSpeakers speakers={event.speakers} />
          )}

          <Separator />

          <SimilarEvents current={event} />
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {isPast ? (
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
            <TicketBox event={event} />
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
    </article>
  );
}
