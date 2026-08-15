import type { Metadata } from 'next';

import { EventList } from '@/frontend/components/events/EventList';

export const metadata: Metadata = {
  title: 'All Upcoming Events',
  description:
    'Browse, search, and filter through our entire collection of exciting upcoming events — by category, price, format and location.',
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
        <h1 className="font-headline text-3xl font-bold sm:text-4xl">All Upcoming Events</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Browse, search, and filter through our entire collection of exciting upcoming events.
        </p>
      </div>

      <EventList initialView={view === 'calendar' ? 'calendar' : view === 'map' ? 'map' : 'grid'} />
    </div>
  );
}
