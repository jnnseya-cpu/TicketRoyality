import Link from 'next/link';
import Image from 'next/image';
import { Flame, MapPin, Moon, Sparkles, Ticket } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import type { Event } from '@/shared/types';
import { leadPrice } from '@/shared/pricing';
import { TicketPrice } from '@/frontend/components/pricing/TicketPrice';
import { toMinor } from '@/shared/fees';

/**
 * Fast discovery for people who are deciding what to do, not researching (docs/04 M26).
 *
 * Three questions, answered in one tap: what is on tonight, what is on this weekend,
 * what is selling. Every card carries a price up front — surfacing cost late is the
 * most-mocked pattern in ticketing and the audience this is aimed at is the least
 * willing to tolerate it.
 */
function isWithin(event: Event, fromMs: number, toMs: number) {
  const t = new Date(event.date).getTime();
  return t >= fromMs && t <= toMs;
}

function sellThrough(event: Event) {
  const total = event.ticketTiers.reduce((sum, tier) => sum + tier.quantity, 0);
  if (total === 0) return 0;
  const sold = event.ticketTiers.reduce((sum, tier) => sum + (tier.sold ?? 0), 0);
  return sold / total;
}

interface Strip {
  id: string;
  icon: typeof Flame;
  label: string;
  href: string;
  events: Event[];
}

export function QuickDiscovery({ events }: { events: Event[] }) {
  const now = Date.now();
  const endOfToday = now + 18 * 3_600_000;
  const endOfWeekend = now + 5 * 86_400_000;

  const live = events.filter(
    (e) => e.status === 'published' && new Date(e.date).getTime() >= now
  );

  const strips: Strip[] = [
    {
      id: 'tonight',
      icon: Moon,
      label: 'Tonight',
      href: '/events',
      events: live.filter((e) => isWithin(e, now, endOfToday)).slice(0, 4),
    },
    {
      id: 'weekend',
      icon: Sparkles,
      label: 'This weekend',
      href: '/events?view=calendar',
      events: live.filter((e) => isWithin(e, endOfToday, endOfWeekend)).slice(0, 4),
    },
    {
      id: 'selling',
      icon: Flame,
      label: 'Selling fast',
      href: '/events',
      events: [...live].sort((a, b) => sellThrough(b) - sellThrough(a)).slice(0, 4),
    },
  ].filter((strip) => strip.events.length > 0);

  if (strips.length === 0) return null;

  return (
    <section className="container py-14">
      {/* flex-wrap: under large accessibility font scales this pair outgrows a
          phone viewport; wrapping beats clipping the link off the edge. */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Right now
          </p>
          <h2 className="mt-1 font-headline text-2xl font-bold sm:text-3xl">
            Doing something later?
          </h2>
        </div>
        <Link href="/events" className="shrink-0 text-sm text-primary hover:underline">
          Browse everything
        </Link>
      </div>

      <div className="space-y-8">
        {strips.map((strip) => (
          <div key={strip.id}>
            <div className="mb-3 flex items-center gap-2">
              <strip.icon className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">{strip.label}</h3>
            </div>

            {/* Horizontal scroll on mobile, grid above — thumb-first, no pagination. */}
            <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
              {strip.events.map((event) => (
                <li
                  key={event.id}
                  className="w-[70vw] shrink-0 snap-start sm:w-auto"
                >
                  <Link
                    href={`/events/${event.id}`}
                    className="group block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden">
                      <Image
                        src={event.imageUrl}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 70vw, 25vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <Badge
                        variant="gold"
                        className="absolute bottom-2 left-2 text-xs font-semibold"
                      >
                        {/* All-in. A homepage badge is the first price impression. */}
                        <TicketPrice
                          faceMinor={toMinor(leadPrice(event))}
                          currency={event.currency}
                          variant="lead"
                        />
                      </Badge>
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary">
                        {event.title}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <Ticket className="h-3.5 w-3.5" />
        Prices shown include what you pay. No surprise fees at the last step.
      </p>
    </section>
  );
}
