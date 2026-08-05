import type { Metadata } from 'next';

import { EventList } from '@/components/events/EventList';

export const metadata: Metadata = {
  title: 'All Events',
  description:
    'Browse every event on TicketRoyality — filter by category, price, format and location, or switch to the calendar view.',
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;

  return (
    <div className="container py-12">
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold sm:text-4xl">All Events</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Everything on sale right now. Nearby events are shown first when you share your
          location — searching by name always looks worldwide.
        </p>
      </div>

      <EventList initialView={view === 'calendar' ? 'calendar' : 'grid'} />
    </div>
  );
}
