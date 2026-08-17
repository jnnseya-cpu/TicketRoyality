import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays, MapPin, Radio, Video } from 'lucide-react';

import { Badge } from '@/frontend/components/ui/badge';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { cn, formatEventDate } from '@/shared/utils';
import { TicketPrice } from '@/frontend/components/pricing/TicketPrice';
import { toMinor } from '@/shared/fees';
import type { Event } from '@/shared/types';

function locationLabel(event: Event) {
  if (event.eventType === 'livestream') return 'Live stream';
  if (event.eventType === 'online') return 'Online';
  return event.location;
}

export function EventCard({ event, className }: { event: Event; className?: string }) {
  const isFree = event.price === 0;
  const isPast = new Date(event.date).getTime() < Date.now();

  return (
    <Link href={`/events/${event.id}`} className="group block h-full">
      <Card
        className={cn(
          'flex h-full flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5',
          className
        )}
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {event.featured && <Badge variant="gold">Featured</Badge>}
            {event.eventType === 'livestream' && (
              <Badge variant="destructive" className="gap-1">
                <Radio className="h-3 w-3" /> Live
              </Badge>
            )}
            {event.eventType === 'online' && (
              <Badge variant="secondary" className="gap-1">
                <Video className="h-3 w-3" /> Online
              </Badge>
            )}
            {isPast && <Badge variant="secondary">Past</Badge>}
          </div>
          <div className="absolute bottom-3 right-3">
            <Badge variant={isFree ? 'success' : 'default'} className="text-xs font-semibold">
              {/* All-in, always. A card showing a bare face value next to a Buy button
                  is the drip-pricing pattern itself. */}
              <TicketPrice
                faceMinor={toMinor(event.price)}
                currency={event.currency}
                variant="lead"
              />
            </Badge>
          </div>
        </div>

        <CardContent className="flex flex-1 flex-col gap-2 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            {event.category}
          </p>
          <h3 className="line-clamp-2 font-headline text-base font-semibold leading-snug">
            {event.title}
          </h3>
          <div className="mt-auto space-y-1.5 pt-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{formatEventDate(event.date)}</span>
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{locationLabel(event)}</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function EventCardSkeleton() {
  return (
    <Card className="h-full overflow-hidden">
      <div className="aspect-[16/10] animate-pulse bg-muted" />
      <CardContent className="space-y-3 p-4">
        <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}
