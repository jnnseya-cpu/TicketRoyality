'use client';

import * as React from 'react';
import Link from 'next/link';
import Autoplay from 'embla-carousel-autoplay';
import { Sparkles } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Card } from '@/frontend/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/frontend/components/ui/carousel';
import { formatCurrency } from '@/shared/utils';
import { leadPrice } from '@/shared/pricing';
import type { Event } from '@/shared/types';

/**
 * The promoted strip on the homepage.
 *
 * ## Why this is driven by real events and shows nothing when there are none
 *
 * It used to be three hardcoded entries pointing at demo event ids, with a poster image
 * standing in for a video that did not exist — while the promotions page charged £249 for
 * a slot in it. A carousel of invented ads is the homepage telling every visitor that
 * events are running when none are, and it is exactly the class of claim this project has
 * already paid for.
 *
 * So it renders the organiser's **featured** events, which is a real flag on a real
 * document, and renders nothing at all when nothing is featured. An empty homepage
 * section is honest; a fake one is not.
 *
 * ## Video when there is one, the cover image when there is not
 *
 * A Spotlight placement can carry a promo video: the organiser uploads a short clip in the
 * event editor (`videoAdUrl`), and it plays here muted and looping. When there is no video
 * the strip shows the event's own cover image instead — honestly, with no play button that
 * leads nowhere. So a paid video ad is real when one is supplied and never faked when it
 * is not.
 */
export default function VideoAds({ events }: { events: Event[] }) {
  const autoplay = React.useRef(
    Autoplay({ delay: 8_000, stopOnInteraction: false, stopOnMouseEnter: true })
  );

  // Both paid placements reach the strip: the £249 spotlight buys the strip alone,
  // the £149 featured placement buys the grid and rides here too.
  const promoted = events.filter((event) => event.featured || event.spotlight).slice(0, 6);

  // Nothing featured: the section does not exist rather than inventing something to fill it.
  if (promoted.length === 0) return null;

  return (
    <section className="border-y border-border/60 bg-card/30 py-12">
      <div className="container">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Badge variant="gold" className="mb-2">
              Featured
            </Badge>
            <h2 className="font-headline text-2xl font-bold sm:text-3xl">In the spotlight</h2>
            <p className="text-sm text-muted-foreground">
              Events the team has picked out this week.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Auto-rotating · {promoted.length} {promoted.length === 1 ? 'event' : 'events'}
          </p>
        </div>

        <Carousel opts={{ loop: promoted.length > 1 }} plugins={[autoplay.current]} className="w-full">
          <CarouselContent>
            {promoted.map((event) => {
              const from = leadPrice(event);

              return (
                <CarouselItem key={event.id} className="md:basis-2/3 lg:basis-1/2">
                  <Link href={`/events/${event.id}`}>
                    <Card className="group relative aspect-video overflow-hidden border-primary/20">
                      {event.videoAdUrl ? (
                        // The paid promo video: muted + autoplay + loop is the only
                        // combination browsers allow to start on its own, and playsInline
                        // stops iOS taking it fullscreen. The cover image is the poster, so
                        // the card never flashes empty while the video buffers.
                        <video
                          src={event.videoAdUrl}
                          poster={event.imageUrl}
                          muted
                          autoPlay
                          loop
                          playsInline
                          preload="metadata"
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        // No video: the event's cover image, on any host, so it bypasses the
                        // optimiser's allowlist with a plain img.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={event.imageUrl}
                          alt={event.title}
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-5">
                        <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-primary">
                          <Sparkles className="h-3 w-3" />
                          {event.location}
                        </p>
                        <h3 className="font-headline text-lg font-semibold text-white sm:text-xl">
                          {event.title}
                        </h3>
                        <p className="text-xs text-white/80">
                          {new Date(event.date).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'long',
                          })}
                          {from > 0 ? ` · from ${formatCurrency(from, event.currency)}` : ' · Free'}
                        </p>
                      </div>
                    </Card>
                  </Link>
                </CarouselItem>
              );
            })}
          </CarouselContent>
          {promoted.length > 1 && (
            <>
              <CarouselPrevious />
              <CarouselNext />
            </>
          )}
        </Carousel>
      </div>
    </section>
  );
}
