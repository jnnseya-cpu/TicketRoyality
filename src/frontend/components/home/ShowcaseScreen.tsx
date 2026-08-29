'use client';

import * as React from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { allInPriceLabelFromMajor } from '@/frontend/components/pricing/TicketPrice';
import { leadPrice } from '@/shared/pricing';
import { parseVideoAd, youTubeClipEmbed } from '@/shared/video';
import type { Event } from '@/shared/types';

/**
 * The premium homepage showcase — the big screen in the "Built for serious events" panel.
 *
 * What makes it the premium slot (30% above the spotlight) is that **both** move: the cover
 * image drifts continuously (a slow Ken Burns zoom) and the promo video crossfades over it on
 * a loop — a few seconds of moving picture, then the clip, then back. The image alone still
 * moves when there is no video, so the panel is never a dead still. Capped at 15 seconds of
 * video like every promo clip; YouTube or MP4.
 *
 * Falls back to `fallback` (the section's own static image) when no event holds the showcase.
 */

const IMAGE_MS = 5_000;
const VIDEO_MS = 15_000;

export function ShowcaseScreen({
  event,
  fallback,
}: {
  event?: Event;
  fallback: React.ReactNode;
}) {
  const ad = event ? parseVideoAd(event.videoAdUrl) : null;
  const [showVideo, setShowVideo] = React.useState(false);
  // Bumped every time the clip comes back on, so it remounts and replays from 0 — and,
  // with the capped embed, hard-stops again at 15s rather than running on underneath.
  const [cycle, setCycle] = React.useState(0);

  React.useEffect(() => {
    if (!ad) return; // no video: the moving picture just runs on its own
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = (video: boolean) => {
      timer = setTimeout(() => {
        if (cancelled) return;
        const next = !video;
        setShowVideo(next);
        if (next) setCycle((c) => c + 1);
        loop(next);
      }, video ? VIDEO_MS : IMAGE_MS);
    };
    loop(false);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ad]);

  if (!event) return <>{fallback}</>;

  const from = leadPrice(event);

  return (
    <Link href={`/events/${event.id}`} className="block">
      <div className="group relative aspect-[4/3] overflow-hidden rounded-xl gold-ring">
        {/* Moving picture: always drifting underneath. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={event.imageUrl}
          alt={event.title}
          className="animate-kenburns absolute inset-0 h-full w-full object-cover"
        />

        {/* The video, crossfading over the picture. Kept mounted so it keeps playing; only
            its opacity changes, so the transition is a true dissolve, not a reload. */}
        {ad && (
          <div
            className={`absolute inset-0 transition-opacity duration-1000 ${showVideo ? 'opacity-100' : 'opacity-0'}`}
          >
            {ad.kind === 'youtube' ? (
              <iframe
                key={cycle}
                src={youTubeClipEmbed(ad.id, 15)}
                title={event.title}
                loading="lazy"
                allow="autoplay; encrypted-media; picture-in-picture"
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
            ) : (
              <video
                key={cycle}
                src={ad.url}
                poster={event.imageUrl}
                muted
                autoPlay
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <Badge variant="gold" className="mb-2 gap-1">
            <Sparkles className="h-3 w-3" /> Showcase
          </Badge>
          <h3 className="font-headline text-lg font-semibold text-white sm:text-xl">
            {event.title}
          </h3>
          <p className="text-xs text-white/80">
            {event.location} ·{' '}
            {new Date(event.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
            {from > 0 ? ` · from ${allInPriceLabelFromMajor(from, event.currency)}` : ' · Free'}
          </p>
        </div>
      </div>
    </Link>
  );
}
