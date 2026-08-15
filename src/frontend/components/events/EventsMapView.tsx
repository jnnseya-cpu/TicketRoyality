'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink, MapPin, Navigation } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { cn, formatEventDate, getDistanceInMiles } from '@/shared/utils';
import type { Coordinates, Event } from '@/shared/types';

interface EventsMapViewProps {
  events: Event[];
  /** The visitor's shared location, when they have offered one. */
  origin: Coordinates | null;
}

/**
 * Map view for the events browser, on the Maps **Embed** API.
 *
 * The Embed API is free and unmetered, but it renders one place at a time — it cannot
 * plot a marker per event, because that needs the billed Maps JavaScript API and a
 * custom marker layer. So rather than pretend, this pairs the map with the event list:
 * choosing an event re-centres the map on that venue, and the distance from the
 * visitor's location is shown against each one when they have shared it.
 *
 * That ordering is deliberate. The question someone actually has on a browse page is
 * "how far is this from me", which the list answers for every event at once; the map
 * answers "where exactly is it" for the one they are considering.
 */
export function EventsMapView({ events, origin }: EventsMapViewProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const mappable = React.useMemo(
    () => events.filter((event) => event.eventType !== 'online' && event.location.trim() !== ''),
    [events]
  );

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Falls back to the first event whenever the selection is filtered away, so the map
  // never goes blank while results are still on screen.
  const selected =
    mappable.find((event) => event.id === selectedId) ?? mappable[0] ?? null;

  const destinationOf = (event: Event) =>
    event.coordinates ? `${event.coordinates.lat},${event.coordinates.lng}` : event.location;

  const embedUrl = React.useMemo(() => {
    if (!apiKey || !selected) return null;
    const params = new URLSearchParams({ key: apiKey, q: destinationOf(selected), zoom: '14' });
    return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
  }, [apiKey, selected]);

  const directionsUrlFor = (event: Event) => {
    const params = new URLSearchParams({ api: '1', destination: destinationOf(event) });
    if (origin) params.set('origin', `${origin.lat},${origin.lng}`);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  };

  if (mappable.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <MapPin className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No events with a venue address match these filters. Online events have no map.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
        {mappable.map((event) => {
          const miles =
            origin && event.coordinates ? getDistanceInMiles(origin, event.coordinates) : null;
          const isSelected = selected?.id === event.id;

          return (
            <button
              key={event.id}
              type="button"
              onClick={() => setSelectedId(event.id)}
              aria-pressed={isSelected}
              className={cn(
                'w-full rounded-lg border p-3 text-left transition-colors',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-primary/40'
              )}
            >
              <p className="text-sm font-medium">{event.title}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{event.location}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatEventDate(event.date)}
                {miles !== null && (
                  <span className="text-primary">
                    {' · '}
                    {miles < 10 ? miles.toFixed(1) : Math.round(miles)} miles away
                  </span>
                )}
              </p>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {embedUrl ? (
          <iframe
            key={embedUrl}
            src={embedUrl}
            title={selected ? `Map showing ${selected.location}` : 'Venue map'}
            className="aspect-[4/3] w-full rounded-lg border border-border"
            loading="lazy"
            // Kept out of the tab order: the list beside it carries the same
            // information as text, and a keyboard user should not be trapped panning
            // a map they cannot escape.
            tabIndex={-1}
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        ) : (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card p-6 text-center">
            <MapPin className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              The embedded map needs a Google Maps key. Directions below work without one.
            </p>
          </div>
        )}

        {selected && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="royal" className="flex-1">
              <a href={directionsUrlFor(selected)} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-4 w-4" />
                Directions to {selected.location.split(',')[0]}
              </a>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href={`/events/${selected.id}`}>
                View event <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
