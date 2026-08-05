'use client';

import * as React from 'react';
import Link from 'next/link';
import Autoplay from 'embla-carousel-autoplay';
import { PlayCircle } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Card } from '@/frontend/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/frontend/components/ui/carousel';
import { PLACEHOLDER_IMAGES } from '@/shared/constants/placeholder-images';

/**
 * Paid 20-second video ad slots. Organisers purchase these from their dashboard
 * (Promotions → Video ad). Each slide links straight to the promoted event.
 */
const VIDEO_ADS = [
  {
    eventId: 'wembley-royal-night',
    title: 'Royal Night Live — Wembley Stadium',
    tagline: 'VIP hospitality now on sale',
    poster: PLACEHOLDER_IMAGES.heroCrowd,
  },
  {
    eventId: 'anfield-derby',
    title: 'Merseyside Derby — Matchday Hospitality',
    tagline: 'Lounge access + pre-match dining',
    poster: PLACEHOLDER_IMAGES.stadium,
  },
  {
    eventId: 'bristol-electronic-warehouse',
    title: 'Bristol Warehouse Electronic',
    tagline: 'Three rooms. One night. Capped capacity.',
    poster: PLACEHOLDER_IMAGES.vipLounge,
  },
];

export default function VideoAds() {
  const autoplay = React.useRef(
    Autoplay({ delay: 20_000, stopOnInteraction: false, stopOnMouseEnter: true })
  );

  return (
    <section className="border-y border-border/60 bg-card/30 py-12">
      <div className="container">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Badge variant="gold" className="mb-2">
              Promoted
            </Badge>
            <h2 className="font-headline text-2xl font-bold sm:text-3xl">Events Ads</h2>
            <p className="text-sm text-muted-foreground">
              Twenty-second spotlight slots, purchased by organisers from their dashboard.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">Auto-rotating · 3 slots</p>
        </div>

        <Carousel opts={{ loop: true }} plugins={[autoplay.current]} className="w-full">
          <CarouselContent>
            {VIDEO_ADS.map((ad) => (
              <CarouselItem key={ad.eventId} className="md:basis-2/3 lg:basis-1/2">
                <Link href={`/events/${ad.eventId}`}>
                  <Card className="group relative aspect-video overflow-hidden border-primary/20">
                    {/* Poster image stands in for the organiser's uploaded 20s video. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ad.poster}
                      alt={ad.title}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <PlayCircle className="h-14 w-14 text-white/80 transition-transform group-hover:scale-110" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <p className="text-xs uppercase tracking-widest text-primary">{ad.tagline}</p>
                      <h3 className="font-headline text-lg font-semibold text-white sm:text-xl">
                        {ad.title}
                      </h3>
                    </div>
                  </Card>
                </Link>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    </section>
  );
}
