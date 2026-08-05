'use client';

import * as React from 'react';
import { CalendarX2 } from 'lucide-react';

import { Calendar } from '@/frontend/components/ui/calendar';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { EventCard, EventCardSkeleton } from '@/frontend/components/events/EventCard';
import { EventFilters, type EventFilterState } from '@/frontend/components/events/EventFilters';
import { getEvents } from '@/shared/data/repositories';
import { getDistanceInMiles } from '@/shared/utils';
import { parseCategoryValue } from '@/shared/constants/categories';
import type { Event } from '@/shared/types';

/** Search radii, tried in order until something is found nearby. */
const RADII_MILES = [10, 20, 30];

const INITIAL_FILTERS: EventFilterState = {
  search: '',
  category: 'all',
  freeOnly: false,
  onlineOnly: false,
  livestreamOnly: false,
};

export function EventList({ initialView = 'grid' }: { initialView?: 'grid' | 'calendar' }) {
  const [allEvents, setAllEvents] = React.useState<Event[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filters, setFilters] = React.useState<EventFilterState>(INITIAL_FILTERS);
  const [view, setView] = React.useState<'grid' | 'calendar'>(initialView);
  const [selectedDay, setSelectedDay] = React.useState<Date | undefined>();

  const [coords, setCoords] = React.useState<{ lat: number; lng: number } | null>(null);
  const [locationNotice, setLocationNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getEvents()
      .then((events) => {
        if (!cancelled) setAllEvents(events);
      })
      .catch(() => {
        if (!cancelled) setAllEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Location is only requested on an explicit click. Asking automatically on load
   * produces a permission prompt nobody asked for, and a denial logged as an error.
   */
  const requestLocation = React.useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationNotice('This browser cannot share a location.');
      return;
    }
    setLocationNotice('Finding events near you…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationNotice(null);
      },
      () => {
        // A denial is a valid user choice, not an error condition.
        setCoords(null);
        setLocationNotice('Showing events from all locations.');
      },
      { timeout: 8000 }
    );
  }, []);

  const { visible, radiusUsed } = React.useMemo(() => {
    const term = filters.search.trim().toLowerCase();

    const events = allEvents.filter((event) => {
      if (term) {
        const haystack =
          `${event.title} ${event.location} ${event.category} ${event.organizerName}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      if (filters.category !== 'all') {
        const { group, category } = parseCategoryValue(filters.category);
        if (event.category !== category || event.categoryGroup !== group) return false;
      }

      if (filters.freeOnly && event.price !== 0) return false;
      if (filters.onlineOnly && event.eventType !== 'online') return false;
      if (filters.livestreamOnly && event.eventType !== 'livestream') return false;

      return true;
    });

    // Proximity filter applies only when the user has shared a location and is not
    // running a keyword search — a search should always be able to reach worldwide.
    if (coords && !term) {
      for (const radius of RADII_MILES) {
        const nearby = events.filter((event) => {
          if (!event.coordinates) return false;
          return getDistanceInMiles(coords, event.coordinates) <= radius;
        });
        if (nearby.length > 0) return { visible: nearby, radiusUsed: radius };
      }
      return { visible: [] as Event[], radiusUsed: RADII_MILES[RADII_MILES.length - 1] };
    }

    return { visible: events, radiusUsed: null as number | null };
  }, [allEvents, filters, coords]);

  const daysWithEvents = React.useMemo(
    () => visible.map((event) => new Date(event.date)),
    [visible]
  );

  const eventsOnSelectedDay = React.useMemo(() => {
    if (!selectedDay) return [];
    return visible.filter((event) => {
      const d = new Date(event.date);
      return (
        d.getFullYear() === selectedDay.getFullYear() &&
        d.getMonth() === selectedDay.getMonth() &&
        d.getDate() === selectedDay.getDate()
      );
    });
  }, [visible, selectedDay]);

  const status = React.useMemo(() => {
    if (locationNotice) return locationNotice;
    if (coords && radiusUsed) return `Showing events within ${radiusUsed} miles of you.`;
    if (coords && !radiusUsed && filters.search) return 'Searching worldwide.';
    if (coords) return `No events within ${RADII_MILES.at(-1)} miles of you.`;
    return 'Showing events from all locations.';
  }, [locationNotice, coords, radiusUsed, filters.search]);

  return (
    <div className="space-y-6">
      <EventFilters
        value={filters}
        onChange={setFilters}
        view={view}
        onViewChange={setView}
        locationStatus={status}
        onUseLocation={requestLocation}
        showLocationButton={!coords}
      />

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <EventCardSkeleton key={`list-skel-${i}`} />
          ))}
        </div>
      ) : view === 'calendar' ? (
        <div className="grid gap-8 lg:grid-cols-[auto_1fr]">
          <Card className="w-fit">
            <CardContent className="p-3">
              <Calendar
                mode="single"
                selected={selectedDay}
                onSelect={setSelectedDay}
                modifiers={{ hasEvent: daysWithEvents }}
                modifiersClassNames={{
                  hasEvent:
                    '[&>button]:font-semibold [&>button]:text-primary [&>button]:underline [&>button]:underline-offset-4',
                }}
              />
              <p className="px-2 pb-1 pt-3 text-xs text-muted-foreground">
                Highlighted dates have events. Select a day to see them.
              </p>
            </CardContent>
          </Card>

          <div>
            {!selectedDay ? (
              <p className="text-sm text-muted-foreground">
                Pick a date to see everything happening that day.
              </p>
            ) : eventsOnSelectedDay.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                <CalendarX2 className="h-5 w-5" />
                No events on {selectedDay.toDateString()}.
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                {eventsOnSelectedDay.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="font-headline text-lg font-semibold">No events match those filters</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Try clearing a filter, or search by name to look worldwide.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {visible.length} event{visible.length === 1 ? '' : 's'} found
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
