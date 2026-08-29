'use client';

import * as React from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Card } from '@/frontend/components/ui/card';
import { allInPriceLabelFromMajor } from '@/frontend/components/pricing/TicketPrice';
import { leadPrice } from '@/shared/pricing';
import { parseVideoAd } from '@/shared/video';
import type { Event } from '@/shared/types';

/**
 * The homepage spotlight — video only, on two screens.
 *
 * ## The shape the owner asked for
 *
 * Two screens share the space, and each cycles through up to **three** promo videos. The
 * two screens are deliberately **three seconds out of phase**, so they never cut at the
 * same instant — the strip always has motion on one side while the other changes. Every
 * clip is capped at **15 seconds** on screen (YouTube stops with `end=15`, a file by a
 * 15-second timer), which is also the length the uploader enforces.
 *
 * ## Video only, and nothing when there is none
 *
 * Only featured events that actually carry a video (`videoAdUrl`, a YouTube link or an
 * uploaded/pasted file) reach this strip; an event with no video does not appear, and if
 * nothing featured has a video the whole section renders nothing rather than inventing a
 * poster to fill it. An empty section is honest; a faked one is not — the mistake this
 * strip has already been corrected for once.
 */

const MAX_MS = 15_000;
const STAGGER_MS = 3_000;

/** Cap a YouTube embed at 15 seconds of content, on top of the on-screen timer. */
function cap15(embedUrl: string): string {
  return embedUrl.includes('end=') ? embedUrl : `${embedUrl}&end=15`;
}

/** One playing video, filling its screen, linking to the event. */
function VideoTile({ event }: { event: Event }) {
  const ad = parseVideoAd(event.videoAdUrl);
  const from = leadPrice(event);
  if (!ad) return null;

  return (
    <Link href={`/events/${event.id}`} className="block">
      <Card className="group relative aspect-video overflow-hidden border-primary/20">
        {ad.kind === 'youtube' ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* pointer-events-none so a click falls through to the event link, not YouTube. */}
            <iframe
              src={cap15(ad.embedUrl)}
              title={event.title}
              loading="lazy"
              allow="autoplay; encrypted-media; picture-in-picture"
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
          </>
        ) : (
          <video
            src={ad.url}
            poster={event.imageUrl}
            muted
            autoPlay
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-primary">
            <Sparkles className="h-3 w-3" />
            {event.location}
          </p>
          <h3 className="font-headline text-base font-semibold text-white sm:text-lg">
            {event.title}
          </h3>
          <p className="text-xs text-white/80">
            {new Date(event.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
            {from > 0 ? ` · from ${allInPriceLabelFromMajor(from, event.currency)}` : ' · Free'}
          </p>
        </div>
      </Card>
    </Link>
  );
}

/**
 * One screen: cycles its up-to-three videos on a 15-second beat, its whole rotation phase-
 * shifted by `offsetMs` so the two screens never change together. Remounting the tile on each
 * step (the `key`) restarts a YouTube embed cleanly and re-triggers a file's autoplay.
 */
function Screen({ videos, offsetMs }: { videos: Event[]; offsetMs: number }) {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (videos.length <= 1) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const step = (delay: number) => {
      timer = setTimeout(() => {
        if (cancelled) return;
        setIndex((i) => (i + 1) % videos.length);
        step(MAX_MS);
      }, delay);
    };
    // First advance one full beat away, plus this screen's phase offset, so screen two stays
    // three seconds behind screen one for as long as both run.
    step(MAX_MS + offsetMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [videos.length, offsetMs]);

  const current = videos[index] ?? videos[0];
  if (!current) return null;
  return <VideoTile key={`${current.id}-${index}`} event={current} />;
}

export default function VideoAds({ events }: { events: Event[] }) {
  // Video only: a featured event with no playable video does not belong on this strip.
  const videos = events
    .filter((event) => (event.featured || event.spotlight) && parseVideoAd(event.videoAdUrl))
    .slice(0, 6);

  if (videos.length === 0) return null;

  // Two screens share the space, interleaved so each holds up to three and they alternate
  // whose turn it is. One video: a single screen rather than a lonely half.
  const screenOne = videos.filter((_, i) => i % 2 === 0).slice(0, 3);
  const screenTwo = videos.filter((_, i) => i % 2 === 1).slice(0, 3);

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
              Featured events, playing on the big screens.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {videos.length} {videos.length === 1 ? 'video' : 'videos'} · two screens
          </p>
        </div>

        <div className={screenTwo.length > 0 ? 'grid gap-4 sm:grid-cols-2' : ''}>
          <Screen videos={screenOne} offsetMs={0} />
          {screenTwo.length > 0 && <Screen videos={screenTwo} offsetMs={STAGGER_MS} />}
        </div>
      </div>
    </section>
  );
}
